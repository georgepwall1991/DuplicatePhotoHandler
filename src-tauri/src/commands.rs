//! Tauri commands for the duplicate photo finder.

use duplicate_photo_cleaner::core::cache::{CacheBackend, SqliteCache};
use duplicate_photo_cleaner::core::comparator::DuplicateGroup;
use duplicate_photo_cleaner::core::hasher::HashAlgorithmKind;
use duplicate_photo_cleaner::core::large_files::{LargeFileScanner, LargeFileScanResult};
use duplicate_photo_cleaner::core::pipeline::{CancellationToken, Pipeline, PipelineResult};
use duplicate_photo_cleaner::core::reporter::{export_csv, export_html};
use duplicate_photo_cleaner::core::watcher::{FolderWatcher, WatcherConfig, WatcherEvent as CoreWatcherEvent};
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

impl From<duplicate_photo_cleaner::core::screenshot::ScreenshotConfidence> for ScreenshotConfidenceDto {
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
    let scanner = WalkDirScanner::new(duplicate_photo_cleaner::core::scanner::ScanConfig::default());
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
                let _ = forward_handle.emit("screenshot-scan-event", &Event::Pipeline(PipelineEvent::Cancelled));
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
    let (duplicate_groups, duplicate_count, potential_savings) = if !screenshot_paths.is_empty() && !cancelled.load(Ordering::SeqCst) {
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
                let groups: Vec<DuplicateGroupDto> = result.groups.iter().map(DuplicateGroupDto::from).collect();
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

/// Scan for large files
#[tauri::command]
pub async fn scan_large_files(
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

    // Run scan
    let result = match scanner.scan(&paths) {
        Ok(result) => result,
        Err(e) => {
            reset_scanning();
            return Err(e);
        }
    };

    // Reset scanning state
    reset_scanning();

    Ok(result)
}
