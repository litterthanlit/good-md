import { invoke } from "@tauri-apps/api/core";

export async function readMarkdownFile(path: string): Promise<string> {
  return invoke<string>("read_markdown_file", { path });
}
