//! Large file detection and scanning.
//!
//! Finds files above a size threshold for disk space cleanup.
//! Uses efficient filesystem metadata queries (O(1)) rather than reading file contents.

use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

/// Information about a large file
#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
pub struct LargeFileInfo {
    /// Full path to the file
    pub path: String,
    /// Just the filename
    pub filename: String,
    /// File size in bytes
    pub size_bytes: u64,
    /// File type (e.g., "jpg", "mp4")
    pub file_type: String,
    /// Last modified time (Unix timestamp in seconds)
    pub modified: u64,
}

impl PartialOrd for LargeFileInfo {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for LargeFileInfo {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Compare by size (for use in BinaryHeap as min-heap via Reverse)
        self.size_bytes.cmp(&other.size_bytes)
    }
}

/// Results from a large file scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFileScanResult {
    /// List of large files, sorted by size (largest first)
    pub files: Vec<LargeFileInfo>,
    /// Total size of all found files in bytes
    pub total_size_bytes: u64,
    /// Number of files scanned
    pub files_scanned: u64,
    /// Time taken for scan in milliseconds
    pub scan_duration_ms: u128,
}

/// Scanner for finding large files in directories
#[derive(Debug, Clone)]
pub struct LargeFileScanner {
    /// Minimum file size in bytes (default 10MB)
    min_size_bytes: u64,
    /// Maximum number of results to return (default 50)
    max_results: usize,
}

impl Default for LargeFileScanner {
    fn default() -> Self {
        Self {
            min_size_bytes: 10 * 1024 * 1024, // 10MB
            max_results: 50,
        }
    }
}

impl LargeFileScanner {
    /// Create a new scanner with specified thresholds
    ///
    /// # Arguments
    /// * `min_size_mb` - Minimum file size in MB
    /// * `max_results` - Maximum number of results to return
    pub fn new(min_size_mb: u64, max_results: usize) -> Self {
        Self {
            min_size_bytes: min_size_mb * 1024 * 1024,
            max_results,
        }
    }

    /// Scan directories for large files
    ///
    /// # Arguments
    /// * `paths` - Slice of directory paths to scan
    ///
    /// # Returns
    /// * `Ok(LargeFileScanResult)` - Scan results with large files
    /// * `Err(String)` - Error message if path doesn't exist
    pub fn scan(&self, paths: &[String]) -> Result<LargeFileScanResult, String> {
        self.scan_with_progress(paths, |_, _, _| {})
    }

    /// Scan directories for large files with progress callback
    ///
    /// # Arguments
    /// * `paths` - Slice of directory paths to scan
    /// * `on_progress` - Callback called with (files_scanned, large_files_found, current_file)
    ///
    /// # Returns
    /// * `Ok(LargeFileScanResult)` - Scan results with large files
    /// * `Err(String)` - Error message if path doesn't exist
    pub fn scan_with_progress<F>(
        &self,
        paths: &[String],
        mut on_progress: F,
    ) -> Result<LargeFileScanResult, String>
    where
        F: FnMut(u64, usize, &str),
    {
        use std::time::{Duration, Instant};

        let start = Instant::now();
        let mut last_progress_time = Instant::now();
        const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

        let mut heap: BinaryHeap<Reverse<LargeFileInfo>> = BinaryHeap::new();
        let mut total_size_bytes = 0u64;
        let mut files_scanned = 0u64;

        for path_str in paths {
            let path = Path::new(path_str);

            // Check if path exists
            if !path.exists() {
                return Err(format!("Path does not exist: {}", path_str));
            }

            // Walk the directory
            for entry in WalkDir::new(path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let entry_path = entry.path();

                // Only process files, not directories
                if !entry_path.is_file() {
                    continue;
                }

                files_scanned += 1;

                // Report progress every 100 files OR every 100ms (whichever comes first)
                // This prevents flooding the frontend while ensuring responsive updates
                let now = Instant::now();
                if files_scanned % 100 == 0 || now.duration_since(last_progress_time) >= PROGRESS_INTERVAL {
                    on_progress(
                        files_scanned,
                        heap.len(),
                        entry_path.to_str().unwrap_or(""),
                    );
                    last_progress_time = now;
                }

                // Get file metadata (O(1) operation)
                if let Ok(metadata) = fs::metadata(entry_path) {
                    let size = metadata.len();

                    // Check if file meets size threshold and is a media file
                    if size >= self.min_size_bytes && is_media_file(entry_path) {
                        let file_info = LargeFileInfo {
                            path: entry_path.display().to_string(),
                            filename: entry_path
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string(),
                            size_bytes: size,
                            file_type: get_file_type(entry_path),
                            modified: get_modified_time(&metadata),
                        };

                        total_size_bytes += size;
                        heap.push(Reverse(file_info));

                        // Keep only top N largest files
                        if heap.len() > self.max_results {
                            heap.pop();
                        }
                    }
                }
            }
        }

        // Final progress update
        on_progress(files_scanned, heap.len(), "");

        // Extract files from heap (they're in reverse order, so largest are at the end)
        let mut files: Vec<LargeFileInfo> = heap
            .into_iter()
            .map(|Reverse(info)| info)
            .collect();

        // Sort by size descending (largest first)
        files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

        let duration = start.elapsed();

        Ok(LargeFileScanResult {
            files,
            total_size_bytes,
            files_scanned,
            scan_duration_ms: duration.as_millis(),
        })
    }
}

/// Check if a file is a media file by extension
fn is_media_file(path: &Path) -> bool {
    const MEDIA_EXTENSIONS: &[&str] = &[
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "mp4", "mov", "avi", "mkv",
        "flv", "wmv", "webm", "m4v", "heic", "heif", "raw", "cr2", "nef", "dng", "arw", "raf",
    ];

    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| MEDIA_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Get the file extension as the file type
fn get_file_type(path: &Path) -> String {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Get the modification time as Unix timestamp
fn get_modified_time(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_file(dir: &Path, name: &str, size: u64) -> std::io::Result<()> {
        let path = dir.join(name);
        let mut file = fs::File::create(path)?;
        // Write size bytes to the file
        file.write_all(&vec![0u8; size as usize])?;
        Ok(())
    }

    #[test]
    fn test_default_settings() {
        let scanner = LargeFileScanner::default();
        assert_eq!(scanner.min_size_bytes, 10 * 1024 * 1024); // 10MB
        assert_eq!(scanner.max_results, 50);
    }

    #[test]
    fn test_custom_settings() {
        let scanner = LargeFileScanner::new(100, 25);
        assert_eq!(scanner.min_size_bytes, 100 * 1024 * 1024);
        assert_eq!(scanner.max_results, 25);
    }

    #[test]
    fn test_scan_empty_directory() {
        let temp_dir = TempDir::new().unwrap();
        let scanner = LargeFileScanner::new(1, 50);

        let result = scanner
            .scan(&[temp_dir.path().display().to_string()])
            .unwrap();

        assert_eq!(result.files.len(), 0);
        assert_eq!(result.total_size_bytes, 0);
        assert_eq!(result.files_scanned, 0);
    }

    #[test]
    fn test_filters_by_threshold() {
        let temp_dir = TempDir::new().unwrap();

        // Create files smaller and larger than threshold
        create_test_file(temp_dir.path(), "small.jpg", 1024).unwrap(); // 1KB
        create_test_file(temp_dir.path(), "large.jpg", 20 * 1024 * 1024).unwrap(); // 20MB

        let scanner = LargeFileScanner::new(10, 50); // 10MB threshold
        let result = scanner
            .scan(&[temp_dir.path().display().to_string()])
            .unwrap();

        // Should only find the large file
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].filename, "large.jpg");
        assert_eq!(result.files[0].size_bytes, 20 * 1024 * 1024);
    }

    #[test]
    fn test_respects_max_results() {
        let temp_dir = TempDir::new().unwrap();

        // Create 15 files, each 20MB
        for i in 0..15 {
            create_test_file(
                temp_dir.path(),
                &format!("file{:02}.jpg", i),
                20 * 1024 * 1024,
            )
            .unwrap();
        }

        let scanner = LargeFileScanner::new(10, 5); // Max 5 results
        let result = scanner
            .scan(&[temp_dir.path().display().to_string()])
            .unwrap();

        // Should only return top 5 largest (all same size, so just 5)
        assert_eq!(result.files.len(), 5);
    }

    #[test]
    fn test_is_media_file() {
        // Media files should return true
        assert!(is_media_file(Path::new("photo.jpg")));
        assert!(is_media_file(Path::new("photo.jpeg")));
        assert!(is_media_file(Path::new("photo.png")));
        assert!(is_media_file(Path::new("photo.mp4")));
        assert!(is_media_file(Path::new("photo.mov")));
        assert!(is_media_file(Path::new("photo.raw")));
        assert!(is_media_file(Path::new("photo.heic")));

        // Non-media files should return false
        assert!(!is_media_file(Path::new("document.txt")));
        assert!(!is_media_file(Path::new("archive.zip")));
        assert!(!is_media_file(Path::new("script.rs")));
        assert!(!is_media_file(Path::new("noextension")));
    }

    #[test]
    fn test_get_file_type() {
        assert_eq!(get_file_type(Path::new("photo.JPG")), "jpg");
        assert_eq!(get_file_type(Path::new("video.MP4")), "mp4");
        assert_eq!(get_file_type(Path::new("image.HEIC")), "heic");
        assert_eq!(get_file_type(Path::new("noextension")), "unknown");
    }

    #[test]
    fn test_invalid_path() {
        let scanner = LargeFileScanner::new(1, 50);
        let result = scanner.scan(&["/nonexistent/path/that/does/not/exist".to_string()]);

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn test_sorted_by_size_descending() {
        let temp_dir = TempDir::new().unwrap();

        // Create files of varying sizes
        create_test_file(temp_dir.path(), "small.jpg", 5 * 1024 * 1024).unwrap(); // 5MB
        create_test_file(temp_dir.path(), "large.jpg", 30 * 1024 * 1024).unwrap(); // 30MB
        create_test_file(temp_dir.path(), "medium.jpg", 15 * 1024 * 1024).unwrap(); // 15MB

        let scanner = LargeFileScanner::new(1, 50); // 1MB threshold
        let result = scanner
            .scan(&[temp_dir.path().display().to_string()])
            .unwrap();

        assert_eq!(result.files.len(), 3);
        // Should be sorted by size descending (largest first)
        assert_eq!(result.files[0].size_bytes, 30 * 1024 * 1024);
        assert_eq!(result.files[1].size_bytes, 15 * 1024 * 1024);
        assert_eq!(result.files[2].size_bytes, 5 * 1024 * 1024);
    }

    #[test]
    fn test_multiple_paths() {
        let temp_dir1 = TempDir::new().unwrap();
        let temp_dir2 = TempDir::new().unwrap();

        create_test_file(temp_dir1.path(), "file1.jpg", 20 * 1024 * 1024).unwrap();
        create_test_file(temp_dir2.path(), "file2.jpg", 15 * 1024 * 1024).unwrap();

        let scanner = LargeFileScanner::new(10, 50);
        let result = scanner
            .scan(&[
                temp_dir1.path().display().to_string(),
                temp_dir2.path().display().to_string(),
            ])
            .unwrap();

        // Should find files from both directories
        assert_eq!(result.files.len(), 2);
        assert_eq!(result.total_size_bytes, 35 * 1024 * 1024);
    }
}
