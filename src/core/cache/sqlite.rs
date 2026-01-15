//! SQLite cache backend for persistent storage.

use super::{CacheBackend, CacheEntry, CacheStats};
use crate::core::hasher::HashAlgorithmKind;
use crate::error::CacheError;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// SQLite-backed persistent cache
///
/// Uses WAL (Write-Ahead Logging) mode for better concurrent access.
/// WAL allows readers to proceed even while writes are happening.
pub struct SqliteCache {
    conn: Mutex<Connection>,
    db_path: PathBuf,
}

impl SqliteCache {
    /// Open or create a cache database at the given path
    pub fn open(path: &Path) -> Result<Self, CacheError> {
        // Create parent directories if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| CacheError::OpenFailed {
                path: path.to_path_buf(),
                reason: e.to_string(),
            })?;
        }

        let conn = Connection::open(path).map_err(|e| CacheError::OpenFailed {
            path: path.to_path_buf(),
            reason: e.to_string(),
        })?;

        // Enable WAL mode for better concurrent access
        // WAL allows readers to proceed even while writes are happening
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        // Create table if it doesn't exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS hashes (
                path TEXT PRIMARY KEY,
                hash BLOB NOT NULL,
                algorithm TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_modified INTEGER NOT NULL,
                cached_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        // Create index for faster lookups
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_path ON hashes(path)",
            [],
        )
        .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        // Create scan state table for incremental scanning
        conn.execute(
            "CREATE TABLE IF NOT EXISTS scan_state (
                directory TEXT PRIMARY KEY,
                last_scan_time INTEGER NOT NULL,
                file_count INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        Ok(Self {
            conn: Mutex::new(conn),
            db_path: path.to_path_buf(),
        })
    }

    /// Convert SystemTime to Unix timestamp
    fn to_timestamp(time: SystemTime) -> i64 {
        time.duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs() as i64
    }

    /// Convert Unix timestamp to SystemTime
    fn from_timestamp(timestamp: i64) -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(timestamp as u64)
    }

    /// Convert algorithm to string for storage
    fn algorithm_to_string(algo: HashAlgorithmKind) -> &'static str {
        match algo {
            HashAlgorithmKind::Average => "average",
            HashAlgorithmKind::Difference => "difference",
            HashAlgorithmKind::Perceptual => "perceptual",
        }
    }

    /// Convert string to algorithm
    fn string_to_algorithm(s: &str) -> HashAlgorithmKind {
        match s {
            "average" => HashAlgorithmKind::Average,
            "perceptual" => HashAlgorithmKind::Perceptual,
            _ => HashAlgorithmKind::Difference,
        }
    }

    /// Get the last scan time for a directory
    pub fn get_scan_state(&self, directory: &Path) -> Result<Option<ScanState>, CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let dir_str = directory.to_string_lossy();

        let result: Result<ScanState, _> = conn.query_row(
            "SELECT last_scan_time, file_count FROM scan_state WHERE directory = ?",
            [&dir_str],
            |row| {
                Ok(ScanState {
                    directory: directory.to_path_buf(),
                    last_scan_time: Self::from_timestamp(row.get(0)?),
                    file_count: row.get::<_, i64>(1)? as usize,
                })
            },
        );

        match result {
            Ok(state) => Ok(Some(state)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CacheError::QueryFailed(e.to_string())),
        }
    }

    /// Update the scan state for a directory
    pub fn set_scan_state(&self, state: &ScanState) -> Result<(), CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let dir_str = state.directory.to_string_lossy();

        conn.execute(
            "INSERT OR REPLACE INTO scan_state (directory, last_scan_time, file_count) VALUES (?, ?, ?)",
            params![
                dir_str,
                Self::to_timestamp(state.last_scan_time),
                state.file_count as i64,
            ],
        )
        .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        Ok(())
    }
}

/// Represents the state of a previous scan
#[derive(Debug, Clone)]
pub struct ScanState {
    /// Directory that was scanned
    pub directory: PathBuf,
    /// When the scan was performed
    pub last_scan_time: SystemTime,
    /// Number of photos found
    pub file_count: usize,
}

impl CacheBackend for SqliteCache {
    fn get(
        &self,
        path: &Path,
        current_size: u64,
        current_modified: SystemTime,
    ) -> Result<Option<CacheEntry>, CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let path_str = path.to_string_lossy();

        let result: Result<CacheEntry, _> = conn.query_row(
            "SELECT hash, algorithm, file_size, file_modified, cached_at
             FROM hashes WHERE path = ?",
            [&path_str],
            |row| {
                Ok(CacheEntry {
                    path: path.to_path_buf(),
                    hash: row.get(0)?,
                    algorithm: Self::string_to_algorithm(&row.get::<_, String>(1)?),
                    file_size: row.get::<_, i64>(2)? as u64,
                    file_modified: Self::from_timestamp(row.get(3)?),
                    cached_at: Self::from_timestamp(row.get(4)?),
                })
            },
        );

        match result {
            Ok(entry) => {
                if entry.is_valid_for(current_size, current_modified) {
                    Ok(Some(entry))
                } else {
                    Ok(None)
                }
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(CacheError::QueryFailed(e.to_string())),
        }
    }

    fn set(&self, entry: CacheEntry) -> Result<(), CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let path_str = entry.path.to_string_lossy();

        conn.execute(
            "INSERT OR REPLACE INTO hashes
             (path, hash, algorithm, file_size, file_modified, cached_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![
                path_str,
                entry.hash,
                Self::algorithm_to_string(entry.algorithm),
                entry.file_size as i64,
                Self::to_timestamp(entry.file_modified),
                Self::to_timestamp(entry.cached_at),
            ],
        )
        .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        Ok(())
    }

    fn remove(&self, path: &Path) -> Result<(), CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let path_str = path.to_string_lossy();

        conn.execute("DELETE FROM hashes WHERE path = ?", [&path_str])
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        Ok(())
    }

    fn clear(&self) -> Result<(), CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        conn.execute("DELETE FROM hashes", [])
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        Ok(())
    }

    fn stats(&self) -> Result<CacheStats, CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let total_entries: usize = conn
            .query_row("SELECT COUNT(*) FROM hashes", [], |row| {
                row.get::<_, i64>(0).map(|v| v as usize)
            })
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        let total_size_bytes: u64 = conn
            .query_row("SELECT COALESCE(SUM(LENGTH(hash)), 0) FROM hashes", [], |row| {
                row.get::<_, i64>(0).map(|v| v as u64)
            })
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        let oldest_entry: Option<SystemTime> = conn
            .query_row("SELECT MIN(cached_at) FROM hashes", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?
            .map(Self::from_timestamp);

        let newest_entry: Option<SystemTime> = conn
            .query_row("SELECT MAX(cached_at) FROM hashes", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?
            .map(Self::from_timestamp);

        Ok(CacheStats {
            total_entries,
            total_size_bytes,
            oldest_entry,
            newest_entry,
        })
    }

    fn prune_orphans(&self) -> Result<usize, CacheError> {
        let conn = self.conn.lock().map_err(|_| CacheError::Corrupted {
            path: self.db_path.clone(),
        })?;

        let mut stmt = conn
            .prepare("SELECT path FROM hashes")
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?;

        let paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| CacheError::QueryFailed(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        drop(stmt);

        let mut count = 0;
        for path in paths {
            if !Path::new(&path).exists() {
                conn.execute("DELETE FROM hashes WHERE path = ?", [&path])
                    .map_err(|e| CacheError::QueryFailed(e.to_string()))?;
                count += 1;
            }
        }

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

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
    fn sqlite_cache_creates_database() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("cache.db");

        let cache = SqliteCache::open(&db_path).unwrap();

        assert!(db_path.exists());

        let stats = cache.stats().unwrap();
        assert_eq!(stats.total_entries, 0);
    }

    #[test]
    fn sqlite_cache_stores_and_retrieves() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("cache.db");

        let cache = SqliteCache::open(&db_path).unwrap();
        let entry = create_entry("/test.jpg");
        let size = entry.file_size;
        // Store the timestamp we'll use for retrieval (truncated to seconds for SQLite)
        let modified_secs = entry.file_modified
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let modified = std::time::UNIX_EPOCH + std::time::Duration::from_secs(modified_secs);

        // Create entry with the truncated time
        let entry = CacheEntry {
            file_modified: modified,
            ..entry
        };

        cache.set(entry).unwrap();

        let result = cache.get(Path::new("/test.jpg"), size, modified).unwrap();

        assert!(result.is_some());
        assert_eq!(result.unwrap().hash, vec![0xDE, 0xAD, 0xBE, 0xEF]);
    }

    #[test]
    fn sqlite_cache_invalidates_on_modification() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("cache.db");

        let cache = SqliteCache::open(&db_path).unwrap();
        let entry = create_entry("/test.jpg");
        let original_modified = entry.file_modified;

        cache.set(entry).unwrap();

        // Check with different modification time
        let later = original_modified + Duration::from_secs(60);
        let result = cache.get(Path::new("/test.jpg"), 1000, later).unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn sqlite_cache_clears_all() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("cache.db");

        let cache = SqliteCache::open(&db_path).unwrap();

        cache.set(create_entry("/a.jpg")).unwrap();
        cache.set(create_entry("/b.jpg")).unwrap();

        cache.clear().unwrap();

        let stats = cache.stats().unwrap();
        assert_eq!(stats.total_entries, 0);
    }
}
