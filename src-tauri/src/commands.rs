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

    // Run scan
    let result = tokio::task::spawn_blocking(move || {
        pipeline.run_with_events(&event_sender)
    })
    .await
    .map_err(|e| e.to_string())?;

    // Check if cancelled
    if cancelled.load(Ordering::SeqCst) {
        // Mark scan complete
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        *scanning = false;
        return Err("Scan was cancelled".to_string());
    }

    let result = result.map_err(|e| e.to_string())?;

    // Store results
    {
        let mut results = state.results.lock().map_err(|e| e.to_string())?;
        *results = Some(result.clone());
    }

    // Mark scan complete
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        *scanning = false;
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

/// Move files to trash
#[tauri::command]
pub async fn trash_files(paths: Vec<String>) -> Result<usize, String> {
    let mut trashed = 0;

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            // Use trash crate or system API
            match trash::delete(&path) {
                Ok(_) => trashed += 1,
                Err(e) => {
                    log::warn!("Failed to trash {}: {}", path_str, e);
                }
            }
        }
    }

    Ok(trashed)
}
