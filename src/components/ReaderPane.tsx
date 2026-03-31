import { useEffect, useRef } from "react";
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
  onScroll: (path: string, scrollTop: number) => void;
  onActiveHeadingChange: (headingId: string | null) => void;
  onJumpHandled: (nonce: number) => void;
  onOpenCommandPalette: () => void;
  onOpenSearch: () => void;
  onToggleOutline: () => void;
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
  onScroll,
  onActiveHeadingChange,
  onJumpHandled,
  onOpenCommandPalette,
  onOpenSearch,
  onToggleOutline,
}: ReaderPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
    if (containerRef.current && filePath) {
      const saved = scrollPositions[filePath] ?? 0;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = saved;
          updateActiveHeading();
        }
      });
    }
  }, [filePath, scrollPositions, headings]);

  useEffect(() => {
    if (!containerRef.current || !jumpTarget || jumpTarget.filePath !== filePath) {
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
  }, [filePath, jumpTarget, onJumpHandled]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = () => {
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
              Open a file, a folder, or use the command palette
            </div>
          </div>
          <div className="reader-toolbar-actions">
            <button type="button" onClick={onOpenSearch}>
              Search
            </button>
            <button type="button" onClick={onOpenCommandPalette}>
              Jump
            </button>
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
            {headings.length === 0
              ? "No headings"
              : `${headings.length} heading${headings.length === 1 ? "" : "s"}`}
            {activeHeadingId ? " • Reading with outline sync" : ""}
          </div>
        </div>
        <div className="reader-toolbar-actions">
          <button type="button" onClick={onOpenSearch}>
            Search
          </button>
          <button type="button" onClick={onOpenCommandPalette}>
            Jump
          </button>
          <button type="button" onClick={onToggleOutline}>
            {outlineVisible ? "Hide outline" : "Show outline"}
          </button>
        </div>
      </div>

      <div className="reader-pane" ref={containerRef} onScroll={handleScroll}>
        <MarkdownRenderer content={content} headings={headings} />
      </div>
    </div>
  );
}
