//! Types for the organize module.

use serde::{Deserialize, Serialize};

/// Folder structure options for organization
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FolderStructure {
    /// Year/Month (e.g., 2024/01 - January/)
    #[default]
    YearMonth,
    /// Year/Month/Day (e.g., 2024/01/15/)
    YearMonthDay,
    /// Flat Year-Month (e.g., 2024-01/)
    YearMonthFlat,
}

/// Operation mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperationMode {
    /// Copy files to destination (keep originals)
    #[default]
    Copy,
    /// Move files to destination
    Move,
}

/// Configuration for organize operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizeConfig {
    pub source_paths: Vec<String>,
    pub destination: String,
    pub structure: FolderStructure,
    pub operation: OperationMode,
}

/// Information about a file to be organized
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedFile {
    pub source: String,
    pub destination: String,
    pub filename: String,
    pub date: Option<String>, // ISO date string
    pub size_bytes: u64,
    pub has_conflict: bool,
}

/// Conflict information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub source: String,
    pub destination: String,
    pub resolution: String, // "rename" or "skip"
}

/// Summary of files by year
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YearSummary {
    pub year: u32,
    pub count: usize,
    pub size_bytes: u64,
}

/// The organization plan (preview)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizePlan {
    pub id: String,
    pub files: Vec<PlannedFile>,
    pub total_files: usize,
    pub total_size_bytes: u64,
    pub date_range: Option<(String, String)>, // (earliest, latest)
    pub by_year: Vec<YearSummary>,
    pub no_date_count: usize,
    pub conflict_count: usize,
}

/// Result of executing the plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizeResult {
    pub files_processed: usize,
    pub folders_created: usize,
    pub total_size_bytes: u64,
    pub duration_ms: u64,
    pub errors: Vec<String>,
}
