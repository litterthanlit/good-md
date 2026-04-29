use crate::{
    watcher::{self, WatcherState},
    PendingOpenFiles,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};

pub struct PdfSessionState(pub Mutex<HashMap<String, PdfSession>>);

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

#[derive(Clone)]
pub struct PdfSession {
    path: String,
    modified_ms: u64,
    size: u64,
    dirty: bool,
    operations: Vec<PdfOperation>,
    undone_operations: Vec<PdfOperation>,
    ocr_pages: Vec<PdfOcrPage>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRect {
    page_index: usize,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PdfOperation {
    AddAnnotation {
        page_index: usize,
        annotation_type: String,
        rect: PdfRect,
        text: Option<String>,
        color: Option<String>,
    },
    DeleteAnnotation {
        annotation_id: String,
    },
    PageRotate {
        page_index: usize,
        degrees: i32,
    },
    PageDelete {
        page_index: usize,
    },
    PageMove {
        from_index: usize,
        to_index: usize,
    },
    RedactionMark {
        rect: PdfRect,
        reason: Option<String>,
    },
    FormValue {
        field_name: String,
        value: String,
    },
    SecurityChange {
        owner_password: Option<String>,
        user_password: Option<String>,
        allow_printing: bool,
        allow_copying: bool,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPermissions {
    can_print: bool,
    can_copy: bool,
    can_annotate: bool,
    can_fill_forms: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSessionInfo {
    session_id: String,
    path: String,
    page_count: usize,
    encrypted: bool,
    permissions: PdfPermissions,
    has_forms: bool,
    ocr_available: bool,
    dirty: bool,
    engine: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFrame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSaveOptions {
    mode: String,
    target_path: Option<String>,
    create_backup: Option<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrWord {
    text: String,
    confidence: f64,
    rect: PdfRect,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOcrPage {
    page_index: usize,
    text: String,
    words: Vec<PdfOcrWord>,
    confidence: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSearchResult {
    path: String,
    page: usize,
    snippet: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfDirtyChanged {
    session_id: String,
    dirty: bool,
}

fn is_markdown_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "mdx" | "markdown"))
        .unwrap_or(false)
}

fn is_pdf_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
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

fn file_metadata_for_path(path: &str) -> Result<FileMetadata, String> {
    let metadata =
        std::fs::metadata(path).map_err(|e| format!("Failed to stat {}: {}", path, e))?;
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

fn pdf_session_id(path: &str, metadata: &FileMetadata) -> String {
    let mut hash = 1469598103934665603u64;
    for byte in path.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("pdf-{}-{}-{}", hash, metadata.modified_ms, metadata.size)
}

fn pdf_contains(bytes: &[u8], marker: &str) -> bool {
    String::from_utf8_lossy(bytes).contains(marker)
}

fn backup_path(path: &str) -> PathBuf {
    let original = Path::new(path);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let filename = original
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.pdf");
    original.with_file_name(format!("{filename}.{timestamp}.bak"))
}

fn atomic_copy_replace(source_path: &str, target_path: &str) -> Result<FileMetadata, String> {
    let bytes =
        std::fs::read(source_path).map_err(|e| format!("Failed to read {}: {}", source_path, e))?;
    let target = Path::new(target_path);
    let filename = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("document.pdf");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp_path = target.with_file_name(format!(".{filename}.{nonce}.houston-tmp"));
    std::fs::write(&temp_path, bytes)
        .map_err(|e| format!("Failed to write {}: {}", temp_path.display(), e))?;
    std::fs::rename(&temp_path, target_path)
        .map_err(|e| format!("Failed to replace {}: {}", target_path, e))?;
    file_metadata_for_path(target_path)
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
    file_metadata_for_path(&path)
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

#[tauri::command]
pub async fn pdf_open_session(
    path: String,
    state: State<'_, PdfSessionState>,
) -> Result<PdfSessionInfo, String> {
    if !is_pdf_path(&path) {
        return Err(format!("Not a PDF document: {}", path));
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    let metadata = file_metadata_for_path(&path)?;
    let session_id = pdf_session_id(&path, &metadata);
    let encrypted = pdf_contains(&bytes, "/Encrypt");
    let has_forms = pdf_contains(&bytes, "/AcroForm");
    let session = PdfSession {
        path: path.clone(),
        modified_ms: metadata.modified_ms,
        size: metadata.size,
        dirty: false,
        operations: Vec::new(),
        undone_operations: Vec::new(),
        ocr_pages: Vec::new(),
    };

    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(session_id.clone(), session);

    Ok(PdfSessionInfo {
        session_id,
        path,
        page_count: 0,
        encrypted,
        permissions: PdfPermissions {
            can_print: true,
            can_copy: !encrypted,
            can_annotate: true,
            can_fill_forms: has_forms,
        },
        has_forms,
        ocr_available: false,
        dirty: false,
        engine: "read-only-native-foundation".to_string(),
    })
}

#[tauri::command]
pub async fn pdf_close_session(
    session_id: String,
    state: State<'_, PdfSessionState>,
) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn pdf_attach_view(
    session_id: String,
    window_label: String,
    frame: PdfFrame,
    state: State<'_, PdfSessionState>,
) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    if !sessions.contains_key(&session_id) {
        return Err(format!("Unknown PDF session: {}", session_id));
    }

    let _ = (window_label, frame.x, frame.y, frame.width, frame.height);
    Err("Native PDFKit view embedding is not implemented yet".to_string())
}

#[tauri::command]
pub async fn pdf_set_view_frame(
    session_id: String,
    frame: PdfFrame,
    state: State<'_, PdfSessionState>,
) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    if !sessions.contains_key(&session_id) {
        return Err(format!("Unknown PDF session: {}", session_id));
    }

    let _ = (frame.x, frame.y, frame.width, frame.height);
    Err("Native PDFKit view embedding is not implemented yet".to_string())
}

#[tauri::command]
pub async fn pdf_apply_operation(
    session_id: String,
    operation: PdfOperation,
    app_handle: AppHandle,
    state: State<'_, PdfSessionState>,
) -> Result<(), String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    if !sessions.contains_key(&session_id) {
        return Err(format!("Unknown PDF session: {}", session_id));
    }

    let _ = (operation, app_handle);
    Err(
        "Native PDF editing is not implemented yet; use the PDF.js editor for current edits"
            .to_string(),
    )
}

#[tauri::command]
pub async fn pdf_undo(
    session_id: String,
    app_handle: AppHandle,
    state: State<'_, PdfSessionState>,
) -> Result<(), String> {
    let mut sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Unknown PDF session: {}", session_id))?;
    if let Some(operation) = session.operations.pop() {
        session.undone_operations.push(operation);
    }
    session.dirty = !session.operations.is_empty();
    let _ = app_handle.emit(
        "pdf:dirty-changed",
        PdfDirtyChanged {
            session_id,
            dirty: session.dirty,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn pdf_redo(
    session_id: String,
    app_handle: AppHandle,
    state: State<'_, PdfSessionState>,
) -> Result<(), String> {
    let mut sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Unknown PDF session: {}", session_id))?;
    if let Some(operation) = session.undone_operations.pop() {
        session.operations.push(operation);
    }
    session.dirty = !session.operations.is_empty();
    let _ = app_handle.emit(
        "pdf:dirty-changed",
        PdfDirtyChanged {
            session_id,
            dirty: session.dirty,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn pdf_run_ocr(
    session_id: String,
    pages: Option<Vec<usize>>,
    app_handle: AppHandle,
    state: State<'_, PdfSessionState>,
) -> Result<Vec<PdfOcrPage>, String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    if !sessions.contains_key(&session_id) {
        return Err(format!("Unknown PDF session: {}", session_id));
    }

    let _ = (pages, app_handle);
    Err("Native OCR is not implemented yet".to_string())
}

#[tauri::command]
pub async fn pdf_search(
    session_id: String,
    query: String,
    state: State<'_, PdfSessionState>,
) -> Result<Vec<PdfSearchResult>, String> {
    let sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Unknown PDF session: {}", session_id))?;
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    Ok(session
        .ocr_pages
        .iter()
        .filter(|page| page.text.to_lowercase().contains(&query))
        .map(|page| PdfSearchResult {
            path: session.path.clone(),
            page: page.page_index + 1,
            snippet: page.text.chars().take(140).collect(),
        })
        .collect())
}

#[tauri::command]
pub async fn pdf_save(
    session_id: String,
    options: PdfSaveOptions,
    app_handle: AppHandle,
    state: State<'_, PdfSessionState>,
) -> Result<FileMetadata, String> {
    let mut sessions = state.0.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Unknown PDF session: {}", session_id))?;
    if !session.operations.is_empty() {
        return Err(
            "Native PDF save cannot apply pending edit operations yet; use the PDF.js editor or discard the native draft"
                .to_string(),
        );
    }
    let target_path = match options.mode.as_str() {
        "overwrite" => session.path.clone(),
        "copy" => options
            .target_path
            .clone()
            .ok_or_else(|| "Copy saves require targetPath".to_string())?,
        other => return Err(format!("Unsupported PDF save mode: {}", other)),
    };

    if options.mode == "overwrite" && options.create_backup.unwrap_or(true) {
        let backup = backup_path(&session.path);
        std::fs::copy(&session.path, &backup)
            .map_err(|e| format!("Failed to create backup {}: {}", backup.display(), e))?;
    }

    let metadata = atomic_copy_replace(&session.path, &target_path)?;
    session.modified_ms = metadata.modified_ms;
    session.size = metadata.size;
    session.dirty = false;
    session.operations.clear();
    session.undone_operations.clear();
    let _ = app_handle.emit(
        "pdf:dirty-changed",
        PdfDirtyChanged {
            session_id,
            dirty: false,
        },
    );
    Ok(metadata)
}
