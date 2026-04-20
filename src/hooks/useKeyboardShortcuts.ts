import { useEffect } from "react";

interface ShortcutHandlers {
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onCloseFile: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onOpenCommandPalette: () => void;
  onOpenSearch: () => void;
  onToggleOutline: () => void;
  onToggleEditMode: () => void;
  onSaveFile: () => void;
  onNavigateHeadingPrev: () => void;
  onNavigateHeadingNext: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onRotatePage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);

      if (meta && e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        handlers.onOpenFile();
      } else if (meta && e.key === "o" && e.shiftKey) {
        e.preventDefault();
        handlers.onOpenFolder();
      } else if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onOpenCommandPalette();
      } else if (meta && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handlers.onOpenSearch();
      } else if (meta && e.key === "\\") {
        e.preventDefault();
        handlers.onToggleOutline();
      } else if (meta && e.key.toLowerCase() === "e") {
        e.preventDefault();
        handlers.onToggleEditMode();
      } else if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handlers.onSaveFile();
      } else if (meta && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handlers.onRotatePage();
      } else if (meta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        handlers.onZoomIn();
      } else if (meta && e.key === "-") {
        e.preventDefault();
        handlers.onZoomOut();
      } else if (meta && e.key === "0") {
        e.preventDefault();
        handlers.onZoomReset();
      } else if (meta && e.key === "w") {
        e.preventDefault();
        handlers.onCloseFile();
      } else if (e.key === "ArrowUp" && !meta && !typing) {
        handlers.onNavigateUp();
      } else if (e.key === "ArrowDown" && !meta && !typing) {
        handlers.onNavigateDown();
      } else if (e.key === "ArrowLeft" && !meta && !typing) {
        handlers.onPreviousPage();
      } else if (e.key === "ArrowRight" && !meta && !typing) {
        handlers.onNextPage();
      } else if (e.key === "[" && !meta && !typing) {
        e.preventDefault();
        handlers.onNavigateHeadingPrev();
      } else if (e.key === "]" && !meta && !typing) {
        e.preventDefault();
        handlers.onNavigateHeadingNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
