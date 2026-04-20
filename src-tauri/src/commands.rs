use crate::{
    watcher::{self, WatcherState},
    PendingOpenFiles,
};
use serde::Serialize;
use std::{
    collections::HashSet,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    kind: String,
    path: String,
    filename: String,
    parent_folder: String,
    snippet: String,
    line: usize,
    heading_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    modified_ms: u64,
    size: u64,
}

fn is_markdown_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "mdx" | "markdown"))
        .unwrap_or(false)
}

fn extract_file_info(path: &str) -> (String, String) {
    let path_obj = Path::new(path);
    let filename = path_obj
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();
    let parent_folder = path_obj
        .parent()
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();

    (filename, parent_folder)
}

fn normalize_heading_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn slug_base(value: &str) -> String {
    let mut output = String::new();
    let normalized = normalize_heading_text(value).to_lowercase();
    let mut last_was_dash = false;

    for ch in normalized.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_was_dash = false;
        } else if ch.is_whitespace() || ch == '-' {
            if !output.is_empty() && !last_was_dash {
                output.push('-');
                last_was_dash = true;
            }
        }
    }

    output.trim_matches('-').to_string()
}

fn create_slug(value: &str, seen: &mut std::collections::HashMap<String, usize>) -> String {
    let base = {
        let base = slug_base(value);
        if base.is_empty() {
            "section".to_string()
        } else {
            base
        }
    };

    let count = seen.entry(base.clone()).or_insert(0);
    let slug = if *count == 0 {
        base
    } else {
        format!("{}-{}", base, *count)
    };
    *count += 1;
    slug
}

fn extract_headings(content: &str) -> Vec<(usize, String)> {
    let lines: Vec<&str> = content.lines().collect();
    let mut headings = Vec::new();
    let mut seen = std::collections::HashMap::new();
    let mut fence_marker: Option<char> = None;
    let mut index = 0usize;

    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim_start();

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            let marker = trimmed.chars().next().unwrap_or('`');
            match fence_marker {
                None => fence_marker = Some(marker),
                Some(current) if current == marker => fence_marker = None,
                _ => {}
            }
            index += 1;
            continue;
        }

        if fence_marker.is_some() {
            index += 1;
            continue;
        }

        let hash_count = trimmed.chars().take_while(|ch| *ch == '#').count();
        if (1..=6).contains(&hash_count) {
            let text = normalize_heading_text(
                trimmed[hash_count..]
                    .trim()
                    .trim_end_matches('#')
                    .trim(),
            );
            if !text.is_empty() {
                headings.push((index + 1, create_slug(&text, &mut seen)));
            }
            index += 1;
            continue;
        }

        if index + 1 < lines.len() {
            let next = lines[index + 1].trim();
            let is_setext = !trimmed.is_empty()
                && !next.is_empty()
                && (next.chars().all(|ch| ch == '=')
                    || next.chars().all(|ch| ch == '-'));

            if is_setext {
                let text = normalize_heading_text(trimmed);
                if !text.is_empty() {
                    headings.push((index + 1, create_slug(&text, &mut seen)));
                }
                index += 2;
                continue;
            }
        }

        index += 1;
    }

    headings
}

fn find_heading_for_line(headings: &[(usize, String)], line: usize) -> Option<String> {
    headings
        .iter()
        .take_while(|(heading_line, _)| *heading_line <= line)
        .last()
        .map(|(_, id)| id.clone())
}

fn build_snippet(line: &str) -> String {
    let trimmed = normalize_heading_text(line);
    if trimmed.chars().count() <= 140 {
        trimmed
    } else {
        let snippet: String = trimmed.chars().take(137).collect();
        format!("{snippet}...")
    }
}

#[tauri::command]
pub async fn read_markdown_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub async fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub async fn write_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub async fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let modified_ms = modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(FileMetadata {
        modified_ms,
        size: metadata.len(),
    })
}

#[tauri::command]
pub async fn list_document_files(dir: String) -> Result<Vec<String>, String> {
    Ok(watcher::scan_directory(&dir))
}

#[tauri::command]
pub async fn watch_folder(
    dir: String,
    app_handle: AppHandle,
    state: State<'_, WatcherState>,
) -> Result<Vec<String>, String> {
    // Stop existing watcher if any
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;

    // Scan for existing files
    let files = watcher::scan_directory(&dir);

    // Start new watcher
    let w = watcher::start_watcher(&dir, app_handle)?;
    *guard = Some(w);

    Ok(files)
}

#[tauri::command]
pub async fn stop_watcher(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn consume_pending_open_files(
    state: State<'_, PendingOpenFiles>,
) -> Result<Vec<String>, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(std::mem::take(&mut *guard))
}

#[tauri::command]
pub async fn search_markdown_files(
    dir: Option<String>,
    file_paths: Vec<String>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let paths = if let Some(dir) = dir {
        watcher::scan_directory(&dir)
    } else {
        let mut seen = HashSet::new();
        file_paths
            .into_iter()
            .filter(|path| seen.insert(path.clone()))
            .collect()
    };

    let mut results = Vec::new();

    for path in paths {
        if !is_markdown_path(&path) {
            continue;
        }

        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };

        let (filename, parent_folder) = extract_file_info(&path);
        let filename_lower = filename.to_lowercase();
        let headings = extract_headings(&content);
        let mut best_score = if filename_lower.contains(&query) { 200 } else { 0 };
        let mut best_line = None;
        let mut best_snippet = None;

        for (index, line) in content.lines().enumerate() {
            let line_lower = line.to_lowercase();
            if line_lower.contains(&query) {
                let score = if line_lower == query {
                    140
                } else if line_lower.starts_with(&query) {
                    120
                } else {
                    100
                };

                if score > best_score || best_line.is_none() {
                    best_score = score;
                    best_line = Some(index + 1);
                    best_snippet = Some(build_snippet(line));
                }
            }
        }

        if best_line.is_none() && best_score == 0 {
            continue;
        }

        let line = best_line.unwrap_or(1);
        let heading_id = find_heading_for_line(&headings, line);
        let snippet = best_snippet.unwrap_or_else(|| build_snippet(&filename));

        results.push((
            best_score,
            SearchResult {
                kind: "markdown".to_string(),
                path,
                filename,
                parent_folder,
                snippet,
                line,
                heading_id,
            },
        ));
    }

    results.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| left.filename.cmp(&right.filename))
            .then_with(|| left.line.cmp(&right.line))
    });

    Ok(results
        .into_iter()
        .map(|(_, result)| result)
        .take(60)
        .collect())
}
