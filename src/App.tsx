import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Sidebar from "./components/Sidebar";
import ReaderPane from "./components/ReaderPane";
import { useFileManager } from "./hooks/useFileManager";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useThemePreference } from "./hooks/useThemePreference";
import {
  consumePendingOpenFiles,
  stopWatcher,
  watchFolder,
} from "./lib/commands";
import "./styles/theme.css";
import "./App.css";

const MD_EXTENSIONS = ["md", "mdx", "markdown"];

function isMarkdownPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? MD_EXTENSIONS.includes(extension) : false;
}

function App() {
  const {
    openFiles,
    activeFile,
    activeFilePath,
    scrollPositions,
    openFile,
    reloadFile,
    closeFile,
    setActiveFilePath,
    watchedFolder,
    setWatchedFolder,
    updateScrollPosition,
  } = useFileManager();

  const [dragOver, setDragOver] = useState(false);
  const { themePreference, setThemePreference } = useThemePreference();

  const handleOpenFile = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Markdown", extensions: MD_EXTENSIONS }],
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

  const handleCloseFile = useCallback(() => {
    if (activeFilePath) {
      closeFile(activeFilePath);
    }
  }, [activeFilePath, closeFile]);

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

  useKeyboardShortcuts({
    onOpenFile: handleOpenFile,
    onOpenFolder: handleOpenFolder,
    onCloseFile: handleCloseFile,
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
  });

  // Update window title
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    if (activeFile) {
      appWindow.setTitle(`${activeFile.filename} — Houston 2.0`);
    } else {
      appWindow.setTitle("Houston 2.0");
    }
  }, [activeFile]);

  // Tauri native drag and drop
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
          if (isMarkdownPath(path)) {
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
      if (!watchedFolder) return;

      try {
        const files = await watchFolder(watchedFolder);
        if (cancelled) return;

        for (const path of files) {
          await openFile(path);
        }
      } catch {
        if (!cancelled) {
          setWatchedFolder(null);
        }
      }
    };

    restoreWatchedFolder();

    return () => {
      cancelled = true;
    };
  }, [watchedFolder, openFile, setWatchedFolder]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      unlisteners.push(
        await listen<string[]>("app:open-files", async (event) => {
          for (const path of event.payload) {
            if (isMarkdownPath(path)) {
              await openFile(path);
            }
          }
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-added", async (event) => {
          if (isMarkdownPath(event.payload)) {
            await openFile(event.payload);
          }
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-changed", async (event) => {
          if (isMarkdownPath(event.payload)) {
            await reloadFile(event.payload);
          }
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-removed", async (event) => {
          closeFile(event.payload);
        }),
      );

      const pendingPaths = await consumePendingOpenFiles();
      if (cancelled) return;

      for (const path of pendingPaths) {
        if (isMarkdownPath(path)) {
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
  }, [openFile, reloadFile, closeFile]);

  useEffect(() => {
    return () => {
      stopWatcher().catch(() => {});
    };
  }, []);

  return (
    <div className="app">
      <Sidebar
        files={openFiles}
        activeFilePath={activeFilePath}
        onSelect={setActiveFilePath}
        onClose={closeFile}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
      />
      <ReaderPane
        content={activeFile?.content ?? null}
        filePath={activeFilePath}
        scrollPositions={scrollPositions}
        onScroll={updateScrollPosition}
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
