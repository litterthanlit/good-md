mod commands;
mod watcher;

use std::{path::Path, sync::Mutex};
use tauri::{Emitter, Manager, RunEvent};

pub struct PendingOpenFiles(pub Mutex<Vec<String>>);

fn is_document_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "mdx" | "markdown" | "pdf"))
        .unwrap_or(false)
}

fn collect_launch_paths() -> Vec<String> {
    std::env::args_os()
        .skip(1)
        .filter_map(|arg| arg.into_string().ok())
        .filter(|path| is_document_path(path))
        .collect()
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn opened_urls_to_paths(urls: &[url::Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter_map(|path| path.into_os_string().into_string().ok())
        .filter(|path| is_document_path(path))
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(watcher::WatcherState(Mutex::new(None)))
        .manage(PendingOpenFiles(Mutex::new(collect_launch_paths())))
        .invoke_handler(tauri::generate_handler![
            commands::read_markdown_file,
            commands::write_markdown_file,
            commands::read_file_bytes,
            commands::write_file_bytes,
            commands::get_file_metadata,
            commands::watch_folder,
            commands::stop_watcher,
            commands::list_document_files,
            commands::consume_pending_open_files,
            commands::search_markdown_files
        ])
        .build(tauri::generate_context!())
        .expect("error while running Markwell");

    app.run(|app_handle, event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let RunEvent::Opened { urls } = event {
            let paths = opened_urls_to_paths(&urls);
            if paths.is_empty() {
                return;
            }

            let state = app_handle.state::<PendingOpenFiles>();
            if let Ok(mut guard) = state.0.lock() {
                guard.extend(paths.clone());
            }

            let _ = app_handle.emit("app:open-files", paths);
        }
    });
}
