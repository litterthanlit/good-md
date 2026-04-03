import { invoke } from "@tauri-apps/api/core";
import type { SearchResult } from "./types";

export async function readMarkdownFile(path: string): Promise<string> {
  return invoke<string>("read_markdown_file", { path });
}

export async function writeMarkdownFile(
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>("write_markdown_file", { path, content });
}

export async function listMarkdownFiles(dir: string): Promise<string[]> {
  return invoke<string[]>("list_markdown_files", { dir });
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
