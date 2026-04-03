export interface OpenFile {
  path: string;
  filename: string;
  parentFolder: string;
  content: string;
}

export type ThemePreference = "system" | "light" | "dark";

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
  line: number;
}

export interface SearchResult {
  path: string;
  filename: string;
  parentFolder: string;
  snippet: string;
  line: number;
  headingId: string | null;
}

export type CommandPaletteItem =
  | {
      kind: "open-file";
      id: string;
      label: string;
      detail: string;
      path: string;
    }
  | {
      kind: "heading";
      id: string;
      label: string;
      detail: string;
      headingId: string;
    }
  | {
      kind: "search-result";
      id: string;
      label: string;
      detail: string;
      result: SearchResult;
    }
  | {
      kind: "action";
      id: string;
      label: string;
      detail: string;
      action:
        | "open-file"
        | "open-folder"
        | "toggle-outline"
        | "toggle-edit-mode"
        | "save-file"
        | "zoom-in"
        | "zoom-out"
        | "zoom-reset"
        | "theme-system"
        | "theme-light"
        | "theme-dark";
    };
