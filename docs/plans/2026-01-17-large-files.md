# Large Files Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Help users find and delete large files (≥10MB) to reclaim disk space, showing the top 50 largest files sorted by size.

**Architecture:** Reuse existing scanner infrastructure. Size filtering via `fs::metadata()` is O(1) - no file reads needed. Min-heap keeps top N results efficiently.

**Tech Stack:** Rust backend (Tauri 2.0), React frontend, TypeScript, framer-motion

---

## Task 1: Create Large Files Scanner Module

**Files:**
- Create: `src/core/large_files/mod.rs`
- Create: `src/core/large_files/scanner.rs`
- Modify: `src/core/mod.rs`

**Step 1: Create module structure**

Create `src/core/large_files/mod.rs`:
```rust
//! Large file detection module.
//!
//! Finds files above a size threshold for disk space cleanup.

mod scanner;

pub use scanner::{LargeFileInfo, LargeFileScanner, LargeFileScanResult};
```

**Step 2: Create scanner with types**

Create `src/core/large_files/scanner.rs`:
```rust
//! Large file scanner implementation.

use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::fs;
use std::path::Path;
use std::time::Instant;
use walkdir::WalkDir;

/// Information about a large file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFileInfo {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub file_type: String,
    pub modified: Option<String>,
}

impl PartialEq for LargeFileInfo {
    fn eq(&self, other: &Self) -> bool {
        self.size_bytes == other.size_bytes
    }
}

impl Eq for LargeFileInfo {}

impl PartialOrd for LargeFileInfo {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for LargeFileInfo {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.size_bytes.cmp(&other.size_bytes)
    }
}

/// Result of a large file scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFileScanResult {
    pub files: Vec<LargeFileInfo>,
    pub total_size_bytes: u64,
    pub files_scanned: usize,
    pub scan_duration_ms: u64,
}

/// Scanner for finding large files
pub struct LargeFileScanner {
    min_size_bytes: u64,
    max_results: usize,
}

impl Default for LargeFileScanner {
    fn default() -> Self {
        Self {
            min_size_bytes: 10 * 1024 * 1024, // 10 MB
            max_results: 50,
        }
    }
}

impl LargeFileScanner {
    /// Create a new scanner with custom settings
    pub fn new(min_size_mb: u64, max_results: usize) -> Self {
        Self {
            min_size_bytes: min_size_mb * 1024 * 1024,
            max_results,
        }
    }

    /// Scan directories for large files
    pub fn scan(&self, paths: &[String]) -> Result<LargeFileScanResult, String> {
        let start = Instant::now();
        let mut files_scanned = 0usize;

        // Min-heap to keep track of largest files (using Reverse for min-heap behavior)
        let mut heap: BinaryHeap<Reverse<LargeFileInfo>> = BinaryHeap::new();

        for path in paths {
            let path = Path::new(path);
            if !path.exists() {
                return Err(format!("Path does not exist: {}", path.display()));
            }

            for entry in WalkDir::new(path)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let entry_path = entry.path();

                // Skip directories
                if entry_path.is_dir() {
                    continue;
                }

                // Skip non-image/video files by extension
                if !Self::is_media_file(entry_path) {
                    continue;
                }

                files_scanned += 1;

                // Get file size - this is O(1), no file read needed
                let metadata = match fs::metadata(entry_path) {
                    Ok(m) => m,
                    Err(_) => continue, // Skip unreadable files
                };

                let size = metadata.len();

                // Skip if below threshold
                if size < self.min_size_bytes {
                    continue;
                }

                let file_info = LargeFileInfo {
                    path: entry_path.to_string_lossy().to_string(),
                    filename: entry_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    size_bytes: size,
                    file_type: Self::get_file_type(entry_path),
                    modified: Self::get_modified_time(&metadata),
                };

                // Add to heap, maintaining max_results limit
                if heap.len() < self.max_results {
                    heap.push(Reverse(file_info));
                } else if let Some(Reverse(smallest)) = heap.peek() {
                    if size > smallest.size_bytes {
                        heap.pop();
                        heap.push(Reverse(file_info));
                    }
                }
            }
        }

        // Extract and sort by size descending
        let mut files: Vec<LargeFileInfo> = heap.into_iter().map(|Reverse(f)| f).collect();
        files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

        let total_size_bytes = files.iter().map(|f| f.size_bytes).sum();
        let duration = start.elapsed();

        Ok(LargeFileScanResult {
            files,
            total_size_bytes,
            files_scanned,
            scan_duration_ms: duration.as_millis() as u64,
        })
    }

    fn is_media_file(path: &Path) -> bool {
        let media_extensions = [
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif", "heic", "heif",
            "raw", "cr2", "nef", "arw", "dng", "orf", "rw2",
            "mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "m4v", "3gp",
        ];

        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| media_extensions.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    fn get_file_type(path: &Path) -> String {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "png" => "image/png".to_string(),
            "gif" => "image/gif".to_string(),
            "webp" => "image/webp".to_string(),
            "heic" | "heif" => "image/heic".to_string(),
            "tiff" | "tif" => "image/tiff".to_string(),
            "bmp" => "image/bmp".to_string(),
            "raw" | "cr2" | "nef" | "arw" | "dng" | "orf" | "rw2" => "image/raw".to_string(),
            "mp4" => "video/mp4".to_string(),
            "mov" => "video/quicktime".to_string(),
            "avi" => "video/avi".to_string(),
            "mkv" => "video/x-matroska".to_string(),
            "webm" => "video/webm".to_string(),
            _ => format!("application/{}", ext),
        }
    }

    fn get_modified_time(metadata: &fs::Metadata) -> Option<String> {
        metadata
            .modified()
            .ok()
            .and_then(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                Some(datetime.to_rfc3339())
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_default_settings() {
        let scanner = LargeFileScanner::default();
        assert_eq!(scanner.min_size_bytes, 10 * 1024 * 1024);
        assert_eq!(scanner.max_results, 50);
    }

    #[test]
    fn test_custom_settings() {
        let scanner = LargeFileScanner::new(25, 100);
        assert_eq!(scanner.min_size_bytes, 25 * 1024 * 1024);
        assert_eq!(scanner.max_results, 100);
    }

    #[test]
    fn test_scan_empty_directory() {
        let dir = tempdir().unwrap();
        let scanner = LargeFileScanner::new(1, 10); // 1 MB threshold
        let result = scanner.scan(&[dir.path().to_string_lossy().to_string()]);

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result.files.len(), 0);
        assert_eq!(result.total_size_bytes, 0);
    }

    #[test]
    fn test_filters_by_threshold() {
        let dir = tempdir().unwrap();

        // Create a small file (below threshold)
        let small_path = dir.path().join("small.jpg");
        let mut small_file = File::create(&small_path).unwrap();
        small_file.write_all(&vec![0u8; 100]).unwrap(); // 100 bytes

        let scanner = LargeFileScanner::new(1, 10); // 1 MB threshold
        let result = scanner.scan(&[dir.path().to_string_lossy().to_string()]).unwrap();

        // Small file should be filtered out
        assert_eq!(result.files.len(), 0);
    }

    #[test]
    fn test_respects_max_results() {
        // This test verifies the max_results limit logic
        let scanner = LargeFileScanner::new(1, 2);
        assert_eq!(scanner.max_results, 2);
    }

    #[test]
    fn test_is_media_file() {
        assert!(LargeFileScanner::is_media_file(Path::new("photo.jpg")));
        assert!(LargeFileScanner::is_media_file(Path::new("video.mp4")));
        assert!(LargeFileScanner::is_media_file(Path::new("raw.CR2")));
        assert!(!LargeFileScanner::is_media_file(Path::new("document.pdf")));
        assert!(!LargeFileScanner::is_media_file(Path::new("script.js")));
    }

    #[test]
    fn test_get_file_type() {
        assert_eq!(LargeFileScanner::get_file_type(Path::new("a.jpg")), "image/jpeg");
        assert_eq!(LargeFileScanner::get_file_type(Path::new("b.mp4")), "video/mp4");
        assert_eq!(LargeFileScanner::get_file_type(Path::new("c.heic")), "image/heic");
    }

    #[test]
    fn test_invalid_path() {
        let scanner = LargeFileScanner::default();
        let result = scanner.scan(&["/nonexistent/path/12345".to_string()]);
        assert!(result.is_err());
    }
}
```

**Step 3: Export module from core**

Modify `src/core/mod.rs` to add:
```rust
pub mod large_files;
```

**Step 4: Run tests**

Run: `cargo test large_files`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/core/large_files/ src/core/mod.rs
git commit -m "feat(large-files): add large file scanner module"
```

---

## Task 2: Add Tauri Command for Large Files Scan

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register command)

**Step 1: Add scan_large_files command**

Add to `src-tauri/src/commands.rs`:
```rust
use duplicate_photo_cleaner::core::large_files::{LargeFileScanner, LargeFileScanResult};

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

    let reset_scanning = || {
        if let Ok(mut scanning) = state.scanning.lock() {
            *scanning = false;
        }
    };

    // Create scanner with optional overrides
    let scanner = match (min_size_mb, max_results) {
        (Some(size), Some(limit)) => LargeFileScanner::new(size, limit),
        (Some(size), None) => LargeFileScanner::new(size, 50),
        (None, Some(limit)) => LargeFileScanner::new(10, limit),
        (None, None) => LargeFileScanner::default(),
    };

    let result = match scanner.scan(&paths) {
        Ok(r) => r,
        Err(e) => {
            reset_scanning();
            return Err(e);
        }
    };

    reset_scanning();
    Ok(result)
}
```

**Step 2: Register command in lib.rs**

Add `scan_large_files` to the `invoke_handler` in `src-tauri/src/lib.rs`.

**Step 3: Build and verify**

Run: `cargo build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(large-files): add scan_large_files Tauri command"
```

---

## Task 3: Add TypeScript Types

**Files:**
- Modify: `ui/src/lib/types.ts`

**Step 1: Add LargeFileInfo and LargeFileScanResult types**

Add to `ui/src/lib/types.ts`:
```typescript
// Large file information
export interface LargeFileInfo {
  path: string
  filename: string
  size_bytes: number
  file_type: string
  modified: string | null
}

// Large file scan result
export interface LargeFileScanResult {
  files: LargeFileInfo[]
  total_size_bytes: number
  files_scanned: number
  scan_duration_ms: number
}
```

**Step 2: Update ActiveModule type**

Change:
```typescript
export type ActiveModule = 'duplicates' | 'screenshots'
```

To:
```typescript
export type ActiveModule = 'duplicates' | 'screenshots' | 'large'
```

**Step 3: Commit**

```bash
git add ui/src/lib/types.ts
git commit -m "feat(large-files): add TypeScript types"
```

---

## Task 4: Create LargeFileCard Component

**Files:**
- Create: `ui/src/components/LargeFileCard.tsx`

**Step 1: Create component**

Create `ui/src/components/LargeFileCard.tsx`:
```tsx
import { motion } from 'framer-motion'
import { File, Film, Image, Check } from 'lucide-react'
import type { LargeFileInfo } from '../lib/types'

interface LargeFileCardProps {
  file: LargeFileInfo
  isSelected: boolean
  onToggleSelect: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('video/')) return Film
  if (fileType.startsWith('image/')) return Image
  return File
}

export function LargeFileCard({ file, isSelected, onToggleSelect }: LargeFileCardProps) {
  const FileIcon = getFileIcon(file.file_type)

  return (
    <motion.button
      type="button"
      onClick={onToggleSelect}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`group relative w-full overflow-hidden border bg-white/[0.02] p-4 text-left transition-all ${
        isSelected
          ? 'border-cyan-400/40 bg-cyan-500/10'
          : 'border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
      }`}
      aria-pressed={isSelected}
      aria-label={`${file.filename}, ${formatBytes(file.size_bytes)}${isSelected ? ', selected' : ''}`}
    >
      {/* Selection indicator */}
      <div
        className={`absolute top-3 right-3 flex h-6 w-6 items-center justify-center border transition-all ${
          isSelected
            ? 'border-cyan-400 bg-cyan-500 text-white'
            : 'border-white/20 bg-white/5 text-transparent group-hover:border-white/40'
        }`}
      >
        <Check className="h-4 w-4" />
      </div>

      {/* File icon */}
      <div className={`mb-3 flex h-12 w-12 items-center justify-center border ${
        isSelected
          ? 'border-cyan-400/30 bg-cyan-500/20 text-cyan-200'
          : 'border-white/10 bg-white/5 text-slate-400'
      }`}>
        <FileIcon className="h-6 w-6" />
      </div>

      {/* File info */}
      <p className="truncate text-sm font-medium text-white" title={file.filename}>
        {file.filename}
      </p>

      {/* Size badge */}
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold ${
          isSelected
            ? 'border-cyan-400/30 bg-cyan-500/20 text-cyan-200'
            : 'border-amber-400/30 bg-amber-500/20 text-amber-200'
        }`}>
          {formatBytes(file.size_bytes)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {file.file_type.split('/')[1]}
        </span>
      </div>
    </motion.button>
  )
}
```

**Step 2: Commit**

```bash
git add ui/src/components/LargeFileCard.tsx
git commit -m "feat(large-files): add LargeFileCard component"
```

---

## Task 5: Create LargeFileGrid Component

**Files:**
- Create: `ui/src/components/LargeFileGrid.tsx`

**Step 1: Create component**

Create `ui/src/components/LargeFileGrid.tsx`:
```tsx
import { LargeFileCard } from './LargeFileCard'
import type { LargeFileInfo } from '../lib/types'

interface LargeFileGridProps {
  files: LargeFileInfo[]
  selectedPaths: Set<string>
  onToggleSelect: (path: string) => void
}

export function LargeFileGrid({ files, selectedPaths, onToggleSelect }: LargeFileGridProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-slate-400">No large files found</p>
        <p className="mt-2 text-sm text-slate-500">
          All files in your library are below the size threshold
        </p>
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      role="grid"
      aria-label="Large files"
    >
      {files.map((file) => (
        <LargeFileCard
          key={file.path}
          file={file}
          isSelected={selectedPaths.has(file.path)}
          onToggleSelect={() => onToggleSelect(file.path)}
        />
      ))}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add ui/src/components/LargeFileGrid.tsx
git commit -m "feat(large-files): add LargeFileGrid component"
```

---

## Task 6: Create LargeFilesView Component

**Files:**
- Create: `ui/src/components/LargeFilesView.tsx`

**Step 1: Create component**

Create `ui/src/components/LargeFilesView.tsx`:
```tsx
import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import { Trash2, CheckSquare, Square, ArrowLeft, HardDrive } from 'lucide-react'
import { LargeFileGrid } from './LargeFileGrid'
import { ConfirmModal } from './ConfirmModal'
import type { LargeFileScanResult } from '../lib/types'

interface LargeFilesViewProps {
  results: LargeFileScanResult
  onNewScan: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function LargeFilesView({ results, onNewScan }: LargeFilesViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleToggleSelect = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedPaths.size === results.files.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(results.files.map(f => f.path)))
    }
  }, [selectedPaths.size, results.files])

  const selectedSize = results.files
    .filter(f => selectedPaths.has(f.path))
    .reduce((sum, f) => sum + f.size_bytes, 0)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const pathsToDelete = Array.from(selectedPaths)
      await invoke('delete_files', { paths: pathsToDelete })
      // Remove deleted files from selection
      setSelectedPaths(new Set())
      // Trigger new scan to refresh results
      onNewScan()
    } catch (error) {
      console.error('Delete failed:', error)
    } finally {
      setIsDeleting(false)
      setShowConfirm(false)
    }
  }

  const allSelected = selectedPaths.size === results.files.length && results.files.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onNewScan}
              className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              New scan
            </button>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-amber-400" />
              <span className="text-lg font-semibold text-white">
                {results.files.length} Large Files
              </span>
              <span className="text-sm text-slate-400">
                ({formatBytes(results.total_size_bytes)} total)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-cyan-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>

            {selectedPaths.size > 0 && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 transition hover:border-red-500/50 hover:bg-red-500/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete {selectedPaths.size} ({formatBytes(selectedSize)})
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        <LargeFileGrid
          files={results.files}
          selectedPaths={selectedPaths}
          onToggleSelect={handleToggleSelect}
        />
      </div>

      {/* Stats footer */}
      <div className="border-t border-white/10 bg-white/[0.02] px-6 py-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Scanned {results.files_scanned.toLocaleString()} files in {(results.scan_duration_ms / 1000).toFixed(1)}s</span>
          <span>{selectedPaths.size} selected</span>
        </div>
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title="Delete Large Files"
        message={`Are you sure you want to permanently delete ${selectedPaths.size} file${selectedPaths.size === 1 ? '' : 's'}? This will free up ${formatBytes(selectedSize)}.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
        isDestructive
      />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add ui/src/components/LargeFilesView.tsx
git commit -m "feat(large-files): add LargeFilesView component"
```

---

## Task 7: Create LargeFileScanView Component

**Files:**
- Create: `ui/src/components/LargeFileScanView.tsx`

**Step 1: Create component**

Create `ui/src/components/LargeFileScanView.tsx`:
```tsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import { HardDrive, FolderOpen, Search, Loader2 } from 'lucide-react'
import { FolderSelector } from './FolderSelector'
import type { LargeFileScanResult } from '../lib/types'

interface LargeFileScanViewProps {
  isScanning?: boolean
  progress?: { phase: string; percent: number; message: string }
  onScanStart: () => void
  onScanComplete: (result: LargeFileScanResult) => void
  onScanCancel: () => void
  onProgress: (progress: { phase: string; percent: number; message: string }) => void
}

export function LargeFileScanView({
  isScanning = false,
  progress,
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
}: LargeFileScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])

  const handleStartScan = async () => {
    if (selectedPaths.length === 0) return

    onScanStart()
    onProgress({ phase: 'Scanning', percent: 0, message: 'Looking for large files...' })

    try {
      const result = await invoke<LargeFileScanResult>('scan_large_files', {
        paths: selectedPaths,
        minSizeMb: 10,
        maxResults: 50,
      })
      onScanComplete(result)
    } catch (error) {
      console.error('Large file scan failed:', error)
      onScanCancel()
    }
  }

  if (isScanning) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="relative">
            <div className="absolute -inset-4 bg-amber-400/20 blur-xl" />
            <div className="relative flex h-20 w-20 items-center justify-center border border-amber-400/30 bg-amber-500/20">
              <Loader2 className="h-10 w-10 text-amber-300 animate-spin" />
            </div>
          </div>
          <p className="mt-6 text-lg font-medium text-white">{progress?.phase || 'Scanning'}</p>
          <p className="mt-2 text-sm text-slate-400">{progress?.message || 'Looking for large files...'}</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="relative">
            <div className="absolute -inset-2 bg-amber-400/20 blur-lg" />
            <div className="relative flex h-16 w-16 items-center justify-center border border-amber-400/30 bg-gradient-to-br from-amber-500/30 to-orange-500/20">
              <HardDrive className="h-8 w-8 text-amber-300" />
            </div>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white">Find Large Files</h2>
        <p className="mt-2 text-slate-400">
          Discover files over 10 MB taking up space in your photo library
        </p>
      </div>

      <div className="flex-1">
        <FolderSelector
          selectedPaths={selectedPaths}
          onPathsChange={setSelectedPaths}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <motion.button
          type="button"
          onClick={handleStartScan}
          disabled={selectedPaths.length === 0}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`flex items-center gap-3 px-8 py-4 text-lg font-semibold transition ${
            selectedPaths.length > 0
              ? 'border border-amber-400/40 bg-gradient-to-r from-amber-500/30 to-orange-500/20 text-amber-100 hover:from-amber-500/40 hover:to-orange-500/30'
              : 'border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Search className="h-5 w-5" />
          Scan for Large Files
        </motion.button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add ui/src/components/LargeFileScanView.tsx
git commit -m "feat(large-files): add LargeFileScanView component"
```

---

## Task 8: Update Sidebar Navigation

**Files:**
- Modify: `ui/src/components/Sidebar.tsx`

**Step 1: Update isActiveModule type guard**

Change:
```typescript
const isActiveModule = (id: string): id is ActiveModule => {
  return id === 'duplicates' || id === 'screenshots'
}
```

To:
```typescript
const isActiveModule = (id: string): id is ActiveModule => {
  return id === 'duplicates' || id === 'screenshots' || id === 'large'
}
```

**Step 2: Mark Large Files as available**

In the `groups` array, change the Large Files item:
```typescript
{ id: 'large', name: 'Large Files', hint: 'Space hogs', icon: HardDrive, available: true },
```

**Step 3: Commit**

```bash
git add ui/src/components/Sidebar.tsx
git commit -m "feat(large-files): enable Large Files in sidebar navigation"
```

---

## Task 9: Integrate Large Files into App.tsx

**Files:**
- Modify: `ui/src/App.tsx`

**Step 1: Add imports**

Add:
```typescript
import { LargeFilesView } from './components/LargeFilesView'
import { LargeFileScanView } from './components/LargeFileScanView'
```

And update type import:
```typescript
import type { AppState, ScanResult, WatcherEvent, ActiveModule, ScreenshotScanResult, LargeFileScanResult } from './lib/types'
```

**Step 2: Add state for large files**

Add after screenshotAppState:
```typescript
const [largeFileResults, setLargeFileResults] = useState<LargeFileScanResult | null>(null)
const [largeFileAppState, setLargeFileAppState] = useState<AppState>('idle')
const [largeFileProgress, setLargeFileProgress] = useState({ phase: '', percent: 0, message: '' })
```

**Step 3: Add handler for large file scan completion**

Add after handleScreenshotScanComplete:
```typescript
const handleLargeFileScanComplete = (result: LargeFileScanResult) => {
  setLargeFileResults(result)
  setLargeFileAppState('results')
}
```

**Step 4: Update handleNewScan**

Update to handle large files module:
```typescript
const handleNewScan = () => {
  if (activeModule === 'screenshots') {
    setScreenshotResults(null)
    setScreenshotAppState('idle')
  } else if (activeModule === 'large') {
    setLargeFileResults(null)
    setLargeFileAppState('idle')
  } else {
    setResults(null)
    setAppState('idle')
  }
}
```

**Step 5: Add Large Files module rendering**

Add after Screenshots module section in the AnimatePresence:
```tsx
{/* Large Files Module */}
{activeModule === 'large' && (
  <>
    {largeFileAppState === 'idle' && (
      <motion.div
        key="large-idle"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="flex-1 glass-strong overflow-hidden shadow-2xl"
      >
        <LargeFileScanView
          onScanStart={() => setLargeFileAppState('scanning')}
          onScanComplete={handleLargeFileScanComplete}
          onScanCancel={handleNewScan}
          onProgress={setLargeFileProgress}
        />
      </motion.div>
    )}

    {largeFileAppState === 'scanning' && (
      <motion.div
        key="large-scanning"
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 glass-strong overflow-hidden shadow-2xl"
      >
        <LargeFileScanView
          isScanning
          progress={largeFileProgress}
          onScanStart={() => {}}
          onScanComplete={handleLargeFileScanComplete}
          onScanCancel={handleNewScan}
          onProgress={setLargeFileProgress}
        />
      </motion.div>
    )}

    {largeFileAppState === 'results' && largeFileResults && (
      <motion.div
        key="large-results"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.5, ease: "circOut" }}
        className="flex-1 glass-strong overflow-hidden shadow-2xl"
      >
        <LargeFilesView
          results={largeFileResults}
          onNewScan={handleNewScan}
        />
      </motion.div>
    )}
  </>
)}
```

**Step 6: Commit**

```bash
git add ui/src/App.tsx
git commit -m "feat(large-files): integrate Large Files module into App"
```

---

## Task 10: Test Full Flow

**Step 1: Build backend**

Run: `cargo build`
Expected: Build succeeds

**Step 2: Run Rust tests**

Run: `cargo test`
Expected: All tests pass

**Step 3: Build frontend**

Run: `cd ui && npm run build`
Expected: Build succeeds

**Step 4: Test in development**

Run: `cargo tauri dev`
Expected:
- Large Files appears in sidebar as enabled
- Clicking it shows LargeFileScanView
- Selecting folder and scanning works
- Results show in grid
- Selection and delete work

**Step 5: Commit any fixes**

If fixes were needed, commit them.

---

## Task 11: Final Review and Merge

**Step 1: Run all tests**

Run: `cargo test && cd ui && npm run build`
Expected: All pass

**Step 2: Review changes**

Run: `git log --oneline feature/large-files ^master`
Review all commits are clean.

**Step 3: Merge to master**

```bash
git checkout master
git merge feature/large-files
git push
```

---

**Plan complete.** Two execution options:

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks
2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution

Which approach?
