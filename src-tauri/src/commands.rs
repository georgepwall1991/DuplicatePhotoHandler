//! Tauri commands for the duplicate photo finder.

use duplicate_photo_cleaner::core::comparator::DuplicateGroup;
use duplicate_photo_cleaner::core::hasher::HashAlgorithmKind;
use duplicate_photo_cleaner::core::pipeline::{CancellationToken, Pipeline, PipelineResult};
use duplicate_photo_cleaner::core::reporter::{export_csv, export_html};
use duplicate_photo_cleaner::core::watcher::{FolderWatcher, WatcherConfig, WatcherEvent as CoreWatcherEvent};
use duplicate_photo_cleaner::events::{Event, EventSender, PipelineEvent, WatcherEvent};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Application state
pub struct AppState {
    /// Last scan results
    pub results: Mutex<Option<PipelineResult>>,
    /// Whether a scan is currently running
    pub scanning: Mutex<bool>,
    /// Cancellation flag for current scan
    pub cancelled: Arc<AtomicBool>,
    /// Folder watcher for background monitoring
    pub watcher: Mutex<Option<FolderWatcher>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            results: Mutex::new(None),
            scanning: Mutex::new(false),
            cancelled: Arc::new(AtomicBool::new(false)),
            watcher: Mutex::new(None),
        }
    }
}

/// Scan configuration from frontend
#[derive(Debug, Deserialize)]
pub struct ScanConfig {
    pub paths: Vec<String>,
    pub threshold: u32,
    pub algorithm: Option<String>,
}

/// Duplicate group for frontend
#[derive(Debug, Serialize)]
pub struct DuplicateGroupDto {
    pub id: String,
    pub photos: Vec<String>,
    pub representative: String,
    pub match_type: String,
    pub duplicate_count: usize,
    pub duplicate_size_bytes: u64,
}

impl From<&DuplicateGroup> for DuplicateGroupDto {
    fn from(group: &DuplicateGroup) -> Self {
        Self {
            id: group.id.to_string(),
            photos: group.photos.iter().map(|p| p.display().to_string()).collect(),
            representative: group.representative.display().to_string(),
            match_type: format!("{:?}", group.match_type),
            duplicate_count: group.duplicate_count(),
            duplicate_size_bytes: group.duplicate_size_bytes,
        }
    }
}

/// Scan results for frontend
#[derive(Debug, Serialize)]
pub struct ScanResultDto {
    pub total_photos: usize,
    pub duplicate_groups: usize,
    pub duplicate_count: usize,
    pub potential_savings_bytes: u64,
    pub duration_ms: u64,
    pub groups: Vec<DuplicateGroupDto>,
    pub errors: Vec<String>,
}

/// Start a scan
#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    config: ScanConfig,
) -> Result<ScanResultDto, String> {
    // Check if already scanning
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        if *scanning {
            return Err("A scan is already in progress".to_string());
        }
        *scanning = true;
    }

    // Reset cancellation flag
    state.cancelled.store(false, Ordering::SeqCst);
    let cancelled = state.cancelled.clone();

    // Parse algorithm
    let algorithm = match config.algorithm.as_deref() {
        Some("average") => HashAlgorithmKind::Average,
        Some("perceptual") => HashAlgorithmKind::Perceptual,
        Some("fusion") => HashAlgorithmKind::Fusion,
        _ => HashAlgorithmKind::Difference,
    };

    // Build pipeline
    let paths: Vec<PathBuf> = config.paths.iter().map(PathBuf::from).collect();

    let pipeline = Pipeline::builder()
        .paths(paths)
        .algorithm(algorithm)
        .threshold(config.threshold)
        .build();

    // Create event sender that emits to frontend
    let app_handle = app.clone();
    let (sender, receiver) = crossbeam_channel::unbounded::<Event>();

    // Spawn event forwarder with cancellation check
    let forward_handle = app_handle.clone();
    let cancelled_check = cancelled.clone();
    std::thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            // Check if cancelled before forwarding
            if cancelled_check.load(Ordering::SeqCst) {
                // Emit cancelled event and stop
                let _ = forward_handle.emit("scan-event", &Event::Pipeline(PipelineEvent::Cancelled));
                break;
            }
            let _ = forward_handle.emit("scan-event", &event);
        }
    });

    let event_sender = EventSender::new(sender);

    // Run scan with cancellation support
    let cancel_token: CancellationToken = cancelled.clone();
    let scan_result = async {
        let task_result = tokio::task::spawn_blocking(move || {
            pipeline.run_with_cancellation(&event_sender, cancel_token)
        })
        .await
        .map_err(|e| e.to_string())?;

        task_result.map_err(|e| e.to_string())
    }
    .await;

    // ALWAYS reset scanning state, even on error (fixes potential deadlock)
    {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    }

    // Now handle the result
    let result = scan_result?;

    // Store results
    {
        let mut results = state.results.lock().map_err(|e| e.to_string())?;
        *results = Some(result.clone());
    }

    // Convert to DTO
    let dto = ScanResultDto {
        total_photos: result.total_photos,
        duplicate_groups: result.groups.len(),
        duplicate_count: result.groups.iter().map(|g| g.duplicate_count()).sum(),
        potential_savings_bytes: result.groups.iter().map(|g| g.duplicate_size_bytes).sum(),
        duration_ms: result.duration_ms,
        groups: result.groups.iter().map(DuplicateGroupDto::from).collect(),
        errors: result.errors.clone(),
    };

    Ok(dto)
}

/// Cancel the current scan
#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> Result<bool, String> {
    let scanning = state.scanning.lock().map_err(|e| e.to_string())?;
    if *scanning {
        state.cancelled.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Get the last scan results
#[tauri::command]
pub fn get_results(state: State<'_, AppState>) -> Result<Option<ScanResultDto>, String> {
    let results = state.results.lock().map_err(|e| e.to_string())?;

    Ok(results.as_ref().map(|result| ScanResultDto {
        total_photos: result.total_photos,
        duplicate_groups: result.groups.len(),
        duplicate_count: result.groups.iter().map(|g| g.duplicate_count()).sum(),
        potential_savings_bytes: result.groups.iter().map(|g| g.duplicate_size_bytes).sum(),
        duration_ms: result.duration_ms,
        groups: result.groups.iter().map(DuplicateGroupDto::from).collect(),
        errors: result.errors.clone(),
    }))
}

/// Check if a scan is running
#[tauri::command]
pub fn is_scanning(state: State<'_, AppState>) -> Result<bool, String> {
    let scanning = state.scanning.lock().map_err(|e| e.to_string())?;
    Ok(*scanning)
}

/// Result of trash operation
#[derive(Debug, Serialize)]
pub struct TrashResult {
    pub trashed: usize,
    pub errors: Vec<String>,
}

/// File information for comparison view
#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub modified: Option<String>,
    pub dimensions: Option<(u32, u32)>,
}

/// Get file information for comparison
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }

    let metadata = std::fs::metadata(&path_buf).map_err(|e| e.to_string())?;

    let filename = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let modified = metadata.modified().ok().map(|time| {
        let datetime: chrono::DateTime<chrono::Local> = time.into();
        datetime.format("%Y-%m-%d %H:%M").to_string()
    });

    // Try to get image dimensions
    let dimensions = image::image_dimensions(&path_buf).ok();

    Ok(FileInfo {
        path,
        filename,
        size_bytes: metadata.len(),
        modified,
        dimensions,
    })
}

/// Move files to trash
#[tauri::command]
pub async fn trash_files(paths: Vec<String>) -> Result<TrashResult, String> {
    let mut trashed = 0;
    let mut errors = Vec::new();

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            match trash::delete(&path) {
                Ok(_) => trashed += 1,
                Err(e) => {
                    let error_msg = format!("{}: {}", path_str, e);
                    log::warn!("Failed to trash {}", error_msg);
                    errors.push(error_msg);
                }
            }
        } else {
            errors.push(format!("{}: File not found", path_str));
        }
    }

    Ok(TrashResult { trashed, errors })
}

/// Result of restore operation
#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub restored: usize,
    pub errors: Vec<String>,
}

/// Quality score for an image
#[derive(Debug, Serialize)]
pub struct QualityScoreDto {
    pub path: String,
    pub sharpness: f64,
    pub contrast: f64,
    pub brightness: f64,
    pub overall: f64,
}

/// Get quality score for an image (sharpness, contrast, etc.)
#[tauri::command]
pub async fn get_quality_score(path: String) -> Result<QualityScoreDto, String> {
    use duplicate_photo_cleaner::core::quality::QualityAnalyzer;

    let path_buf = PathBuf::from(&path);

    if !path_buf.exists() {
        return Err(format!("File not found: {}", path));
    }

    let analyzer = QualityAnalyzer::default();
    let score = analyzer
        .analyze_file(&path_buf)
        .map_err(|e| format!("Failed to analyze: {:?}", e))?;

    Ok(QualityScoreDto {
        path,
        sharpness: score.sharpness,
        contrast: score.contrast,
        brightness: score.brightness,
        overall: score.overall,
    })
}

/// Validate filename for safe use in AppleScript
/// Only allows alphanumeric, spaces, dots, dashes, underscores, and common punctuation
fn is_safe_filename(filename: &str) -> bool {
    if filename.is_empty() || filename.len() > 255 {
        return false;
    }
    filename.chars().all(|c| {
        c.is_alphanumeric()
            || c == ' '
            || c == '.'
            || c == '-'
            || c == '_'
            || c == '('
            || c == ')'
            || c == '['
            || c == ']'
    })
}

/// Restore files from trash (macOS only)
/// Uses AppleScript to put files back to their original locations
#[tauri::command]
pub async fn restore_from_trash(filenames: Vec<String>) -> Result<RestoreResult, String> {
    let mut restored = 0;
    let mut errors = Vec::new();

    #[cfg(target_os = "macos")]
    {
        for filename in filenames {
            // Security: Validate filename to prevent AppleScript injection
            if !is_safe_filename(&filename) {
                errors.push(format!("{}: Invalid filename (contains unsafe characters)", filename));
                continue;
            }

            // AppleScript to restore a file from Trash
            // Safe because filename is validated above
            let script = format!(
                r#"
                tell application "Finder"
                    set trashItems to items of trash
                    repeat with trashItem in trashItems
                        if name of trashItem is "{}" then
                            move trashItem to (original item of trashItem)
                            return "ok"
                        end if
                    end repeat
                    return "not found"
                end tell
                "#,
                filename.replace("\"", "\\\"").replace("\\", "\\\\")
            );

            let output = std::process::Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output();

            match output {
                Ok(out) => {
                    let result = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if result == "ok" {
                        restored += 1;
                    } else {
                        errors.push(format!("{}: Not found in Trash", filename));
                    }
                }
                Err(e) => {
                    errors.push(format!("{}: {}", filename, e));
                }
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        errors.push("Restore from trash is only supported on macOS".to_string());
    }

    Ok(RestoreResult { restored, errors })
}

/// Start watching folders for changes
#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<bool, String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;

    // If already watching, stop first
    if watcher_guard.is_some() {
        *watcher_guard = None;
    }

    let app_handle = app.clone();

    // Create watcher with event handler
    let mut watcher = FolderWatcher::new(WatcherConfig::default(), move |event| {
        let tauri_event = match event {
            CoreWatcherEvent::PhotoAdded(path) => {
                Event::Watcher(WatcherEvent::PhotoAdded { path })
            }
            CoreWatcherEvent::PhotoModified(path) => {
                Event::Watcher(WatcherEvent::PhotoModified { path })
            }
            CoreWatcherEvent::PhotoRemoved(path) => {
                Event::Watcher(WatcherEvent::PhotoRemoved { path })
            }
            CoreWatcherEvent::Error(msg) => {
                Event::Watcher(WatcherEvent::Error { message: msg })
            }
        };
        let _ = app_handle.emit("watcher-event", &tauri_event);
    })
    .map_err(|e| e.to_string())?;

    // Watch all requested paths
    for path_str in &paths {
        let path = PathBuf::from(path_str);
        if path.exists() {
            watcher.watch(&path).map_err(|e| e.to_string())?;
            let _ = app.emit(
                "watcher-event",
                &Event::Watcher(WatcherEvent::Started { path }),
            );
        }
    }

    *watcher_guard = Some(watcher);

    Ok(true)
}

/// Stop watching folders
#[tauri::command]
pub fn stop_watching(state: State<'_, AppState>) -> Result<bool, String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;

    if watcher_guard.is_some() {
        *watcher_guard = None;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Check if watching is active
#[tauri::command]
pub fn is_watching(state: State<'_, AppState>) -> Result<bool, String> {
    let watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    Ok(watcher_guard.is_some())
}

/// Get currently watched paths
#[tauri::command]
pub fn get_watched_paths(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;

    match &*watcher_guard {
        Some(watcher) => Ok(watcher
            .watched_paths()
            .into_iter()
            .map(|p| p.display().to_string())
            .collect()),
        None => Ok(vec![]),
    }
}

/// Export result for frontend
#[derive(Debug, Serialize)]
pub struct ExportResultDto {
    pub success: bool,
    pub path: String,
    pub format: String,
    pub groups_exported: usize,
}

/// Export scan results to CSV
#[tauri::command]
pub fn export_results_csv(
    state: State<'_, AppState>,
    path: String,
) -> Result<ExportResultDto, String> {
    let results = state.results.lock().map_err(|e| e.to_string())?;

    let result = results.as_ref().ok_or("No scan results available")?;

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let writer = std::io::BufWriter::new(file);

    export_csv(&result.groups, writer).map_err(|e| e.to_string())?;

    Ok(ExportResultDto {
        success: true,
        path,
        format: "CSV".to_string(),
        groups_exported: result.groups.len(),
    })
}

/// Export scan results to HTML
#[tauri::command]
pub fn export_results_html(
    state: State<'_, AppState>,
    path: String,
    title: Option<String>,
) -> Result<ExportResultDto, String> {
    let results = state.results.lock().map_err(|e| e.to_string())?;

    let result = results.as_ref().ok_or("No scan results available")?;

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let writer = std::io::BufWriter::new(file);

    let report_title = title.unwrap_or_else(|| "Duplicate Photo Report".to_string());
    export_html(&result.groups, writer, &report_title).map_err(|e| e.to_string())?;

    Ok(ExportResultDto {
        success: true,
        path,
        format: "HTML".to_string(),
        groups_exported: result.groups.len(),
    })
}
