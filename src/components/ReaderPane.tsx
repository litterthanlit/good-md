import { useEffect, useRef, type ReactNode } from "react";
import type { HeadingItem } from "../lib/types";
import MarkdownRenderer from "./MarkdownRenderer";
import EmptyState from "./EmptyState";

interface ReaderJumpTarget {
  filePath: string;
  headingId: string | null;
  nonce: number;
}

interface ReaderPaneProps {
  content: string | null;
  filePath: string | null;
  filename: string | null;
  headings: HeadingItem[];
  scrollPositions: Record<string, number>;
  activeHeadingId: string | null;
  jumpTarget: ReaderJumpTarget | null;
  outlineVisible: boolean;
  isEditing: boolean;
  isDirty: boolean;
  hasExternalChanges: boolean;
  onScroll: (path: string, scrollTop: number) => void;
  onActiveHeadingChange: (headingId: string | null) => void;
  onJumpHandled: (nonce: number) => void;
  onContentChange: (value: string) => void;
  onOpenCommandPalette: () => void;
  onOpenSearch: () => void;
  onSave: () => void;
  onToggleEditMode: () => void;
  onToggleOutline: () => void;
}

const isApplePlatform =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function shortcutLabel(key: string) {
  return isApplePlatform ? `⌘${key}` : `Ctrl+${key}`;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M13.2 13.2L17 17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoToIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6.4 3.7a2.7 2.7 0 1 0 0 5.4H8V11H6.4a2.7 2.7 0 1 0 2.6 3.3V12.6h2v1.7a2.7 2.7 0 1 0 2.6-3.3H12V9.1h1.6a2.7 2.7 0 1 0-2.6-3.3v1.7H9V5.8A2.7 2.7 0 0 0 6.4 3.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OutlineIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 5.5h12M4 10h12M4 14.5h7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {visible ? (
        <path
          d="M15 13.2l2 2-2 2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M17 13.2l-2 2 2 2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 14.7V16h1.3l8.1-8.1-1.3-1.3L4 14.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M11.7 5.3l1.3 1.3m1.6-3a1.1 1.1 0 0 1 1.6 0l.2.2a1.1 1.1 0 0 1 0 1.6l-1.7 1.7-1.8-1.8 1.7-1.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 4.5A1.5 1.5 0 0 1 5.5 3h7.9l2.6 2.6V15.5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 3.5v4h5v-4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({
  label,
  shortcut,
  active = false,
  onClick,
  children,
}: ToolbarButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;

  return (
    <button
      type="button"
      className={`reader-toolbar-button ${active ? "active" : ""}`}
      onClick={onClick}
      aria-label={title}
      title={title}
    >
      <span className="reader-toolbar-button-icon">{children}</span>
      <span className="reader-toolbar-button-label">{label}</span>
      {shortcut ? (
        <span className="reader-toolbar-button-shortcut" aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

export default function ReaderPane({
  content,
  filePath,
  filename,
  headings,
  scrollPositions,
  activeHeadingId,
  jumpTarget,
  outlineVisible,
  isEditing,
  isDirty,
  hasExternalChanges,
  onScroll,
  onActiveHeadingChange,
  onJumpHandled,
  onContentChange,
  onOpenCommandPalette,
  onOpenSearch,
  onSave,
  onToggleEditMode,
  onToggleOutline,
}: ReaderPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  const updateActiveHeading = () => {
    if (!containerRef.current || headings.length === 0) {
      onActiveHeadingChange(null);
      return;
    }

    const elements = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>("[data-heading-id]"),
    );
    const scrollTop = containerRef.current.scrollTop;
    const current =
      elements
        .filter((element) => element.offsetTop - scrollTop <= 96)
        .slice(-1)[0]
        ?.dataset.headingId ?? headings[0]?.id ?? null;

    onActiveHeadingChange(current);
  };

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    }
  }, [isEditing, filePath]);

  useEffect(() => {
    if (containerRef.current && filePath) {
      const saved = scrollPositions[filePath] ?? 0;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = saved;
          updateActiveHeading();
        }
      });
    }
  }, [filePath, isEditing, scrollPositions, headings]);

  useEffect(() => {
    if (
      isEditing ||
      !containerRef.current ||
      !jumpTarget ||
      jumpTarget.filePath !== filePath
    ) {
      return;
    }

    requestAnimationFrame(() => {
      if (!containerRef.current) {
        return;
      }

      if (jumpTarget.headingId) {
        const element = containerRef.current.querySelector<HTMLElement>(
          `[data-heading-id="${jumpTarget.headingId}"]`,
        );

        if (element) {
          containerRef.current.scrollTo({
            top: Math.max(element.offsetTop - 24, 0),
            behavior: "smooth",
          });
        }
      } else {
        containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }

      updateActiveHeading();
      onJumpHandled(jumpTarget.nonce);
    });
  }, [filePath, isEditing, jumpTarget, onJumpHandled]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = () => {
    if (isEditing) return;
    if (!filePath || !containerRef.current) return;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      if (containerRef.current) {
        onScroll(filePath, containerRef.current.scrollTop);
        updateActiveHeading();
      }
    }, 120);
  };

  if (content === null) {
    return (
      <div className="reader-shell">
        <div className="reader-toolbar">
          <div className="reader-toolbar-meta">
            <div className="reader-toolbar-title">Houston 2.0</div>
            <div className="reader-toolbar-subtitle">
              Open a file, search your docs, or jump with the command palette
            </div>
          </div>
          <div className="reader-toolbar-actions">
            <ToolbarButton
              label="Search"
              shortcut={shortcutLabel("F")}
              onClick={onOpenSearch}
            >
              <SearchIcon />
            </ToolbarButton>
            <ToolbarButton
              label="Go to"
              shortcut={shortcutLabel("K")}
              onClick={onOpenCommandPalette}
            >
              <GoToIcon />
            </ToolbarButton>
          </div>
        </div>
        <div className="reader-pane empty">
          <EmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="reader-shell">
      <div className="reader-toolbar">
        <div className="reader-toolbar-meta">
          <div className="reader-toolbar-title">{filename ?? "Untitled"}</div>
          <div className="reader-toolbar-subtitle">
            {isEditing
              ? isDirty
                ? "Editing markdown source • Unsaved changes"
                : "Editing markdown source"
              : headings.length === 0
                ? "No headings"
                : `${headings.length} heading${headings.length === 1 ? "" : "s"}`}
            {!isEditing && activeHeadingId ? " • Reading with outline sync" : ""}
          </div>
        </div>
        <div className="reader-toolbar-actions">
          <ToolbarButton
            label="Search"
            shortcut={shortcutLabel("F")}
            onClick={onOpenSearch}
          >
            <SearchIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Go to"
            shortcut={shortcutLabel("K")}
            onClick={onOpenCommandPalette}
          >
            <GoToIcon />
          </ToolbarButton>
          <ToolbarButton
            label={isEditing ? "Preview" : "Edit"}
            shortcut={shortcutLabel("E")}
            active={isEditing}
            onClick={onToggleEditMode}
          >
            <EditIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Save"
            shortcut={shortcutLabel("S")}
            active={isDirty}
            onClick={onSave}
          >
            <SaveIcon />
          </ToolbarButton>
          <ToolbarButton
            label={outlineVisible ? "Hide outline" : "Show outline"}
            shortcut={shortcutLabel("\\")}
            active={outlineVisible}
            onClick={onToggleOutline}
          >
            <OutlineIcon visible={outlineVisible} />
          </ToolbarButton>
        </div>
      </div>

      {hasExternalChanges ? (
        <div className="editor-banner" role="status">
          The file changed on disk while you were editing. Save to overwrite it,
          or reopen the file to load the outside changes.
        </div>
      ) : null}

      {isEditing ? (
        <div className="editor-pane">
          <textarea
            ref={editorRef}
            className="editor-textarea"
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            spellCheck={false}
            aria-label="Markdown editor"
          />
        </div>
      ) : (
        <div className="reader-pane" ref={containerRef} onScroll={handleScroll}>
          <MarkdownRenderer content={content} headings={headings} />
        </div>
      )}
    </div>
  );
}
