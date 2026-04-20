import type { DocumentKind } from "./types";

export const DOCUMENT_EXTENSIONS = ["md", "mdx", "markdown", "pdf"] as const;
export const MARKDOWN_EXTENSIONS = ["md", "mdx", "markdown"] as const;
export const PDF_EXTENSIONS = ["pdf"] as const;

export function getPathExtension(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function getDocumentKind(path: string): DocumentKind | null {
  const extension = getPathExtension(path);
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(extension)) {
    return "markdown";
  }
  if ((PDF_EXTENSIONS as readonly string[]).includes(extension)) {
    return "pdf";
  }
  return null;
}

export function isDocumentPath(path: string) {
  return getDocumentKind(path) !== null;
}

export function isMarkdownPath(path: string) {
  return getDocumentKind(path) === "markdown";
}

export function isPdfPath(path: string) {
  return getDocumentKind(path) === "pdf";
}

export function extractFileInfo(path: string) {
  const parts = path.split(/[\\/]+/);
  const filename = parts[parts.length - 1] || path;
  const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : "";
  return { filename, parentFolder };
}
