mod commands;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::start_scan,
            commands::cancel_scan,
            commands::get_results,
            commands::is_scanning,
            commands::trash_files,
            commands::get_file_info,
            commands::get_quality_score,
            commands::restore_from_trash,
            commands::start_watching,
            commands::stop_watching,
            commands::is_watching,
            commands::get_watched_paths,
            commands::export_results_csv,
            commands::export_results_html,
            commands::get_cache_info,
            commands::clear_cache,
            commands::scan_screenshots,
            commands::scan_large_files,
            commands::show_in_folder,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
