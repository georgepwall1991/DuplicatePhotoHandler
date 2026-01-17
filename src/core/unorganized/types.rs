//! Types for unorganized file detection.

use serde::{Deserialize, Serialize};

/// Why a file is considered unorganized
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum UnorganizedReason {
    /// File is in root of scanned folder (no subfolder)
    InRoot,
    /// File is in a shallow folder (only 1 level deep)
    ShallowFolder,
    /// Folder doesn't follow date pattern (YYYY, YYYY-MM, etc.)
    NoDatePattern,
    /// File has generic/meaningless name (IMG_*, DSC*, Screenshot*, etc.)
    GenericName,
}

impl UnorganizedReason {
    pub fn description(&self) -> &'static str {
        match self {
            Self::InRoot => "In root folder",
            Self::ShallowFolder => "In shallow folder",
            Self::NoDatePattern => "Not in date folder",
            Self::GenericName => "Generic filename",
        }
    }

    pub fn priority(&self) -> u8 {
        // Higher = more "unorganized"
        match self {
            Self::InRoot => 4,
            Self::GenericName => 3,
            Self::ShallowFolder => 2,
            Self::NoDatePattern => 1,
        }
    }
}

/// A file identified as unorganized
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnorganizedFile {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub file_type: String,
    pub reasons: Vec<UnorganizedReason>,
    pub folder_depth: usize,
    pub parent_folder: String,
}

impl UnorganizedFile {
    /// Get the highest priority reason
    pub fn primary_reason(&self) -> Option<&UnorganizedReason> {
        self.reasons.iter().max_by_key(|r| r.priority())
    }
}

/// Configuration for unorganized scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnorganizedConfig {
    pub source_paths: Vec<String>,
    /// Check for files in root folders
    pub check_root: bool,
    /// Check for files not in date-patterned folders
    pub check_date_pattern: bool,
    /// Check for generic filenames
    pub check_generic_names: bool,
    /// Minimum folder depth to be considered "organized" (default: 2)
    pub min_depth: usize,
}

impl Default for UnorganizedConfig {
    fn default() -> Self {
        Self {
            source_paths: Vec::new(),
            check_root: true,
            check_date_pattern: true,
            check_generic_names: true,
            min_depth: 2,
        }
    }
}

/// Result of an unorganized scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnorganizedResult {
    pub files: Vec<UnorganizedFile>,
    pub total_files: usize,
    pub total_size_bytes: u64,
    pub by_reason: Vec<ReasonSummary>,
    pub duration_ms: u64,
}

/// Summary of files by reason
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasonSummary {
    pub reason: UnorganizedReason,
    pub count: usize,
    pub size_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reason_priority() {
        assert!(UnorganizedReason::InRoot.priority() > UnorganizedReason::NoDatePattern.priority());
        assert!(UnorganizedReason::GenericName.priority() > UnorganizedReason::ShallowFolder.priority());
    }

    #[test]
    fn test_primary_reason() {
        let file = UnorganizedFile {
            path: "/test/photo.jpg".to_string(),
            filename: "photo.jpg".to_string(),
            size_bytes: 1000,
            file_type: "jpg".to_string(),
            reasons: vec![UnorganizedReason::NoDatePattern, UnorganizedReason::InRoot],
            folder_depth: 0,
            parent_folder: "/test".to_string(),
        };

        assert_eq!(file.primary_reason(), Some(&UnorganizedReason::InRoot));
    }
}
