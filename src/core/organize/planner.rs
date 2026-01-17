//! Plan generator for organization operations.

use super::scanner::OrganizeScanner;
use super::types::*;
use chrono::{Datelike, NaiveDate};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use uuid::Uuid;

/// Generates organization plans
pub struct OrganizePlanner;

impl OrganizePlanner {
    /// Create an organization plan from config
    pub fn create_plan<F>(config: &OrganizeConfig, on_progress: F) -> Result<OrganizePlan, String>
    where
        F: FnMut(usize, &str),
    {
        // Scan all files
        let scanned = OrganizeScanner::scan_with_progress(&config.source_paths, on_progress)?;

        let mut files = Vec::new();
        let mut by_year: HashMap<u32, (usize, u64)> = HashMap::new();
        let mut no_date_count = 0;
        let mut destinations: HashSet<String> = HashSet::new();
        // Track next available counter for each base path (parent + stem + ext)
        // This avoids O(N^2) conflict resolution when many files have the same name
        let mut path_counters: HashMap<String, usize> = HashMap::new();
        let mut conflict_count = 0;
        let mut earliest: Option<NaiveDate> = None;
        let mut latest: Option<NaiveDate> = None;
        let mut total_size = 0u64;

        let dest_base = Path::new(&config.destination);

        for (source, date, size) in scanned {
            total_size += size;

            let (dest_folder, date_str) = match date {
                Some(d) => {
                    // Update date range
                    earliest = Some(earliest.map_or(d, |e| e.min(d)));
                    latest = Some(latest.map_or(d, |l| l.max(d)));

                    // Update year summary
                    let year = d.year() as u32;
                    let entry = by_year.entry(year).or_insert((0, 0));
                    entry.0 += 1;
                    entry.1 += size;

                    let folder = Self::build_folder_path(&config.structure, d);
                    (folder, Some(d.to_string()))
                }
                None => {
                    no_date_count += 1;
                    ("Unsorted".to_string(), None)
                }
            };

            let filename = Path::new(&source)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let mut dest_path = dest_base.join(&dest_folder).join(&filename);
            let mut has_conflict = false;

            // Check for conflicts using efficient counter-based resolution
            let dest_str = dest_path.display().to_string();
            if destinations.contains(&dest_str) {
                has_conflict = true;
                conflict_count += 1;
                // Generate unique name using counter tracking (O(1) instead of O(N))
                dest_path =
                    Self::generate_unique_path_fast(&dest_path, &destinations, &mut path_counters);
            }

            let final_dest = dest_path.display().to_string();
            destinations.insert(final_dest.clone());

            files.push(PlannedFile {
                source,
                destination: final_dest,
                filename,
                date: date_str,
                size_bytes: size,
                has_conflict,
            });
        }

        // Convert year summary
        let mut by_year_vec: Vec<YearSummary> = by_year
            .into_iter()
            .map(|(year, (count, size))| YearSummary {
                year,
                count,
                size_bytes: size,
            })
            .collect();
        by_year_vec.sort_by(|a, b| b.year.cmp(&a.year));

        let date_range = match (earliest, latest) {
            (Some(e), Some(l)) => Some((e.to_string(), l.to_string())),
            _ => None,
        };

        Ok(OrganizePlan {
            id: Uuid::new_v4().to_string(),
            total_files: files.len(),
            total_size_bytes: total_size,
            date_range,
            by_year: by_year_vec,
            no_date_count,
            conflict_count,
            files,
        })
    }

    fn build_folder_path(structure: &FolderStructure, date: NaiveDate) -> String {
        use chrono::Datelike;

        let year = date.year();
        let month = date.month();
        let day = date.day();

        let month_name = match month {
            1 => "January",
            2 => "February",
            3 => "March",
            4 => "April",
            5 => "May",
            6 => "June",
            7 => "July",
            8 => "August",
            9 => "September",
            10 => "October",
            11 => "November",
            12 => "December",
            _ => "Unknown",
        };

        match structure {
            FolderStructure::YearMonth => {
                format!("{}/{:02} - {}", year, month, month_name)
            }
            FolderStructure::YearMonthDay => {
                format!("{}/{:02}/{:02}", year, month, day)
            }
            FolderStructure::YearMonthFlat => {
                format!("{}-{:02}", year, month)
            }
        }
    }

    /// Fast unique path generation using counter tracking (O(1) per call)
    fn generate_unique_path_fast(
        path: &Path,
        existing: &HashSet<String>,
        counters: &mut HashMap<String, usize>,
    ) -> std::path::PathBuf {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let parent = path.parent().unwrap_or(Path::new(""));

        // Create a key for this path pattern (parent + stem + ext)
        let pattern_key = format!("{}:{}:{}", parent.display(), stem, ext);

        // Get the next counter value for this pattern
        let counter = counters.entry(pattern_key).or_insert(1);

        loop {
            let new_name = if ext.is_empty() {
                format!("{}_{}", stem, counter)
            } else {
                format!("{}_{}.{}", stem, counter, ext)
            };
            let new_path = parent.join(new_name);
            let new_path_str = new_path.display().to_string();

            // Increment counter for next call
            *counter += 1;

            // Double-check not in existing (handles edge cases)
            if !existing.contains(&new_path_str) {
                return new_path;
            }
        }
    }

    /// Original unique path generation (kept for reference and tests)
    #[allow(dead_code)]
    fn generate_unique_path(path: &Path, existing: &HashSet<String>) -> std::path::PathBuf {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let parent = path.parent().unwrap_or(Path::new(""));

        let mut counter = 1;
        loop {
            let new_name = if ext.is_empty() {
                format!("{}_{}", stem, counter)
            } else {
                format!("{}_{}.{}", stem, counter, ext)
            };
            let new_path = parent.join(new_name);
            if !existing.contains(&new_path.display().to_string()) {
                return new_path;
            }
            counter += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_folder_path_year_month() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonth, date);
        assert_eq!(path, "2024/01 - January");
    }

    #[test]
    fn test_build_folder_path_year_month_day() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonthDay, date);
        assert_eq!(path, "2024/01/15");
    }

    #[test]
    fn test_build_folder_path_flat() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonthFlat, date);
        assert_eq!(path, "2024-01");
    }

    #[test]
    fn test_build_folder_path_december() {
        let date = NaiveDate::from_ymd_opt(2024, 12, 25).unwrap();
        let path = OrganizePlanner::build_folder_path(&FolderStructure::YearMonth, date);
        assert_eq!(path, "2024/12 - December");
    }

    #[test]
    fn test_generate_unique_path() {
        let existing: HashSet<String> = vec![
            "/dest/2024/photo.jpg".to_string(),
            "/dest/2024/photo_1.jpg".to_string(),
        ]
        .into_iter()
        .collect();

        let path = Path::new("/dest/2024/photo.jpg");
        let unique = OrganizePlanner::generate_unique_path(path, &existing);
        assert_eq!(unique.display().to_string(), "/dest/2024/photo_2.jpg");
    }
}
