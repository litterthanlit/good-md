import type { OpenFile } from "../lib/types";
import SidebarItem from "./SidebarItem";
import "../styles/sidebar.css";

interface SidebarProps {
  files: OpenFile[];
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export default function Sidebar({
  files,
  activeFilePath,
  onSelect,
  onClose,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Files</div>
      <div className="sidebar-list">
        {files.length === 0 ? (
          <div className="sidebar-empty">No files open</div>
        ) : (
          files.map((file) => (
            <SidebarItem
              key={file.path}
              file={file}
              isActive={file.path === activeFilePath}
              onSelect={() => onSelect(file.path)}
              onClose={() => onClose(file.path)}
            />
          ))
        )}
      </div>
    </div>
  );
}
