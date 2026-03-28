import { useRef, useEffect } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import EmptyState from "./EmptyState";

interface ReaderPaneProps {
  content: string | null;
  filePath: string | null;
  scrollPositions: Record<string, number>;
  onScroll: (path: string, scrollTop: number) => void;
}

export default function ReaderPane({
  content,
  filePath,
  scrollPositions,
  onScroll,
}: ReaderPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Restore scroll position when switching files
  useEffect(() => {
    if (containerRef.current && filePath) {
      const saved = scrollPositions[filePath] ?? 0;
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = saved;
        }
      });
    }
  }, [filePath, scrollPositions]);

  const handleScroll = () => {
    if (!filePath || !containerRef.current) return;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      if (containerRef.current) {
        onScroll(filePath, containerRef.current.scrollTop);
      }
    }, 300);
  };

  if (!content) {
    return (
      <div className="reader-pane">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="reader-pane" ref={containerRef} onScroll={handleScroll}>
      <MarkdownRenderer content={content} />
    </div>
  );
}
