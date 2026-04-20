import type { OpenDocument } from "../lib/types";
import type { ThemePreference } from "../lib/types";
import SidebarItem from "./SidebarItem";
import "../styles/sidebar.css";

interface SidebarProps {
  files: OpenDocument[];
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  themePreference: ThemePreference;
  onThemeChange: (value: ThemePreference) => void;
}

export default function Sidebar({
  files,
  activeFilePath,
  onSelect,
  onClose,
  themePreference,
  onThemeChange,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-header-title">Files</span>
        <label className="theme-select-wrap">
          <span className="theme-select-label">Theme</span>
          <select
            className="theme-select"
            value={themePreference}
            onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
      <div className="sidebar-list">
        {files.length === 0 ? (
          <div className="sidebar-empty">No documents open</div>
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
