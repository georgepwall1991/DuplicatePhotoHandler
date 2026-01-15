//! # Error Module
//!
//! User-friendly error types for the duplicate photo cleaner.
//!
//! ## Design Principles
//! - **Never panic** on user data - return errors instead
//! - **Include context** - paths, file names, what went wrong
//! - **User-friendly messages** - non-technical users should understand
//! - **Recovery hints** - suggest how to fix when possible

use std::path::PathBuf;
use thiserror::Error;

/// Top-level application error
#[derive(Error, Debug)]
pub enum DuplicateFinderError {
    #[error("Scanning error: {0}")]
    Scan(#[from] ScanError),

    #[error("Hashing error: {0}")]
    Hash(#[from] HashError),

    #[error("Comparison error: {0}")]
    Compare(#[from] CompareError),

    #[error("Cache error: {0}")]
    Cache(#[from] CacheError),

    #[error("Report generation error: {0}")]
    Report(#[from] ReportError),

    #[error("Configuration error: {0}")]
    Config(String),
}

/// Errors that occur during photo scanning
#[derive(Error, Debug)]
pub enum ScanError {
    #[error("Directory not found: {path}")]
    DirectoryNotFound { path: PathBuf },

    #[error("Permission denied accessing: {path}")]
    PermissionDenied { path: PathBuf },

    #[error("Failed to read directory {path}: {source}")]
    ReadDirectory {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("Scan was cancelled")]
    Cancelled,
}

/// Errors that occur during image hashing
#[derive(Error, Debug)]
pub enum HashError {
    #[error("Unsupported image format: {format}")]
    UnsupportedFormat { format: String },

    #[error("Failed to decode image {path}: {reason}")]
    DecodeError { path: PathBuf, reason: String },

    #[error("Image is empty or corrupted: {path}")]
    EmptyImage { path: PathBuf },

    #[error("Hash computation failed: {0}")]
    ComputationFailed(String),

    #[error("Failed to open image file {path}: {source}")]
    IoError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Errors that occur during duplicate comparison
#[derive(Error, Debug)]
pub enum CompareError {
    #[error("No photos to compare")]
    NoPhotos,

    #[error("Invalid threshold: {value} (must be 0-64)")]
    InvalidThreshold { value: u32 },

    #[error("Comparison was cancelled")]
    Cancelled,
}

/// Errors that occur with the hash cache
#[derive(Error, Debug)]
pub enum CacheError {
    #[error("Failed to open cache database at {path}: {reason}")]
    OpenFailed { path: PathBuf, reason: String },

    #[error("Database query failed: {0}")]
    QueryFailed(String),

    #[error("Cache corruption detected at {path}. Delete this file and try again.")]
    Corrupted { path: PathBuf },

    #[error("Failed to serialize hash data: {0}")]
    SerializationFailed(String),
}

/// Errors that occur during report generation
#[derive(Error, Debug)]
pub enum ReportError {
    #[error("Photo not found: {path}")]
    PhotoNotFound { path: PathBuf },

    #[error("Failed to read photo metadata for {path}: {reason}")]
    MetadataError { path: PathBuf, reason: String },

    #[error("Failed to generate report: {0}")]
    GenerationFailed(String),
}

/// Convenience Result type alias
pub type Result<T> = std::result::Result<T, DuplicateFinderError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_error_includes_path() {
        let error = ScanError::DirectoryNotFound {
            path: PathBuf::from("/photos/vacation"),
        };
        let message = error.to_string();
        assert!(message.contains("/photos/vacation"));
    }

    #[test]
    fn hash_error_includes_path() {
        let error = HashError::DecodeError {
            path: PathBuf::from("/photos/broken.jpg"),
            reason: "invalid JPEG".to_string(),
        };
        let message = error.to_string();
        assert!(message.contains("/photos/broken.jpg"));
        assert!(message.contains("invalid JPEG"));
    }

    #[test]
    fn cache_error_suggests_recovery() {
        let error = CacheError::Corrupted {
            path: PathBuf::from("/cache/hashes.db"),
        };
        let message = error.to_string();
        assert!(message.contains("Delete this file"));
    }
}
