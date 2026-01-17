//! Database operations for scan history.

use super::types::{ModuleType, ScanHistoryEntry, ScanHistoryResult, ScanStatus};
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

/// Repository for scan history operations
pub struct HistoryRepository {
    conn: Mutex<Connection>,
    #[allow(dead_code)]
    db_path: PathBuf,
}

impl HistoryRepository {
    /// Open or create the history database
    pub fn open(path: &Path) -> Result<Self, String> {
        // Create parent directories if needed
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(path).map_err(|e| e.to_string())?;

        // Enable WAL mode
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| e.to_string())?;

        // Create history tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS scan_history (
                id TEXT PRIMARY KEY,
                module_type TEXT NOT NULL,
                scan_time INTEGER NOT NULL,
                paths TEXT NOT NULL,
                settings TEXT NOT NULL,
                total_files INTEGER NOT NULL,
                groups_found INTEGER,
                duplicates_found INTEGER,
                potential_savings INTEGER,
                duration_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_time ON scan_history(scan_time DESC)",
            [],
        )
        .map_err(|e| e.to_string())?;

        Ok(Self {
            conn: Mutex::new(conn),
            db_path: path.to_path_buf(),
        })
    }

    /// Save a scan entry
    pub fn save_scan(&self, entry: &ScanHistoryEntry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let paths_json = serde_json::to_string(&entry.paths).map_err(|e| e.to_string())?;
        let (status_str, error_msg) = match &entry.status {
            ScanStatus::Completed => ("completed", None),
            ScanStatus::Cancelled => ("cancelled", None),
            ScanStatus::Error(msg) => ("error", Some(msg.as_str())),
        };

        conn.execute(
            "INSERT OR REPLACE INTO scan_history
             (id, module_type, scan_time, paths, settings, total_files, groups_found,
              duplicates_found, potential_savings, duration_ms, status, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                entry.id,
                entry.module_type.as_str(),
                entry.scan_time,
                paths_json,
                entry.settings,
                entry.total_files as i64,
                entry.groups_found.map(|v| v as i64),
                entry.duplicates_found.map(|v| v as i64),
                entry.potential_savings.map(|v| v as i64),
                entry.duration_ms as i64,
                status_str,
                error_msg,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// List scan history with pagination
    pub fn list_scans(&self, limit: usize, offset: usize) -> Result<ScanHistoryResult, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Get total count
        let total_count: usize = conn
            .query_row("SELECT COUNT(*) FROM scan_history", [], |row| {
                row.get::<_, i64>(0).map(|v| v as usize)
            })
            .map_err(|e| e.to_string())?;

        // Get entries
        let mut stmt = conn
            .prepare(
                "SELECT id, module_type, scan_time, paths, settings, total_files,
                        groups_found, duplicates_found, potential_savings, duration_ms,
                        status, error_message
                 FROM scan_history
                 ORDER BY scan_time DESC
                 LIMIT ? OFFSET ?",
            )
            .map_err(|e| e.to_string())?;

        let entries: Vec<ScanHistoryEntry> = stmt
            .query_map(params![limit as i64, offset as i64], |row| {
                let id: String = row.get(0)?;
                let module_type_str: String = row.get(1)?;
                let scan_time: i64 = row.get(2)?;
                let paths_json: String = row.get(3)?;
                let settings: String = row.get(4)?;
                let total_files: i64 = row.get(5)?;
                let groups_found: Option<i64> = row.get(6)?;
                let duplicates_found: Option<i64> = row.get(7)?;
                let potential_savings: Option<i64> = row.get(8)?;
                let duration_ms: i64 = row.get(9)?;
                let status_str: String = row.get(10)?;
                let error_message: Option<String> = row.get(11)?;

                Ok(ScanHistoryEntry {
                    id,
                    module_type: ModuleType::from_str(&module_type_str).unwrap_or(ModuleType::Duplicates),
                    scan_time,
                    paths: serde_json::from_str(&paths_json).unwrap_or_default(),
                    settings,
                    total_files: total_files as usize,
                    groups_found: groups_found.map(|v| v as usize),
                    duplicates_found: duplicates_found.map(|v| v as usize),
                    potential_savings: potential_savings.map(|v| v as u64),
                    duration_ms: duration_ms as u64,
                    status: ScanStatus::from_str(&status_str, error_message.as_deref()),
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ScanHistoryResult {
            entries,
            total_count,
        })
    }

    /// Get a specific scan by ID
    pub fn get_scan(&self, id: &str) -> Result<Option<ScanHistoryEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let result = conn.query_row(
            "SELECT id, module_type, scan_time, paths, settings, total_files,
                    groups_found, duplicates_found, potential_savings, duration_ms,
                    status, error_message
             FROM scan_history WHERE id = ?",
            [id],
            |row| {
                let id: String = row.get(0)?;
                let module_type_str: String = row.get(1)?;
                let scan_time: i64 = row.get(2)?;
                let paths_json: String = row.get(3)?;
                let settings: String = row.get(4)?;
                let total_files: i64 = row.get(5)?;
                let groups_found: Option<i64> = row.get(6)?;
                let duplicates_found: Option<i64> = row.get(7)?;
                let potential_savings: Option<i64> = row.get(8)?;
                let duration_ms: i64 = row.get(9)?;
                let status_str: String = row.get(10)?;
                let error_message: Option<String> = row.get(11)?;

                Ok(ScanHistoryEntry {
                    id,
                    module_type: ModuleType::from_str(&module_type_str).unwrap_or(ModuleType::Duplicates),
                    scan_time,
                    paths: serde_json::from_str(&paths_json).unwrap_or_default(),
                    settings,
                    total_files: total_files as usize,
                    groups_found: groups_found.map(|v| v as usize),
                    duplicates_found: duplicates_found.map(|v| v as usize),
                    potential_savings: potential_savings.map(|v| v as u64),
                    duration_ms: duration_ms as u64,
                    status: ScanStatus::from_str(&status_str, error_message.as_deref()),
                })
            },
        );

        match result {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Delete a scan entry
    pub fn delete_scan(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let rows_affected = conn
            .execute("DELETE FROM scan_history WHERE id = ?", [id])
            .map_err(|e| e.to_string())?;

        Ok(rows_affected > 0)
    }

    /// Clear all history
    pub fn clear_history(&self) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let count: usize = conn
            .query_row("SELECT COUNT(*) FROM scan_history", [], |row| {
                row.get::<_, i64>(0).map(|v| v as usize)
            })
            .map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM scan_history", [])
            .map_err(|e| e.to_string())?;

        Ok(count)
    }

    /// Generate a new unique ID
    pub fn generate_id() -> String {
        Uuid::new_v4().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_test_entry() -> ScanHistoryEntry {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        ScanHistoryEntry {
            id: HistoryRepository::generate_id(),
            module_type: ModuleType::Duplicates,
            scan_time: now,
            paths: vec!["/test/path".to_string()],
            settings: "{}".to_string(),
            total_files: 100,
            groups_found: Some(5),
            duplicates_found: Some(10),
            potential_savings: Some(1024000),
            duration_ms: 1500,
            status: ScanStatus::Completed,
        }
    }

    #[test]
    fn test_save_and_list() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("history.db");

        let repo = HistoryRepository::open(&db_path).unwrap();
        let entry = create_test_entry();
        let entry_id = entry.id.clone();

        repo.save_scan(&entry).unwrap();

        let result = repo.list_scans(10, 0).unwrap();
        assert_eq!(result.total_count, 1);
        assert_eq!(result.entries[0].id, entry_id);
    }

    #[test]
    fn test_get_scan() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("history.db");

        let repo = HistoryRepository::open(&db_path).unwrap();
        let entry = create_test_entry();
        let entry_id = entry.id.clone();

        repo.save_scan(&entry).unwrap();

        let result = repo.get_scan(&entry_id).unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().total_files, 100);
    }

    #[test]
    fn test_delete_scan() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("history.db");

        let repo = HistoryRepository::open(&db_path).unwrap();
        let entry = create_test_entry();
        let entry_id = entry.id.clone();

        repo.save_scan(&entry).unwrap();
        let deleted = repo.delete_scan(&entry_id).unwrap();
        assert!(deleted);

        let result = repo.get_scan(&entry_id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_clear_history() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("history.db");

        let repo = HistoryRepository::open(&db_path).unwrap();

        // Add multiple entries
        for _ in 0..5 {
            repo.save_scan(&create_test_entry()).unwrap();
        }

        let cleared = repo.clear_history().unwrap();
        assert_eq!(cleared, 5);

        let result = repo.list_scans(10, 0).unwrap();
        assert_eq!(result.total_count, 0);
    }
}
