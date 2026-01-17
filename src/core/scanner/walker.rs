//! Directory walking implementation using walkdir.

use super::{filter::ImageFilter, PhotoFile, PhotoScanner, ScanResult};
use crate::error::ScanError;
use crate::events::{Event, EventSender, ScanEvent, ScanProgress};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

/// Holds mutable state during directory scanning
struct ScanContext<'a> {
    photos: Vec<PhotoFile>,
    errors: Vec<ScanError>,
    directories_scanned: usize,
    events: Option<&'a EventSender>,
}

impl<'a> ScanContext<'a> {
    fn new(events: Option<&'a EventSender>) -> Self {
        Self {
            photos: Vec::new(),
            errors: Vec::new(),
            directories_scanned: 0,
            events,
        }
    }

    fn emit_progress(&self, current_path: &Path) {
        if let Some(sender) = self.events {
            sender.send(Event::Scan(ScanEvent::Progress(ScanProgress {
                directories_scanned: self.directories_scanned,
                photos_found: self.photos.len(),
                current_path: current_path.to_path_buf(),
            })));
        }
    }

    fn emit_photo_found(&self, path: &Path) {
        if let Some(sender) = self.events {
            sender.send(Event::Scan(ScanEvent::PhotoFound {
                path: path.to_path_buf(),
            }));
        }
    }

    fn emit_error(&self, path: &Path, message: &str) {
        if let Some(sender) = self.events {
            sender.send(Event::Scan(ScanEvent::Error {
                path: path.to_path_buf(),
                message: message.to_string(),
            }));
        }
    }

    fn add_photo(&mut self, photo: PhotoFile) {
        self.emit_photo_found(&photo.path);
        self.photos.push(photo);
    }

    fn add_error(&mut self, error: ScanError, path: &Path) {
        self.emit_error(path, &error.to_string());
        self.errors.push(error);
    }
}

/// Configuration for the directory scanner
#[derive(Debug, Clone, Default)]
pub struct ScanConfig {
    /// Whether to follow symbolic links
    pub follow_symlinks: bool,
    /// Whether to include hidden files and directories
    pub include_hidden: bool,
    /// Maximum directory depth (None = unlimited)
    pub max_depth: Option<usize>,
    /// Custom extensions to include (None = use defaults)
    pub extensions: Option<Vec<String>>,
    /// Enable incremental mode (track scan state for faster subsequent scans)
    pub incremental: bool,
}

/// Scanner implementation using the walkdir crate
pub struct WalkDirScanner {
    config: ScanConfig,
    filter: ImageFilter,
}

impl WalkDirScanner {
    /// Create a new scanner with the given configuration
    pub fn new(config: ScanConfig) -> Self {
        let mut filter = ImageFilter::new().with_hidden(config.include_hidden);

        if let Some(ref extensions) = config.extensions {
            filter = filter.with_extensions(extensions.clone());
        }

        Self { config, filter }
    }

    /// Check if a directory should be skipped (hidden directory check)
    fn should_skip_directory(&self, path: &Path, root: &Path) -> bool {
        if self.config.include_hidden {
            return false;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            return false;
        };
        name.starts_with('.') && path != root
    }

    /// Process a directory entry
    fn process_directory(&self, entry: &DirEntry, root: &Path, ctx: &mut ScanContext) {
        let path = entry.path();
        ctx.directories_scanned += 1;

        if !self.should_skip_directory(path, root) {
            ctx.emit_progress(path);
        }
    }

    /// Process a file entry, adding it as a photo if it matches the filter
    fn process_file(&self, entry: &DirEntry, ctx: &mut ScanContext) {
        let path = entry.path();

        if !self.filter.should_include(path) {
            return;
        }

        match fs::metadata(path) {
            Ok(metadata) => {
                let photo = PhotoFile {
                    path: path.to_path_buf(),
                    size: metadata.len(),
                    modified: metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                    format: self.filter.get_format(path),
                };
                ctx.add_photo(photo);
            }
            Err(e) => {
                let error = ScanError::ReadDirectory {
                    path: path.to_path_buf(),
                    source: e,
                };
                ctx.add_error(error, path);
            }
        }
    }

    /// Handle a walkdir error
    fn handle_walk_error(&self, error: walkdir::Error, ctx: &mut ScanContext) {
        let path = error.path().map(|p| p.to_path_buf()).unwrap_or_default();
        let scan_error = self.convert_walk_error(&error, &path);
        ctx.add_error(scan_error, &path);
    }

    /// Convert a walkdir error to a ScanError
    fn convert_walk_error(&self, error: &walkdir::Error, path: &Path) -> ScanError {
        if error.io_error().map(|e| e.kind()) == Some(std::io::ErrorKind::PermissionDenied) {
            ScanError::PermissionDenied { path: path.to_path_buf() }
        } else {
            ScanError::ReadDirectory {
                path: path.to_path_buf(),
                source: std::io::Error::other(error.to_string()),
            }
        }
    }

    /// Scan a single directory
    fn scan_directory(
        &self,
        root: &PathBuf,
        events: Option<&EventSender>,
    ) -> Result<(Vec<PhotoFile>, Vec<ScanError>), ScanError> {
        if !root.exists() || !root.is_dir() {
            return Err(ScanError::DirectoryNotFound { path: root.clone() });
        }

        let mut ctx = ScanContext::new(events);
        let mut walker = WalkDir::new(root).follow_links(self.config.follow_symlinks);

        if let Some(depth) = self.config.max_depth {
            walker = walker.max_depth(depth);
        }

        for entry_result in walker {
            match entry_result {
                Ok(entry) if entry.path().is_dir() => {
                    self.process_directory(&entry, root, &mut ctx);
                }
                Ok(entry) => {
                    self.process_file(&entry, &mut ctx);
                }
                Err(e) => {
                    self.handle_walk_error(e, &mut ctx);
                }
            }
        }

        Ok((ctx.photos, ctx.errors))
    }
}

impl PhotoScanner for WalkDirScanner {
    fn scan(&self, paths: &[PathBuf]) -> Result<ScanResult, ScanError> {
        self.scan_with_events(paths, &crate::events::null_sender())
    }

    fn scan_with_events(
        &self,
        paths: &[PathBuf],
        events: &EventSender,
    ) -> Result<ScanResult, ScanError> {
        events.send(Event::Scan(ScanEvent::Started {
            paths: paths.to_vec(),
        }));

        let mut all_photos = Vec::new();
        let mut all_errors = Vec::new();

        for path in paths {
            match self.scan_directory(path, Some(events)) {
                Ok((photos, errors)) => {
                    all_photos.extend(photos);
                    all_errors.extend(errors);
                }
                Err(e) => {
                    all_errors.push(e);
                }
            }
        }

        events.send(Event::Scan(ScanEvent::Completed {
            total_photos: all_photos.len(),
        }));

        Ok(ScanResult {
            photos: all_photos,
            errors: all_errors,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::ImageFormat;
    use tempfile::TempDir;
    use std::fs::File;
    use std::io::Write;

    fn create_test_photo(dir: &TempDir, name: &str) -> PathBuf {
        let path = dir.path().join(name);
        let mut file = File::create(&path).unwrap();
        // Write minimal JPEG header
        file.write_all(&[0xFF, 0xD8, 0xFF, 0xE0]).unwrap();
        path
    }

    #[test]
    fn scan_empty_directory_returns_empty_vec() {
        let temp_dir = TempDir::new().unwrap();
        let scanner = WalkDirScanner::new(ScanConfig::default());

        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert!(result.photos.is_empty());
        assert!(result.errors.is_empty());
    }

    #[test]
    fn scan_finds_single_photo() {
        let temp_dir = TempDir::new().unwrap();
        create_test_photo(&temp_dir, "photo.jpg");

        let scanner = WalkDirScanner::new(ScanConfig::default());
        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert_eq!(result.photos.len(), 1);
        assert!(result.photos[0].path.ends_with("photo.jpg"));
    }

    #[test]
    fn scan_detects_multiple_formats() {
        let temp_dir = TempDir::new().unwrap();
        create_test_photo(&temp_dir, "photo.jpg");
        create_test_photo(&temp_dir, "photo.png");
        create_test_photo(&temp_dir, "photo.heic");
        create_test_photo(&temp_dir, "photo.webp");

        let scanner = WalkDirScanner::new(ScanConfig::default());
        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert_eq!(result.photos.len(), 4);

        let formats: Vec<_> = result.photos.iter().map(|p| p.format).collect();
        assert!(formats.contains(&ImageFormat::Jpeg));
        assert!(formats.contains(&ImageFormat::Png));
        assert!(formats.contains(&ImageFormat::Heic));
        assert!(formats.contains(&ImageFormat::WebP));
    }

    #[test]
    fn scan_excludes_non_image_files() {
        let temp_dir = TempDir::new().unwrap();
        create_test_photo(&temp_dir, "photo.jpg");

        let txt_path = temp_dir.path().join("document.txt");
        File::create(&txt_path).unwrap();

        let pdf_path = temp_dir.path().join("document.pdf");
        File::create(&pdf_path).unwrap();

        let scanner = WalkDirScanner::new(ScanConfig::default());
        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert_eq!(result.photos.len(), 1);
        assert!(result.photos[0].path.ends_with("photo.jpg"));
    }

    #[test]
    fn scan_traverses_nested_directories() {
        let temp_dir = TempDir::new().unwrap();

        // Create nested structure
        let subdir = temp_dir.path().join("subdir");
        fs::create_dir(&subdir).unwrap();

        create_test_photo(&temp_dir, "root.jpg");

        let nested_path = subdir.join("nested.jpg");
        let mut file = File::create(&nested_path).unwrap();
        file.write_all(&[0xFF, 0xD8, 0xFF, 0xE0]).unwrap();

        let scanner = WalkDirScanner::new(ScanConfig::default());
        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert_eq!(result.photos.len(), 2);
    }

    #[test]
    fn scan_excludes_hidden_files_by_default() {
        let temp_dir = TempDir::new().unwrap();
        create_test_photo(&temp_dir, "visible.jpg");
        create_test_photo(&temp_dir, ".hidden.jpg");

        let scanner = WalkDirScanner::new(ScanConfig::default());
        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert_eq!(result.photos.len(), 1);
        assert!(result.photos[0].path.ends_with("visible.jpg"));
    }

    #[test]
    fn scan_can_include_hidden_files() {
        let temp_dir = TempDir::new().unwrap();
        create_test_photo(&temp_dir, "visible.jpg");
        create_test_photo(&temp_dir, ".hidden.jpg");

        let config = ScanConfig {
            include_hidden: true,
            ..Default::default()
        };
        let scanner = WalkDirScanner::new(config);
        let result = scanner.scan(&[temp_dir.path().to_path_buf()]).unwrap();

        assert_eq!(result.photos.len(), 2);
    }

    #[test]
    fn scan_nonexistent_directory_returns_error() {
        let scanner = WalkDirScanner::new(ScanConfig::default());
        let result = scanner.scan(&[PathBuf::from("/nonexistent/path/12345")]);

        // Should still succeed but with an error recorded
        let result = result.unwrap();
        assert!(!result.errors.is_empty());
    }
}
