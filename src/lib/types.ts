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

export interface PdfPermissions {
  canPrint: boolean;
  canCopy: boolean;
  canAnnotate: boolean;
  canFillForms: boolean;
}

export interface PdfSessionInfo {
  sessionId: string;
  path: string;
  pageCount: number;
  encrypted: boolean;
  permissions: PdfPermissions;
  hasForms: boolean;
  ocrAvailable: boolean;
  dirty: boolean;
  engine: string;
}

export interface PdfFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfOcrPage {
  pageIndex: number;
  text: string;
  words: Array<{
    text: string;
    confidence: number;
    rect: PdfFrame & { pageIndex: number };
  }>;
  confidence: number;
}

export type PdfOperation =
  | {
      kind: "addAnnotation";
      pageIndex: number;
      annotationType: string;
      rect: PdfFrame & { pageIndex: number };
      text?: string | null;
      color?: string | null;
    }
  | { kind: "deleteAnnotation"; annotationId: string }
  | { kind: "pageRotate"; pageIndex: number; degrees: number }
  | { kind: "pageDelete"; pageIndex: number }
  | { kind: "pageMove"; fromIndex: number; toIndex: number }
  | {
      kind: "redactionMark";
      rect: PdfFrame & { pageIndex: number };
      reason?: string | null;
    }
  | { kind: "formValue"; fieldName: string; value: string }
  | {
      kind: "securityChange";
      ownerPassword?: string | null;
      userPassword?: string | null;
      allowPrinting: boolean;
      allowCopying: boolean;
    };

export interface PdfSaveOptions {
  mode: "overwrite" | "copy";
  targetPath?: string | null;
  createBackup?: boolean;
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
