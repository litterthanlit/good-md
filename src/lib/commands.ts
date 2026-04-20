import { invoke } from "@tauri-apps/api/core";
import type { FileMetadata, SearchResult } from "./types";

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
