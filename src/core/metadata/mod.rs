//! # Metadata Module
//!
//! Extracts EXIF metadata from photo files.
//!
//! ## Extracted Fields
//! - Date taken (DateTimeOriginal)
//! - Image dimensions (width x height)
//! - Camera model
//! - Orientation
//!
//! ## Supported Formats
//! EXIF metadata is typically found in JPEG and TIFF files.
//! HEIC files may use different metadata formats.

use chrono::{DateTime, NaiveDateTime, Utc};
use exif::{In, Reader, Tag, Value};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

/// Extracted photo metadata
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PhotoMetadata {
    /// Original capture date/time
    pub date_taken: Option<DateTime<Utc>>,
    /// Image width in pixels
    pub width: Option<u32>,
    /// Image height in pixels
    pub height: Option<u32>,
    /// Camera make (e.g., "Apple", "Canon")
    pub camera_make: Option<String>,
    /// Camera model (e.g., "iPhone 15 Pro")
    pub camera_model: Option<String>,
    /// Image orientation (1-8, where 1 is normal)
    pub orientation: Option<u16>,
}

impl PhotoMetadata {
    /// Check if any metadata was extracted
    pub fn has_data(&self) -> bool {
        self.date_taken.is_some()
            || self.width.is_some()
            || self.height.is_some()
            || self.camera_make.is_some()
            || self.camera_model.is_some()
    }

    /// Get a display string for the camera
    pub fn camera_display(&self) -> Option<String> {
        match (&self.camera_make, &self.camera_model) {
            (Some(make), Some(model)) => {
                // Avoid duplication like "Apple Apple iPhone"
                if model.starts_with(make) {
                    Some(model.clone())
                } else {
                    Some(format!("{} {}", make, model))
                }
            }
            (None, Some(model)) => Some(model.clone()),
            (Some(make), None) => Some(make.clone()),
            (None, None) => None,
        }
    }

    /// Get dimensions as a formatted string
    pub fn dimensions_display(&self) -> Option<String> {
        match (self.width, self.height) {
            (Some(w), Some(h)) => Some(format!("{}x{}", w, h)),
            _ => None,
        }
    }

    /// Calculate megapixels
    pub fn megapixels(&self) -> Option<f64> {
        match (self.width, self.height) {
            (Some(w), Some(h)) => Some((w as f64 * h as f64) / 1_000_000.0),
            _ => None,
        }
    }
}

/// Extract EXIF metadata from a photo file
pub fn extract_metadata(path: &Path) -> PhotoMetadata {
    let mut metadata = PhotoMetadata::default();

    // Try to open and read the file
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return metadata,
    };

    let mut bufreader = BufReader::new(&file);
    let exif_reader = match Reader::new().read_from_container(&mut bufreader) {
        Ok(r) => r,
        Err(_) => return metadata,
    };

    // Extract date taken
    if let Some(field) = exif_reader.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        if let Value::Ascii(ref vec) = field.value {
            if let Some(bytes) = vec.first() {
                if let Ok(s) = std::str::from_utf8(bytes) {
                    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
                    if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S") {
                        metadata.date_taken = Some(DateTime::from_naive_utc_and_offset(naive, Utc));
                    }
                }
            }
        }
    }

    // Extract dimensions - prefer actual pixel dimensions
    if let Some(field) = exif_reader.get_field(Tag::PixelXDimension, In::PRIMARY) {
        metadata.width = get_u32_value(&field.value);
    }
    if let Some(field) = exif_reader.get_field(Tag::PixelYDimension, In::PRIMARY) {
        metadata.height = get_u32_value(&field.value);
    }

    // Fallback to image width/height tags
    if metadata.width.is_none() {
        if let Some(field) = exif_reader.get_field(Tag::ImageWidth, In::PRIMARY) {
            metadata.width = get_u32_value(&field.value);
        }
    }
    if metadata.height.is_none() {
        if let Some(field) = exif_reader.get_field(Tag::ImageLength, In::PRIMARY) {
            metadata.height = get_u32_value(&field.value);
        }
    }

    // Extract camera make
    if let Some(field) = exif_reader.get_field(Tag::Make, In::PRIMARY) {
        metadata.camera_make = get_string_value(&field.value);
    }

    // Extract camera model
    if let Some(field) = exif_reader.get_field(Tag::Model, In::PRIMARY) {
        metadata.camera_model = get_string_value(&field.value);
    }

    // Extract orientation
    if let Some(field) = exif_reader.get_field(Tag::Orientation, In::PRIMARY) {
        if let Value::Short(ref vec) = field.value {
            metadata.orientation = vec.first().copied();
        }
    }

    metadata
}

/// Helper to extract u32 from various EXIF value types
fn get_u32_value(value: &Value) -> Option<u32> {
    match value {
        Value::Long(vec) => vec.first().copied(),
        Value::Short(vec) => vec.first().map(|v| *v as u32),
        _ => None,
    }
}

/// Helper to extract string from EXIF ASCII value
fn get_string_value(value: &Value) -> Option<String> {
    if let Value::Ascii(ref vec) = value {
        if let Some(bytes) = vec.first() {
            if let Ok(s) = std::str::from_utf8(bytes) {
                let trimmed = s.trim_end_matches('\0').trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_default_has_no_data() {
        let meta = PhotoMetadata::default();
        assert!(!meta.has_data());
    }

    #[test]
    fn metadata_with_date_has_data() {
        let mut meta = PhotoMetadata::default();
        meta.date_taken = Some(Utc::now());
        assert!(meta.has_data());
    }

    #[test]
    fn camera_display_combines_make_model() {
        let mut meta = PhotoMetadata::default();
        meta.camera_make = Some("Canon".to_string());
        meta.camera_model = Some("EOS R5".to_string());
        assert_eq!(meta.camera_display(), Some("Canon EOS R5".to_string()));
    }

    #[test]
    fn camera_display_avoids_duplication() {
        let mut meta = PhotoMetadata::default();
        meta.camera_make = Some("Apple".to_string());
        meta.camera_model = Some("Apple iPhone 15 Pro".to_string());
        assert_eq!(
            meta.camera_display(),
            Some("Apple iPhone 15 Pro".to_string())
        );
    }

    #[test]
    fn dimensions_display_format() {
        let mut meta = PhotoMetadata::default();
        meta.width = Some(4032);
        meta.height = Some(3024);
        assert_eq!(meta.dimensions_display(), Some("4032x3024".to_string()));
    }

    #[test]
    fn megapixels_calculation() {
        let mut meta = PhotoMetadata::default();
        meta.width = Some(4000);
        meta.height = Some(3000);
        let mp = meta.megapixels().unwrap();
        assert!((mp - 12.0).abs() < 0.001);
    }

    #[test]
    fn extract_from_nonexistent_returns_default() {
        let meta = extract_metadata(Path::new("/nonexistent/file.jpg"));
        assert!(!meta.has_data());
    }
}
