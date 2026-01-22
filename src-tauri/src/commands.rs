//! Tauri commands for the duplicate photo finder.

use duplicate_photo_cleaner::core::cache::{CacheBackend, SqliteCache};
use duplicate_photo_cleaner::core::comparator::DuplicateGroup;
use duplicate_photo_cleaner::core::hasher::HashAlgorithmKind;
use duplicate_photo_cleaner::core::history::{
    HistoryRepository, ModuleType as HistoryModuleType, ScanHistoryEntry, ScanHistoryResult,
    ScanStatus,
};
use duplicate_photo_cleaner::core::large_files::{LargeFileScanResult, LargeFileScanner};
use duplicate_photo_cleaner::core::organize::{
    OperationMode, OrganizeConfig, OrganizeExecutor, OrganizePlan, OrganizePlanner, OrganizeResult,
};
use duplicate_photo_cleaner::core::pipeline::{CancellationToken, Pipeline, PipelineResult};
use duplicate_photo_cleaner::core::reporter::{export_csv, export_html};
use duplicate_photo_cleaner::core::similar::{SimilarConfig, SimilarResult, SimilarScanner};
use duplicate_photo_cleaner::core::unorganized::{
    UnorganizedConfig, UnorganizedResult, UnorganizedScanner,
};
use duplicate_photo_cleaner::core::watcher::{
    FolderWatcher, WatcherConfig, WatcherEvent as CoreWatcherEvent,
};
use duplicate_photo_cleaner::events::{Event, EventSender, PipelineEvent, WatcherEvent};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

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
    /// Stored organize plan for execution
    pub organize_plan: Mutex<Option<OrganizePlan>>,
    /// History repository for storing scan results
    pub history: Mutex<Option<HistoryRepository>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            results: Mutex::new(None),
            scanning: Mutex::new(false),
            cancelled: Arc::new(AtomicBool::new(false)),
            watcher: Mutex::new(None),
            organize_plan: Mutex::new(None),
            history: Mutex::new(None),
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
            photos: group
                .photos
                .iter()
                .map(|p| p.display().to_string())
                .collect(),
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
                let _ =
                    forward_handle.emit("scan-event", &Event::Pipeline(PipelineEvent::Cancelled));
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
pub async fn trash_files(app: AppHandle, paths: Vec<String>) -> Result<TrashResult, String> {
    let mut trashed = 0;
    let mut errors = Vec::new();
    let mut trashed_paths = Vec::new();

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            match trash::delete(&path) {
                Ok(_) => {
                    trashed += 1;
                    trashed_paths.push(path);
                }
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

    // Remove trashed files from cache to keep it clean
    if !trashed_paths.is_empty() {
        if let Ok(cache_path) = get_cache_path(&app) {
            if cache_path.exists() {
                if let Ok(cache) = SqliteCache::open(&cache_path) {
                    for path in &trashed_paths {
                        let _ = cache.remove(path);
                    }
                }
            }
        }
    }

    Ok(TrashResult { trashed, errors })
}

/// DTO for a trashed file in the Recovery Zone
#[derive(Debug, Serialize)]
pub struct TrashedFileDto {
    pub filename: String,
    pub original_path: String,
    pub size_bytes: u64,
    pub trashed_at: i64,
}

/// Result of listing trashed files
#[derive(Debug, Serialize)]
pub struct TrashedFilesResult {
    pub files: Vec<TrashedFileDto>,
    pub total_size_bytes: u64,
}

/// List files in the system Trash (macOS only)
/// Uses AppleScript to enumerate trash items
#[tauri::command]
pub async fn get_trashed_files() -> Result<TrashedFilesResult, String> {
    let mut files = Vec::new();
    let mut total_size_bytes: u64 = 0;

    #[cfg(target_os = "macos")]
    {
        // AppleScript to list all items in Trash with their properties
        let script = r#"
            tell application "Finder"
                set output to ""
                set trashItems to items of trash
                repeat with trashItem in trashItems
                    try
                        set itemName to name of trashItem as string
                        set itemSize to size of trashItem
                        set itemPath to POSIX path of (original item of trashItem as alias)
                        set modDate to modification date of trashItem
                        set epochTime to (modDate - (date "Thursday, January 1, 1970 at 12:00:00 AM")) / 86400 * 86400
                        set output to output & itemName & "|" & itemPath & "|" & itemSize & "|" & (round epochTime) & "
"
                    end try
                end repeat
                return output
            end tell
        "#;

        let output = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to run AppleScript: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 4 {
                let filename = parts[0].to_string();
                let original_path = parts[1].to_string();
                let size_bytes: u64 = parts[2].parse().unwrap_or(0);
                let trashed_at: i64 = parts[3].parse().unwrap_or(0);

                total_size_bytes += size_bytes;
                files.push(TrashedFileDto {
                    filename,
                    original_path,
                    size_bytes,
                    trashed_at,
                });
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // On other platforms, return empty - Trash API varies significantly
        log::warn!("get_trashed_files is only supported on macOS");
    }

    Ok(TrashedFilesResult {
        files,
        total_size_bytes,
    })
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
                errors.push(format!(
                    "{}: Invalid filename (contains unsafe characters)",
                    filename
                ));
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
            CoreWatcherEvent::PhotoAdded(path) => Event::Watcher(WatcherEvent::PhotoAdded { path }),
            CoreWatcherEvent::PhotoModified(path) => {
                Event::Watcher(WatcherEvent::PhotoModified { path })
            }
            CoreWatcherEvent::PhotoRemoved(path) => {
                Event::Watcher(WatcherEvent::PhotoRemoved { path })
            }
            CoreWatcherEvent::Error(msg) => Event::Watcher(WatcherEvent::Error { message: msg }),
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

/// Cache info for frontend
#[derive(Debug, Serialize)]
pub struct CacheInfoDto {
    pub entries: usize,
    pub size_bytes: u64,
    pub path: String,
}

/// Screenshot confidence level for frontend
#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScreenshotConfidenceDto {
    High,
    Medium,
    Low,
}

impl From<duplicate_photo_cleaner::core::screenshot::ScreenshotConfidence>
    for ScreenshotConfidenceDto
{
    fn from(c: duplicate_photo_cleaner::core::screenshot::ScreenshotConfidence) -> Self {
        use duplicate_photo_cleaner::core::screenshot::ScreenshotConfidence;
        match c {
            ScreenshotConfidence::High => Self::High,
            ScreenshotConfidence::Medium => Self::Medium,
            ScreenshotConfidence::Low => Self::Low,
        }
    }
}

/// Screenshot info for frontend
#[derive(Debug, Serialize)]
pub struct ScreenshotInfoDto {
    pub path: String,
    pub size_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub date_taken: Option<String>,
    pub confidence: ScreenshotConfidenceDto,
    pub detection_reason: String,
    pub source_app: Option<String>,
}

/// Screenshot scan results for frontend
#[derive(Debug, Serialize)]
pub struct ScreenshotScanResultDto {
    pub all_screenshots: Vec<ScreenshotInfoDto>,
    pub duplicate_groups: Vec<DuplicateGroupDto>,
    pub total_size_bytes: u64,
    pub scan_duration_ms: u64,
}

/// Get the cache database path
fn get_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(app_data_dir.join("cache.db"))
}

/// Get cache information
#[tauri::command]
pub fn get_cache_info(app: AppHandle) -> Result<CacheInfoDto, String> {
    let cache_path = get_cache_path(&app)?;

    if !cache_path.exists() {
        return Ok(CacheInfoDto {
            entries: 0,
            size_bytes: 0,
            path: cache_path.display().to_string(),
        });
    }

    let cache = SqliteCache::open(&cache_path).map_err(|e| e.to_string())?;
    let stats = cache.stats().map_err(|e| e.to_string())?;

    // Get actual file size on disk
    let file_size = std::fs::metadata(&cache_path)
        .map(|m| m.len())
        .unwrap_or(stats.total_size_bytes);

    Ok(CacheInfoDto {
        entries: stats.total_entries,
        size_bytes: file_size,
        path: cache_path.display().to_string(),
    })
}

/// Clear the cache database
#[tauri::command]
pub fn clear_cache(app: AppHandle) -> Result<bool, String> {
    let cache_path = get_cache_path(&app)?;

    if !cache_path.exists() {
        return Ok(true);
    }

    let cache = SqliteCache::open(&cache_path).map_err(|e| e.to_string())?;
    cache.clear().map_err(|e| e.to_string())?;

    Ok(true)
}

/// DTO for interrupted scan state
#[derive(Debug, Serialize)]
pub struct ScanStateDto {
    pub directory: String,
    pub file_count: usize,
    pub last_scan_time: i64,
}

/// Get any interrupted scans that can be resumed
#[tauri::command]
pub fn get_interrupted_scans(app: AppHandle) -> Result<Vec<ScanStateDto>, String> {
    let cache_path = get_cache_path(&app)?;

    if !cache_path.exists() {
        return Ok(vec![]);
    }

    let cache = SqliteCache::open(&cache_path).map_err(|e| e.to_string())?;

    // Get all scan states from recent scans
    // For now, return empty - scan state tracking would need to be
    // integrated into the pipeline to track in-progress scans
    // This is a placeholder for future implementation
    let _ = cache;

    Ok(vec![])
}

/// Scan for screenshots and duplicates among them
#[tauri::command]
pub async fn scan_screenshots(
    app: AppHandle,
    state: State<'_, AppState>,
    config: ScanConfig,
) -> Result<ScreenshotScanResultDto, String> {
    use duplicate_photo_cleaner::core::metadata::extract_metadata;
    use duplicate_photo_cleaner::core::scanner::{PhotoScanner, WalkDirScanner};
    use duplicate_photo_cleaner::core::screenshot::is_screenshot;
    use std::time::Instant;

    // Check if already scanning
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        if *scanning {
            return Err("A scan is already in progress".to_string());
        }
        *scanning = true;
    }

    // Helper to reset scanning state on any exit path
    let reset_scanning = || {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    };

    // Reset cancellation flag
    state.cancelled.store(false, Ordering::SeqCst);
    let cancelled = state.cancelled.clone();

    let start_time = Instant::now();

    // Parse algorithm
    let algorithm = match config.algorithm.as_deref() {
        Some("average") => HashAlgorithmKind::Average,
        Some("perceptual") => HashAlgorithmKind::Perceptual,
        Some("fusion") => HashAlgorithmKind::Fusion,
        _ => HashAlgorithmKind::Difference,
    };

    // Build paths
    let paths: Vec<PathBuf> = config.paths.iter().map(PathBuf::from).collect();

    // Scan for all photos first
    let scanner =
        WalkDirScanner::new(duplicate_photo_cleaner::core::scanner::ScanConfig::default());
    let scan_result = match scanner.scan(&paths) {
        Ok(result) => result,
        Err(e) => {
            reset_scanning();
            return Err(e.to_string());
        }
    };

    let app_handle = app.clone();
    let (sender, receiver) = crossbeam_channel::unbounded::<Event>();

    // Spawn event forwarder
    let forward_handle = app_handle.clone();
    let cancelled_check = cancelled.clone();
    std::thread::spawn(move || {
        while let Ok(event) = receiver.recv() {
            if cancelled_check.load(Ordering::SeqCst) {
                let _ = forward_handle.emit(
                    "screenshot-scan-event",
                    &Event::Pipeline(PipelineEvent::Cancelled),
                );
                break;
            }
            let _ = forward_handle.emit("screenshot-scan-event", &event);
        }
    });

    let event_sender = EventSender::new(sender);

    // Filter photos to find screenshots
    // Optimization: check filename pattern first before expensive metadata extraction
    use duplicate_photo_cleaner::core::screenshot::might_be_screenshot;

    let mut screenshots = Vec::new();
    let mut screenshot_paths = Vec::new();
    let mut total_size_bytes: u64 = 0;

    for photo in &scan_result.photos {
        if cancelled.load(Ordering::SeqCst) {
            break;
        }

        // Quick filename check - skip metadata extraction for files that clearly aren't screenshots
        // This significantly improves performance for large photo libraries
        if !might_be_screenshot(&photo.path) {
            continue;
        }

        let metadata = extract_metadata(&photo.path);
        if let Some(screenshot_info) = is_screenshot(&photo.path, &metadata, photo.size) {
            // Convert width/height from Option to u32 with defaults
            let width = metadata.width.unwrap_or(0);
            let height = metadata.height.unwrap_or(0);

            let dto = ScreenshotInfoDto {
                path: screenshot_info.path.clone(),
                size_bytes: screenshot_info.size_bytes,
                width,
                height,
                date_taken: screenshot_info.date_taken,
                confidence: screenshot_info.confidence.into(),
                detection_reason: screenshot_info.detection_reason,
                source_app: screenshot_info.source_app,
            };

            total_size_bytes += screenshot_info.size_bytes;
            screenshot_paths.push(photo.path.clone());
            screenshots.push(dto);
        }
    }

    // Run duplicate detection on screenshots only if we found any
    let (duplicate_groups, _duplicate_count, _potential_savings) =
        if !screenshot_paths.is_empty() && !cancelled.load(Ordering::SeqCst) {
            let pipeline = Pipeline::builder()
                .paths(screenshot_paths.clone())
                .algorithm(algorithm)
                .threshold(config.threshold)
                .build();

            let cancel_token: CancellationToken = cancelled.clone();
            match tokio::task::spawn_blocking(move || {
                pipeline.run_with_cancellation(&event_sender, cancel_token)
            })
            .await
            {
                Ok(Ok(result)) => {
                    let groups: Vec<DuplicateGroupDto> =
                        result.groups.iter().map(DuplicateGroupDto::from).collect();
                    let dup_count: usize = groups.iter().map(|g| g.duplicate_count).sum();
                    let savings: u64 = groups.iter().map(|g| g.duplicate_size_bytes).sum();
                    (groups, dup_count, savings)
                }
                Ok(Err(e)) => {
                    log::error!("Screenshot duplicate detection failed: {}", e);
                    (Vec::new(), 0, 0)
                }
                Err(e) => {
                    log::error!("Screenshot duplicate detection task panicked: {}", e);
                    (Vec::new(), 0, 0)
                }
            }
        } else {
            (Vec::new(), 0, 0)
        };

    // ALWAYS reset scanning state
    {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    }

    let scan_duration_ms = start_time.elapsed().as_millis() as u64;

    Ok(ScreenshotScanResultDto {
        all_screenshots: screenshots,
        duplicate_groups,
        total_size_bytes,
        scan_duration_ms,
    })
}

/// Large file scan progress event
#[derive(Clone, Serialize)]
pub struct LargeFileScanProgress {
    pub files_scanned: u64,
    pub large_files_found: usize,
    pub current_file: String,
    pub phase: String,
}

/// Scan for large files
#[tauri::command]
pub async fn scan_large_files(
    app: AppHandle,
    paths: Vec<String>,
    min_size_mb: Option<u64>,
    max_results: Option<usize>,
    state: State<'_, AppState>,
) -> Result<LargeFileScanResult, String> {
    // Check if already scanning
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        if *scanning {
            return Err("A scan is already in progress".to_string());
        }
        *scanning = true;
    }

    // Helper to reset scanning state on any exit path
    let reset_scanning = || {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    };

    // Apply defaults if not provided
    let min_size_mb = min_size_mb.unwrap_or(10);
    let max_results = max_results.unwrap_or(50);

    // Create scanner with optional overrides
    let scanner = LargeFileScanner::new(min_size_mb, max_results);

    // Emit initial progress
    let _ = app.emit(
        "large-file-scan-event",
        LargeFileScanProgress {
            files_scanned: 0,
            large_files_found: 0,
            current_file: "Starting scan...".to_string(),
            phase: "Scanning".to_string(),
        },
    );

    // Run scan with progress callback in a blocking task to avoid blocking the async runtime
    let app_handle = app.clone();
    let paths_clone = paths.clone();
    let result = match tokio::task::spawn_blocking(move || {
        scanner.scan_with_progress(&paths_clone, |files_scanned, large_found, current| {
            let _ = app_handle.emit(
                "large-file-scan-event",
                LargeFileScanProgress {
                    files_scanned,
                    large_files_found: large_found,
                    current_file: current.to_string(),
                    phase: "Scanning".to_string(),
                },
            );
        })
    })
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            reset_scanning();
            return Err(e);
        }
        Err(e) => {
            reset_scanning();
            return Err(format!("Scan task panicked: {}", e));
        }
    };

    // Emit completion event
    let _ = app.emit(
        "large-file-scan-event",
        LargeFileScanProgress {
            files_scanned: result.files_scanned,
            large_files_found: result.files.len(),
            current_file: "".to_string(),
            phase: "Complete".to_string(),
        },
    );

    // Reset scanning state
    reset_scanning();

    Ok(result)
}

/// Show a file in the system file manager (Finder on macOS)
#[tauri::command]
pub fn show_in_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try to open the parent folder
        if let Some(parent) = path.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
    }

    Ok(())
}

/// Progress event for organize operations
#[derive(Clone, Serialize)]
pub struct OrganizeProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

/// Create an organization plan (preview)
#[tauri::command]
pub async fn create_organize_plan(
    app: AppHandle,
    config: OrganizeConfig,
    state: State<'_, AppState>,
) -> Result<OrganizePlan, String> {
    let app_handle = app.clone();

    let plan = tokio::task::spawn_blocking(move || {
        OrganizePlanner::create_plan(&config, |scanned, current| {
            let _ = app_handle.emit(
                "organize-progress-event",
                OrganizeProgress {
                    phase: "Scanning".to_string(),
                    current: scanned,
                    total: 0,
                    current_file: current.to_string(),
                },
            );
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Store plan for later execution
    if let Ok(mut stored) = state.organize_plan.lock() {
        *stored = Some(plan.clone());
    }

    // Emit completion
    let _ = app.emit(
        "organize-progress-event",
        OrganizeProgress {
            phase: "PlanReady".to_string(),
            current: plan.total_files,
            total: plan.total_files,
            current_file: String::new(),
        },
    );

    Ok(plan)
}

/// Execute the stored organization plan
#[tauri::command]
pub async fn execute_organize_plan(
    app: AppHandle,
    operation: OperationMode,
    state: State<'_, AppState>,
) -> Result<OrganizeResult, String> {
    let plan = {
        let stored = state.organize_plan.lock().map_err(|e| e.to_string())?;
        stored.clone().ok_or("No plan available")?
    };

    let app_handle = app.clone();

    let result = tokio::task::spawn_blocking(move || {
        OrganizeExecutor::execute(&plan, operation, |current, total, filename| {
            let _ = app_handle.emit(
                "organize-progress-event",
                OrganizeProgress {
                    phase: "Organizing".to_string(),
                    current,
                    total,
                    current_file: filename.to_string(),
                },
            );
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Emit completion
    let _ = app.emit(
        "organize-progress-event",
        OrganizeProgress {
            phase: "Complete".to_string(),
            current: result.files_processed,
            total: result.files_processed,
            current_file: String::new(),
        },
    );

    // Clear the stored plan
    if let Ok(mut stored) = state.organize_plan.lock() {
        *stored = None;
    }

    Ok(result)
}

/// Progress event for unorganized file scan
#[derive(Clone, Serialize)]
pub struct UnorganizedProgress {
    pub phase: String,
    pub files_scanned: usize,
    pub message: String,
}

/// Scan for unorganized/loose media files
#[tauri::command]
pub async fn scan_unorganized(
    app: AppHandle,
    config: UnorganizedConfig,
    state: State<'_, AppState>,
) -> Result<UnorganizedResult, String> {
    // Check if already scanning
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        if *scanning {
            return Err("A scan is already in progress".to_string());
        }
        *scanning = true;
    }

    // Helper to reset scanning state on any exit path
    let reset_scanning = || {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    };

    // Emit initial progress
    let _ = app.emit(
        "unorganized-scan-event",
        UnorganizedProgress {
            phase: "Scanning".to_string(),
            files_scanned: 0,
            message: "Starting scan...".to_string(),
        },
    );

    // Run scan with progress callback
    let app_handle = app.clone();
    let result = match tokio::task::spawn_blocking(move || {
        UnorganizedScanner::scan(&config, |count, message| {
            let _ = app_handle.emit(
                "unorganized-scan-event",
                UnorganizedProgress {
                    phase: "Scanning".to_string(),
                    files_scanned: count,
                    message: message.to_string(),
                },
            );
        })
    })
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            reset_scanning();
            return Err(e);
        }
        Err(e) => {
            reset_scanning();
            return Err(format!("Scan task panicked: {}", e));
        }
    };

    // Emit completion event
    let _ = app.emit(
        "unorganized-scan-event",
        UnorganizedProgress {
            phase: "Complete".to_string(),
            files_scanned: result.total_files,
            message: format!("Found {} unorganized files", result.total_files),
        },
    );

    // Reset scanning state
    reset_scanning();

    Ok(result)
}

/// Progress event for similar photo scan
#[derive(Clone, Serialize)]
pub struct SimilarScanProgress {
    pub phase: String,
    pub current: usize,
    pub total: usize,
}

/// Similar photo DTO for frontend
#[derive(Debug, Serialize)]
pub struct SimilarPhotoDto {
    pub path: String,
    pub distance: u32,
    pub similarity_percent: f64,
    pub match_type: String,
    pub size_bytes: u64,
}

/// Similar group DTO for frontend
#[derive(Debug, Serialize)]
pub struct SimilarGroupDto {
    pub id: String,
    pub reference: String,
    pub reference_size_bytes: u64,
    pub similar_photos: Vec<SimilarPhotoDto>,
    pub average_similarity: f64,
    pub total_size_bytes: u64,
}

/// Similar result DTO for frontend
#[derive(Debug, Serialize)]
pub struct SimilarResultDto {
    pub groups: Vec<SimilarGroupDto>,
    pub total_photos_scanned: usize,
    pub similar_groups_found: usize,
    pub similar_photos_found: usize,
    pub duration_ms: u64,
}

impl From<SimilarResult> for SimilarResultDto {
    fn from(result: SimilarResult) -> Self {
        Self {
            groups: result
                .groups
                .into_iter()
                .map(|g| SimilarGroupDto {
                    id: g.id,
                    reference: g.reference,
                    reference_size_bytes: g.reference_size_bytes,
                    similar_photos: g
                        .similar_photos
                        .into_iter()
                        .map(|p| SimilarPhotoDto {
                            path: p.path,
                            distance: p.distance,
                            similarity_percent: p.similarity_percent,
                            match_type: format!("{:?}", p.match_type),
                            size_bytes: p.size_bytes,
                        })
                        .collect(),
                    average_similarity: g.average_similarity,
                    total_size_bytes: g.total_size_bytes,
                })
                .collect(),
            total_photos_scanned: result.total_photos_scanned,
            similar_groups_found: result.similar_groups_found,
            similar_photos_found: result.similar_photos_found,
            duration_ms: result.duration_ms,
        }
    }
}

/// Scan for similar (not exact duplicate) photos
#[tauri::command]
pub async fn scan_similar(
    app: AppHandle,
    config: SimilarConfig,
    state: State<'_, AppState>,
) -> Result<SimilarResultDto, String> {
    // Check if already scanning
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        if *scanning {
            return Err("A scan is already in progress".to_string());
        }
        *scanning = true;
    }

    // Helper to reset scanning state on any exit path
    let reset_scanning = || {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    };

    // Emit initial progress
    let _ = app.emit(
        "similar-scan-event",
        SimilarScanProgress {
            phase: "Scanning".to_string(),
            current: 0,
            total: 0,
        },
    );

    // Run scan with progress callback
    let app_handle = app.clone();
    let result = match tokio::task::spawn_blocking(move || {
        SimilarScanner::scan(&config, |phase, current, total| {
            let _ = app_handle.emit(
                "similar-scan-event",
                SimilarScanProgress {
                    phase: phase.to_string(),
                    current,
                    total,
                },
            );
        })
    })
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => {
            reset_scanning();
            return Err(e);
        }
        Err(e) => {
            reset_scanning();
            return Err(format!("Scan task panicked: {}", e));
        }
    };

    // Emit completion event
    let _ = app.emit(
        "similar-scan-event",
        SimilarScanProgress {
            phase: "Complete".to_string(),
            current: result.similar_groups_found,
            total: result.total_photos_scanned,
        },
    );

    // Reset scanning state
    reset_scanning();

    Ok(result.into())
}

/// History entry DTO for frontend
#[derive(Debug, Serialize)]
pub struct ScanHistoryEntryDto {
    pub id: String,
    pub module_type: String,
    pub scan_time: i64,
    pub paths: Vec<String>,
    pub total_files: usize,
    pub groups_found: Option<usize>,
    pub duplicates_found: Option<usize>,
    pub potential_savings: Option<u64>,
    pub duration_ms: u64,
    pub status: String,
}

impl From<ScanHistoryEntry> for ScanHistoryEntryDto {
    fn from(entry: ScanHistoryEntry) -> Self {
        Self {
            id: entry.id,
            module_type: entry.module_type.as_str().to_string(),
            scan_time: entry.scan_time,
            paths: entry.paths,
            total_files: entry.total_files,
            groups_found: entry.groups_found,
            duplicates_found: entry.duplicates_found,
            potential_savings: entry.potential_savings,
            duration_ms: entry.duration_ms,
            status: entry.status.as_str().to_string(),
        }
    }
}

/// History result DTO for frontend
#[derive(Debug, Serialize)]
pub struct ScanHistoryResultDto {
    pub entries: Vec<ScanHistoryEntryDto>,
    pub total_count: usize,
}

impl From<ScanHistoryResult> for ScanHistoryResultDto {
    fn from(result: ScanHistoryResult) -> Self {
        Self {
            entries: result.entries.into_iter().map(|e| e.into()).collect(),
            total_count: result.total_count,
        }
    }
}

/// Initialize the history repository
fn get_or_init_history(state: &AppState, app: &AppHandle) -> Result<(), String> {
    let mut history = state.history.lock().map_err(|e| e.to_string())?;

    if history.is_none() {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let history_db_path = app_data_dir.join("history.db");
        let repo = HistoryRepository::open(&history_db_path)?;
        *history = Some(repo);
    }

    Ok(())
}

/// Get scan history
#[tauri::command]
pub fn get_scan_history(
    app: AppHandle,
    state: State<'_, AppState>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<ScanHistoryResultDto, String> {
    get_or_init_history(&state, &app)?;

    let history = state.history.lock().map_err(|e| e.to_string())?;
    let repo = history
        .as_ref()
        .ok_or("History repository not initialized")?;

    let result = repo.list_scans(limit.unwrap_or(50), offset.unwrap_or(0))?;
    Ok(result.into())
}

/// Get a specific scan by ID
#[tauri::command]
pub fn get_scan_details(
    app: AppHandle,
    state: State<'_, AppState>,
    scan_id: String,
) -> Result<Option<ScanHistoryEntryDto>, String> {
    get_or_init_history(&state, &app)?;

    let history = state.history.lock().map_err(|e| e.to_string())?;
    let repo = history
        .as_ref()
        .ok_or("History repository not initialized")?;

    let entry = repo.get_scan(&scan_id)?;
    Ok(entry.map(|e| e.into()))
}

/// Delete a scan history entry
#[tauri::command]
pub fn delete_scan_history(
    app: AppHandle,
    state: State<'_, AppState>,
    scan_id: String,
) -> Result<bool, String> {
    get_or_init_history(&state, &app)?;

    let history = state.history.lock().map_err(|e| e.to_string())?;
    let repo = history
        .as_ref()
        .ok_or("History repository not initialized")?;

    repo.delete_scan(&scan_id)
}

/// Clear all scan history
#[tauri::command]
pub fn clear_scan_history(app: AppHandle, state: State<'_, AppState>) -> Result<usize, String> {
    get_or_init_history(&state, &app)?;

    let history = state.history.lock().map_err(|e| e.to_string())?;
    let repo = history
        .as_ref()
        .ok_or("History repository not initialized")?;

    repo.clear_history()
}

/// Helper to save scan to history
pub fn save_to_history(
    state: &AppState,
    app: &AppHandle,
    module_type: HistoryModuleType,
    paths: Vec<String>,
    total_files: usize,
    groups_found: Option<usize>,
    duplicates_found: Option<usize>,
    potential_savings: Option<u64>,
    duration_ms: u64,
    status: ScanStatus,
) -> Result<(), String> {
    get_or_init_history(state, app)?;

    let history = state.history.lock().map_err(|e| e.to_string())?;
    let repo = history
        .as_ref()
        .ok_or("History repository not initialized")?;

    let entry = ScanHistoryEntry {
        id: HistoryRepository::generate_id(),
        module_type,
        scan_time: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        paths,
        settings: "{}".to_string(),
        total_files,
        groups_found,
        duplicates_found,
        potential_savings,
        duration_ms,
        status,
    };

    repo.save_scan(&entry)
}

/// Get the path for storing app statistics
fn get_stats_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(app_data_dir.join("stats.json"))
}

/// Stats structure for JSON storage
#[derive(Debug, Serialize, Deserialize, Default)]
struct AppStats {
    lifetime_savings_bytes: u64,
}

/// Get lifetime space savings in bytes
#[tauri::command]
pub fn get_lifetime_savings(app: AppHandle) -> Result<u64, String> {
    let stats_path = get_stats_path(&app)?;

    if !stats_path.exists() {
        return Ok(0);
    }

    let contents = std::fs::read_to_string(&stats_path)
        .map_err(|e| format!("Failed to read stats file: {}", e))?;

    let stats: AppStats = serde_json::from_str(&contents).unwrap_or_default();

    Ok(stats.lifetime_savings_bytes)
}

/// Save lifetime space savings in bytes
#[tauri::command]
pub fn save_lifetime_savings(app: AppHandle, bytes: u64) -> Result<bool, String> {
    let stats_path = get_stats_path(&app)?;

    let stats = AppStats {
        lifetime_savings_bytes: bytes,
    };

    let contents = serde_json::to_string_pretty(&stats)
        .map_err(|e| format!("Failed to serialize stats: {}", e))?;

    std::fs::write(&stats_path, contents)
        .map_err(|e| format!("Failed to write stats file: {}", e))?;

    Ok(true)
}
