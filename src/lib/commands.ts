import { invoke } from "@tauri-apps/api/core";

export async function readMarkdownFile(path: string): Promise<string> {
  return invoke<string>("read_markdown_file", { path });
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
