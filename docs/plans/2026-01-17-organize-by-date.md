# Organize by Date - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Help users organize photos/videos into a date-based folder structure (Year/Month) using EXIF metadata.

**Architecture:** Three-phase workflow (Configure → Preview → Execute). Scanner extracts dates from EXIF, planner generates file mappings, executor copies/moves with progress events.

**Tech Stack:** Rust backend (Tauri 2.0, kamadak-exif for EXIF), React frontend, TypeScript, framer-motion

---

## Task 1: Create Organize Module Structure

**Files:**
- Create: `src/core/organize/mod.rs`
- Create: `src/core/organize/types.rs`
- Modify: `src/core/mod.rs`

**Step 1: Create module structure**

Create `src/core/organize/mod.rs`:
```rust
//! Photo organization module.
//!
//! Organizes photos into date-based folder structures using EXIF metadata.

mod types;
mod scanner;
mod planner;
mod executor;

pub use types::*;
pub use scanner::OrganizeScanner;
pub use planner::OrganizePlanner;
pub use executor::OrganizeExecutor;
```

**Step 2: Create types**

Create `src/core/organize/types.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Folder structure options for organization
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum FolderStructure {
    /// Year/Month (e.g., 2024/01 - January/)
    #[default]
    YearMonth,
    /// Year/Month/Day (e.g., 2024/01/15/)
    YearMonthDay,
    /// Flat Year-Month (e.g., 2024-01/)
    YearMonthFlat,
}

/// Operation mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum OperationMode {
    /// Copy files to destination (keep originals)
    #[default]
    Copy,
    /// Move files to destination
    Move,
}

/// Configuration for organize operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizeConfig {
    pub source_paths: Vec<String>,
    pub destination: String,
    pub structure: FolderStructure,
    pub operation: OperationMode,
}

/// Information about a file to be organized
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedFile {
    pub source: String,
    pub destination: String,
    pub filename: String,
    pub date: Option<String>,  // ISO date string
    pub size_bytes: u64,
    pub has_conflict: bool,
}

/// Conflict information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub source: String,
    pub destination: String,
    pub resolution: String,  // "rename" or "skip"
}

/// Summary of files by year
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YearSummary {
    pub year: u32,
    pub count: usize,
    pub size_bytes: u64,
}

/// The organization plan (preview)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizePlan {
    pub id: String,
    pub files: Vec<PlannedFile>,
    pub total_files: usize,
    pub total_size_bytes: u64,
    pub date_range: Option<(String, String)>,  // (earliest, latest)
    pub by_year: Vec<YearSummary>,
    pub no_date_count: usize,
    pub conflict_count: usize,
}

/// Result of executing the plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizeResult {
    pub files_processed: usize,
    pub folders_created: usize,
    pub total_size_bytes: u64,
    pub duration_ms: u64,
    pub errors: Vec<String>,
}
```

**Step 3: Export from core**

Add to `src/core/mod.rs`:
```rust
pub mod organize;
```

**Step 4: Verify build**

Run: `cargo build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/core/organize/ src/core/mod.rs
git commit -m "feat(organize): add module structure and types"
```

---

## Task 2: Create Date Scanner

**Files:**
- Create: `src/core/organize/scanner.rs`
- Modify: `Cargo.toml` (add kamadak-exif)

**Step 1: Add EXIF dependency**

Add to workspace `Cargo.toml` dependencies:
```toml
kamadak-exif = "0.5"
```

**Step 2: Create scanner**

Create `src/core/organize/scanner.rs`:
```rust
//! Scanner for extracting dates from media files.

use chrono::NaiveDate;
use std::fs::{self, File};
use std::io::BufReader;
use std::path::Path;
use walkdir::WalkDir;

/// Scanner for extracting dates from photos/videos
pub struct OrganizeScanner;

impl OrganizeScanner {
    /// Extract date from a file using EXIF or file metadata
    pub fn extract_date(path: &Path) -> Option<NaiveDate> {
        // Try EXIF first
        if let Some(date) = Self::extract_exif_date(path) {
            return Some(date);
        }

        // Fall back to file modified date
        Self::extract_file_date(path)
    }

    fn extract_exif_date(path: &Path) -> Option<NaiveDate> {
        let file = File::open(path).ok()?;
        let mut reader = BufReader::new(file);
        let exif = exif::Reader::new().read_from_container(&mut reader).ok()?;

        // Try DateTimeOriginal first (when photo was taken)
        if let Some(field) = exif.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
            if let Some(date) = Self::parse_exif_datetime(&field.display_value().to_string()) {
                return Some(date);
            }
        }

        // Try CreateDate as fallback
        if let Some(field) = exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY) {
            if let Some(date) = Self::parse_exif_datetime(&field.display_value().to_string()) {
                return Some(date);
            }
        }

        None
    }

    fn parse_exif_datetime(s: &str) -> Option<NaiveDate> {
        // EXIF format: "2024-01-15 14:30:00" or "2024:01:15 14:30:00"
        let s = s.replace(':', "-");
        let date_part = s.split_whitespace().next()?;
        NaiveDate::parse_from_str(date_part, "%Y-%m-%d").ok()
    }

    fn extract_file_date(path: &Path) -> Option<NaiveDate> {
        let metadata = fs::metadata(path).ok()?;
        let modified = metadata.modified().ok()?;
        let datetime: chrono::DateTime<chrono::Utc> = modified.into();
        Some(datetime.date_naive())
    }

    /// Check if file is a supported media type
    pub fn is_media_file(path: &Path) -> bool {
        const MEDIA_EXTENSIONS: &[&str] = &[
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif",
            "heic", "heif", "raw", "cr2", "nef", "dng", "arw", "raf",
            "mp4", "mov", "avi", "mkv", "wmv", "webm", "m4v",
        ];

        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| MEDIA_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    /// Scan directories and return all media files with dates
    pub fn scan_with_progress<F>(
        paths: &[String],
        mut on_progress: F,
    ) -> Result<Vec<(String, Option<NaiveDate>, u64)>, String>
    where
        F: FnMut(usize, &str),
    {
        let mut results = Vec::new();
        let mut scanned = 0;

        for path_str in paths {
            let path = Path::new(path_str);
            if !path.exists() {
                return Err(format!("Path does not exist: {}", path_str));
            }

            for entry in WalkDir::new(path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let entry_path = entry.path();

                if !entry_path.is_file() || !Self::is_media_file(entry_path) {
                    continue;
                }

                scanned += 1;
                if scanned % 50 == 0 {
                    on_progress(scanned, entry_path.to_str().unwrap_or(""));
                }

                let size = fs::metadata(entry_path).map(|m| m.len()).unwrap_or(0);
                let date = Self::extract_date(entry_path);

                results.push((entry_path.display().to_string(), date, size));
            }
        }

        on_progress(scanned, "");
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_media_file() {
        assert!(OrganizeScanner::is_media_file(Path::new("photo.jpg")));
        assert!(OrganizeScanner::is_media_file(Path::new("video.mp4")));
        assert!(OrganizeScanner::is_media_file(Path::new("image.HEIC")));
        assert!(!OrganizeScanner::is_media_file(Path::new("doc.pdf")));
    }

    #[test]
    fn test_parse_exif_datetime() {
        let date = OrganizeScanner::parse_exif_datetime("2024-01-15 14:30:00");
        assert_eq!(date, Some(NaiveDate::from_ymd_opt(2024, 1, 15).unwrap()));
    }
}
```

**Step 3: Verify build**

Run: `cargo build`
Expected: Build succeeds

**Step 4: Run tests**

Run: `cargo test organize`
Expected: Tests pass

**Step 5: Commit**

```bash
git add Cargo.toml src/core/organize/scanner.rs
git commit -m "feat(organize): add date scanner with EXIF support"
```

---

## Task 3: Create Plan Generator

**Files:**
- Create: `src/core/organize/planner.rs`

**Step 1: Create planner**

Create `src/core/organize/planner.rs`:
```rust
//! Plan generator for organization operations.

use super::types::*;
use super::scanner::OrganizeScanner;
use chrono::NaiveDate;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use uuid::Uuid;

/// Generates organization plans
pub struct OrganizePlanner;

impl OrganizePlanner {
    /// Create an organization plan from config
    pub fn create_plan<F>(
        config: &OrganizeConfig,
        on_progress: F,
    ) -> Result<OrganizePlan, String>
    where
        F: FnMut(usize, &str),
    {
        // Scan all files
        let scanned = OrganizeScanner::scan_with_progress(&config.source_paths, on_progress)?;

        let mut files = Vec::new();
        let mut by_year: HashMap<u32, (usize, u64)> = HashMap::new();
        let mut no_date_count = 0;
        let mut destinations: HashSet<String> = HashSet::new();
        let mut conflict_count = 0;
        let mut earliest: Option<NaiveDate> = None;
        let mut latest: Option<NaiveDate> = None;
        let mut total_size = 0u64;

        let dest_base = Path::new(&config.destination);

        for (source, date, size) in scanned {
            total_size += size;

            let (dest_folder, date_str) = match date {
                Some(d) => {
                    // Update date range
                    earliest = Some(earliest.map_or(d, |e| e.min(d)));
                    latest = Some(latest.map_or(d, |l| l.max(d)));

                    // Update year summary
                    let year = d.year() as u32;
                    let entry = by_year.entry(year).or_insert((0, 0));
                    entry.0 += 1;
                    entry.1 += size;

                    let folder = Self::build_folder_path(&config.structure, d);
                    (folder, Some(d.to_string()))
                }
                None => {
                    no_date_count += 1;
                    ("Unsorted".to_string(), None)
                }
            };

            let filename = Path::new(&source)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let mut dest_path = dest_base.join(&dest_folder).join(&filename);
            let mut has_conflict = false;

            // Check for conflicts
            let dest_str = dest_path.display().to_string();
            if destinations.contains(&dest_str) {
                has_conflict = true;
                conflict_count += 1;
                // Generate unique name
                dest_path = Self::generate_unique_path(&dest_path, &destinations);
            }

            let final_dest = dest_path.display().to_string();
            destinations.insert(final_dest.clone());

            files.push(PlannedFile {
                source,
                destination: final_dest,
                filename,
                date: date_str,
                size_bytes: size,
                has_conflict,
            });
        }

        // Convert year summary
        let mut by_year_vec: Vec<YearSummary> = by_year
            .into_iter()
            .map(|(year, (count, size))| YearSummary { year, count, size_bytes: size })
            .collect();
        by_year_vec.sort_by(|a, b| b.year.cmp(&a.year));

        let date_range = match (earliest, latest) {
            (Some(e), Some(l)) => Some((e.to_string(), l.to_string())),
            _ => None,
        };

        Ok(OrganizePlan {
            id: Uuid::new_v4().to_string(),
            total_files: files.len(),
            total_size_bytes: total_size,
            date_range,
            by_year: by_year_vec,
            no_date_count,
            conflict_count,
            files,
        })
    }

    fn build_folder_path(structure: &FolderStructure, date: NaiveDate) -> String {
        let year = date.year();
        let month = date.month();
        let day = date.day();

        let month_name = match month {
            1 => "January", 2 => "February", 3 => "March",
            4 => "April", 5 => "May", 6 => "June",
            7 => "July", 8 => "August", 9 => "September",
            10 => "October", 11 => "November", 12 => "December",
            _ => "Unknown",
        };

        match structure {
            FolderStructure::YearMonth => {
                format!("{}/{:02} - {}", year, month, month_name)
            }
            FolderStructure::YearMonthDay => {
                format!("{}/{:02}/{:02}", year, month, day)
            }
            FolderStructure::YearMonthFlat => {
                format!("{}-{:02}", year, month)
            }
        }
    }

    fn generate_unique_path(path: &Path, existing: &HashSet<String>) -> std::path::PathBuf {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let parent = path.parent().unwrap_or(Path::new(""));

        let mut counter = 1;
        loop {
            let new_name = if ext.is_empty() {
                format!("{}_{}", stem, counter)
            } else {
                format!("{}_{}.{}", stem, counter, ext)
            };
            let new_path = parent.join(new_name);
            if !existing.contains(&new_path.display().to_string()) {
                return new_path;
            }
            counter += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_folder_path_year_month() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonth, date);
        assert_eq!(path, "2024/01 - January");
    }

    #[test]
    fn test_build_folder_path_year_month_day() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonthDay, date);
        assert_eq!(path, "2024/01/15");
    }

    #[test]
    fn test_build_folder_path_flat() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonthFlat, date);
        assert_eq!(path, "2024-01");
    }
}
```

**Step 2: Add uuid dependency if not present**

Check and add to Cargo.toml if needed:
```toml
uuid = { version = "1", features = ["v4"] }
```

**Step 3: Run tests**

Run: `cargo test organize`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/core/organize/planner.rs Cargo.toml
git commit -m "feat(organize): add plan generator"
```

---

## Task 4: Create Plan Executor

**Files:**
- Create: `src/core/organize/executor.rs`

**Step 1: Create executor**

Create `src/core/organize/executor.rs`:
```rust
//! Executor for organization plans.

use super::types::*;
use std::fs;
use std::path::Path;
use std::time::Instant;

/// Executes organization plans
pub struct OrganizeExecutor;

impl OrganizeExecutor {
    /// Execute an organization plan with progress callback
    pub fn execute<F>(
        plan: &OrganizePlan,
        operation: OperationMode,
        mut on_progress: F,
    ) -> Result<OrganizeResult, String>
    where
        F: FnMut(usize, usize, &str),
    {
        let start = Instant::now();
        let mut processed = 0usize;
        let mut folders_created = 0usize;
        let mut total_size = 0u64;
        let mut errors = Vec::new();
        let mut created_dirs = std::collections::HashSet::new();

        for (i, file) in plan.files.iter().enumerate() {
            on_progress(i + 1, plan.total_files, &file.filename);

            let dest_path = Path::new(&file.destination);

            // Create parent directories if needed
            if let Some(parent) = dest_path.parent() {
                if !created_dirs.contains(&parent.to_path_buf()) {
                    if let Err(e) = fs::create_dir_all(parent) {
                        errors.push(format!("Failed to create {}: {}", parent.display(), e));
                        continue;
                    }
                    created_dirs.insert(parent.to_path_buf());
                    folders_created += 1;
                }
            }

            let source_path = Path::new(&file.source);

            // Execute copy or move
            let result = match operation {
                OperationMode::Copy => fs::copy(source_path, dest_path).map(|_| ()),
                OperationMode::Move => fs::rename(source_path, dest_path).or_else(|_| {
                    // rename fails across filesystems, fall back to copy+delete
                    fs::copy(source_path, dest_path)?;
                    fs::remove_file(source_path)
                }),
            };

            match result {
                Ok(()) => {
                    processed += 1;
                    total_size += file.size_bytes;
                }
                Err(e) => {
                    errors.push(format!("{}: {}", file.filename, e));
                }
            }
        }

        let duration = start.elapsed();

        Ok(OrganizeResult {
            files_processed: processed,
            folders_created,
            total_size_bytes: total_size,
            duration_ms: duration.as_millis() as u64,
            errors,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::io::Write;

    #[test]
    fn test_execute_copy() {
        let temp_src = TempDir::new().unwrap();
        let temp_dest = TempDir::new().unwrap();

        // Create a test file
        let src_file = temp_src.path().join("test.jpg");
        let mut f = fs::File::create(&src_file).unwrap();
        f.write_all(b"test content").unwrap();

        let plan = OrganizePlan {
            id: "test".to_string(),
            files: vec![PlannedFile {
                source: src_file.display().to_string(),
                destination: temp_dest.path().join("2024/01/test.jpg").display().to_string(),
                filename: "test.jpg".to_string(),
                date: Some("2024-01-15".to_string()),
                size_bytes: 12,
                has_conflict: false,
            }],
            total_files: 1,
            total_size_bytes: 12,
            date_range: None,
            by_year: vec![],
            no_date_count: 0,
            conflict_count: 0,
        };

        let result = OrganizeExecutor::execute(&plan, OperationMode::Copy, |_, _, _| {}).unwrap();

        assert_eq!(result.files_processed, 1);
        assert!(src_file.exists()); // Original still exists
        assert!(temp_dest.path().join("2024/01/test.jpg").exists());
    }
}
```

**Step 2: Run tests**

Run: `cargo test organize`
Expected: Tests pass

**Step 3: Commit**

```bash
git add src/core/organize/executor.rs
git commit -m "feat(organize): add plan executor"
```

---

## Task 5: Add Tauri Commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add organize commands**

Add to `src-tauri/src/commands.rs`:
```rust
use duplicate_photo_cleaner::core::organize::{
    OrganizeConfig, OrganizePlan, OrganizeResult, OrganizePlanner, OrganizeExecutor, OperationMode,
};
use std::sync::Mutex as StdMutex;

// Add to AppState:
// pub organize_plan: StdMutex<Option<OrganizePlan>>,

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
            let _ = app_handle.emit("organize-progress-event", OrganizeProgress {
                phase: "Scanning".to_string(),
                current: scanned,
                total: 0,
                current_file: current.to_string(),
            });
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Store plan for later execution
    if let Ok(mut stored) = state.organize_plan.lock() {
        *stored = Some(plan.clone());
    }

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
            let _ = app_handle.emit("organize-progress-event", OrganizeProgress {
                phase: "Organizing".to_string(),
                current,
                total,
                current_file: filename.to_string(),
            });
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Emit completion
    let _ = app.emit("organize-progress-event", OrganizeProgress {
        phase: "Complete".to_string(),
        current: result.files_processed,
        total: result.files_processed,
        current_file: String::new(),
    });

    Ok(result)
}
```

**Step 2: Update AppState**

Add to AppState struct:
```rust
pub organize_plan: std::sync::Mutex<Option<duplicate_photo_cleaner::core::organize::OrganizePlan>>,
```

Update Default impl to include:
```rust
organize_plan: std::sync::Mutex::new(None),
```

**Step 3: Register commands in lib.rs**

Add to invoke_handler:
```rust
commands::create_organize_plan,
commands::execute_organize_plan,
```

**Step 4: Build and verify**

Run: `cargo build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(organize): add Tauri commands"
```

---

## Task 6: Add TypeScript Types

**Files:**
- Modify: `ui/src/lib/types.ts`

**Step 1: Add organize types**

Add to `ui/src/lib/types.ts`:
```typescript
// Organization types
export type FolderStructure = 'year_month' | 'year_month_day' | 'year_month_flat'
export type OperationMode = 'copy' | 'move'

export interface OrganizeConfig {
  source_paths: string[]
  destination: string
  structure: FolderStructure
  operation: OperationMode
}

export interface PlannedFile {
  source: string
  destination: string
  filename: string
  date: string | null
  size_bytes: number
  has_conflict: boolean
}

export interface YearSummary {
  year: number
  count: number
  size_bytes: number
}

export interface OrganizePlan {
  id: string
  files: PlannedFile[]
  total_files: number
  total_size_bytes: number
  date_range: [string, string] | null
  by_year: YearSummary[]
  no_date_count: number
  conflict_count: number
}

export interface OrganizeResult {
  files_processed: number
  folders_created: number
  total_size_bytes: number
  duration_ms: number
  errors: string[]
}
```

**Step 2: Update ActiveModule type**

Change:
```typescript
export type ActiveModule = 'duplicates' | 'screenshots' | 'large'
```

To:
```typescript
export type ActiveModule = 'duplicates' | 'screenshots' | 'large' | 'organize'
```

**Step 3: Commit**

```bash
git add ui/src/lib/types.ts
git commit -m "feat(organize): add TypeScript types"
```

---

## Task 7: Create OrganizeConfigView Component

**Files:**
- Create: `ui/src/components/OrganizeConfigView.tsx`

**Step 1: Create config component**

Create the configuration view with:
- Source folder selector (reuse FolderSelector)
- Destination folder selector
- Folder structure dropdown (Year/Month, Year/Month/Day, Year-Month flat)
- Operation mode toggle (Copy/Move)
- "Preview" button to generate plan

Use existing component patterns from LargeFileScanView for consistency.

**Step 2: Commit**

```bash
git add ui/src/components/OrganizeConfigView.tsx
git commit -m "feat(organize): add config view component"
```

---

## Task 8: Create OrganizePreviewView Component

**Files:**
- Create: `ui/src/components/OrganizePreviewView.tsx`

**Step 1: Create preview component**

Create the preview view showing:
- Summary stats (total files, date range, total size)
- Year breakdown (expandable accordion)
- Warnings section (no-date count, conflicts)
- "Organize" button to execute
- "Back" button to reconfigure

**Step 2: Commit**

```bash
git add ui/src/components/OrganizePreviewView.tsx
git commit -m "feat(organize): add preview view component"
```

---

## Task 9: Create OrganizeResultView Component

**Files:**
- Create: `ui/src/components/OrganizeResultView.tsx`

**Step 1: Create result component**

Create the result view showing:
- Success message with stats
- Files processed, folders created
- Duration and size
- Errors list (if any)
- "Open in Finder" button
- "Organize More" button

**Step 2: Commit**

```bash
git add ui/src/components/OrganizeResultView.tsx
git commit -m "feat(organize): add result view component"
```

---

## Task 10: Create OrganizeView Container

**Files:**
- Create: `ui/src/components/OrganizeView.tsx`
- Create: `ui/src/hooks/useOrganizeEvents.ts`

**Step 1: Create events hook**

Create hook for listening to organize-progress-event.

**Step 2: Create container component**

Create main container that manages state between:
- Config → Preview → Executing → Result

**Step 3: Commit**

```bash
git add ui/src/components/OrganizeView.tsx ui/src/hooks/useOrganizeEvents.ts
git commit -m "feat(organize): add main view container and events hook"
```

---

## Task 11: Integrate into App

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`
- Modify: `ui/src/App.tsx`

**Step 1: Add to Sidebar**

Add "Organize" navigation item with FolderTree or similar icon.

**Step 2: Add to App.tsx**

Add OrganizeView to the module switch statement.

**Step 3: Commit**

```bash
git add ui/src/components/Sidebar.tsx ui/src/App.tsx
git commit -m "feat(organize): integrate into app navigation"
```

---

## Task 12: Test and Create PR

**Step 1: Build and test**

```bash
cargo build
cargo test
cd ui && npm run build
```

**Step 2: Manual testing**

- Test with folder containing photos with EXIF dates
- Test with mixed files (some with dates, some without)
- Test Copy mode
- Test Move mode
- Verify folder structure is created correctly

**Step 3: Create PR**

```bash
git push -u origin feature/organize-by-date
gh pr create --title "feat: add Organize by Date module" --body "..."
```

**Step 4: Get Gemini review**

```bash
gemini -p "Review PR for organize by date feature..."
```

**Step 5: Address feedback and merge**
