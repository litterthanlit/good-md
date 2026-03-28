import { useEffect } from "react";

interface ShortcutHandlers {
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onCloseFile: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        handlers.onOpenFile();
      } else if (meta && e.key === "o" && e.shiftKey) {
        e.preventDefault();
        handlers.onOpenFolder();
      } else if (meta && e.key === "w") {
        e.preventDefault();
        handlers.onCloseFile();
      } else if (e.key === "ArrowUp" && !meta) {
        handlers.onNavigateUp();
      } else if (e.key === "ArrowDown" && !meta) {
        handlers.onNavigateDown();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
