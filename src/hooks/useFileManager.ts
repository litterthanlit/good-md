import { useState, useCallback, useEffect, useRef } from "react";
import type { OpenFile } from "../lib/types";
import { readMarkdownFile } from "../lib/commands";
import { saveState, loadState } from "../lib/store";

function extractFileInfo(path: string) {
  const parts = path.split(/[\\/]+/);
  const filename = parts[parts.length - 1] || path;
  const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : "";
  return { filename, parentFolder };
}

export function useFileManager() {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [watchedFilePaths, setWatchedFilePaths] = useState<string[]>([]);
  const [scrollPositions, setScrollPositions] = useState<
    Record<string, number>
  >({});
  const [watchedFolder, setWatchedFolder] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const openFilesRef = useRef<OpenFile[]>([]);

  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  // Restore state on mount
  useEffect(() => {
    loadState()
      .then(async (state) => {
        if (state.openFilePaths.length > 0) {
          const files: OpenFile[] = [];
          for (const path of state.openFilePaths) {
            try {
              const content = await readMarkdownFile(path);
              const { filename, parentFolder } = extractFileInfo(path);
              files.push({ path, filename, parentFolder, content });
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

  const openFile = useCallback(
    async (path: string) => {
      // Already open — just switch to it
      const existing = openFilesRef.current.find((f) => f.path === path);
      if (existing) {
        setActiveFilePath(path);
        return;
      }

      const content = await readMarkdownFile(path);
      const { filename, parentFolder } = extractFileInfo(path);
      const file: OpenFile = { path, filename, parentFolder, content };

      setOpenFiles((prev) => [...prev, file]);
      setActiveFilePath(path);
    },
    [],
  );

  const reloadFile = useCallback(async (path: string) => {
    const content = await readMarkdownFile(path);
    const { filename, parentFolder } = extractFileInfo(path);
    const file: OpenFile = { path, filename, parentFolder, content };

    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === path);
      if (idx === -1) {
        return prev;
      }

      const next = [...prev];
      next[idx] = file;
      return next;
    });
  }, []);

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

  const updateScrollPosition = useCallback(
    (path: string, scrollTop: number) => {
      setScrollPositions((prev) => ({ ...prev, [path]: scrollTop }));
    },
    [],
  );

  const updateFileContent = useCallback((path: string, content: string) => {
    setOpenFiles((prev) =>
      prev.map((file) => (file.path === path ? { ...file, content } : file)),
    );
  }, []);

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
    setActiveFilePath,
    setWatchedFilePaths,
    setWatchedFolder,
    updateScrollPosition,
    updateFileContent,
  };
}
