//! Scanner for finding unorganized media files.

use super::types::*;
use rayon::prelude::*;
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use walkdir::WalkDir;

/// Scanner for finding unorganized files
pub struct UnorganizedScanner;

impl UnorganizedScanner {
    /// Scan for unorganized files with progress callback
    pub fn scan<F>(config: &UnorganizedConfig, mut on_progress: F) -> Result<UnorganizedResult, String>
    where
        F: FnMut(usize, &str),
    {
        let start = Instant::now();

        // Phase 1: Collect all media files
        let mut all_files: Vec<(String, String, usize)> = Vec::new(); // (path, root, depth)

        for source_path in &config.source_paths {
            let source = Path::new(source_path);
            if !source.exists() {
                return Err(format!("Path does not exist: {}", source_path));
            }

            for entry in WalkDir::new(source).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if path.is_file() && Self::is_media_file(path) {
                    let depth = Self::calculate_depth(path, source);
                    all_files.push((
                        path.display().to_string(),
                        source_path.clone(),
                        depth,
                    ));
                }
            }
        }

        let total_files = all_files.len();
        on_progress(0, &format!("Found {} media files, analyzing...", total_files));

        if all_files.is_empty() {
            return Ok(UnorganizedResult {
                files: Vec::new(),
                total_files: 0,
                total_size_bytes: 0,
                by_reason: Vec::new(),
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }

        // Phase 2: Analyze files in parallel
        let processed = Arc::new(AtomicUsize::new(0));
        let date_pattern = Regex::new(r"(?:19|20)\d{2}[-_/]?\d{0,2}[-_/]?\d{0,2}").unwrap();
        let generic_pattern =
            Regex::new(r"(?i)^(IMG|DSC|DCIM|P|DSCN|DSCF|SAM|MOV|VID|MVI|Screenshot|Screen Shot|Untitled|Photo|Image|Picture)[-_]?\d*").unwrap();

        let unorganized_files: Vec<UnorganizedFile> = all_files
            .par_iter()
            .filter_map(|(path, root, depth)| {
                let path_obj = Path::new(path);
                let mut reasons = Vec::new();

                // Check depth
                if config.check_root && *depth == 0 {
                    reasons.push(UnorganizedReason::InRoot);
                } else if *depth < config.min_depth {
                    reasons.push(UnorganizedReason::ShallowFolder);
                }

                // Check date pattern in path
                if config.check_date_pattern {
                    let relative_path = path.strip_prefix(root).unwrap_or(path);
                    if !date_pattern.is_match(relative_path) {
                        reasons.push(UnorganizedReason::NoDatePattern);
                    }
                }

                // Check generic filename
                if config.check_generic_names {
                    if let Some(filename) = path_obj.file_stem().and_then(|s| s.to_str()) {
                        if generic_pattern.is_match(filename) {
                            reasons.push(UnorganizedReason::GenericName);
                        }
                    }
                }

                // Update progress
                let current = processed.fetch_add(1, Ordering::Relaxed) + 1;
                if current % 100 == 0 {
                    // Progress callback can't be called from parallel context easily
                    // We'll report final progress after
                }

                if reasons.is_empty() {
                    return None;
                }

                let size = fs::metadata(path_obj).map(|m| m.len()).unwrap_or(0);
                let filename = path_obj
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let file_type = path_obj
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let parent_folder = path_obj
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                Some(UnorganizedFile {
                    path: path.clone(),
                    filename,
                    size_bytes: size,
                    file_type,
                    reasons,
                    folder_depth: *depth,
                    parent_folder,
                })
            })
            .collect();

        on_progress(total_files, "Analysis complete");

        // Calculate summaries
        let total_size: u64 = unorganized_files.iter().map(|f| f.size_bytes).sum();

        let mut reason_counts: HashMap<UnorganizedReason, (usize, u64)> = HashMap::new();
        for file in &unorganized_files {
            for reason in &file.reasons {
                let entry = reason_counts.entry(reason.clone()).or_insert((0, 0));
                entry.0 += 1;
                entry.1 += file.size_bytes;
            }
        }

        let by_reason: Vec<ReasonSummary> = reason_counts
            .into_iter()
            .map(|(reason, (count, size))| ReasonSummary {
                reason,
                count,
                size_bytes: size,
            })
            .collect();

        Ok(UnorganizedResult {
            total_files: unorganized_files.len(),
            total_size_bytes: total_size,
            files: unorganized_files,
            by_reason,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    fn is_media_file(path: &Path) -> bool {
        const MEDIA_EXTENSIONS: &[&str] = &[
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "raw",
            "cr2", "nef", "dng", "arw", "raf", "mp4", "mov", "avi", "mkv", "wmv", "webm", "m4v",
        ];

        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| MEDIA_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    fn calculate_depth(file_path: &Path, root: &Path) -> usize {
        let relative = file_path
            .parent()
            .and_then(|p| p.strip_prefix(root).ok())
            .unwrap_or(Path::new(""));

        relative.components().count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_is_media_file() {
        assert!(UnorganizedScanner::is_media_file(Path::new("photo.jpg")));
        assert!(UnorganizedScanner::is_media_file(Path::new("video.MP4")));
        assert!(!UnorganizedScanner::is_media_file(Path::new("doc.pdf")));
    }

    #[test]
    fn test_calculate_depth() {
        let root = Path::new("/photos");
        assert_eq!(
            UnorganizedScanner::calculate_depth(Path::new("/photos/image.jpg"), root),
            0
        );
        assert_eq!(
            UnorganizedScanner::calculate_depth(Path::new("/photos/2024/image.jpg"), root),
            1
        );
        assert_eq!(
            UnorganizedScanner::calculate_depth(Path::new("/photos/2024/01/image.jpg"), root),
            2
        );
    }

    #[test]
    fn test_scan_empty() {
        let temp = TempDir::new().unwrap();
        let config = UnorganizedConfig {
            source_paths: vec![temp.path().display().to_string()],
            ..Default::default()
        };

        let result = UnorganizedScanner::scan(&config, |_, _| {}).unwrap();
        assert_eq!(result.total_files, 0);
    }

    #[test]
    fn test_scan_finds_root_files() {
        let temp = TempDir::new().unwrap();

        // Create a file in root
        let root_file = temp.path().join("IMG_001.jpg");
        fs::File::create(&root_file)
            .unwrap()
            .write_all(b"test")
            .unwrap();

        let config = UnorganizedConfig {
            source_paths: vec![temp.path().display().to_string()],
            ..Default::default()
        };

        let result = UnorganizedScanner::scan(&config, |_, _| {}).unwrap();
        assert_eq!(result.total_files, 1);
        assert!(result.files[0]
            .reasons
            .contains(&UnorganizedReason::InRoot));
        assert!(result.files[0]
            .reasons
            .contains(&UnorganizedReason::GenericName));
    }

    #[test]
    fn test_scan_organized_files_not_flagged() {
        let temp = TempDir::new().unwrap();

        // Create organized structure: 2024/01/vacation_photo.jpg
        let organized_dir = temp.path().join("2024").join("01");
        fs::create_dir_all(&organized_dir).unwrap();
        let organized_file = organized_dir.join("vacation_photo.jpg");
        fs::File::create(&organized_file)
            .unwrap()
            .write_all(b"test")
            .unwrap();

        let config = UnorganizedConfig {
            source_paths: vec![temp.path().display().to_string()],
            ..Default::default()
        };

        let result = UnorganizedScanner::scan(&config, |_, _| {}).unwrap();
        // File is at depth 2 with date pattern and non-generic name - should not be flagged
        assert_eq!(result.total_files, 0);
    }
}
