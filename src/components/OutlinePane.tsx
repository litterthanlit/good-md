import type { HeadingItem } from "../lib/types";

interface OutlinePaneProps {
  headings: HeadingItem[];
  activeHeadingId: string | null;
  onSelect: (headingId: string) => void;
  onClose?: () => void;
  narrow?: boolean;
}

export default function OutlinePane({
  headings,
  activeHeadingId,
  onSelect,
  onClose,
  narrow = false,
}: OutlinePaneProps) {
  return (
    <aside className={`outline-pane ${narrow ? "overlay" : ""}`}>
      <div className="outline-header">
        <div className="outline-title">Outline</div>
        {onClose ? (
          <button
            className="outline-close"
            type="button"
            onClick={onClose}
            aria-label="Close outline"
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="outline-list">
        {headings.length === 0 ? (
          <div className="outline-empty">No headings in this document</div>
        ) : (
          headings.map((heading) => (
            <button
              key={`${heading.id}-${heading.line}`}
              type="button"
              className={`outline-item ${
                heading.id === activeHeadingId ? "active" : ""
              }`}
              style={{ paddingLeft: `${0.8 + (heading.level - 1) * 0.8}rem` }}
              onClick={() => onSelect(heading.id)}
            >
              {heading.text}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
