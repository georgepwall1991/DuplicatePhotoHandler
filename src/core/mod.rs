//! # Core Module
//!
//! The GUI-agnostic duplicate detection engine.
//!
//! ## Modules
//! - `scanner` - Discovers photos in directories
//! - `hasher` - Computes perceptual hashes
//! - `comparator` - Finds duplicates by comparing hashes
//! - `reporter` - Explains why photos are duplicates
//! - `cache` - Persists hashes to avoid recomputation
//! - `pipeline` - Orchestrates the full workflow
//! - `metadata` - Extracts EXIF metadata from photos
//! - `quality` - Analyzes image quality (sharpness, contrast)
//! - `watcher` - Monitors folders for file changes
//! - `screenshot` - Detects screenshots using multiple methods
//! - `large_files` - Finds large files for disk space cleanup

pub mod cache;
pub mod comparator;
pub mod hasher;
pub mod large_files;
pub mod metadata;
pub mod pipeline;
pub mod quality;
pub mod reporter;
pub mod scanner;
pub mod screenshot;
pub mod watcher;

// Re-export commonly used types
pub use comparator::{DuplicateGroup, MatchResult, MatchType};
pub use hasher::{HashAlgorithmKind, PerceptualHash};
pub use large_files::{LargeFileInfo, LargeFileScanner, LargeFileScanResult};
pub use metadata::PhotoMetadata;
pub use quality::QualityScore;
pub use reporter::{DuplicateExplanation, GroupReport};
pub use scanner::PhotoFile;
pub use screenshot::{ScreenshotConfidence, ScreenshotInfo};
