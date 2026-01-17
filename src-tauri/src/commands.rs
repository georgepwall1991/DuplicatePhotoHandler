//! Tauri commands for the duplicate photo finder.

use duplicate_photo_cleaner::core::comparator::DuplicateGroup;
use duplicate_photo_cleaner::core::hasher::HashAlgorithmKind;
use duplicate_photo_cleaner::core::pipeline::{Pipeline, PipelineResult};
use duplicate_photo_cleaner::events::{Event, EventSender, PipelineEvent};
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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            results: Mutex::new(None),
            scanning: Mutex::new(false),
            cancelled: Arc::new(AtomicBool::new(false)),
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

    // Run scan - use a helper to ensure scanning state is always reset
    let scan_result = async {
        let task_result = tokio::task::spawn_blocking(move || {
            pipeline.run_with_events(&event_sender)
        })
        .await
        .map_err(|e| e.to_string())?;

        // Check if cancelled
        if cancelled.load(Ordering::SeqCst) {
            return Err("Scan was cancelled".to_string());
        }

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

/// Restore files from trash (macOS only)
/// Uses AppleScript to put files back to their original locations
#[tauri::command]
pub async fn restore_from_trash(filenames: Vec<String>) -> Result<RestoreResult, String> {
    let mut restored = 0;
    let mut errors = Vec::new();

    #[cfg(target_os = "macos")]
    {
        for filename in filenames {
            // AppleScript to restore a file from Trash
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
                filename.replace("\"", "\\\"")
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
