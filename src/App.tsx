import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Sidebar from "./components/Sidebar";
import ReaderPane from "./components/ReaderPane";
import PdfPane from "./components/PdfPane";
import NativePdfPane from "./components/NativePdfPane";
import OutlinePane from "./components/OutlinePane";
import CommandPalette from "./components/CommandPalette";
import { useFileManager } from "./hooks/useFileManager";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useThemePreference } from "./hooks/useThemePreference";
import {
  consumePendingOpenFiles,
  getFileMetadata,
  writeMarkdownFile,
  writeFileBytes,
  searchMarkdownFiles,
  stopWatcher,
  watchFolder,
} from "./lib/commands";
import {
  DOCUMENT_EXTENSIONS,
  isDocumentPath,
  isPdfPath,
} from "./lib/documents";
import { extractHeadings } from "./lib/markdown";
import {
  applyPdfEdits,
  createEmptyPdfEditState,
  hasPdfEdits,
  searchPdfFiles,
  type PdfTextCacheEntry,
} from "./lib/pdf";
import { loadState, saveState } from "./lib/store";
import type { CommandPaletteItem, PdfEditState, SearchResult } from "./lib/types";
import "./styles/theme.css";
import "./App.css";

const NARROW_LAYOUT_WIDTH = 1180;
const DEFAULT_ZOOM_LEVEL = 1;
const MIN_ZOOM_LEVEL = 0.8;
const MAX_ZOOM_LEVEL = 2;
const ZOOM_STEP = 0.1;

function clampZoomLevel(value: number) {
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, value));
}

function roundZoomLevel(value: number) {
  return Math.round(value * 100) / 100;
}

function fileLabel(path: string) {
  const parts = path.split(/[\\/]+/);
  return parts[parts.length - 1] ?? path;
}

function fileDetail(path: string) {
  const parts = path.split(/[\\/]+/);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function App() {
  const {
    openFiles,
    activeFile,
    activeFilePath,
    watchedFilePaths,
    scrollPositions,
    openFile,
    reloadFile,
    closeFile,
    closeAllFiles,
    setActiveFilePath,
    setWatchedFilePaths,
    watchedFolder,
    setWatchedFolder,
    updateScrollPosition,
    updateFileContent,
    updatePdfBytes,
  } = useFileManager();

  const [dragOver, setDragOver] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"all" | "search">("all");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pdfEditStates, setPdfEditStates] = useState<Record<string, PdfEditState>>({});
  const [pdfPageByPath, setPdfPageByPath] = useState<Record<string, number>>({});
  const [pdfPageCountByPath, setPdfPageCountByPath] = useState<Record<string, number>>({});
  const [pdfSearchPageByPath, setPdfSearchPageByPath] = useState<Record<string, number | null>>({});
  const [pdfFallbackPaths, setPdfFallbackPaths] = useState<Record<string, true>>({});
  const [externalChangePaths, setExternalChangePaths] = useState<
    Record<string, true>
  >({});
  const [jumpTarget, setJumpTarget] = useState<{
    filePath: string;
    headingId: string | null;
    nonce: number;
  } | null>(null);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [outlineInitialized, setOutlineInitialized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM_LEVEL);
  const [isNarrowLayout, setIsNarrowLayout] = useState(
    () => window.innerWidth < NARROW_LAYOUT_WIDTH,
  );
  const { themePreference, setThemePreference } = useThemePreference();
  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const draftsRef = useRef(drafts);
  const pdfEditStatesRef = useRef(pdfEditStates);
  const pdfTextCacheRef = useRef<Map<string, PdfTextCacheEntry>>(new Map());
  const savingPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    pdfEditStatesRef.current = pdfEditStates;
  }, [pdfEditStates]);

  const activeMarkdownContent =
    activeFilePath && activeFile?.kind === "markdown"
      ? drafts[activeFilePath] ?? activeFile.content
      : null;
  const activeMarkdownIsDirty =
    !!activeFilePath &&
    activeFile?.kind === "markdown" &&
    drafts[activeFilePath] !== undefined &&
    drafts[activeFilePath] !== activeFile.content;
  const activePdfEditState =
    activeFilePath && activeFile?.kind === "pdf"
      ? pdfEditStates[activeFilePath] ?? createEmptyPdfEditState()
      : createEmptyPdfEditState();
  const activePdfIsDirty = activeFile?.kind === "pdf" && hasPdfEdits(activePdfEditState);
  const activeFileIsDirty = activeMarkdownIsDirty || activePdfIsDirty;
  const activeFileHasExternalChanges =
    !!activeFilePath && externalChangePaths[activeFilePath] === true;

  const activeHeadings = useMemo(
    () =>
      activeMarkdownContent !== null ? extractHeadings(activeMarkdownContent) : [],
    [activeMarkdownContent],
  );
  const activePdfPageIndex =
    activeFilePath && activeFile?.kind === "pdf" ? pdfPageByPath[activeFilePath] ?? 0 : 0;
  const activePdfPageCount =
    activeFilePath && activeFile?.kind === "pdf" ? pdfPageCountByPath[activeFilePath] ?? 0 : 0;
  const activePdfSearchPage =
    activeFilePath && activeFile?.kind === "pdf"
      ? pdfSearchPageByPath[activeFilePath] ?? null
      : null;

  useEffect(() => {
    loadState()
      .then((state) => {
        setOutlineVisible(state.outlineVisible);
        setZoomLevel(clampZoomLevel(state.zoomLevel));
        setOutlineInitialized(true);
      })
      .catch(() => setOutlineInitialized(true));
  }, []);

  useEffect(() => {
    if (!outlineInitialized) return;
    saveState({ outlineVisible, zoomLevel }).catch(() => {});
  }, [outlineVisible, outlineInitialized, zoomLevel]);

  useEffect(() => {
    getCurrentWebview()
      .setZoom(zoomLevel)
      .catch(() => {});
  }, [zoomLevel]);

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowLayout(window.innerWidth < NARROW_LAYOUT_WIDTH);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleOpenFile = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Documents", extensions: [...DOCUMENT_EXTENSIONS] }],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        await openFile(path);
      }
    }
  }, [openFile]);

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({ directory: true });
    if (selected && typeof selected === "string") {
      setWatchedFolder(selected);
    }
  }, [setWatchedFolder]);

  const openPalette = useCallback((mode: "all" | "search") => {
    setPaletteMode(mode);
    setPaletteQuery("");
    setPaletteOpen(true);
  }, []);

  const handleClosePath = useCallback(
    (path: string) => {
      const file = openFiles.find((item) => item.path === path);
      const draft = drafts[path];
      const hasUnsavedChanges =
        file?.kind === "markdown"
          ? draft !== undefined && draft !== file.content
          : hasPdfEdits(pdfEditStates[path]);

      if (
        hasUnsavedChanges &&
        !window.confirm(
          `Discard unsaved changes in ${file?.filename ?? "this file"}?`,
        )
      ) {
        return;
      }

      setDrafts((current) => {
        if (current[path] === undefined) return current;
        const next = { ...current };
        delete next[path];
        return next;
      });
      setExternalChangePaths((current) => {
        if (!current[path]) return current;
        const next = { ...current };
        delete next[path];
        return next;
      });
      setPdfEditStates((current) => {
        if (!current[path]) return current;
        const next = { ...current };
        delete next[path];
        return next;
      });
      closeFile(path);
    },
    [closeFile, drafts, openFiles, pdfEditStates],
  );

  const handleCloseFile = useCallback(() => {
    if (activeFilePath) {
      handleClosePath(activeFilePath);
    }
  }, [activeFilePath, handleClosePath]);

  const handleCloseAllFiles = useCallback(() => {
    const hasUnsavedChanges =
      Object.entries(drafts).some(([path, draft]) => {
        const file = openFiles.find((item) => item.path === path);
        return file?.kind === "markdown" && draft !== file.content;
      }) ||
      Object.values(pdfEditStates).some((editState) => hasPdfEdits(editState));

    if (
      hasUnsavedChanges &&
      !window.confirm("Discard unsaved changes in all open documents?")
    ) {
      return;
    }

    setDrafts({});
    setExternalChangePaths({});
    setPdfEditStates({});
    setPdfPageByPath({});
    setPdfPageCountByPath({});
    setPdfSearchPageByPath({});
    setPdfFallbackPaths({});
    closeAllFiles();
  }, [closeAllFiles, drafts, openFiles, pdfEditStates]);

  const handleNavigateUp = useCallback(() => {
    if (!activeFilePath || openFiles.length === 0) return;
    const idx = openFiles.findIndex((f) => f.path === activeFilePath);
    if (idx > 0) {
      setActiveFilePath(openFiles[idx - 1].path);
    }
  }, [activeFilePath, openFiles, setActiveFilePath]);

  const handleNavigateDown = useCallback(() => {
    if (!activeFilePath || openFiles.length === 0) return;
    const idx = openFiles.findIndex((f) => f.path === activeFilePath);
    if (idx < openFiles.length - 1) {
      setActiveFilePath(openFiles[idx + 1].path);
    }
  }, [activeFilePath, openFiles, setActiveFilePath]);

  const jumpToHeading = useCallback(
    (headingId: string | null, targetFilePath = activeFilePath) => {
      if (!targetFilePath) return;
      setJumpTarget({ filePath: targetFilePath, headingId, nonce: Date.now() });
      if (isNarrowLayout) {
        setOutlineVisible(false);
      }
    },
    [activeFilePath, isNarrowLayout],
  );

  const handleJumpHandled = useCallback((nonce: number) => {
    setJumpTarget((current) =>
      current?.nonce === nonce ? null : current,
    );
  }, []);

  const handleNextHeading = useCallback(() => {
    if (activeHeadings.length === 0) return;
    const currentIndex = activeHeadings.findIndex(
      (heading) => heading.id === activeHeadingId,
    );
    const nextHeading =
      activeHeadings[currentIndex >= 0 ? currentIndex + 1 : 0] ??
      activeHeadings[0];
    if (nextHeading) {
      jumpToHeading(nextHeading.id);
    }
  }, [activeHeadings, activeHeadingId, jumpToHeading]);

  const handlePreviousHeading = useCallback(() => {
    if (activeHeadings.length === 0) return;
    const currentIndex = activeHeadings.findIndex(
      (heading) => heading.id === activeHeadingId,
    );
    const previousHeading =
      activeHeadings[currentIndex > 0 ? currentIndex - 1 : 0] ??
      activeHeadings[0];
    if (previousHeading) {
      jumpToHeading(previousHeading.id);
    }
  }, [activeHeadings, activeHeadingId, jumpToHeading]);

  const handleDraftChange = useCallback(
    (value: string) => {
      if (!activeFilePath || activeFile?.kind !== "markdown") return;
      setDrafts((current) => {
        if (value === activeFile.content) {
          const next = { ...current };
          delete next[activeFilePath];
          return next;
        }

        return { ...current, [activeFilePath]: value };
      });
      setExternalChangePaths((current) => {
        if (!current[activeFilePath]) {
          return current;
        }
        const next = { ...current };
        delete next[activeFilePath];
        return next;
      });
    },
    [activeFile, activeFilePath],
  );

  const handleSaveActiveFile = useCallback(async () => {
    if (!activeFilePath || !activeFile) return;

    if (activeFile.kind === "pdf") {
      const editState = pdfEditStates[activeFilePath];
      if (!hasPdfEdits(editState)) return;

      savingPathsRef.current.add(activeFilePath);
      const nextBytes = await applyPdfEdits(activeFile.bytes, editState);
      await writeFileBytes(activeFilePath, nextBytes);
      const metadata = await getFileMetadata(activeFilePath);
      updatePdfBytes(activeFilePath, nextBytes, metadata);
      setPdfEditStates((current) => {
        const next = { ...current };
        delete next[activeFilePath];
        return next;
      });
      window.setTimeout(() => {
        savingPathsRef.current.delete(activeFilePath);
      }, 1500);
    } else {
      const nextContent = draftsRef.current[activeFilePath];
      if (nextContent === undefined || nextContent === activeFile.content) {
        return;
      }

      savingPathsRef.current.add(activeFilePath);
      await writeMarkdownFile(activeFilePath, nextContent);
      updateFileContent(activeFilePath, nextContent);
      window.setTimeout(() => {
        savingPathsRef.current.delete(activeFilePath);
      }, 1500);
      setDrafts((current) => {
        const next = { ...current };
        delete next[activeFilePath];
        return next;
      });
    }

    setExternalChangePaths((current) => {
      if (!current[activeFilePath]) {
        return current;
      }
      const next = { ...current };
      delete next[activeFilePath];
      return next;
    });
  }, [activeFile, activeFilePath, pdfEditStates, updateFileContent, updatePdfBytes]);

  const handleSaveActiveFileAsCopy = useCallback(async () => {
    if (!activeFilePath || activeFile?.kind !== "pdf") return;

    const targetPath = await save({
      defaultPath: activeFile.filename.replace(/\.pdf$/i, " copy.pdf"),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!targetPath) return;

    const editState = pdfEditStates[activeFilePath] ?? createEmptyPdfEditState();
    const bytes = hasPdfEdits(editState)
      ? await applyPdfEdits(activeFile.bytes, editState)
      : activeFile.bytes;
    await writeFileBytes(targetPath, bytes);
  }, [activeFile, activeFilePath, pdfEditStates]);

  const handleToggleEditMode = useCallback(() => {
    if (!activeFilePath) return;
    setEditMode((current) => !current);
  }, [activeFilePath]);

  const handlePdfPageChange = useCallback(
    (pageIndex: number) => {
      if (!activeFilePath) return;
      setPdfPageByPath((current) => ({ ...current, [activeFilePath]: pageIndex }));
      setPdfSearchPageByPath((current) => ({ ...current, [activeFilePath]: null }));
    },
    [activeFilePath],
  );

  const handlePdfPageCountChange = useCallback(
    (pageCount: number) => {
      if (!activeFilePath) return;
      setPdfPageCountByPath((current) => ({ ...current, [activeFilePath]: pageCount }));
    },
    [activeFilePath],
  );

  const handlePdfEditStateChange = useCallback(
    (editState: PdfEditState) => {
      if (!activeFilePath) return;
      setPdfEditStates((current) => ({
        ...current,
        [activeFilePath]: editState,
      }));
    },
    [activeFilePath],
  );

  const handlePdfPreviousPage = useCallback(() => {
    if (!activeFilePath || activeFile?.kind !== "pdf") return;
    setPdfPageByPath((current) => ({
      ...current,
      [activeFilePath]: Math.max((current[activeFilePath] ?? 0) - 1, 0),
    }));
  }, [activeFile, activeFilePath]);

  const handlePdfNextPage = useCallback(() => {
    if (!activeFilePath || activeFile?.kind !== "pdf") return;
    setPdfPageByPath((current) => ({
      ...current,
      [activeFilePath]: Math.min(
        (current[activeFilePath] ?? 0) + 1,
        Math.max(activePdfPageCount - 1, 0),
      ),
    }));
  }, [activeFile, activeFilePath, activePdfPageCount]);

  const handlePdfRotatePage = useCallback(() => {
    if (!activeFilePath || activeFile?.kind !== "pdf") return;
    const current = activePdfEditState.rotations[activePdfPageIndex] ?? 0;
    setPdfEditStates((state) => ({
      ...state,
      [activeFilePath]: {
        ...activePdfEditState,
        rotations: {
          ...activePdfEditState.rotations,
          [activePdfPageIndex]: (current + 90) % 360,
        },
      },
    }));
  }, [activeFile, activeFilePath, activePdfEditState, activePdfPageIndex]);

  const handlePdfDeletePage = useCallback(() => {
    if (!activeFilePath || activeFile?.kind !== "pdf") return;
    setPdfEditStates((state) => ({
      ...state,
      [activeFilePath]: {
        ...activePdfEditState,
        deletedPages: Array.from(
          new Set([...activePdfEditState.deletedPages, activePdfPageIndex]),
        ),
      },
    }));
  }, [activeFile, activeFilePath, activePdfEditState, activePdfPageIndex]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((current) =>
      roundZoomLevel(clampZoomLevel(current + ZOOM_STEP)),
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((current) =>
      roundZoomLevel(clampZoomLevel(current - ZOOM_STEP)),
    );
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(DEFAULT_ZOOM_LEVEL);
  }, []);

  useKeyboardShortcuts({
    onOpenFile: handleOpenFile,
    onOpenFolder: handleOpenFolder,
    onCloseFile: handleCloseFile,
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onOpenCommandPalette: () => openPalette("all"),
    onOpenSearch: () => openPalette("search"),
    onToggleOutline: () => setOutlineVisible((current) => !current),
    onToggleEditMode: handleToggleEditMode,
    onSaveFile: () => {
      handleSaveActiveFile().catch(() => {});
    },
    onNavigateHeadingPrev: handlePreviousHeading,
    onNavigateHeadingNext: handleNextHeading,
    onPreviousPage: handlePdfPreviousPage,
    onNextPage: handlePdfNextPage,
    onRotatePage: handlePdfRotatePage,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomReset: handleZoomReset,
  });

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    if (activeFile) {
      const dirtyMark = activeFileIsDirty ? " • Edited" : "";
      appWindow.setTitle(`${activeFile.filename}${dirtyMark} — Houston-MD`);
    } else {
      appWindow.setTitle("Houston-MD");
    }
  }, [activeFile, activeFileIsDirty]);

  useEffect(() => {
    if (!activeFilePath) {
      setEditMode(false);
    }
  }, [activeFilePath]);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const unlisten = appWindow.onDragDropEvent(async (event) => {
      if (event.payload.type === "over") {
        setDragOver(true);
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        for (const path of event.payload.paths) {
          if (isDocumentPath(path)) {
            await openFile(path);
          }
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openFile]);

  useEffect(() => {
    let cancelled = false;

    const restoreWatchedFolder = async () => {
      if (!watchedFolder) {
        setWatchedFilePaths([]);
        return;
      }

      try {
        const files = await watchFolder(watchedFolder);
        if (cancelled) return;

        setWatchedFilePaths(files);
        if (!activeFilePath && files[0]) {
          await openFile(files[0]);
        }
      } catch {
        if (!cancelled) {
          setWatchedFolder(null);
          setWatchedFilePaths([]);
        }
      }
    };

    restoreWatchedFolder().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [watchedFolder, activeFilePath, openFile, setWatchedFilePaths, setWatchedFolder]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      unlisteners.push(
        await listen<string[]>("app:open-files", async (event) => {
          for (const path of event.payload) {
            if (isDocumentPath(path)) {
              await openFile(path);
            }
          }
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-added", async (event) => {
          if (!isDocumentPath(event.payload)) return;
          setWatchedFilePaths((current) =>
            Array.from(new Set([...current, event.payload])).sort(),
          );
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-changed", async (event) => {
          if (!isDocumentPath(event.payload)) return;
          if (savingPathsRef.current.has(event.payload)) {
            savingPathsRef.current.delete(event.payload);
            return;
          }
          if (
            draftsRef.current[event.payload] !== undefined ||
            hasPdfEdits(pdfEditStatesRef.current[event.payload])
          ) {
            setExternalChangePaths((current) => ({
              ...current,
              [event.payload]: true,
            }));
            return;
          }
          await reloadFile(event.payload);
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-removed", async (event) => {
          setWatchedFilePaths((current) =>
            current.filter((path) => path !== event.payload),
          );
          closeFile(event.payload);
        }),
      );

      const pendingPaths = await consumePendingOpenFiles();
      if (cancelled) return;

      for (const path of pendingPaths) {
        if (isDocumentPath(path)) {
          await openFile(path);
        }
      }
    };

    setup().catch(() => {});

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [openFile, reloadFile, closeFile, setWatchedFilePaths]);

  useEffect(() => {
    return () => {
      stopWatcher().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!paletteOpen || paletteMode !== "search" || paletteQuery.trim() === "") {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const pdfPaths = watchedFolder
        ? watchedFilePaths.filter(isPdfPath)
        : openFiles.filter((file) => file.kind === "pdf").map((file) => file.path);

      Promise.all([
        searchMarkdownFiles({
          dir: watchedFolder,
          filePaths: openFiles
            .filter((file) => file.kind === "markdown")
            .map((file) => file.path),
          query: paletteQuery,
        }),
        searchPdfFiles(pdfPaths, paletteQuery, pdfTextCacheRef.current),
      ])
        .then(([markdownResults, pdfResults]) => {
          if (!cancelled) {
            setSearchResults([...markdownResults, ...pdfResults]);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
          }
        });
    }, 140);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paletteMode, paletteOpen, paletteQuery, watchedFolder, watchedFilePaths, openFiles]);

  const paletteSections = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    const sections: Array<{ title: string; items: CommandPaletteItem[] }> = [];

    const openFileItems: CommandPaletteItem[] = openFiles
      .filter(
        (file) =>
          paletteMode === "all" &&
          (!query ||
            matchesQuery(file.filename, query) ||
            matchesQuery(file.parentFolder, query)),
      )
      .slice(0, 10)
      .map((file) => ({
        kind: "open-file",
        id: `open:${file.path}`,
        label: file.filename,
        detail: `${file.kind === "pdf" ? "PDF" : "Markdown"} • ${
          file.parentFolder || "Open file"
        }`,
        path: file.path,
      }));

    if (openFileItems.length > 0) {
      sections.push({ title: "Open Files", items: openFileItems });
    }

    const headingItems: CommandPaletteItem[] = activeHeadings
      .filter(
        (heading) => paletteMode === "all" && (!query || matchesQuery(heading.text, query)),
      )
      .slice(0, 12)
      .map((heading) => ({
        kind: "heading",
        id: `heading:${heading.id}`,
        label: heading.text,
        detail: `H${heading.level}`,
        headingId: heading.id,
      }));

    if (headingItems.length > 0) {
      sections.push({ title: "Current Document", items: headingItems });
    }

    const watchedFolderItems: CommandPaletteItem[] =
      paletteMode === "all" && query === ""
        ? watchedFilePaths
            .filter((path) => !openFiles.some((file) => file.path === path))
            .slice(0, 12)
            .map((path) => ({
              kind: "open-file",
              id: `watch:${path}`,
              label: fileLabel(path),
              detail: `${isPdfPath(path) ? "PDF" : "Markdown"} • ${
                fileDetail(path) || "Watched folder"
              }`,
              path,
            }))
        : [];

    if (watchedFolderItems.length > 0) {
      sections.push({ title: "Watched Folder", items: watchedFolderItems });
    }

    const searchItems: CommandPaletteItem[] =
      paletteMode === "search"
        ? searchResults.map((result) => ({
            kind: "search-result",
            id: `search:${result.path}:${result.line}:${result.headingId ?? result.page ?? "top"}`,
            label: result.filename,
            detail: `${result.kind === "pdf" ? `PDF page ${result.page ?? 1}` : "Markdown"} • ${
              result.parentFolder || "Search"
            } • ${result.snippet}`,
            result,
          }))
        : [];

    if (searchItems.length > 0) {
      sections.push({ title: "Search Results", items: searchItems });
    }

    const actions: CommandPaletteItem[] =
      paletteMode === "all"
        ? ([
            {
              kind: "action",
              id: "action:open-file",
              label: "Open file",
              detail: "Choose Markdown or PDF documents to open",
              action: "open-file",
            },
            {
              kind: "action",
              id: "action:open-folder",
              label: "Open folder",
              detail: "Watch a folder and search across it",
              action: "open-folder",
            },
            ...(openFiles.length > 0
              ? [
                  {
                    kind: "action",
                    id: "action:close-all-files",
                    label: "Close all documents",
                    detail: "Clear the restored document session",
                    action: "close-all-files",
                  },
                ]
              : []),
            {
              kind: "action",
              id: "action:outline",
              label: outlineVisible ? "Hide outline" : "Show outline",
              detail: "Toggle the document outline pane",
              action: "toggle-outline",
            },
            ...(activeFilePath
              ? ([
                  {
                    kind: "action",
                    id: "action:edit-mode",
                    label:
                      activeFile?.kind === "pdf"
                        ? editMode
                          ? "Preview PDF"
                          : "Edit PDF"
                        : editMode
                          ? "Preview markdown"
                          : "Edit markdown",
                    detail: editMode
                      ? "Switch back to the rendered reader view"
                      : activeFile?.kind === "pdf"
                        ? "Annotate, overlay edit, and adjust pages"
                        : "Edit the current markdown source",
                    action: "toggle-edit-mode",
                  },
                  {
                    kind: "action",
                    id: "action:save-file",
                    label: "Save file",
                    detail: activeFileIsDirty
                      ? "Write your current draft to disk"
                      : "No unsaved changes",
                    action: "save-file",
                  },
                  ...(activeFile?.kind === "pdf"
                    ? [
                        {
                          kind: "action",
                          id: "action:save-file-as-copy",
                          label: "Save PDF as copy",
                          detail: "Write the edited PDF to a new file",
                          action: "save-file-as-copy",
                        },
                        {
                          kind: "action",
                          id: "action:previous-page",
                          label: "Previous page",
                          detail: "Move to the previous PDF page",
                          action: "previous-page",
                        },
                        {
                          kind: "action",
                          id: "action:next-page",
                          label: "Next page",
                          detail: "Move to the next PDF page",
                          action: "next-page",
                        },
                        {
                          kind: "action",
                          id: "action:rotate-page",
                          label: "Rotate page",
                          detail: "Rotate the current PDF page clockwise",
                          action: "rotate-page",
                        },
                        {
                          kind: "action",
                          id: "action:delete-page",
                          label: "Delete page",
                          detail: "Remove the current PDF page on save",
                          action: "delete-page",
                        },
                      ]
                    : []),
                ] as CommandPaletteItem[])
              : []),
            {
              kind: "action",
              id: "action:zoom-in",
              label: "Zoom in",
              detail: `Increase view size • ${Math.round(zoomLevel * 100)}%`,
              action: "zoom-in",
            },
            {
              kind: "action",
              id: "action:zoom-out",
              label: "Zoom out",
              detail: `Decrease view size • ${Math.round(zoomLevel * 100)}%`,
              action: "zoom-out",
            },
            {
              kind: "action",
              id: "action:zoom-reset",
              label: "Reset zoom",
              detail: `Return to 100% view • ${Math.round(zoomLevel * 100)}%`,
              action: "zoom-reset",
            },
            {
              kind: "action",
              id: "action:theme-system",
              label: "Theme: System",
              detail: "Match the current macOS or desktop theme",
              action: "theme-system",
            },
            {
              kind: "action",
              id: "action:theme-light",
              label: "Theme: Light",
              detail: "Force the light reading theme",
              action: "theme-light",
            },
            {
              kind: "action",
              id: "action:theme-dark",
              label: "Theme: Dark",
              detail: "Force the dark reading theme",
              action: "theme-dark",
            },
          ] as CommandPaletteItem[])
        : [];

    const filteredActions = actions.filter(
      (item) => !query || matchesQuery(`${item.label} ${item.detail}`, query),
    );

    if (filteredActions.length > 0) {
      sections.push({ title: "Actions", items: filteredActions });
    }

    return sections;
  }, [
    activeFile,
    activeHeadings,
    activeFileIsDirty,
    activeFilePath,
    editMode,
    openFiles,
    outlineVisible,
    paletteMode,
    paletteQuery,
    searchResults,
    watchedFilePaths,
    zoomLevel,
  ]);

  const handleActivatePaletteItem = useCallback(
    async (item: CommandPaletteItem) => {
      setPaletteOpen(false);

      if (item.kind === "open-file") {
        await openFile(item.path);
        return;
      }

      if (item.kind === "heading") {
        jumpToHeading(item.headingId);
        return;
      }

      if (item.kind === "search-result") {
        await openFile(item.result.path);
        if (item.result.kind === "pdf") {
          setPdfSearchPageByPath((current) => ({
            ...current,
            [item.result.path]: item.result.page ?? 1,
          }));
        } else {
          jumpToHeading(item.result.headingId, item.result.path);
        }
        return;
      }

      switch (item.action) {
        case "open-file":
          await handleOpenFile();
          break;
        case "open-folder":
          await handleOpenFolder();
          break;
        case "close-all-files":
          handleCloseAllFiles();
          break;
        case "toggle-outline":
          setOutlineVisible((current) => !current);
          break;
        case "toggle-edit-mode":
          handleToggleEditMode();
          break;
        case "save-file":
          await handleSaveActiveFile();
          break;
        case "save-file-as-copy":
          await handleSaveActiveFileAsCopy();
          break;
        case "previous-page":
          handlePdfPreviousPage();
          break;
        case "next-page":
          handlePdfNextPage();
          break;
        case "rotate-page":
          handlePdfRotatePage();
          break;
        case "delete-page":
          handlePdfDeletePage();
          break;
        case "zoom-in":
          handleZoomIn();
          break;
        case "zoom-out":
          handleZoomOut();
          break;
        case "zoom-reset":
          handleZoomReset();
          break;
        case "theme-system":
          setThemePreference("system");
          break;
        case "theme-light":
          setThemePreference("light");
          break;
        case "theme-dark":
          setThemePreference("dark");
          break;
      }
    },
    [
      handleOpenFile,
      handleOpenFolder,
      handleCloseAllFiles,
      handlePdfDeletePage,
      handlePdfNextPage,
      handlePdfPreviousPage,
      handlePdfRotatePage,
      handleSaveActiveFile,
      handleSaveActiveFileAsCopy,
      handleToggleEditMode,
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
      jumpToHeading,
      openFile,
      setThemePreference,
    ],
  );

  return (
    <div className="app">
      <Sidebar
        files={openFiles}
        activeFilePath={activeFilePath}
        onSelect={setActiveFilePath}
        onClose={handleClosePath}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
      />

      <div className="main-shell">
        {activeFile?.kind === "pdf" &&
        isMacPlatform &&
        !pdfFallbackPaths[activeFile.path] ? (
          <NativePdfPane
            path={activeFile.path}
            filename={activeFile.filename}
            hasExternalChanges={activeFileHasExternalChanges}
            onFallback={() =>
              setPdfFallbackPaths((current) => ({
                ...current,
                [activeFile.path]: true,
              }))
            }
            onSaved={() => {
              reloadFile(activeFile.path).catch(() => {});
            }}
          />
        ) : activeFile?.kind === "pdf" ? (
          <PdfPane
            path={activeFile.path}
            bytes={activeFile.bytes}
            filename={activeFile.filename}
            editMode={editMode}
            editState={activePdfEditState}
            isDirty={activePdfIsDirty}
            hasExternalChanges={activeFileHasExternalChanges}
            pageIndex={activePdfPageIndex}
            searchPage={activePdfSearchPage}
            onPageChange={handlePdfPageChange}
            onPageCountChange={handlePdfPageCountChange}
            onEditStateChange={handlePdfEditStateChange}
            onSave={handleSaveActiveFile}
            onToggleEditMode={handleToggleEditMode}
          />
        ) : (
          <ReaderPane
            content={activeMarkdownContent}
            filePath={activeFilePath}
            filename={activeFile?.filename ?? null}
            headings={activeHeadings}
            activeHeadingId={activeHeadingId}
            jumpTarget={jumpTarget}
            outlineVisible={outlineVisible}
            isEditing={editMode}
            isDirty={activeMarkdownIsDirty}
            hasExternalChanges={activeFileHasExternalChanges}
            scrollPositions={scrollPositions}
            onScroll={updateScrollPosition}
            onActiveHeadingChange={setActiveHeadingId}
            onJumpHandled={handleJumpHandled}
            onContentChange={handleDraftChange}
            onOpenCommandPalette={() => openPalette("all")}
            onOpenSearch={() => openPalette("search")}
            onSave={handleSaveActiveFile}
            onToggleEditMode={handleToggleEditMode}
            onToggleOutline={() => setOutlineVisible((current) => !current)}
          />
        )}

        {activeFile?.kind !== "pdf" && !isNarrowLayout && outlineVisible ? (
          <OutlinePane
            headings={activeHeadings}
            activeHeadingId={activeHeadingId}
            onSelect={(headingId) => jumpToHeading(headingId)}
          />
        ) : null}
      </div>

      {activeFile?.kind !== "pdf" && isNarrowLayout && outlineVisible ? (
        <div className="overlay-shell" onClick={() => setOutlineVisible(false)}>
          <div onClick={(event) => event.stopPropagation()}>
            <OutlinePane
              narrow
              headings={activeHeadings}
              activeHeadingId={activeHeadingId}
              onSelect={(headingId) => jumpToHeading(headingId)}
              onClose={() => setOutlineVisible(false)}
            />
          </div>
        </div>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        query={paletteQuery}
        sections={paletteSections}
        onQueryChange={setPaletteQuery}
        onActivate={handleActivatePaletteItem}
        onClose={() => setPaletteOpen(false)}
      />

      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-text">Drop to open</div>
        </div>
      )}
    </div>
  );
}

export default App;
