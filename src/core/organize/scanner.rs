//! Scanner for extracting dates from media files.

use chrono::NaiveDate;
use rayon::prelude::*;
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
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

        // Try DateTime as fallback
        if let Some(field) = exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY) {
            if let Some(date) = Self::parse_exif_datetime(&field.display_value().to_string()) {
                return Some(date);
            }
        }

        None
    }

    fn parse_exif_datetime(s: &str) -> Option<NaiveDate> {
        // EXIF format: "2024-01-15 14:30:00" or "2024:01:15 14:30:00"
        let s = s.trim_matches('"').replace(':', "-");
        let date_part = s.split_whitespace().next()?;

        // Try standard format
        if let Ok(date) = NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
            return Some(date);
        }

        // Handle edge cases
        let parts: Vec<&str> = date_part.split('-').collect();
        if parts.len() >= 3 {
            let year: i32 = parts[0].parse().ok()?;
            let month: u32 = parts[1].parse().ok()?;
            let day: u32 = parts[2].parse().ok()?;
            return NaiveDate::from_ymd_opt(year, month, day);
        }

        None
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
            "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "raw",
            "cr2", "nef", "dng", "arw", "raf", "mp4", "mov", "avi", "mkv", "wmv", "webm", "m4v",
        ];

        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| MEDIA_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    /// Scan directories and return all media files with dates
    /// Uses parallel processing with Rayon for EXIF extraction
    pub fn scan_with_progress<F>(
        paths: &[String],
        mut on_progress: F,
    ) -> Result<Vec<(String, Option<NaiveDate>, u64)>, String>
    where
        F: FnMut(usize, &str),
    {
        // Phase 1: Collect all media file paths (fast sequential operation)
        let mut media_paths: Vec<PathBuf> = Vec::new();
        for path_str in paths {
            let path = Path::new(path_str);
            if !path.exists() {
                return Err(format!("Path does not exist: {}", path_str));
            }

            for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                let entry_path = entry.path();
                if entry_path.is_file() && Self::is_media_file(entry_path) {
                    media_paths.push(entry_path.to_path_buf());
                }
            }
        }

        let total_files = media_paths.len();
        on_progress(0, &format!("Found {} media files, extracting dates...", total_files));

        if media_paths.is_empty() {
            return Ok(Vec::new());
        }

        // Phase 2: Extract dates in parallel using Rayon
        let processed = Arc::new(AtomicUsize::new(0));
        let last_progress_time = Arc::new(std::sync::Mutex::new(Instant::now()));

        let results: Vec<(String, Option<NaiveDate>, u64)> = media_paths
            .par_iter()
            .map(|path| {
                let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
                let date = Self::extract_date(path);
                let path_str = path.display().to_string();

                // Update progress counter
                let current = processed.fetch_add(1, Ordering::Relaxed) + 1;

                // Throttle progress updates to reduce lock contention
                if current % 100 == 0 {
                    if let Ok(mut last_time) = last_progress_time.try_lock() {
                        let now = Instant::now();
                        if now.duration_since(*last_time) >= Duration::from_millis(100) {
                            *last_time = now;
                        }
                    }
                }

                (path_str, date, size)
            })
            .collect();

        on_progress(total_files, "");
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_media_file() {
        assert!(OrganizeScanner::is_media_file(Path::new("photo.jpg")));
        assert!(OrganizeScanner::is_media_file(Path::new("photo.JPG")));
        assert!(OrganizeScanner::is_media_file(Path::new("video.mp4")));
        assert!(OrganizeScanner::is_media_file(Path::new("image.HEIC")));
        assert!(!OrganizeScanner::is_media_file(Path::new("doc.pdf")));
        assert!(!OrganizeScanner::is_media_file(Path::new("text.txt")));
    }

    #[test]
    fn test_parse_exif_datetime() {
        let date = OrganizeScanner::parse_exif_datetime("2024-01-15 14:30:00");
        assert_eq!(date, Some(NaiveDate::from_ymd_opt(2024, 1, 15).unwrap()));

        let date2 = OrganizeScanner::parse_exif_datetime("\"2024-01-15 14:30:00\"");
        assert_eq!(date2, Some(NaiveDate::from_ymd_opt(2024, 1, 15).unwrap()));
    }

    #[test]
    fn test_scan_empty_paths() {
        let result = OrganizeScanner::scan_with_progress(&[], |_, _| {});
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_scan_invalid_path() {
        let result =
            OrganizeScanner::scan_with_progress(&["/nonexistent/path".to_string()], |_, _| {});
        assert!(result.is_err());
    }
}
