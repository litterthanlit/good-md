import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import {
  pdfCloseSession,
  pdfOpenSession,
  pdfSave,
  pdfSearch,
} from "../lib/commands";
import type { FileMetadata, PdfSessionInfo } from "../lib/types";

interface NativePdfPaneProps {
  path: string;
  filename: string;
  hasExternalChanges: boolean;
  onFallback: () => void;
  onSaved: (metadata: FileMetadata) => void;
}

interface DirtyChangedPayload {
  sessionId: string;
  dirty: boolean;
}

export default function NativePdfPane({
  path,
  filename,
  hasExternalChanges,
  onFallback,
  onSaved,
}: NativePdfPaneProps) {
  const [session, setSession] = useState<PdfSessionInfo | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Opening native PDF session...");
  const [query, setQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const nativePreviewUrl = useMemo(
    () => `${convertFileSrc(path)}#toolbar=0&navpanes=0&scrollbar=1`,
    [path],
  );

  useEffect(() => {
    let cancelled = false;
    let activeSessionId: string | null = null;

    pdfOpenSession(path)
      .then(async (info) => {
        if (cancelled) {
          await pdfCloseSession(info.sessionId).catch(() => {});
          return;
        }

        activeSessionId = info.sessionId;
        setSession(info);
        setDirty(info.dirty);
        setStatus(`${info.engine} - using compatibility preview`);
      })
      .catch(() => {
        if (!cancelled) onFallback();
      });

    return () => {
      cancelled = true;
      if (activeSessionId) {
        pdfCloseSession(activeSessionId).catch(() => {});
      }
    };
  }, [onFallback, path]);

  useEffect(() => {
    if (!session) return;
    const unlisteners = [
      listen<DirtyChangedPayload>("pdf:dirty-changed", (event) => {
        if (event.payload.sessionId === session.sessionId) {
          setDirty(event.payload.dirty);
        }
      }),
      listen<number>("pdf:ocr-progress", (event) => {
        setSearchStatus(`OCR ${Math.round(event.payload * 100)}%`);
      }),
      listen<string>("pdf:error", (event) => {
        setStatus(event.payload);
      }),
    ];

    return () => {
      unlisteners.forEach((unlisten) => unlisten.then((fn) => fn()));
    };
  }, [session]);

  const runSearch = async () => {
    if (!session || !query.trim()) return;
    if (!session.ocrAvailable) {
      setSearchStatus("Native OCR search is not implemented yet");
      return;
    }
    const results = await pdfSearch(session.sessionId, query);
    setSearchStatus(
      results.length === 0
        ? "No native OCR sidecar matches"
        : `${results.length} native OCR sidecar match${results.length === 1 ? "" : "es"}`,
    );
  };

  const saveNativePdf = async (mode: "overwrite" | "copy") => {
    if (!session) return;
    const targetPath =
      mode === "copy"
        ? await save({
            defaultPath: filename.replace(/\.pdf$/i, " copy.pdf"),
            filters: [{ name: "PDF", extensions: ["pdf"] }],
          })
        : null;
    if (mode === "copy" && !targetPath) return;

    const metadata = await pdfSave(session.sessionId, {
      mode,
      targetPath,
      createBackup: mode === "overwrite",
    });
    setDirty(false);
    setStatus(mode === "overwrite" ? "Saved with backup" : "Saved copy");
    if (mode === "overwrite") onSaved(metadata);
  };

  return (
    <div className="pdf-shell native-pdf-shell">
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-meta">
          <div className="reader-toolbar-title">{filename}</div>
          <div className="reader-toolbar-subtitle">
            Native PDF foundation preview{dirty ? " - Unsaved changes" : ""} - {status}
          </div>
        </div>
        <div className="pdf-toolbar-actions">
          <button
            type="button"
            onClick={() => saveNativePdf("overwrite")}
            disabled={!session || !dirty}
          >
            Save
          </button>
          <button type="button" onClick={() => saveNativePdf("copy")} disabled={!session}>
            Save copy
          </button>
          <button type="button" onClick={onFallback}>
            PDF.js fallback
          </button>
        </div>
      </div>

      {hasExternalChanges ? (
        <div className="editor-banner" role="status">
          The PDF changed on disk. Save will create a backup before replacing it.
        </div>
      ) : null}

      <div className="editor-banner" role="status">
        Native PDFKit editing, redaction, embedded view, and OCR are not implemented yet.
        This mode is a read-only compatibility preview. Use PDF.js fallback for current edit tools.
      </div>

      <div className="pdf-native-pro-toolbar">
        <button
          type="button"
          disabled
          title="Native PDFKit annotation editing is not implemented yet"
        >
          Annotate
        </button>
        <button type="button" disabled title="Permanent native redaction is not implemented yet">
          Redact
        </button>
        <button type="button" disabled title="Native OCR is not implemented yet">
          OCR
        </button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") runSearch().catch(() => {});
          }}
          placeholder="Search OCR sidecar"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={!session || !session.ocrAvailable || !query.trim()}
        >
          Search
        </button>
        <span>{searchStatus}</span>
      </div>

      <div className="pdf-native-stage native-pdf-stage">
        <iframe
          key={nativePreviewUrl}
          className="pdf-native-frame"
          src={nativePreviewUrl}
          title={`${filename} native PDF preview`}
        />
      </div>
    </div>
  );
}
