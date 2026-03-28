mod commands;
mod watcher;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(watcher::WatcherState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::read_markdown_file,
            commands::watch_folder,
            commands::stop_watcher,
            commands::list_markdown_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running Houston");
}
