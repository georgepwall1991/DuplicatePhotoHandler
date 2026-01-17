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
//! - `organize` - Organizes photos into date-based folder structures
//! - `unorganized` - Finds loose/unorganized files
//! - `similar` - Finds perceptually similar (not exact duplicate) photos
//! - `history` - Stores and retrieves scan history

pub mod cache;
pub mod comparator;
pub mod hasher;
pub mod history;
pub mod large_files;
pub mod metadata;
pub mod organize;
pub mod pipeline;
pub mod quality;
pub mod reporter;
pub mod scanner;
pub mod screenshot;
pub mod similar;
pub mod unorganized;
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
pub use similar::{SimilarConfig, SimilarGroup, SimilarPhoto, SimilarResult, SimilarScanner};
pub use history::{HistoryRepository, ModuleType, ScanHistoryEntry, ScanHistoryResult, ScanStatus};
pub use unorganized::{UnorganizedConfig, UnorganizedFile, UnorganizedReason, UnorganizedResult, UnorganizedScanner};
