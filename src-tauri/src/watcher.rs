use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

fn is_document(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "md" | "mdx" | "markdown" | "pdf"))
        .unwrap_or(false)
}

pub fn scan_directory(dir: &str) -> Vec<String> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && is_document(path) {
            if let Some(s) = path.to_str() {
                files.push(s.to_string());
            }
        }
    }
    files.sort();
    files
}

pub fn start_watcher(
    dir: &str,
    app_handle: AppHandle,
) -> Result<RecommendedWatcher, String> {
    let handle = app_handle.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            for path in &event.paths {
                if !is_document(path) {
                    continue;
                }
                let path_str = path.to_string_lossy().to_string();
                match event.kind {
                    EventKind::Create(_) => {
                        let _ = handle.emit("watcher:file-added", &path_str);
                    }
                    EventKind::Modify(_) => {
                        let _ = handle.emit("watcher:file-changed", &path_str);
                    }
                    EventKind::Remove(_) => {
                        let _ = handle.emit("watcher:file-removed", &path_str);
                    }
                    _ => {}
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(dir), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    Ok(watcher)
}
