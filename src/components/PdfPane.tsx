import { useEffect, useRef, useState, type PointerEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import type { PdfAnnotation, PdfEditState, PdfPoint } from "../lib/types";
import { loadPdfDocument } from "../lib/pdf";

type PdfTool = "highlight" | "note" | "text" | "whiteout" | "ink";

interface PdfPaneProps {
  path: string;
  bytes: number[];
  filename: string;
  editMode: boolean;
  editState: PdfEditState;
  isDirty: boolean;
  hasExternalChanges: boolean;
  pageIndex: number;
  searchPage: number | null;
  onPageChange: (pageIndex: number) => void;
  onPageCountChange: (pageCount: number) => void;
  onEditStateChange: (editState: PdfEditState) => void;
  onSave: () => void;
  onToggleEditMode: () => void;
}

const TOOL_COLORS: Record<PdfTool, string> = {
  highlight: "#facc15",
  note: "#f59e0b",
  text: "#2563eb",
  whiteout: "#ffffff",
  ink: "#ef4444",
};

function clampPage(index: number, count: number) {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

function rotatePage(editState: PdfEditState, pageIndex: number): PdfEditState {
  const current = editState.rotations[pageIndex] ?? 0;
  return {
    ...editState,
    rotations: {
      ...editState.rotations,
      [pageIndex]: (current + 90) % 360,
    },
  };
}

function deletePage(editState: PdfEditState, pageIndex: number): PdfEditState {
  return {
    ...editState,
    deletedPages: Array.from(new Set([...editState.deletedPages, pageIndex])),
  };
}

function movePage(editState: PdfEditState, pageCount: number, pageIndex: number, direction: -1 | 1) {
  const order = editState.pageOrder ?? Array.from({ length: pageCount }, (_, index) => index);
  const currentIndex = order.indexOf(pageIndex);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) {
    return editState;
  }

  const nextOrder = [...order];
  [nextOrder[currentIndex], nextOrder[nextIndex]] = [
    nextOrder[nextIndex],
    nextOrder[currentIndex],
  ];
  return { ...editState, pageOrder: nextOrder };
}

export default function PdfPane({
  path,
  bytes,
  filename,
  editMode,
  editState,
  isDirty,
  hasExternalChanges,
  pageIndex,
  searchPage,
  onPageChange,
  onPageCountChange,
  onEditStateChange,
  onSave,
  onToggleEditMode,
}: PdfPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const pageIndexRef = useRef(pageIndex);
  const inkPointsRef = useRef<PdfPoint[]>([]);
  const nativePreviewUrlRef = useRef<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [pageText, setPageText] = useState("");
  const [tool, setTool] = useState<PdfTool>("highlight");
  const [hasSelectableText, setHasSelectableText] = useState(true);
  const [inkDraftPoints, setInkDraftPoints] = useState<PdfPoint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useNativePreview, setUseNativePreview] = useState(false);
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const nativePreviewUrl =
    nativePreviewUrlRef.current ??
    (isMac
      ? `${convertFileSrc(path)}#toolbar=0&navpanes=0&scrollbar=1`
      : null);

  if (!nativePreviewUrlRef.current && nativePreviewUrl) {
    nativePreviewUrlRef.current = nativePreviewUrl;
  }

  useEffect(() => {
    nativePreviewUrlRef.current = isMac
      ? `${convertFileSrc(path)}#toolbar=0&navpanes=0&scrollbar=1`
      : null;
    setUseNativePreview(false);
    setLoadError(null);
  }, [isMac, path]);

  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    let cancelled = false;
    loadPdfDocument(bytes)
      .then(async (document) => {
        if (cancelled) {
          await document.destroy();
          return;
        }
        setUseNativePreview(false);
        setLoadError(null);
        setPdfDocument(document);
        setPageCount(document.numPages);
        onPageCountChange(document.numPages);
        onPageChange(clampPage(pageIndexRef.current, document.numPages));

        try {
          let foundSelectableText = false;
          const probePages = Math.min(document.numPages, 5);
          for (let pageNumber = 1; pageNumber <= probePages; pageNumber += 1) {
            const probePage = await document.getPage(pageNumber);
            const content = await probePage.getTextContent();
            foundSelectableText = content.items.some(
              (item) =>
                typeof (item as { str?: unknown }).str === "string" &&
                (item as { str: string }).str.trim().length > 0,
            );
            if (foundSelectableText) break;
          }

          if (!cancelled) {
            setHasSelectableText(foundSelectableText);
          }
        } catch (error) {
          console.error("Failed to inspect PDF text layer", error);
          if (!cancelled) {
            // Default to hiding the OCR warning if inspection itself fails.
            setHasSelectableText(true);
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load PDF document", error);
        if (!cancelled) {
          setPdfDocument(null);
          setPageCount(0);
          setHasSelectableText(true);
          if (isMac && nativePreviewUrlRef.current) {
            setUseNativePreview(true);
            setLoadError(null);
          } else {
            setUseNativePreview(false);
            setLoadError("This PDF could not be loaded.");
          }
          onPageCountChange(0);
          onPageChange(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bytes, onPageChange, onPageCountChange]);

  useEffect(() => {
    return () => {
      pdfDocument?.destroy();
    };
  }, [pdfDocument]);

  useEffect(() => {
    if (!pdfDocument || pageCount === 0) return;
    const targetPage = clampPage(pageIndex, pageCount);
    if (targetPage !== pageIndex) {
      onPageChange(targetPage);
      return;
    }

    pdfDocument
      .getPage(targetPage + 1)
      .then((nextPage) => {
        setLoadError(null);
        setPage(nextPage);
      })
      .catch((error) => {
        console.error("Failed to load PDF page", error);
        setPage(null);
        if (isMac && nativePreviewUrlRef.current) {
          setUseNativePreview(true);
          setLoadError(null);
        } else {
          setLoadError("This PDF page could not be opened.");
        }
      });
  }, [isMac, onPageChange, pageCount, pageIndex, pdfDocument]);

  useEffect(() => {
    if (!searchPage || pageCount === 0) return;
    onPageChange(clampPage(searchPage - 1, pageCount));
  }, [onPageChange, pageCount, searchPage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;

    const viewport = page.getViewport({
      scale: 1.35,
      rotation: (editState.rotations[pageIndex] ?? 0) % 360,
    });
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    setPageSize({ width: viewport.width, height: viewport.height });

    const task = page.render({ canvas, canvasContext: context, viewport });
    page
      .getTextContent()
      .then((content) =>
        setPageText(
          content.items
            .map((item) =>
              typeof (item as { str?: unknown }).str === "string"
                ? (item as { str: string }).str
                : "",
            )
            .join(" "),
        ),
      )
      .catch((error) => {
        console.error("Failed to read current PDF page text", error);
        setPageText("");
      });

    task.promise.catch((error) => {
      const message =
        error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("cancel")) {
        return;
      }

      console.error("Failed to render PDF page", error);
      if (isMac && nativePreviewUrlRef.current) {
        setUseNativePreview(true);
        setLoadError(null);
      } else {
        setLoadError("This PDF page could not be rendered.");
      }
    });

    return () => {
      task.cancel();
    };
  }, [editState.rotations, page, pageIndex]);

  const visibleAnnotations = editState.annotations.filter(
    (annotation) => annotation.pageIndex === pageIndex,
  );

  const currentRotation = (editState.rotations[pageIndex] ?? 0) % 360;

  const getPdfPoint = (event: PointerEvent<HTMLDivElement>) => {
    if (!pageWrapRef.current || !page) return null;
    const rect = pageWrapRef.current.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const pdfPage = page
      .getViewport({ scale: 1.35, rotation: currentRotation })
      .convertToPdfPoint(canvasX, canvasY);
    return { x: Math.max(0, pdfPage[0]), y: Math.max(0, pdfPage[1]) };
  };

  const getViewportPoint = (point: PdfPoint) => {
    const viewport = page?.getViewport({ scale: 1.35, rotation: currentRotation });
    if (!viewport) return point;
    const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
    return { x, y };
  };

  const addAnnotation = (event: PointerEvent<HTMLDivElement>) => {
    if (!editMode || !page) return;

    const pdfPoint = getPdfPoint(event);
    if (!pdfPoint) return;

    if (tool === "ink") {
      event.currentTarget.setPointerCapture(event.pointerId);
      inkPointsRef.current = [pdfPoint];
      setInkDraftPoints([pdfPoint]);
      return;
    }

    const { x: pdfX, y: pdfY } = pdfPoint;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const width = tool === "note" || tool === "text" ? 170 : 150;
    const height = tool === "note" || tool === "text" ? 56 : 28;
    const text =
      tool === "note"
        ? window.prompt("Note text", "Note") || "Note"
        : tool === "text"
          ? window.prompt("Overlay text", "Replacement text") || "Replacement text"
          : undefined;

    const annotation: PdfAnnotation = {
      id,
      kind: tool,
      pageIndex,
      x: Math.max(0, pdfX),
      y: Math.max(0, pdfY - height),
      width,
      height,
      color: TOOL_COLORS[tool],
      opacity: tool === "highlight" ? 0.35 : 0.92,
      text,
      fontSize: 12,
    };

    onEditStateChange({
      ...editState,
      annotations: [...editState.annotations, annotation],
    });
  };

  const continueInkStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (!editMode || tool !== "ink" || inkPointsRef.current.length === 0) return;
    const pdfPoint = getPdfPoint(event);
    if (!pdfPoint) return;
    const nextPoints = [...inkPointsRef.current, pdfPoint];
    inkPointsRef.current = nextPoints;
    setInkDraftPoints(nextPoints);
  };

  const commitInkStroke = () => {
    if (tool !== "ink" || inkPointsRef.current.length === 0) return;
    const points = inkPointsRef.current;
    inkPointsRef.current = [];
    setInkDraftPoints([]);
    if (points.length < 2) return;

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    const annotation: PdfAnnotation = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: "ink",
      pageIndex,
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      color: TOOL_COLORS.ink,
      opacity: 0.9,
      points,
    };

    onEditStateChange({
      ...editState,
      annotations: [...editState.annotations, annotation],
    });
  };

  const removeAnnotation = (id: string) => {
    onEditStateChange({
      ...editState,
      annotations: editState.annotations.filter((annotation) => annotation.id !== id),
    });
  };

  if (useNativePreview && nativePreviewUrlRef.current) {
    return (
      <div className="pdf-shell">
        <div className="pdf-toolbar">
          <div className="pdf-toolbar-meta">
            <div className="reader-toolbar-title">{filename}</div>
            <div className="reader-toolbar-subtitle">Native PDF compatibility mode</div>
          </div>
          <div className="pdf-toolbar-actions">
            <button type="button" disabled title="Compatibility mode is read-only for now">
              Native preview
            </button>
          </div>
        </div>

        {hasExternalChanges ? (
          <div className="editor-banner" role="status">
            The PDF changed on disk. Reopen it to refresh the native preview.
          </div>
        ) : null}

        <div className="editor-banner" role="status">
          This PDF is using macOS native preview for compatibility. Reading should work,
          but search and editing tools are not available for this file yet.
        </div>

        <div className="pdf-native-stage">
          <iframe
            key={nativePreviewUrlRef.current}
            className="pdf-native-frame"
            src={nativePreviewUrlRef.current}
            title={`${filename} native preview`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-shell">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-meta">
          <div className="reader-toolbar-title">{filename}</div>
          <div className="reader-toolbar-subtitle">
            Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
            {editMode ? (isDirty ? " - PDF edit mode - Unsaved changes" : " - PDF edit mode") : ""}
          </div>
        </div>
        <div className="pdf-toolbar-actions">
          <button type="button" onClick={() => onPageChange(clampPage(pageIndex - 1, pageCount))}>
            Previous
          </button>
          <button type="button" onClick={() => onPageChange(clampPage(pageIndex + 1, pageCount))}>
            Next
          </button>
          <button type="button" className={editMode ? "active" : ""} onClick={onToggleEditMode}>
            {editMode ? "Preview PDF" : "Edit PDF"}
          </button>
          <button type="button" className={isDirty ? "active" : ""} onClick={onSave}>
            Save
          </button>
        </div>
      </div>

      {hasExternalChanges ? (
        <div className="editor-banner" role="status">
          The PDF changed on disk while you were editing. Save to overwrite it,
          or reopen it to load the outside changes.
        </div>
      ) : null}

      {loadError ? (
        <div className="editor-banner" role="status">
          {loadError}
        </div>
      ) : null}

      {!hasSelectableText ? (
        <div className="editor-banner" role="status">
          No selectable text found. OCR is not supported yet.
        </div>
      ) : null}

      {editMode ? (
        <div className="pdf-edit-toolbar">
          {(["highlight", "note", "text", "whiteout", "ink"] as PdfTool[]).map((item) => (
            <button
              key={item}
              type="button"
              className={tool === item ? "active" : ""}
              onClick={() => setTool(item)}
            >
              {item === "text" ? "Overlay text" : item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onEditStateChange(rotatePage(editState, pageIndex))}
          >
            Rotate page
          </button>
          <button
            type="button"
            onClick={() => onEditStateChange(movePage(editState, pageCount, pageIndex, -1))}
          >
            Move up
          </button>
          <button
            type="button"
            onClick={() => onEditStateChange(movePage(editState, pageCount, pageIndex, 1))}
          >
            Move down
          </button>
          <button
            type="button"
            onClick={() => onEditStateChange(deletePage(editState, pageIndex))}
          >
            Delete page
          </button>
        </div>
      ) : null}

      <div className="pdf-body">
        <aside className="pdf-page-list" aria-label="PDF pages">
          {Array.from({ length: pageCount }, (_, index) => {
            const deleted = editState.deletedPages.includes(index);
            return (
              <button
                key={index}
                type="button"
                className={`${index === pageIndex ? "active" : ""} ${deleted ? "deleted" : ""}`}
                onClick={() => onPageChange(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </aside>

        <div className="pdf-stage">
          <div
            ref={pageWrapRef}
            className="pdf-page-wrap"
            style={{ width: pageSize.width, height: pageSize.height }}
            onPointerDown={addAnnotation}
            onPointerMove={continueInkStroke}
            onPointerUp={commitInkStroke}
            onPointerCancel={commitInkStroke}
          >
            <canvas ref={canvasRef} className="pdf-canvas" />
            <div className="pdf-text-proxy" aria-label="PDF text for current page">
              {pageText}
            </div>
            {visibleAnnotations.map((annotation) => {
              if (annotation.kind === "ink" && annotation.points) {
                const viewportPoints = annotation.points.map(getViewportPoint);
                const xs = viewportPoints.map((point) => point.x);
                const ys = viewportPoints.map((point) => point.y);
                const minX = Math.min(...xs);
                const minY = Math.min(...ys);
                const maxX = Math.max(...xs);
                const maxY = Math.max(...ys);

                return (
                  <button
                    key={annotation.id}
                    type="button"
                    className="pdf-annotation ink"
                    style={{
                      left: minX,
                      top: minY,
                      width: Math.max(8, maxX - minX),
                      height: Math.max(8, maxY - minY),
                      opacity: annotation.opacity,
                    }}
                    title="Click to remove ink"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (editMode) removeAnnotation(annotation.id);
                    }}
                  >
                    <svg viewBox={`0 0 ${Math.max(8, maxX - minX)} ${Math.max(8, maxY - minY)}`}>
                      <polyline
                        points={viewportPoints
                          .map((point) => `${point.x - minX},${point.y - minY}`)
                          .join(" ")}
                        fill="none"
                        stroke={annotation.color}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                      />
                    </svg>
                  </button>
                );
              }

              const viewport = page?.getViewport({ scale: 1.35, rotation: currentRotation });
              const [left, top] = viewport
                ? viewport.convertToViewportPoint(annotation.x, annotation.y + annotation.height)
                : [annotation.x, annotation.y];
              return (
                <button
                  key={annotation.id}
                  type="button"
                  className={`pdf-annotation ${annotation.kind}`}
                  style={{
                    left,
                    top,
                    width: annotation.width * 1.35,
                    height: annotation.height * 1.35,
                    backgroundColor: annotation.kind === "whiteout" ? "#fff" : annotation.color,
                    opacity: annotation.opacity,
                  }}
                  title="Click to remove annotation"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (editMode) removeAnnotation(annotation.id);
                  }}
                >
                  {annotation.kind === "note" || annotation.kind === "text"
                    ? annotation.text
                    : ""}
                </button>
              );
            })}
            {inkDraftPoints.length > 1 ? (
              <svg className="pdf-ink-draft" width={pageSize.width} height={pageSize.height}>
                <polyline
                  points={inkDraftPoints
                    .map(getViewportPoint)
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={TOOL_COLORS.ink}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
              </svg>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
