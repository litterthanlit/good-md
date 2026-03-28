use crate::watcher::{self, WatcherState};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn read_markdown_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub async fn list_markdown_files(dir: String) -> Result<Vec<String>, String> {
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
