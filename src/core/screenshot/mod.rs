//! Screenshot detection module.
//!
//! Detects screenshots using filename patterns, EXIF metadata, and dimension heuristics.

mod detector;

pub use detector::{
    is_screenshot, might_be_screenshot, ScreenshotConfidence, ScreenshotDetection, ScreenshotInfo,
};
