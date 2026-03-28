import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Sidebar from "./components/Sidebar";
import ReaderPane from "./components/ReaderPane";
import { useFileManager } from "./hooks/useFileManager";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import "./styles/theme.css";
import "./App.css";

const MD_EXTENSIONS = ["md", "mdx", "markdown"];

function App() {
  const {
    openFiles,
    activeFile,
    activeFilePath,
    scrollPositions,
    openFile,
    closeFile,
    setActiveFilePath,
    updateScrollPosition,
  } = useFileManager();

  const [dragOver, setDragOver] = useState(false);

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
    if (selected) {
      // TODO: folder watching (Step 8-9)
      console.log("Folder selected:", selected);
    }
  }, []);

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
      appWindow.setTitle(`${activeFile.filename} — Houston`);
    } else {
      appWindow.setTitle("Houston");
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
          if (MD_EXTENSIONS.some((ext) => path.endsWith(`.${ext}`))) {
            await openFile(path);
          }
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openFile]);

  return (
    <div className="app">
      <Sidebar
        files={openFiles}
        activeFilePath={activeFilePath}
        onSelect={setActiveFilePath}
        onClose={closeFile}
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
