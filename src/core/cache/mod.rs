//! # Cache Module
//!
//! Persists perceptual hashes to avoid recomputation.
//!
//! ## Benefits
//! - Subsequent scans are much faster
//! - Only new or modified photos need hashing
//! - Cache invalidation based on file modification time
//!
//! ## Backends
//! - `SqliteCache` - Persistent storage using SQLite
//! - `InMemoryCache` - For testing

mod memory;
mod sqlite;
mod traits;

pub use memory::InMemoryCache;
pub use sqlite::{ScanState, SqliteCache};
pub use traits::CacheBackend;

use crate::core::hasher::HashAlgorithmKind;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::SystemTime;

/// A cached hash entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    /// Path to the photo
    pub path: PathBuf,
    /// The computed hash
    pub hash: Vec<u8>,
    /// Algorithm used to compute the hash
    pub algorithm: HashAlgorithmKind,
    /// File size at time of hashing
    pub file_size: u64,
    /// File modification time at time of hashing
    pub file_modified: SystemTime,
    /// When the entry was cached
    pub cached_at: SystemTime,
}

impl CacheEntry {
    /// Check if this entry is still valid for a file
    pub fn is_valid_for(&self, file_size: u64, file_modified: SystemTime) -> bool {
        // Entry is valid if file hasn't changed
        // Compare timestamps at second precision (SQLite stores seconds)
        let cached_secs = self.file_modified
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let current_secs = file_modified
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        self.file_size == file_size && cached_secs == current_secs
    }
}

/// Cache statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CacheStats {
    /// Total number of entries
    pub total_entries: usize,
    /// Total size of cached data in bytes
    pub total_size_bytes: u64,
    /// Oldest entry timestamp
    pub oldest_entry: Option<SystemTime>,
    /// Newest entry timestamp
    pub newest_entry: Option<SystemTime>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_entry_valid_when_unchanged() {
        let now = SystemTime::now();
        let entry = CacheEntry {
            path: PathBuf::from("/test.jpg"),
            hash: vec![0xFF],
            algorithm: HashAlgorithmKind::Difference,
            file_size: 1000,
            file_modified: now,
            cached_at: now,
        };

        assert!(entry.is_valid_for(1000, now));
    }

    #[test]
    fn cache_entry_invalid_when_size_changed() {
        let now = SystemTime::now();
        let entry = CacheEntry {
            path: PathBuf::from("/test.jpg"),
            hash: vec![0xFF],
            algorithm: HashAlgorithmKind::Difference,
            file_size: 1000,
            file_modified: now,
            cached_at: now,
        };

        assert!(!entry.is_valid_for(2000, now)); // Different size
    }

    #[test]
    fn cache_entry_invalid_when_modified() {
        let now = SystemTime::now();
        let later = now + std::time::Duration::from_secs(60);

        let entry = CacheEntry {
            path: PathBuf::from("/test.jpg"),
            hash: vec![0xFF],
            algorithm: HashAlgorithmKind::Difference,
            file_size: 1000,
            file_modified: now,
            cached_at: now,
        };

        assert!(!entry.is_valid_for(1000, later)); // Different time
    }
}
