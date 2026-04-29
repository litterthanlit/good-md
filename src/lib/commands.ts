import { invoke } from "@tauri-apps/api/core";
import type {
  FileMetadata,
  PdfFrame,
  PdfOcrPage,
  PdfOperation,
  PdfSaveOptions,
  PdfSessionInfo,
  SearchResult,
} from "./types";

export async function readMarkdownFile(path: string): Promise<string> {
  return invoke<string>("read_markdown_file", { path });
}

export async function writeMarkdownFile(
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>("write_markdown_file", { path, content });
}

export async function readFileBytes(path: string): Promise<number[]> {
  return invoke<number[]>("read_file_bytes", { path });
}

export async function writeFileBytes(
  path: string,
  bytes: number[],
): Promise<void> {
  return invoke<void>("write_file_bytes", { path, bytes });
}

export async function getFileMetadata(path: string): Promise<FileMetadata> {
  return invoke<FileMetadata>("get_file_metadata", { path });
}

export async function listDocumentFiles(dir: string): Promise<string[]> {
  return invoke<string[]>("list_document_files", { dir });
}

export async function watchFolder(dir: string): Promise<string[]> {
  return invoke<string[]>("watch_folder", { dir });
}

export async function stopWatcher(): Promise<void> {
  return invoke<void>("stop_watcher");
}

export async function consumePendingOpenFiles(): Promise<string[]> {
  return invoke<string[]>("consume_pending_open_files");
}

export async function searchMarkdownFiles(params: {
  dir: string | null;
  filePaths: string[];
  query: string;
}): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_markdown_files", params);
}

export async function pdfOpenSession(path: string): Promise<PdfSessionInfo> {
  return invoke<PdfSessionInfo>("pdf_open_session", { path });
}

export async function pdfCloseSession(sessionId: string): Promise<void> {
  return invoke<void>("pdf_close_session", { sessionId });
}

export async function pdfAttachView(
  sessionId: string,
  windowLabel: string,
  frame: PdfFrame,
): Promise<void> {
  return invoke<void>("pdf_attach_view", { sessionId, windowLabel, frame });
}

export async function pdfSetViewFrame(
  sessionId: string,
  frame: PdfFrame,
): Promise<void> {
  return invoke<void>("pdf_set_view_frame", { sessionId, frame });
}

export async function pdfApplyOperation(
  sessionId: string,
  operation: PdfOperation,
): Promise<void> {
  return invoke<void>("pdf_apply_operation", { sessionId, operation });
}

export async function pdfUndo(sessionId: string): Promise<void> {
  return invoke<void>("pdf_undo", { sessionId });
}

export async function pdfRedo(sessionId: string): Promise<void> {
  return invoke<void>("pdf_redo", { sessionId });
}

export async function pdfRunOcr(
  sessionId: string,
  pages?: number[],
): Promise<PdfOcrPage[]> {
  return invoke<PdfOcrPage[]>("pdf_run_ocr", { sessionId, pages });
}

export async function pdfSearch(
  sessionId: string,
  query: string,
): Promise<Array<{ path: string; page: number; snippet: string }>> {
  return invoke<Array<{ path: string; page: number; snippet: string }>>("pdf_search", {
    sessionId,
    query,
  });
}

export async function pdfSave(
  sessionId: string,
  options: PdfSaveOptions,
): Promise<FileMetadata> {
  return invoke<FileMetadata>("pdf_save", { sessionId, options });
}
