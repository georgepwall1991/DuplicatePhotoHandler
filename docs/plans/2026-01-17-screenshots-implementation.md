# Screenshots Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Screenshots module that detects screenshot files via filename patterns, EXIF metadata, and dimension heuristics, then displays them in a tabbed view with duplicate detection.

**Architecture:** New `screenshot` module in Rust core handles detection logic. Reuses existing `Pipeline` for duplicate detection on filtered screenshots. New React components mirror existing `ResultsView` pattern with tabs for "Duplicates" and "All Screenshots".

**Tech Stack:** Rust (detection), Tauri (IPC), React + TypeScript (UI), Tailwind CSS (styling)

---

## Task 1: Add Software Field to PhotoMetadata

**Files:**
- Modify: `src/core/metadata/mod.rs:23-37` (add field)
- Modify: `src/core/metadata/mod.rs:84-151` (extract field)

**Step 1: Add software field to PhotoMetadata struct**

In `src/core/metadata/mod.rs`, add the `software` field after `orientation`:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PhotoMetadata {
    pub date_taken: Option<DateTime<Utc>>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub orientation: Option<u16>,
    /// Software used to create the image (e.g., "screencaptureui")
    pub software: Option<String>,
}
```

**Step 2: Update has_data() method**

Add `|| self.software.is_some()` to the `has_data()` method.

**Step 3: Extract Software tag in extract_metadata()**

Add after orientation extraction (~line 148):

```rust
// Extract software
if let Some(field) = exif_reader.get_field(Tag::Software, In::PRIMARY) {
    metadata.software = get_string_value(&field.value);
}
```

**Step 4: Run existing tests**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler && cargo test metadata
```

Expected: All existing tests pass.

**Step 5: Add test for software field**

Add to `mod tests`:

```rust
#[test]
fn metadata_with_software_has_data() {
    let mut meta = PhotoMetadata::default();
    meta.software = Some("screencaptureui".to_string());
    assert!(meta.has_data());
}
```

**Step 6: Run tests to verify**

```bash
cargo test metadata
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/core/metadata/mod.rs
git commit -m "feat(metadata): add software field for screenshot detection"
```

---

## Task 2: Create Screenshot Detector Module

**Files:**
- Create: `src/core/screenshot/mod.rs`
- Create: `src/core/screenshot/detector.rs`
- Modify: `src/core/mod.rs` (add module)

**Step 1: Create module directory and files**

Create `src/core/screenshot/mod.rs`:

```rust
//! Screenshot detection module.
//!
//! Detects screenshots using filename patterns, EXIF metadata, and dimension heuristics.

mod detector;

pub use detector::{
    is_screenshot, ScreenshotConfidence, ScreenshotDetection, ScreenshotInfo,
};
```

**Step 2: Create detector.rs with types**

Create `src/core/screenshot/detector.rs`:

```rust
//! Screenshot detection logic.

use crate::core::metadata::PhotoMetadata;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Confidence level for screenshot detection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScreenshotConfidence {
    High,
    Medium,
    Low,
}

/// Result of screenshot detection
#[derive(Debug, Clone)]
pub struct ScreenshotDetection {
    pub confidence: ScreenshotConfidence,
    pub reason: String,
}

/// Information about a detected screenshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotInfo {
    pub path: PathBuf,
    pub size_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub date_taken: Option<DateTime<Utc>>,
    pub confidence: ScreenshotConfidence,
    pub detection_reason: String,
    pub source_app: Option<String>,
}

/// Filename patterns that indicate screenshots
const SCREENSHOT_PATTERNS: &[&str] = &[
    "screenshot",
    "screen shot",
    "capture",
    "simulator screen shot",
    "cleanshot",
    "snagit",
    "monosnap",
    "skitch",
    "snip",
    "grab",
];

/// Software tags that indicate screenshot tools
const SCREENSHOT_SOFTWARE: &[&str] = &[
    "screencaptureui",
    "grab",
    "screenshot",
    "snipping tool",
    "snip & sketch",
    "cleanshot",
    "snagit",
    "monosnap",
    "lightshot",
    "greenshot",
];

/// Check if a file is a screenshot based on filename
fn detect_from_filename(filename: &str) -> Option<ScreenshotDetection> {
    let lower = filename.to_lowercase();

    for pattern in SCREENSHOT_PATTERNS {
        if lower.contains(pattern) {
            return Some(ScreenshotDetection {
                confidence: ScreenshotConfidence::Medium,
                reason: format!("Filename contains '{}'", pattern),
            });
        }
    }

    None
}

/// Check if metadata indicates a screenshot
fn detect_from_metadata(metadata: &PhotoMetadata) -> Option<ScreenshotDetection> {
    // Check software tag
    if let Some(ref software) = metadata.software {
        let lower = software.to_lowercase();
        for pattern in SCREENSHOT_SOFTWARE {
            if lower.contains(pattern) {
                return Some(ScreenshotDetection {
                    confidence: ScreenshotConfidence::High,
                    reason: format!("Software: {}", software),
                });
            }
        }
    }

    // No camera = likely screenshot (if we have other indicators)
    if metadata.camera_make.is_none() && metadata.camera_model.is_none() {
        // Only return this as supporting evidence, not primary
        return None;
    }

    None
}

/// Known device screen dimensions
const KNOWN_SCREEN_DIMENSIONS: &[(u32, u32, &str)] = &[
    // iPhones
    (1170, 2532, "iPhone 12/13/14"),
    (1179, 2556, "iPhone 14 Pro"),
    (1284, 2778, "iPhone 12/13/14 Pro Max"),
    (1290, 2796, "iPhone 14 Pro Max"),
    (750, 1334, "iPhone SE/8"),
    (1125, 2436, "iPhone X/XS/11 Pro"),
    // iPads
    (2048, 2732, "iPad Pro 12.9"),
    (1668, 2388, "iPad Pro 11"),
    // Macs
    (2560, 1600, "MacBook Pro 13"),
    (2880, 1800, "MacBook Pro 15"),
    (3024, 1964, "MacBook Pro 14"),
    (3456, 2234, "MacBook Pro 16"),
    (2560, 1664, "MacBook Air M2"),
    (4480, 2520, "iMac 24"),
    (5120, 2880, "iMac 27 5K"),
    // Common monitors
    (1920, 1080, "1080p"),
    (2560, 1440, "1440p"),
    (3840, 2160, "4K"),
];

/// Check if dimensions match known screen sizes
fn detect_from_dimensions(width: u32, height: u32) -> Option<ScreenshotDetection> {
    // Check both orientations
    for (w, h, device) in KNOWN_SCREEN_DIMENSIONS {
        if (width == *w && height == *h) || (width == *h && height == *w) {
            return Some(ScreenshotDetection {
                confidence: ScreenshotConfidence::Low,
                reason: format!("Dimensions match {}", device),
            });
        }
    }

    None
}

/// Determine if a file is a screenshot
/// Returns Some(ScreenshotInfo) if detected, None otherwise
pub fn is_screenshot(
    path: &Path,
    metadata: &PhotoMetadata,
    size_bytes: u64,
) -> Option<ScreenshotInfo> {
    let filename = path.file_name()?.to_str()?;

    let width = metadata.width?;
    let height = metadata.height?;

    // Try detection methods in order of reliability
    let filename_result = detect_from_filename(filename);
    let metadata_result = detect_from_metadata(metadata);
    let dimension_result = detect_from_dimensions(width, height);

    // Determine final confidence and reason
    let (confidence, reason) = match (&filename_result, &metadata_result, &dimension_result) {
        // High: filename + metadata confirm
        (Some(f), Some(m), _) => (
            ScreenshotConfidence::High,
            format!("{} + {}", f.reason, m.reason),
        ),
        // High: metadata alone (software tag is definitive)
        (_, Some(m), _) if m.confidence == ScreenshotConfidence::High => (
            m.confidence,
            m.reason.clone(),
        ),
        // Medium: filename match
        (Some(f), None, _) => (f.confidence, f.reason.clone()),
        // Medium: filename + dimensions
        (Some(f), None, Some(d)) => (
            ScreenshotConfidence::Medium,
            format!("{} + {}", f.reason, d.reason),
        ),
        // Low: dimensions only (with PNG check would be better)
        (None, None, Some(d)) => (d.confidence, d.reason.clone()),
        // Not a screenshot
        _ => return None,
    };

    Some(ScreenshotInfo {
        path: path.to_path_buf(),
        size_bytes,
        width,
        height,
        date_taken: metadata.date_taken,
        confidence,
        detection_reason: reason,
        source_app: metadata.software.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_metadata(width: u32, height: u32, software: Option<&str>) -> PhotoMetadata {
        PhotoMetadata {
            width: Some(width),
            height: Some(height),
            software: software.map(String::from),
            ..Default::default()
        }
    }

    #[test]
    fn detects_screenshot_from_filename() {
        let path = Path::new("/photos/Screenshot 2024-01-15.png");
        let meta = make_metadata(1920, 1080, None);

        let result = is_screenshot(path, &meta, 1000);
        assert!(result.is_some());
        let info = result.unwrap();
        assert!(matches!(info.confidence, ScreenshotConfidence::Medium));
    }

    #[test]
    fn detects_screenshot_from_software() {
        let path = Path::new("/photos/IMG_1234.png");
        let meta = make_metadata(1920, 1080, Some("screencaptureui"));

        let result = is_screenshot(path, &meta, 1000);
        assert!(result.is_some());
        let info = result.unwrap();
        assert!(matches!(info.confidence, ScreenshotConfidence::High));
    }

    #[test]
    fn detects_high_confidence_with_filename_and_metadata() {
        let path = Path::new("/photos/Screenshot 2024-01-15.png");
        let meta = make_metadata(1920, 1080, Some("screencaptureui"));

        let result = is_screenshot(path, &meta, 1000);
        assert!(result.is_some());
        let info = result.unwrap();
        assert!(matches!(info.confidence, ScreenshotConfidence::High));
    }

    #[test]
    fn detects_from_iphone_dimensions() {
        let path = Path::new("/photos/IMG_1234.png");
        let meta = make_metadata(1170, 2532, None);

        let result = is_screenshot(path, &meta, 1000);
        assert!(result.is_some());
        let info = result.unwrap();
        assert!(matches!(info.confidence, ScreenshotConfidence::Low));
    }

    #[test]
    fn no_detection_for_regular_photo() {
        let path = Path::new("/photos/IMG_1234.jpg");
        let meta = PhotoMetadata {
            width: Some(4000),
            height: Some(3000),
            camera_make: Some("Apple".to_string()),
            camera_model: Some("iPhone 15 Pro".to_string()),
            ..Default::default()
        };

        let result = is_screenshot(path, &meta, 1000);
        assert!(result.is_none());
    }

    #[test]
    fn cleanshot_detected() {
        let path = Path::new("/photos/CleanShot 2024-01-15.png");
        let meta = make_metadata(800, 600, None);

        let result = is_screenshot(path, &meta, 1000);
        assert!(result.is_some());
    }
}
```

**Step 3: Add screenshot module to core/mod.rs**

Add after `pub mod watcher;`:

```rust
pub mod screenshot;
```

And add to re-exports:

```rust
pub use screenshot::{ScreenshotConfidence, ScreenshotInfo};
```

**Step 4: Run tests**

```bash
cargo test screenshot
```

Expected: All 6 tests pass.

**Step 5: Commit**

```bash
git add src/core/screenshot/ src/core/mod.rs
git commit -m "feat(screenshot): add screenshot detection module"
```

---

## Task 3: Add Screenshot Scan Command to Tauri

**Files:**
- Modify: `src-tauri/src/commands.rs` (add DTOs and command)
- Modify: `src-tauri/src/lib.rs` (register command)

**Step 1: Add ScreenshotInfo DTO**

Add after `CacheInfoDto` in `commands.rs`:

```rust
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
```

**Step 2: Add scan_screenshots command**

Add the command:

```rust
/// Scan for screenshots
#[tauri::command]
pub async fn scan_screenshots(
    app: AppHandle,
    state: State<'_, AppState>,
    config: ScanConfig,
) -> Result<ScreenshotScanResultDto, String> {
    use duplicate_photo_cleaner::core::metadata::extract_metadata;
    use duplicate_photo_cleaner::core::screenshot::is_screenshot;
    use duplicate_photo_cleaner::core::scanner::Scanner;
    use std::time::Instant;

    // Check if already scanning
    {
        let mut scanning = state.scanning.lock().map_err(|e| e.to_string())?;
        if *scanning {
            return Err("A scan is already in progress".to_string());
        }
        *scanning = true;
    }

    let start = Instant::now();

    // Reset cancellation flag
    state.cancelled.store(false, Ordering::SeqCst);

    // Parse paths
    let paths: Vec<PathBuf> = config.paths.iter().map(PathBuf::from).collect();

    // Emit start event
    let _ = app.emit("screenshot-scan-event", serde_json::json!({
        "phase": "scanning",
        "percent": 0,
        "message": "Scanning for photos..."
    }));

    // Scan for all photos
    let scanner = Scanner::new();
    let photos = scanner.scan_directories(&paths).map_err(|e| e.to_string())?;

    let total_photos = photos.len();
    let mut screenshots = Vec::new();
    let mut total_size: u64 = 0;

    // Emit progress
    let _ = app.emit("screenshot-scan-event", serde_json::json!({
        "phase": "analyzing",
        "percent": 10,
        "message": format!("Found {} photos, analyzing...", total_photos)
    }));

    // Check each photo for screenshot characteristics
    for (i, photo) in photos.iter().enumerate() {
        if state.cancelled.load(Ordering::SeqCst) {
            // Reset scanning state
            if let Ok(mut scanning) = state.scanning.lock() {
                *scanning = false;
            }
            return Err("Scan cancelled".to_string());
        }

        let metadata = extract_metadata(&photo.path);
        let size = std::fs::metadata(&photo.path)
            .map(|m| m.len())
            .unwrap_or(0);

        if let Some(info) = is_screenshot(&photo.path, &metadata, size) {
            total_size += info.size_bytes;
            screenshots.push(ScreenshotInfoDto {
                path: info.path.display().to_string(),
                size_bytes: info.size_bytes,
                width: info.width,
                height: info.height,
                date_taken: info.date_taken.map(|d| d.to_rfc3339()),
                confidence: info.confidence.into(),
                detection_reason: info.detection_reason,
                source_app: info.source_app,
            });
        }

        // Emit progress every 100 photos
        if i % 100 == 0 {
            let percent = 10 + (i * 40 / total_photos.max(1));
            let _ = app.emit("screenshot-scan-event", serde_json::json!({
                "phase": "analyzing",
                "percent": percent,
                "message": format!("Analyzed {}/{} photos ({} screenshots)", i, total_photos, screenshots.len())
            }));
        }
    }

    // Emit progress for duplicate detection
    let _ = app.emit("screenshot-scan-event", serde_json::json!({
        "phase": "comparing",
        "percent": 50,
        "message": format!("Found {} screenshots, checking for duplicates...", screenshots.len())
    }));

    // Run duplicate detection on screenshots only
    let screenshot_paths: Vec<PathBuf> = screenshots.iter()
        .map(|s| PathBuf::from(&s.path))
        .collect();

    let duplicate_groups = if screenshot_paths.len() > 1 {
        // Build pipeline for just screenshots
        let algorithm = match config.algorithm.as_deref() {
            Some("average") => HashAlgorithmKind::Average,
            Some("perceptual") => HashAlgorithmKind::Perceptual,
            Some("fusion") => HashAlgorithmKind::Fusion,
            _ => HashAlgorithmKind::Difference,
        };

        let pipeline = Pipeline::builder()
            .paths(screenshot_paths)
            .algorithm(algorithm)
            .threshold(config.threshold)
            .build();

        let (sender, _receiver) = crossbeam_channel::unbounded::<Event>();
        let event_sender = EventSender::new(sender);
        let cancel_token = state.cancelled.clone();

        match pipeline.run_with_cancellation(&event_sender, cancel_token) {
            Ok(result) => result.groups.iter().map(DuplicateGroupDto::from).collect(),
            Err(_) => vec![],
        }
    } else {
        vec![]
    };

    // Reset scanning state
    {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    // Emit completion
    let _ = app.emit("screenshot-scan-event", serde_json::json!({
        "phase": "complete",
        "percent": 100,
        "message": format!("Found {} screenshots ({} duplicate groups)", screenshots.len(), duplicate_groups.len())
    }));

    Ok(ScreenshotScanResultDto {
        all_screenshots: screenshots,
        duplicate_groups,
        total_size_bytes: total_size,
        scan_duration_ms: duration_ms,
    })
}
```

**Step 3: Add import at top of commands.rs**

```rust
use duplicate_photo_cleaner::events::{Event, EventSender, PipelineEvent, WatcherEvent};
```

(Already exists, but verify it includes what we need)

**Step 4: Register command in lib.rs**

In `src-tauri/src/lib.rs`, add `scan_screenshots` to the invoke_handler:

```rust
.invoke_handler(tauri::generate_handler![
    commands::start_scan,
    commands::cancel_scan,
    commands::get_results,
    commands::is_scanning,
    commands::trash_files,
    commands::restore_from_trash,
    commands::get_file_info,
    commands::get_quality_score,
    commands::start_watching,
    commands::stop_watching,
    commands::is_watching,
    commands::get_watched_paths,
    commands::export_results_csv,
    commands::export_results_html,
    commands::get_cache_info,
    commands::clear_cache,
    commands::scan_screenshots,  // NEW
])
```

**Step 5: Build and verify**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/src-tauri && cargo build
```

Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add scan_screenshots command"
```

---

## Task 4: Add TypeScript Types

**Files:**
- Modify: `ui/src/lib/types.ts`

**Step 1: Add screenshot types**

Add to `ui/src/lib/types.ts`:

```typescript
// Screenshot detection confidence
export type ScreenshotConfidence = 'high' | 'medium' | 'low'

// Screenshot info from backend
export interface ScreenshotInfo {
  path: string
  size_bytes: number
  width: number
  height: number
  date_taken: string | null
  confidence: ScreenshotConfidence
  detection_reason: string
  source_app: string | null
}

// Screenshot scan results
export interface ScreenshotScanResult {
  all_screenshots: ScreenshotInfo[]
  duplicate_groups: DuplicateGroup[]
  total_size_bytes: number
  scan_duration_ms: number
}

// Active module in the app
export type ActiveModule = 'duplicates' | 'screenshots'
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

Expected: No type errors.

**Step 3: Commit**

```bash
git add ui/src/lib/types.ts
git commit -m "feat(types): add screenshot TypeScript types"
```

---

## Task 5: Create ScreenshotCard Component

**Files:**
- Create: `ui/src/components/ScreenshotCard.tsx`

**Step 1: Create the component**

Create `ui/src/components/ScreenshotCard.tsx`:

```tsx
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Eye, Calendar, HardDrive } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { ScreenshotInfo, ScreenshotConfidence } from '../lib/types'

interface ScreenshotCardProps {
  screenshot: ScreenshotInfo
  isSelected: boolean
  onSelect: (path: string) => void
  onPreview: (path: string) => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'Unknown date'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const confidenceColors: Record<ScreenshotConfidence, string> = {
  high: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
}

export function ScreenshotCard({ screenshot, isSelected, onSelect, onPreview }: ScreenshotCardProps) {
  const [imageError, setImageError] = useState(false)
  const filename = screenshot.path.split('/').pop() || 'Unknown'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`group relative overflow-hidden border transition-all duration-200 ${
        isSelected
          ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video cursor-pointer overflow-hidden bg-black/20"
        onClick={() => onPreview(screenshot.path)}
      >
        {!imageError ? (
          <img
            src={convertFileSrc(screenshot.path)}
            alt={filename}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            <span className="text-xs">Preview unavailable</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Eye className="h-8 w-8 text-white/80" />
        </div>

        {/* Confidence badge */}
        <div className={`absolute top-2 right-2 border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${confidenceColors[screenshot.confidence]}`}>
          {screenshot.confidence}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="truncate text-sm font-medium text-white" title={filename}>
          {filename}
        </p>

        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            {formatBytes(screenshot.size_bytes)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(screenshot.date_taken)}
          </span>
        </div>

        <p className="mt-1 truncate text-[10px] text-slate-500" title={screenshot.detection_reason}>
          {screenshot.detection_reason}
        </p>
      </div>

      {/* Selection checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onSelect(screenshot.path)
        }}
        className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center border transition ${
          isSelected
            ? 'border-cyan-400 bg-cyan-500 text-white'
            : 'border-white/30 bg-black/50 text-transparent hover:border-white/50 hover:text-white/50'
        }`}
      >
        <Check className="h-4 w-4" />
      </button>
    </motion.div>
  )
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

Expected: No errors.

**Step 3: Commit**

```bash
git add ui/src/components/ScreenshotCard.tsx
git commit -m "feat(ui): add ScreenshotCard component"
```

---

## Task 6: Create ScreenshotGrid Component

**Files:**
- Create: `ui/src/components/ScreenshotGrid.tsx`

**Step 1: Create the component**

Create `ui/src/components/ScreenshotGrid.tsx`:

```tsx
import { ScreenshotCard } from './ScreenshotCard'
import type { ScreenshotInfo } from '../lib/types'

interface ScreenshotGridProps {
  screenshots: ScreenshotInfo[]
  selectedPaths: Set<string>
  onSelect: (path: string) => void
  onPreview: (path: string) => void
}

export function ScreenshotGrid({
  screenshots,
  selectedPaths,
  onSelect,
  onPreview
}: ScreenshotGridProps) {
  if (screenshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <p className="text-lg font-medium">No screenshots found</p>
        <p className="mt-1 text-sm text-slate-500">
          Try scanning a different folder
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {screenshots.map((screenshot) => (
        <ScreenshotCard
          key={screenshot.path}
          screenshot={screenshot}
          isSelected={selectedPaths.has(screenshot.path)}
          onSelect={onSelect}
          onPreview={onPreview}
        />
      ))}
    </div>
  )
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

**Step 3: Commit**

```bash
git add ui/src/components/ScreenshotGrid.tsx
git commit -m "feat(ui): add ScreenshotGrid component"
```

---

## Task 7: Create ScreenshotsView Component

**Files:**
- Create: `ui/src/components/ScreenshotsView.tsx`

**Step 1: Create the main view component**

Create `ui/src/components/ScreenshotsView.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Images, Layers, Search, SortAsc, Trash2, X } from 'lucide-react'
import { ScreenshotGrid } from './ScreenshotGrid'
import { DuplicateGroupCard } from './DuplicateGroupCard'
import { ImagePreview } from './ImagePreview'
import { ConfirmModal } from './ConfirmModal'
import type { ScreenshotScanResult, ScreenshotInfo, DuplicateGroup } from '../lib/types'

type TabId = 'all' | 'duplicates'
type SortOption = 'date' | 'size' | 'name' | 'confidence'

interface ScreenshotsViewProps {
  results: ScreenshotScanResult
  onTrash: (paths: string[]) => Promise<void>
  onNewScan: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ScreenshotsView({ results, onTrash, onNewScan }: ScreenshotsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [groupSelections, setGroupSelections] = useState<Record<string, Set<string>>>({})

  const tabs = [
    {
      id: 'all' as const,
      label: 'All Screenshots',
      icon: Images,
      count: results.all_screenshots.length
    },
    {
      id: 'duplicates' as const,
      label: 'Duplicates',
      icon: Layers,
      count: results.duplicate_groups.length
    },
  ]

  // Filter and sort screenshots
  const filteredScreenshots = useMemo(() => {
    let items = [...results.all_screenshots]

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      items = items.filter(s =>
        s.path.toLowerCase().includes(query) ||
        s.detection_reason.toLowerCase().includes(query)
      )
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return (b.date_taken || '').localeCompare(a.date_taken || '')
        case 'size':
          return b.size_bytes - a.size_bytes
        case 'name':
          return a.path.localeCompare(b.path)
        case 'confidence':
          const order = { high: 0, medium: 1, low: 2 }
          return order[a.confidence] - order[b.confidence]
        default:
          return 0
      }
    })

    return items
  }, [results.all_screenshots, searchQuery, sortBy])

  const handleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedPaths.size === filteredScreenshots.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(filteredScreenshots.map(s => s.path)))
    }
  }

  const handleGroupSelectionChange = (groupId: string, paths: Set<string>) => {
    setGroupSelections(prev => ({ ...prev, [groupId]: paths }))
  }

  const getAllSelectedPaths = (): string[] => {
    if (activeTab === 'all') {
      return Array.from(selectedPaths)
    } else {
      // Collect from group selections
      return Object.values(groupSelections).flatMap(set => Array.from(set))
    }
  }

  const handleTrash = async () => {
    const paths = getAllSelectedPaths()
    if (paths.length === 0) return

    await onTrash(paths)
    setSelectedPaths(new Set())
    setGroupSelections({})
    setShowConfirm(false)
  }

  const selectedCount = activeTab === 'all'
    ? selectedPaths.size
    : Object.values(groupSelections).reduce((acc, set) => acc + set.size, 0)

  const selectedSize = activeTab === 'all'
    ? filteredScreenshots
        .filter(s => selectedPaths.has(s.path))
        .reduce((acc, s) => acc + s.size_bytes, 0)
    : 0 // Would need to calculate from groups

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Screenshots</h2>
            <p className="mt-1 text-sm text-slate-400">
              {results.all_screenshots.length} screenshots found • {formatBytes(results.total_size_bytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={onNewScan}
            className="border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            New Scan
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <span className={`ml-1 px-1.5 py-0.5 text-xs ${
                  isActive ? 'bg-cyan-500/20' : 'bg-white/10'
                }`}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Controls for All tab */}
        {activeTab === 'all' && (
          <div className="mt-4 flex items-center gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search screenshots..."
                className="w-full border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <SortAsc className="h-4 w-4 text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan-400/50 focus:outline-none"
              >
                <option value="date">Date</option>
                <option value="size">Size</option>
                <option value="name">Name</option>
                <option value="confidence">Confidence</option>
              </select>
            </div>

            {/* Select all */}
            <button
              type="button"
              onClick={handleSelectAll}
              className="border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-white"
            >
              {selectedPaths.size === filteredScreenshots.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'all' ? (
            <motion.div
              key="all"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ScreenshotGrid
                screenshots={filteredScreenshots}
                selectedPaths={selectedPaths}
                onSelect={handleSelect}
                onPreview={setPreviewPath}
              />
            </motion.div>
          ) : (
            <motion.div
              key="duplicates"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 p-4"
            >
              {results.duplicate_groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Layers className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No duplicate screenshots</p>
                  <p className="mt-1 text-sm text-slate-500">
                    All your screenshots are unique
                  </p>
                </div>
              ) : (
                results.duplicate_groups.map((group) => (
                  <DuplicateGroupCard
                    key={group.id}
                    group={group}
                    selectedPaths={groupSelections[group.id] || new Set()}
                    onSelectionChange={(paths) => handleGroupSelectionChange(group.id, paths)}
                    onPreview={setPreviewPath}
                  />
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action bar */}
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="border-t border-white/10 bg-slate-900/95 p-4 backdrop-blur"
        >
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              <span className="font-medium text-white">{selectedCount}</span> selected
              {activeTab === 'all' && selectedSize > 0 && (
                <span className="ml-2">• {formatBytes(selectedSize)}</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedPaths(new Set())
                  setGroupSelections({})
                }}
                className="border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-400 hover:text-white"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30"
              >
                <Trash2 className="h-4 w-4" />
                Move to Trash
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Preview modal */}
      {previewPath && (
        <ImagePreview
          path={previewPath}
          onClose={() => setPreviewPath(null)}
        />
      )}

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleTrash}
        title="Move to Trash"
        message={`Are you sure you want to move ${selectedCount} screenshot${selectedCount === 1 ? '' : 's'} to Trash?`}
        confirmLabel="Move to Trash"
        variant="danger"
      />
    </div>
  )
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

**Step 3: Commit**

```bash
git add ui/src/components/ScreenshotsView.tsx
git commit -m "feat(ui): add ScreenshotsView main component with tabs"
```

---

## Task 8: Update Sidebar for Module Navigation

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`

**Step 1: Update SidebarProps interface**

Add to the interface:

```typescript
interface SidebarProps {
  activeModule: string
  onModuleChange?: (module: string) => void  // NEW
  onNewScan: () => void
  // ... rest of props
}
```

**Step 2: Update the groups array - enable screenshots**

Change `available: false` to `available: true` for screenshots:

```typescript
{ id: 'screenshots', name: 'Screenshots', hint: 'UI captures', icon: Smartphone, available: true },
```

**Step 3: Update button onClick handler**

Replace the onClick for nav items:

```typescript
onClick={item.available ? () => {
  if (item.id === activeModule) {
    onNewScan()
  } else {
    onModuleChange?.(item.id)
  }
} : undefined}
```

**Step 4: Verify it compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

**Step 5: Commit**

```bash
git add ui/src/components/Sidebar.tsx
git commit -m "feat(sidebar): enable screenshots navigation"
```

---

## Task 9: Integrate Screenshots into App.tsx

**Files:**
- Modify: `ui/src/App.tsx`

**Step 1: Add imports and state**

Add imports:

```typescript
import { ScreenshotsView } from './components/ScreenshotsView'
import type { AppState, ScanResult, WatcherEvent, ScreenshotScanResult, ActiveModule } from './lib/types'
```

Add state:

```typescript
const [activeModule, setActiveModule] = useState<ActiveModule>('duplicates')
const [screenshotResults, setScreenshotResults] = useState<ScreenshotScanResult | null>(null)
const [screenshotAppState, setScreenshotAppState] = useState<AppState>('idle')
```

**Step 2: Add screenshot scan handler**

```typescript
const handleScreenshotScanComplete = (result: ScreenshotScanResult) => {
  setScreenshotResults(result)
  setScreenshotAppState('results')
}

const handleScreenshotNewScan = () => {
  setScreenshotResults(null)
  setScreenshotAppState('idle')
}

const handleModuleChange = (module: string) => {
  setActiveModule(module as ActiveModule)
}

const handleTrashScreenshots = async (paths: string[]) => {
  try {
    await invoke('trash_files', { paths })
    showToast(`Moved ${paths.length} file(s) to Trash`, 'success')
    // Refresh results by filtering out trashed paths
    if (screenshotResults) {
      setScreenshotResults({
        ...screenshotResults,
        all_screenshots: screenshotResults.all_screenshots.filter(
          s => !paths.includes(s.path)
        ),
        duplicate_groups: screenshotResults.duplicate_groups.map(g => ({
          ...g,
          photos: g.photos.filter(p => !paths.includes(p))
        })).filter(g => g.photos.length > 1)
      })
    }
  } catch (error) {
    showToast('Failed to move files to Trash', 'error')
  }
}
```

**Step 3: Update Sidebar props**

```typescript
<Sidebar
  activeModule={activeModule}
  onModuleChange={handleModuleChange}
  onNewScan={activeModule === 'duplicates' ? handleNewScan : handleScreenshotNewScan}
  // ... rest of props
/>
```

**Step 4: Add conditional rendering for screenshots module**

After the duplicates views in the main section:

```typescript
{activeModule === 'screenshots' && screenshotAppState === 'results' && screenshotResults && (
  <motion.div
    key="screenshot-results"
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.5, ease: "circOut" }}
    className="flex-1 glass-strong overflow-hidden shadow-2xl"
  >
    <ScreenshotsView
      results={screenshotResults}
      onTrash={handleTrashScreenshots}
      onNewScan={handleScreenshotNewScan}
    />
  </motion.div>
)}
```

**Step 5: Verify it compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

**Step 6: Commit**

```bash
git add ui/src/App.tsx
git commit -m "feat(app): integrate screenshots module"
```

---

## Task 10: Add Screenshot Scan Trigger in ScanView

**Files:**
- Create: `ui/src/components/ScreenshotScanView.tsx` (optional - or extend ScanView)

For simplicity, we'll create a dedicated scan view for screenshots.

**Step 1: Create ScreenshotScanView component**

Create `ui/src/components/ScreenshotScanView.tsx`:

```tsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { motion } from 'framer-motion'
import { Smartphone, FolderOpen, Zap } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { ProgressRing } from './ProgressRing'
import { SensitivitySlider } from './SensitivitySlider'
import type { ScreenshotScanResult, ScanProgress } from '../lib/types'

interface ScreenshotScanViewProps {
  onScanComplete: (result: ScreenshotScanResult) => void
  onScanCancel: () => void
}

export function ScreenshotScanView({ onScanComplete, onScanCancel }: ScreenshotScanViewProps) {
  const [paths, setPaths] = useState<string[]>([])
  const [threshold, setThreshold] = useState(5)
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress>({ phase: '', percent: 0, message: '' })

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: true,
      title: 'Select folders to scan for screenshots',
    })
    if (selected) {
      setPaths(Array.isArray(selected) ? selected : [selected])
    }
  }

  const handleScan = async () => {
    if (paths.length === 0) return

    setIsScanning(true)
    setProgress({ phase: 'starting', percent: 0, message: 'Starting scan...' })

    // Listen for progress events
    const unlisten = await listen<ScanProgress>('screenshot-scan-event', (event) => {
      setProgress(event.payload)
    })

    try {
      const result = await invoke<ScreenshotScanResult>('scan_screenshots', {
        config: { paths, threshold, algorithm: 'difference' }
      })
      onScanComplete(result)
    } catch (error) {
      console.error('Screenshot scan failed:', error)
      onScanCancel()
    } finally {
      unlisten()
      setIsScanning(false)
    }
  }

  if (isScanning) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <ProgressRing percent={progress.percent} size={200} />
        <div className="mt-8 text-center">
          <p className="text-lg font-medium text-white">{progress.phase}</p>
          <p className="mt-2 text-sm text-slate-400">{progress.message}</p>
        </div>
        <button
          type="button"
          onClick={onScanCancel}
          className="mt-8 border border-white/10 bg-white/5 px-6 py-2 text-sm font-medium text-slate-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
          <Smartphone className="h-10 w-10 text-purple-300" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold text-white">Find Screenshots</h2>
        <p className="mt-2 text-slate-400">
          Detect screenshots by filename, metadata, and screen dimensions
        </p>
      </div>

      <div className="mt-8 w-full max-w-md space-y-6">
        {/* Folder selector */}
        <button
          type="button"
          onClick={handleSelectFolder}
          className="group flex w-full items-center gap-4 border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20"
        >
          <FolderOpen className="h-6 w-6 text-slate-400 group-hover:text-white" />
          <div className="flex-1">
            {paths.length > 0 ? (
              <>
                <p className="text-sm font-medium text-white">
                  {paths.length} folder{paths.length > 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {paths[0]}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">Select folders to scan</p>
            )}
          </div>
        </button>

        {/* Sensitivity slider */}
        <div className="border border-white/10 bg-white/5 p-4">
          <SensitivitySlider value={threshold} onChange={setThreshold} />
        </div>

        {/* Scan button */}
        <motion.button
          type="button"
          onClick={handleScan}
          disabled={paths.length === 0}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`group relative w-full overflow-hidden border p-4 text-center transition ${
            paths.length > 0
              ? 'border-purple-500/30 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white'
              : 'border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-5 w-5" />
            <span className="font-medium">Scan for Screenshots</span>
          </div>
        </motion.button>
      </div>
    </div>
  )
}
```

**Step 2: Update App.tsx to use ScreenshotScanView**

Add import:

```typescript
import { ScreenshotScanView } from './components/ScreenshotScanView'
```

Add view for idle screenshot state:

```typescript
{activeModule === 'screenshots' && screenshotAppState === 'idle' && (
  <motion.div
    key="screenshot-idle"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="flex-1 glass-strong overflow-hidden shadow-2xl"
  >
    <ScreenshotScanView
      onScanComplete={handleScreenshotScanComplete}
      onScanCancel={handleScreenshotNewScan}
    />
  </motion.div>
)}
```

**Step 3: Verify it compiles**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run type-check
```

**Step 4: Commit**

```bash
git add ui/src/components/ScreenshotScanView.tsx ui/src/App.tsx
git commit -m "feat(ui): add screenshot scan view and integrate with app"
```

---

## Task 11: Test Full Flow

**Step 1: Build the Tauri app**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler && cargo tauri dev
```

**Step 2: Manual test checklist**

- [ ] Click "Screenshots" in sidebar - navigates to screenshot module
- [ ] Select a folder with screenshots
- [ ] Click "Scan for Screenshots"
- [ ] Progress shows correctly
- [ ] Results display in "All Screenshots" tab
- [ ] Click "Duplicates" tab - shows duplicate groups (if any)
- [ ] Select screenshots with checkboxes
- [ ] Click "Move to Trash" - confirmation appears
- [ ] Confirm - files are trashed
- [ ] Preview works when clicking thumbnails

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: screenshot flow corrections"
```

---

## Task 12: Final Commit

**Step 1: Verify all tests pass**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler && cargo test
```

**Step 2: Verify frontend builds**

```bash
cd /Users/georgewall/RustroverProjects/DuplicatePhotoHandler/ui && npm run build
```

**Step 3: Create final commit**

```bash
git add -A
git commit -m "feat: complete screenshots feature implementation"
```
