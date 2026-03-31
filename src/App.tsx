import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Sidebar from "./components/Sidebar";
import ReaderPane from "./components/ReaderPane";
import OutlinePane from "./components/OutlinePane";
import CommandPalette from "./components/CommandPalette";
import { useFileManager } from "./hooks/useFileManager";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useThemePreference } from "./hooks/useThemePreference";
import {
  consumePendingOpenFiles,
  searchMarkdownFiles,
  stopWatcher,
  watchFolder,
} from "./lib/commands";
import { extractHeadings } from "./lib/markdown";
import { loadState, saveState } from "./lib/store";
import type { CommandPaletteItem, SearchResult } from "./lib/types";
import "./styles/theme.css";
import "./App.css";

const MD_EXTENSIONS = ["md", "mdx", "markdown"];
const NARROW_LAYOUT_WIDTH = 1180;

function isMarkdownPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? MD_EXTENSIONS.includes(extension) : false;
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
    setActiveFilePath,
    setWatchedFilePaths,
    watchedFolder,
    setWatchedFolder,
    updateScrollPosition,
  } = useFileManager();

  const [dragOver, setDragOver] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"all" | "search">("all");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [jumpTarget, setJumpTarget] = useState<{
    filePath: string;
    headingId: string | null;
    nonce: number;
  } | null>(null);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [outlineInitialized, setOutlineInitialized] = useState(false);
  const [isNarrowLayout, setIsNarrowLayout] = useState(
    () => window.innerWidth < NARROW_LAYOUT_WIDTH,
  );
  const { themePreference, setThemePreference } = useThemePreference();

  const activeHeadings = useMemo(
    () => (activeFile ? extractHeadings(activeFile.content) : []),
    [activeFile],
  );

  useEffect(() => {
    loadState()
      .then((state) => {
        setOutlineVisible(state.outlineVisible);
        setOutlineInitialized(true);
      })
      .catch(() => setOutlineInitialized(true));
  }, []);

  useEffect(() => {
    if (!outlineInitialized) return;
    saveState({ outlineVisible }).catch(() => {});
  }, [outlineVisible, outlineInitialized]);

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

  const openPalette = useCallback((mode: "all" | "search") => {
    setPaletteMode(mode);
    setPaletteQuery("");
    setPaletteOpen(true);
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

  useKeyboardShortcuts({
    onOpenFile: handleOpenFile,
    onOpenFolder: handleOpenFolder,
    onCloseFile: handleCloseFile,
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onOpenCommandPalette: () => openPalette("all"),
    onOpenSearch: () => openPalette("search"),
    onToggleOutline: () => setOutlineVisible((current) => !current),
    onNavigateHeadingPrev: handlePreviousHeading,
    onNavigateHeadingNext: handleNextHeading,
  });

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    if (activeFile) {
      appWindow.setTitle(`${activeFile.filename} — Houston 2.0`);
    } else {
      appWindow.setTitle("Houston 2.0");
    }
  }, [activeFile]);

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
            if (isMarkdownPath(path)) {
              await openFile(path);
            }
          }
        }),
      );

      unlisteners.push(
        await listen<string>("watcher:file-added", async (event) => {
          if (!isMarkdownPath(event.payload)) return;
          setWatchedFilePaths((current) =>
            Array.from(new Set([...current, event.payload])).sort(),
          );
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
          setWatchedFilePaths((current) =>
            current.filter((path) => path !== event.payload),
          );
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
  }, [openFile, reloadFile, closeFile, setWatchedFilePaths]);

  useEffect(() => {
    return () => {
      stopWatcher().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!paletteOpen || paletteQuery.trim() === "") {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchMarkdownFiles({
        dir: watchedFolder,
        filePaths: openFiles.map((file) => file.path),
        query: paletteQuery,
      })
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
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
  }, [paletteOpen, paletteQuery, watchedFolder, openFiles]);

  const paletteSections = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    const sections: Array<{ title: string; items: CommandPaletteItem[] }> = [];

    const openFileItems: CommandPaletteItem[] = openFiles
      .filter((file) => !query || matchesQuery(file.filename, query))
      .slice(0, 10)
      .map((file) => ({
        kind: "open-file",
        id: `open:${file.path}`,
        label: file.filename,
        detail: file.parentFolder || "Open file",
        path: file.path,
      }));

    if (openFileItems.length > 0) {
      sections.push({ title: "Open Files", items: openFileItems });
    }

    const headingItems: CommandPaletteItem[] = activeHeadings
      .filter((heading) => !query || matchesQuery(heading.text, query))
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
              detail: fileDetail(path) || "Watched folder",
              path,
            }))
        : [];

    if (watchedFolderItems.length > 0) {
      sections.push({ title: "Watched Folder", items: watchedFolderItems });
    }

    const searchItems: CommandPaletteItem[] = searchResults.map((result) => ({
      kind: "search-result",
      id: `search:${result.path}:${result.line}:${result.headingId ?? "top"}`,
      label: result.filename,
      detail: `${result.parentFolder || "Search"} • ${result.snippet}`,
      result,
    }));

    if (searchItems.length > 0) {
      sections.push({ title: "Search Results", items: searchItems });
    }

    const actions: CommandPaletteItem[] = [
      {
        kind: "action",
        id: "action:open-file",
        label: "Open file",
        detail: "Choose markdown files to open",
        action: "open-file",
      },
      {
        kind: "action",
        id: "action:open-folder",
        label: "Open folder",
        detail: "Watch a folder and search across it",
        action: "open-folder",
      },
      {
        kind: "action",
        id: "action:outline",
        label: outlineVisible ? "Hide outline" : "Show outline",
        detail: "Toggle the document outline pane",
        action: "toggle-outline",
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
    ] as CommandPaletteItem[];

    const filteredActions = actions.filter(
      (item) => !query || matchesQuery(`${item.label} ${item.detail}`, query),
    );

    if (filteredActions.length > 0) {
      sections.push({ title: "Actions", items: filteredActions });
    }

    return sections;
  }, [
    activeHeadings,
    openFiles,
    outlineVisible,
    paletteMode,
    paletteQuery,
    searchResults,
    watchedFilePaths,
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
        jumpToHeading(item.result.headingId, item.result.path);
        return;
      }

      switch (item.action) {
        case "open-file":
          await handleOpenFile();
          break;
        case "open-folder":
          await handleOpenFolder();
          break;
        case "toggle-outline":
          setOutlineVisible((current) => !current);
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
        onClose={closeFile}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
      />

      <div className="main-shell">
        <ReaderPane
          content={activeFile?.content ?? null}
          filePath={activeFilePath}
          filename={activeFile?.filename ?? null}
          headings={activeHeadings}
          activeHeadingId={activeHeadingId}
          jumpTarget={jumpTarget}
          outlineVisible={outlineVisible}
          scrollPositions={scrollPositions}
          onScroll={updateScrollPosition}
          onActiveHeadingChange={setActiveHeadingId}
          onJumpHandled={handleJumpHandled}
          onOpenCommandPalette={() => openPalette("all")}
          onOpenSearch={() => openPalette("search")}
          onToggleOutline={() => setOutlineVisible((current) => !current)}
        />

        {!isNarrowLayout && outlineVisible ? (
          <OutlinePane
            headings={activeHeadings}
            activeHeadingId={activeHeadingId}
            onSelect={(headingId) => jumpToHeading(headingId)}
          />
        ) : null}
      </div>

      {isNarrowLayout && outlineVisible ? (
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
