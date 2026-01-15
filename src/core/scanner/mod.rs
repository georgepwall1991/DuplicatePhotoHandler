//! # Scanner Module
//!
//! Discovers photo files in directories.
//!
//! ## Supported Formats
//! - JPEG (.jpg, .jpeg)
//! - PNG (.png)
//! - WebP (.webp)
//! - HEIC (.heic, .heif) - iPhone photos
//! - GIF (.gif)
//! - BMP (.bmp)
//! - TIFF (.tiff, .tif)
//!
//! ## Example
//! ```rust,ignore
//! use duplicate_photo_cleaner::core::scanner::{WalkDirScanner, PhotoScanner};
//!
//! let scanner = WalkDirScanner::new(ScanConfig::default());
//! let photos = scanner.scan(&["/Users/photos".into()])?;
//! ```

mod filter;
mod walker;

pub use filter::ImageFilter;
pub use walker::{ScanConfig, WalkDirScanner};

use crate::error::ScanError;
use crate::events::EventSender;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::SystemTime;

/// Represents a discovered photo file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoFile {
    /// Path to the photo file
    pub path: PathBuf,
    /// File size in bytes
    pub size: u64,
    /// Last modified time
    pub modified: SystemTime,
    /// Detected image format
    pub format: ImageFormat,
}

/// Supported image formats
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageFormat {
    Jpeg,
    Png,
    WebP,
    Heic,
    Gif,
    Bmp,
    Tiff,
    Unknown,
}

impl ImageFormat {
    /// Detect format from file extension
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "jpg" | "jpeg" => ImageFormat::Jpeg,
            "png" => ImageFormat::Png,
            "webp" => ImageFormat::WebP,
            "heic" | "heif" => ImageFormat::Heic,
            "gif" => ImageFormat::Gif,
            "bmp" => ImageFormat::Bmp,
            "tiff" | "tif" => ImageFormat::Tiff,
            _ => ImageFormat::Unknown,
        }
    }

    /// Check if this format is supported
    pub fn is_supported(&self) -> bool {
        !matches!(self, ImageFormat::Unknown)
    }
}

/// Result of a scan operation
#[derive(Debug)]
pub struct ScanResult {
    /// Successfully discovered photos
    pub photos: Vec<PhotoFile>,
    /// Errors that occurred during scanning (non-fatal)
    pub errors: Vec<ScanError>,
}

/// Trait for photo scanners
///
/// Implement this trait to create custom scanners (e.g., for testing).
pub trait PhotoScanner: Send + Sync {
    /// Scan directories and return discovered photos
    fn scan(&self, paths: &[PathBuf]) -> Result<ScanResult, ScanError>;

    /// Scan with progress reporting via events
    fn scan_with_events(
        &self,
        paths: &[PathBuf],
        events: &EventSender,
    ) -> Result<ScanResult, ScanError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_format_from_extension_lowercase() {
        assert_eq!(ImageFormat::from_extension("jpg"), ImageFormat::Jpeg);
        assert_eq!(ImageFormat::from_extension("jpeg"), ImageFormat::Jpeg);
        assert_eq!(ImageFormat::from_extension("png"), ImageFormat::Png);
        assert_eq!(ImageFormat::from_extension("heic"), ImageFormat::Heic);
    }

    #[test]
    fn image_format_from_extension_uppercase() {
        assert_eq!(ImageFormat::from_extension("JPG"), ImageFormat::Jpeg);
        assert_eq!(ImageFormat::from_extension("PNG"), ImageFormat::Png);
        assert_eq!(ImageFormat::from_extension("HEIC"), ImageFormat::Heic);
    }

    #[test]
    fn unknown_extension_returns_unknown() {
        assert_eq!(ImageFormat::from_extension("txt"), ImageFormat::Unknown);
        assert_eq!(ImageFormat::from_extension("pdf"), ImageFormat::Unknown);
    }

    #[test]
    fn unknown_format_is_not_supported() {
        assert!(!ImageFormat::Unknown.is_supported());
        assert!(ImageFormat::Jpeg.is_supported());
    }
}
