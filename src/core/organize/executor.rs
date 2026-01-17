//! Executor for organization plans.

use super::types::*;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

/// Executes organization plans
pub struct OrganizeExecutor;

impl OrganizeExecutor {
    /// Execute an organization plan with progress callback
    pub fn execute<F>(
        plan: &OrganizePlan,
        operation: OperationMode,
        mut on_progress: F,
    ) -> Result<OrganizeResult, String>
    where
        F: FnMut(usize, usize, &str),
    {
        let start = Instant::now();
        let mut last_progress = Instant::now();
        const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

        let mut processed = 0usize;
        let mut folders_created = 0usize;
        let mut total_size = 0u64;
        let mut errors = Vec::new();
        let mut created_dirs: HashSet<std::path::PathBuf> = HashSet::new();

        for (i, file) in plan.files.iter().enumerate() {
            // Progress every file or 100ms
            let now = Instant::now();
            if now.duration_since(last_progress) >= PROGRESS_INTERVAL {
                on_progress(i + 1, plan.total_files, &file.filename);
                last_progress = now;
            }

            let dest_path = Path::new(&file.destination);

            // Create parent directories if needed
            if let Some(parent) = dest_path.parent() {
                if !created_dirs.contains(parent) {
                    if let Err(e) = fs::create_dir_all(parent) {
                        errors.push(format!("Failed to create {}: {}", parent.display(), e));
                        continue;
                    }
                    created_dirs.insert(parent.to_path_buf());
                    folders_created += 1;
                }
            }

            let source_path = Path::new(&file.source);

            // Check source exists
            if !source_path.exists() {
                errors.push(format!("{}: Source file not found", file.filename));
                continue;
            }

            // Execute copy or move
            let result = match operation {
                OperationMode::Copy => fs::copy(source_path, dest_path).map(|_| ()),
                OperationMode::Move => fs::rename(source_path, dest_path).or_else(|_| {
                    // rename fails across filesystems, fall back to copy+delete
                    // with size verification before deleting source
                    let source_size = fs::metadata(source_path)?.len();
                    fs::copy(source_path, dest_path)?;

                    // Verify destination size matches source before deleting
                    let dest_size = fs::metadata(dest_path)?.len();
                    if dest_size != source_size {
                        // Copy was incomplete, don't delete source
                        let _ = fs::remove_file(dest_path);
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            format!(
                                "Copy verification failed: source {} bytes, dest {} bytes",
                                source_size, dest_size
                            ),
                        ));
                    }

                    fs::remove_file(source_path)
                }),
            };

            match result {
                Ok(()) => {
                    processed += 1;
                    total_size += file.size_bytes;
                }
                Err(e) => {
                    errors.push(format!("{}: {}", file.filename, e));
                }
            }
        }

        // Final progress
        on_progress(plan.total_files, plan.total_files, "");

        let duration = start.elapsed();

        Ok(OrganizeResult {
            files_processed: processed,
            folders_created,
            total_size_bytes: total_size,
            duration_ms: duration.as_millis() as u64,
            errors,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    #[test]
    fn test_execute_copy() {
        let temp_src = TempDir::new().unwrap();
        let temp_dest = TempDir::new().unwrap();

        // Create a test file
        let src_file = temp_src.path().join("test.jpg");
        let mut f = fs::File::create(&src_file).unwrap();
        f.write_all(b"test content").unwrap();

        let plan = OrganizePlan {
            id: "test".to_string(),
            files: vec![PlannedFile {
                source: src_file.display().to_string(),
                destination: temp_dest
                    .path()
                    .join("2024/01 - January/test.jpg")
                    .display()
                    .to_string(),
                filename: "test.jpg".to_string(),
                date: Some("2024-01-15".to_string()),
                size_bytes: 12,
                has_conflict: false,
            }],
            total_files: 1,
            total_size_bytes: 12,
            date_range: None,
            by_year: vec![],
            no_date_count: 0,
            conflict_count: 0,
        };

        let result = OrganizeExecutor::execute(&plan, OperationMode::Copy, |_, _, _| {}).unwrap();

        assert_eq!(result.files_processed, 1);
        assert!(src_file.exists()); // Original still exists
        assert!(temp_dest
            .path()
            .join("2024/01 - January/test.jpg")
            .exists());
    }

    #[test]
    fn test_execute_move() {
        let temp_src = TempDir::new().unwrap();
        let temp_dest = TempDir::new().unwrap();

        // Create a test file
        let src_file = temp_src.path().join("test.jpg");
        let mut f = fs::File::create(&src_file).unwrap();
        f.write_all(b"test content").unwrap();

        let plan = OrganizePlan {
            id: "test".to_string(),
            files: vec![PlannedFile {
                source: src_file.display().to_string(),
                destination: temp_dest
                    .path()
                    .join("2024/01/test.jpg")
                    .display()
                    .to_string(),
                filename: "test.jpg".to_string(),
                date: Some("2024-01-15".to_string()),
                size_bytes: 12,
                has_conflict: false,
            }],
            total_files: 1,
            total_size_bytes: 12,
            date_range: None,
            by_year: vec![],
            no_date_count: 0,
            conflict_count: 0,
        };

        let result = OrganizeExecutor::execute(&plan, OperationMode::Move, |_, _, _| {}).unwrap();

        assert_eq!(result.files_processed, 1);
        assert!(!src_file.exists()); // Original moved
        assert!(temp_dest.path().join("2024/01/test.jpg").exists());
    }

    #[test]
    fn test_execute_missing_source() {
        let temp_dest = TempDir::new().unwrap();

        let plan = OrganizePlan {
            id: "test".to_string(),
            files: vec![PlannedFile {
                source: "/nonexistent/file.jpg".to_string(),
                destination: temp_dest
                    .path()
                    .join("2024/01/file.jpg")
                    .display()
                    .to_string(),
                filename: "file.jpg".to_string(),
                date: Some("2024-01-15".to_string()),
                size_bytes: 100,
                has_conflict: false,
            }],
            total_files: 1,
            total_size_bytes: 100,
            date_range: None,
            by_year: vec![],
            no_date_count: 0,
            conflict_count: 0,
        };

        let result = OrganizeExecutor::execute(&plan, OperationMode::Copy, |_, _, _| {}).unwrap();

        assert_eq!(result.files_processed, 0);
        assert_eq!(result.errors.len(), 1);
    }
}
