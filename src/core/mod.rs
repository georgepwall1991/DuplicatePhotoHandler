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

pub mod cache;
pub mod comparator;
pub mod hasher;
pub mod metadata;
pub mod pipeline;
pub mod reporter;
pub mod scanner;

// Re-export commonly used types
pub use comparator::{DuplicateGroup, MatchResult, MatchType};
pub use hasher::{HashAlgorithmKind, PerceptualHash};
pub use metadata::PhotoMetadata;
pub use reporter::{DuplicateExplanation, GroupReport};
pub use scanner::PhotoFile;
