import { useState, useCallback, useEffect, useRef } from "react";
import type { OpenDocument } from "../lib/types";
import {
  getFileMetadata,
  readFileBytes,
  readMarkdownFile,
} from "../lib/commands";
import { extractFileInfo, getDocumentKind } from "../lib/documents";
import { saveState, loadState } from "../lib/store";

export function useFileManager() {
  const [openFiles, setOpenFiles] = useState<OpenDocument[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [watchedFilePaths, setWatchedFilePaths] = useState<string[]>([]);
  const [scrollPositions, setScrollPositions] = useState<
    Record<string, number>
  >({});
  const [watchedFolder, setWatchedFolder] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const openFilesRef = useRef<OpenDocument[]>([]);

  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  // Restore state on mount
  useEffect(() => {
    loadState()
      .then(async (state) => {
        if (state.openFilePaths.length > 0) {
          const files: OpenDocument[] = [];
          for (const path of state.openFilePaths) {
            try {
              const file = await loadDocument(path);
              if (file) {
                files.push(file);
              }
            } catch {
              // File may have been moved/deleted — skip it
            }
          }
          setOpenFiles(files);
          const activePath = state.activeFilePath;
          if (activePath && files.some((f) => f.path === activePath)) {
            setActiveFilePath(activePath);
          } else if (files.length > 0) {
            setActiveFilePath(files[0].path);
          }
          setScrollPositions(state.scrollPositions);
        }
        setWatchedFolder(state.watchedFolder);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));
  }, []);

  // Persist state on change
  useEffect(() => {
    if (!initialized) return;
    saveState({
      openFilePaths: openFiles.map((f) => f.path),
      activeFilePath,
      watchedFolder,
      scrollPositions,
    }).catch(() => {});
  }, [openFiles, activeFilePath, watchedFolder, scrollPositions, initialized]);

  const loadDocument = useCallback(async (path: string) => {
    const kind = getDocumentKind(path);
    if (!kind) {
      return null;
    }

    const { filename, parentFolder } = extractFileInfo(path);
    if (kind === "pdf") {
      const [bytes, metadata] = await Promise.all([
        readFileBytes(path),
        getFileMetadata(path),
      ]);
      return { path, filename, parentFolder, kind, bytes, metadata };
    }

    const content = await readMarkdownFile(path);
    return { path, filename, parentFolder, kind, content };
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      // Already open — just switch to it
      const existing = openFilesRef.current.find((f) => f.path === path);
      if (existing) {
        setActiveFilePath(path);
        return;
      }

      const file = await loadDocument(path);
      if (!file) return;

      setOpenFiles((prev) => [...prev, file]);
      setActiveFilePath(path);
    },
    [loadDocument],
  );

  const reloadFile = useCallback(async (path: string) => {
    const file = await loadDocument(path);
    if (!file) return;

    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === path);
      if (idx === -1) {
        return prev;
      }

      const next = [...prev];
      next[idx] = file;
      return next;
    });
  }, [loadDocument]);

  const closeFile = useCallback(
    (path: string) => {
      setOpenFiles((prev) => {
        const idx = prev.findIndex((f) => f.path === path);
        const next = prev.filter((f) => f.path !== path);

        if (activeFilePath === path) {
          if (next.length === 0) {
            setActiveFilePath(null);
          } else {
            // Switch to the nearest remaining file
            const newIdx = Math.min(idx, next.length - 1);
            setActiveFilePath(next[newIdx].path);
          }
        }

        return next;
      });

      setScrollPositions((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    },
    [activeFilePath],
  );

  const closeAllFiles = useCallback(() => {
    setOpenFiles([]);
    setActiveFilePath(null);
    setScrollPositions({});
  }, []);

  const updateScrollPosition = useCallback(
    (path: string, scrollTop: number) => {
      setScrollPositions((prev) => ({ ...prev, [path]: scrollTop }));
    },
    [],
  );

  const updateFileContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((file) =>
        file.path === path && file.kind === "markdown"
          ? { ...file, content }
          : file,
      ),
    );
  }, []);

  const updatePdfBytes = useCallback(
    (path: string, bytes: number[], metadata = { modifiedMs: Date.now(), size: bytes.length }) => {
      setOpenFiles((prev) =>
        prev.map((file) =>
          file.path === path && file.kind === "pdf"
            ? { ...file, bytes, metadata }
            : file,
        ),
      );
    },
    [],
  );

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;

  return {
    openFiles,
    activeFile,
    activeFilePath,
    watchedFilePaths,
    scrollPositions,
    watchedFolder,
    openFile,
    reloadFile,
    closeFile,
    closeAllFiles,
    setActiveFilePath,
    setWatchedFilePaths,
    setWatchedFolder,
    updateScrollPosition,
    updateFileContent,
    updatePdfBytes,
  };
}
