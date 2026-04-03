import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandPaletteItem } from "../lib/types";

interface CommandPaletteSection {
  title: string;
  items: CommandPaletteItem[];
}

interface CommandPaletteProps {
  open: boolean;
  mode: "all" | "search";
  query: string;
  sections: CommandPaletteSection[];
  onQueryChange: (value: string) => void;
  onActivate: (item: CommandPaletteItem) => void;
  onClose: () => void;
}

export default function CommandPalette({
  open,
  mode,
  query,
  sections,
  onQueryChange,
  onActivate,
  onClose,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [query, open]);

  if (!open) {
    return null;
  }

  const activateIndex = (index: number) => {
    const item = items[index];
    if (!item) return;
    onActivate(item);
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "search" ? "Search documents" : "Command palette"}
      >
        <div className="palette-input-wrap">
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) =>
                  items.length === 0 ? 0 : Math.min(current + 1, items.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                activateIndex(activeIndex);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder={
              mode === "search"
                ? "Search filenames and document text"
                : "Go to files, headings, or app actions"
            }
          />
        </div>

        <div className="palette-results">
          {sections.length === 0 ? (
            <div className="palette-empty">
              {mode === "search"
                ? query.trim()
                  ? "No matching documents"
                  : "Start typing to search the current folder or your open files"
                : "No matching destinations or commands"}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.title} className="palette-section">
                <div className="palette-section-title">{section.title}</div>
                {section.items.map((item) => {
                  const index = items.findIndex((value) => value.id === item.id);
                  const selected = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`palette-item ${selected ? "active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => activateIndex(index)}
                    >
                      <span className="palette-item-label">{item.label}</span>
                      <span className="palette-item-detail">{item.detail}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
