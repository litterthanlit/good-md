export type DocumentKind = "markdown" | "pdf";

export interface FileMetadata {
  modifiedMs: number;
  size: number;
}

interface BaseOpenDocument {
  path: string;
  filename: string;
  parentFolder: string;
  kind: DocumentKind;
}

export interface MarkdownDocument extends BaseOpenDocument {
  kind: "markdown";
  content: string;
}

export interface PdfDocument extends BaseOpenDocument {
  kind: "pdf";
  bytes: number[];
  metadata: FileMetadata;
}

export type OpenDocument = MarkdownDocument | PdfDocument;
export type OpenFile = OpenDocument;

export type ThemePreference = "system" | "light" | "dark";

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
  line: number;
}

export interface SearchResult {
  kind: DocumentKind;
  path: string;
  filename: string;
  parentFolder: string;
  snippet: string;
  line: number;
  headingId: string | null;
  page?: number;
}

export type PdfAnnotationKind = "highlight" | "note" | "text" | "ink" | "whiteout";

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfAnnotation {
  id: string;
  kind: PdfAnnotationKind;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  text?: string;
  fontSize?: number;
  points?: PdfPoint[];
}

export interface PdfEditState {
  annotations: PdfAnnotation[];
  rotations: Record<number, number>;
  deletedPages: number[];
  pageOrder: number[] | null;
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
        | "close-all-files"
        | "toggle-outline"
        | "toggle-edit-mode"
        | "save-file"
        | "save-file-as-copy"
        | "next-page"
        | "previous-page"
        | "rotate-page"
        | "delete-page"
        | "zoom-in"
        | "zoom-out"
        | "zoom-reset"
        | "theme-system"
        | "theme-light"
        | "theme-dark";
    };
