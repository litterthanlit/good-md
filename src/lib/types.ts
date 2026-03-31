export interface OpenFile {
  path: string;
  filename: string;
  parentFolder: string;
  content: string;
}

export type ThemePreference = "system" | "light" | "dark";
