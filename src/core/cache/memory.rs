//! In-memory cache backend for testing.

use super::{CacheBackend, CacheEntry, CacheStats};
use crate::error::CacheError;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::SystemTime;

/// In-memory cache backend
///
/// Useful for testing and scenarios where persistence isn't needed.
pub struct InMemoryCache {
    entries: RwLock<HashMap<PathBuf, CacheEntry>>,
}

impl InMemoryCache {
    /// Create a new in-memory cache
    pub fn new() -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
        }
    }
}

impl Default for InMemoryCache {
    fn default() -> Self {
        Self::new()
    }
}

impl CacheBackend for InMemoryCache {
    fn get(
        &self,
        path: &Path,
        current_size: u64,
        current_modified: SystemTime,
    ) -> Result<Option<CacheEntry>, CacheError> {
        let entries = self.entries.read().map_err(|_| CacheError::Corrupted {
            path: PathBuf::from("memory"),
        })?;

        if let Some(entry) = entries.get(path) {
            if entry.is_valid_for(current_size, current_modified) {
                return Ok(Some(entry.clone()));
            }
        }

        Ok(None)
    }

    fn set(&self, entry: CacheEntry) -> Result<(), CacheError> {
        let mut entries = self.entries.write().map_err(|_| CacheError::Corrupted {
            path: PathBuf::from("memory"),
        })?;

        entries.insert(entry.path.clone(), entry);
        Ok(())
    }

    fn remove(&self, path: &Path) -> Result<(), CacheError> {
        let mut entries = self.entries.write().map_err(|_| CacheError::Corrupted {
            path: PathBuf::from("memory"),
        })?;

        entries.remove(path);
        Ok(())
    }

    fn clear(&self) -> Result<(), CacheError> {
        let mut entries = self.entries.write().map_err(|_| CacheError::Corrupted {
            path: PathBuf::from("memory"),
        })?;

        entries.clear();
        Ok(())
    }

    fn stats(&self) -> Result<CacheStats, CacheError> {
        let entries = self.entries.read().map_err(|_| CacheError::Corrupted {
            path: PathBuf::from("memory"),
        })?;

        let total_entries = entries.len();
        let total_size_bytes: u64 = entries.values().map(|e| e.hash.len() as u64).sum();

        let oldest_entry = entries.values().map(|e| e.cached_at).min();
        let newest_entry = entries.values().map(|e| e.cached_at).max();

        Ok(CacheStats {
            total_entries,
            total_size_bytes,
            oldest_entry,
            newest_entry,
        })
    }

    fn prune_orphans(&self) -> Result<usize, CacheError> {
        let mut entries = self.entries.write().map_err(|_| CacheError::Corrupted {
            path: PathBuf::from("memory"),
        })?;

        let before = entries.len();
        entries.retain(|path, _| path.exists());
        let after = entries.len();

        Ok(before - after)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::hasher::HashAlgorithmKind;

    fn create_entry(path: &str) -> CacheEntry {
        let now = SystemTime::now();
        CacheEntry {
            path: PathBuf::from(path),
            hash: vec![0xDE, 0xAD, 0xBE, 0xEF],
            algorithm: HashAlgorithmKind::Difference,
            file_size: 1000,
            file_modified: now,
            cached_at: now,
        }
    }

    #[test]
    fn cache_miss_returns_none() {
        let cache = InMemoryCache::new();
        let now = SystemTime::now();

        let result = cache.get(Path::new("/nonexistent.jpg"), 1000, now).unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn cache_hit_returns_entry() {
        let cache = InMemoryCache::new();
        let entry = create_entry("/test.jpg");
        let modified = entry.file_modified;

        cache.set(entry).unwrap();

        let result = cache.get(Path::new("/test.jpg"), 1000, modified).unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().hash, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn modified_file_invalidates_cache() {
        let cache = InMemoryCache::new();
        let entry = create_entry("/test.jpg");
        let original_modified = entry.file_modified;

        cache.set(entry).unwrap();

        // Try to get with different modification time
        let later = original_modified + std::time::Duration::from_secs(60);
        let result = cache.get(Path::new("/test.jpg"), 1000, later).unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn clear_removes_all_entries() {
        let cache = InMemoryCache::new();

        cache.set(create_entry("/a.jpg")).unwrap();
        cache.set(create_entry("/b.jpg")).unwrap();

        cache.clear().unwrap();

        let stats = cache.stats().unwrap();
        assert_eq!(stats.total_entries, 0);
    }

    #[test]
    fn stats_are_accurate() {
        let cache = InMemoryCache::new();

        cache.set(create_entry("/a.jpg")).unwrap();
        cache.set(create_entry("/b.jpg")).unwrap();

        let stats = cache.stats().unwrap();

        assert_eq!(stats.total_entries, 2);
        assert_eq!(stats.total_size_bytes, 8); // 4 bytes * 2 entries
    }

    #[test]
    fn remove_deletes_specific_entry() {
        let cache = InMemoryCache::new();
        let entry = create_entry("/test.jpg");
        let modified = entry.file_modified;

        cache.set(entry).unwrap();
        cache.remove(Path::new("/test.jpg")).unwrap();

        let result = cache.get(Path::new("/test.jpg"), 1000, modified).unwrap();
        assert!(result.is_none());
    }
}
