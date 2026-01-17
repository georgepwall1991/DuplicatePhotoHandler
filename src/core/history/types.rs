//! Types for scan history storage.

use serde::{Deserialize, Serialize};

/// Type of scan module
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModuleType {
    Duplicates,
    Screenshots,
    Similar,
    LargeFiles,
    Unorganized,
}

impl ModuleType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Duplicates => "duplicates",
            Self::Screenshots => "screenshots",
            Self::Similar => "similar",
            Self::LargeFiles => "large_files",
            Self::Unorganized => "unorganized",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "duplicates" => Some(Self::Duplicates),
            "screenshots" => Some(Self::Screenshots),
            "similar" => Some(Self::Similar),
            "large_files" => Some(Self::LargeFiles),
            "unorganized" => Some(Self::Unorganized),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Duplicates => "Duplicates",
            Self::Screenshots => "Screenshots",
            Self::Similar => "Similar Photos",
            Self::LargeFiles => "Large Files",
            Self::Unorganized => "Unorganized",
        }
    }
}

/// Status of a scan
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Completed,
    Cancelled,
    Error(String),
}

impl ScanStatus {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Error(_) => "error",
        }
    }

    pub fn from_str(s: &str, error_msg: Option<&str>) -> Self {
        match s {
            "completed" => Self::Completed,
            "cancelled" => Self::Cancelled,
            "error" => Self::Error(error_msg.unwrap_or("Unknown error").to_string()),
            _ => Self::Error(format!("Unknown status: {}", s)),
        }
    }
}

/// A scan history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanHistoryEntry {
    pub id: String,
    pub module_type: ModuleType,
    /// Unix timestamp in seconds
    pub scan_time: i64,
    pub paths: Vec<String>,
    /// JSON-serialized settings
    pub settings: String,
    pub total_files: usize,
    pub groups_found: Option<usize>,
    pub duplicates_found: Option<usize>,
    pub potential_savings: Option<u64>,
    pub duration_ms: u64,
    pub status: ScanStatus,
}

/// Result of listing scan history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanHistoryResult {
    pub entries: Vec<ScanHistoryEntry>,
    pub total_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_type_roundtrip() {
        let module = ModuleType::Similar;
        let s = module.as_str();
        let parsed = ModuleType::from_str(s);
        assert_eq!(parsed, Some(module));
    }

    #[test]
    fn test_scan_status_roundtrip() {
        let status = ScanStatus::Completed;
        assert_eq!(status.as_str(), "completed");

        let status = ScanStatus::Error("test error".to_string());
        assert_eq!(status.as_str(), "error");
    }
}
