//! Screenshot detection using multiple methods.
//!
//! Combines filename patterns, EXIF metadata, and dimension heuristics to detect screenshots.

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::core::metadata::PhotoMetadata;

/// Confidence level for screenshot detection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ScreenshotConfidence {
    /// Very confident this is a screenshot (detected via software tag)
    High,
    /// Moderately confident (detected via filename pattern)
    Medium,
    /// Low confidence (detected via dimension heuristics)
    Low,
}

/// Detection information for a screenshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotDetection {
    pub confidence: ScreenshotConfidence,
    pub reason: String,
}

/// Complete screenshot information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotInfo {
    pub path: String,
    pub size_bytes: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub date_taken: Option<String>,
    pub confidence: ScreenshotConfidence,
    pub detection_reason: String,
    pub source_app: Option<String>,
}

/// Common screenshot filename patterns
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

/// Known screenshot software signatures in EXIF
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

/// Known screen dimensions (width x height)
const KNOWN_SCREEN_DIMENSIONS: &[(u32, u32)] = &[
    // iPhone dimensions
    (1170, 2532), // iPhone 12, 13, 14, 15
    (1125, 2436), // iPhone X, XS, 11 Pro
    (1080, 2340), // iPhone 11
    (750, 1334),  // iPhone 8, SE
    (1242, 2688), // iPhone XS Max, 11 Pro Max
    (1284, 2778), // iPhone 14 Pro Max
    // iPad dimensions
    (2048, 1536), // iPad (5th gen and later)
    (1024, 768),  // iPad 2, 3, 4
    (2224, 1668), // iPad Pro 10.5"
    (2732, 2048), // iPad Pro 12.9"
    // Mac dimensions (common resolutions)
    (1440, 900),  // MacBook Air 13"
    (1680, 1050), // MacBook Pro 15"
    (2560, 1600), // MacBook Pro 16"
    (3440, 1440), // Ultra-wide monitor
    (2560, 1440), // QHD monitor
    (1920, 1080), // Full HD (common)
];

/// Detect screenshot from filename patterns
fn detect_from_filename(filename: &str) -> Option<ScreenshotDetection> {
    let lower_filename = filename.to_lowercase();
    for pattern in SCREENSHOT_PATTERNS {
        if lower_filename.contains(pattern) {
            return Some(ScreenshotDetection {
                confidence: ScreenshotConfidence::Medium,
                reason: format!("Filename contains '{}' pattern", pattern),
            });
        }
    }
    None
}

/// Detect screenshot from EXIF software tag
fn detect_from_metadata(metadata: &PhotoMetadata) -> Option<ScreenshotDetection> {
    if let Some(ref software) = metadata.software {
        let lower_software = software.to_lowercase();
        for known_software in SCREENSHOT_SOFTWARE {
            if lower_software.contains(known_software) {
                return Some(ScreenshotDetection {
                    confidence: ScreenshotConfidence::High,
                    reason: format!("EXIF software tag indicates screenshot tool: {}", software),
                });
            }
        }
    }
    None
}

/// Detect screenshot from known screen dimensions
fn detect_from_dimensions(width: u32, height: u32) -> Option<ScreenshotDetection> {
    for &(known_width, known_height) in KNOWN_SCREEN_DIMENSIONS {
        if (width == known_width && height == known_height)
            || (width == known_height && height == known_width)
        {
            return Some(ScreenshotDetection {
                confidence: ScreenshotConfidence::Low,
                reason: format!(
                    "Image dimensions {}x{} match known screen resolution",
                    width, height
                ),
            });
        }
    }
    None
}

/// Quick pre-filter to check if a file might be a screenshot.
///
/// This is a fast check that avoids expensive metadata extraction.
/// Returns true if:
/// - Filename matches any screenshot pattern, OR
/// - File is a PNG (screenshots are commonly PNGs)
///
/// Used for performance optimization in large photo libraries.
pub fn might_be_screenshot(path: &Path) -> bool {
    // Check filename patterns first (fast)
    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
        let lower_filename = filename.to_lowercase();
        for pattern in SCREENSHOT_PATTERNS {
            if lower_filename.contains(pattern) {
                return true;
            }
        }
    }

    // PNG files might be screenshots (many screenshots are PNG)
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if ext.eq_ignore_ascii_case("png") {
            return true;
        }
    }

    false
}

/// Determine if a file is a screenshot
///
/// Uses a three-level approach:
/// 1. Check EXIF software tag (High confidence)
/// 2. Check filename patterns (Medium confidence)
/// 3. Check known screen dimensions (Low confidence)
///
/// Returns the highest confidence detection, if any.
pub fn is_screenshot(
    path: &Path,
    metadata: &PhotoMetadata,
    size_bytes: u64,
) -> Option<ScreenshotInfo> {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // Try detection in order of confidence
    let detection = if let Some(det) = detect_from_metadata(metadata) {
        det
    } else if let Some(det) = detect_from_filename(filename) {
        det
    } else if let (Some(width), Some(height)) = (metadata.width, metadata.height) {
        detect_from_dimensions(width, height)?
    } else {
        return None;
    };

    let date_taken = metadata
        .date_taken
        .map(|dt| dt.to_rfc3339());

    Some(ScreenshotInfo {
        path: path.to_string_lossy().to_string(),
        size_bytes,
        width: metadata.width,
        height: metadata.height,
        date_taken,
        confidence: detection.confidence,
        detection_reason: detection.reason,
        source_app: metadata.software.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_screenshot_from_filename() {
        let filename = "Screenshot 2024-01-15.png";
        let detection = detect_from_filename(filename);
        assert!(detection.is_some());
        let det = detection.unwrap();
        assert_eq!(det.confidence, ScreenshotConfidence::Medium);
        assert!(det.reason.contains("screenshot"));
    }

    #[test]
    fn detects_screenshot_from_software() {
        let mut metadata = PhotoMetadata::default();
        metadata.software = Some("screencaptureui".to_string());
        let detection = detect_from_metadata(&metadata);
        assert!(detection.is_some());
        let det = detection.unwrap();
        assert_eq!(det.confidence, ScreenshotConfidence::High);
        assert!(det.reason.contains("screencaptureui"));
    }

    #[test]
    fn detects_high_confidence_with_filename_and_metadata() {
        let mut metadata = PhotoMetadata::default();
        metadata.software = Some("screencaptureui".to_string());

        let path = Path::new("Screenshot 2024-01-15.png");
        let result = is_screenshot(path, &metadata, 1024);

        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.confidence, ScreenshotConfidence::High);
        assert!(info.detection_reason.contains("software tag"));
    }

    #[test]
    fn detects_from_iphone_dimensions() {
        let mut metadata = PhotoMetadata::default();
        metadata.width = Some(1170);
        metadata.height = Some(2532);

        let detection = detect_from_dimensions(1170, 2532);
        assert!(detection.is_some());
        let det = detection.unwrap();
        assert_eq!(det.confidence, ScreenshotConfidence::Low);
        assert!(det.reason.contains("1170x2532"));
    }

    #[test]
    fn no_detection_for_regular_photo() {
        let mut metadata = PhotoMetadata::default();
        metadata.camera_make = Some("Canon".to_string());
        metadata.camera_model = Some("EOS R5".to_string());
        metadata.width = Some(6000);
        metadata.height = Some(4000);

        let path = Path::new("photo_20240115_001.jpg");
        let result = is_screenshot(path, &metadata, 2048000);

        assert!(result.is_none());
    }

    #[test]
    fn cleanshot_detected() {
        let filename = "CleanShot 2024-01-15.png";
        let detection = detect_from_filename(filename);
        assert!(detection.is_some());
        let det = detection.unwrap();
        assert_eq!(det.confidence, ScreenshotConfidence::Medium);
    }
}
