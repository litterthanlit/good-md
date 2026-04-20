import type { OpenDocument } from "../lib/types";

interface SidebarItemProps {
  file: OpenDocument;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export default function SidebarItem({
  file,
  isActive,
  onSelect,
  onClose,
}: SidebarItemProps) {
  return (
    <div
      className={`sidebar-item ${isActive ? "active" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="sidebar-item-info">
        <div className="sidebar-item-name">{file.filename}</div>
        <div className="sidebar-item-folder">
          {file.kind === "pdf" ? "PDF" : "Markdown"}
          {file.parentFolder ? ` • ${file.parentFolder}` : ""}
        </div>
      </div>
      <button
        className="sidebar-item-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close file"
      >
        &#215;
      </button>
    </div>
  );
}
