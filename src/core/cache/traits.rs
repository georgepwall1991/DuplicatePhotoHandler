//! Cache backend trait definition.

use super::{CacheEntry, CacheStats};
use crate::error::CacheError;
use std::path::Path;
use std::time::SystemTime;

/// Trait for cache backends
pub trait CacheBackend: Send + Sync {
    /// Get a cached hash if it exists and is still valid
    ///
    /// The entry is only returned if the file hasn't been modified
    /// since it was cached.
    fn get(
        &self,
        path: &Path,
        current_size: u64,
        current_modified: SystemTime,
    ) -> Result<Option<CacheEntry>, CacheError>;

    /// Store a hash in the cache
    fn set(&self, entry: CacheEntry) -> Result<(), CacheError>;

    /// Store multiple hashes in the cache in a single transaction.
    ///
    /// This is significantly faster than calling `set` multiple times
    /// due to reduced transaction overhead.
    fn set_batch(&self, entries: &[CacheEntry]) -> Result<(), CacheError> {
        // Default implementation: just call set for each entry
        for entry in entries {
            self.set(entry.clone())?;
        }
        Ok(())
    }

    /// Remove a specific entry
    fn remove(&self, path: &Path) -> Result<(), CacheError>;

    /// Clear all cached entries
    fn clear(&self) -> Result<(), CacheError>;

    /// Get cache statistics
    fn stats(&self) -> Result<CacheStats, CacheError>;

    /// Remove entries for files that no longer exist
    ///
    /// Returns the number of entries removed.
    fn prune_orphans(&self) -> Result<usize, CacheError>;
}
