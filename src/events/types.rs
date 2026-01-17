//! Event type definitions for progress reporting.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// All events emitted by the duplicate finder pipeline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Event {
    /// Scanning phase events
    Scan(ScanEvent),
    /// Hashing phase events
    Hash(HashEvent),
    /// Comparison phase events
    Compare(CompareEvent),
    /// Pipeline-level events
    Pipeline(PipelineEvent),
    /// File watcher events
    Watcher(WatcherEvent),
}

/// Events from the folder watcher
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WatcherEvent {
    /// Watcher started monitoring a folder
    Started { path: PathBuf },
    /// Watcher stopped monitoring a folder
    Stopped { path: PathBuf },
    /// A new photo was detected
    PhotoAdded { path: PathBuf },
    /// A photo was modified
    PhotoModified { path: PathBuf },
    /// A photo was removed
    PhotoRemoved { path: PathBuf },
    /// An error occurred
    Error { message: String },
}

/// Events during the scanning phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanEvent {
    /// Scanning has started
    Started { paths: Vec<PathBuf> },
    /// Progress update during scanning
    Progress(ScanProgress),
    /// A photo was found
    PhotoFound { path: PathBuf },
    /// An error occurred but scanning continues
    Error { path: PathBuf, message: String },
    /// Scanning completed
    Completed { total_photos: usize },
}

/// Progress information during scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    /// Number of directories scanned so far
    pub directories_scanned: usize,
    /// Number of photos found so far
    pub photos_found: usize,
    /// Current directory being scanned
    pub current_path: PathBuf,
}

/// Events during the hashing phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HashEvent {
    /// Hashing has started
    Started { total_photos: usize },
    /// Progress update during hashing
    Progress(HashProgress),
    /// A photo was successfully hashed
    PhotoHashed { path: PathBuf },
    /// A photo was loaded from cache (no rehashing needed)
    CacheHit { path: PathBuf },
    /// An error occurred but hashing continues
    Error { path: PathBuf, message: String },
    /// Hashing completed
    Completed {
        total_hashed: usize,
        cache_hits: usize,
    },
}

/// Progress information during hashing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HashProgress {
    /// Number of photos hashed so far
    pub completed: usize,
    /// Total number of photos to hash
    pub total: usize,
    /// Current photo being hashed
    pub current_path: PathBuf,
    /// Number of cache hits
    pub cache_hits: usize,
}

/// Events during the comparison phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CompareEvent {
    /// Comparison has started
    Started { total_photos: usize },
    /// Progress update during comparison
    Progress(CompareProgress),
    /// A duplicate group was found
    DuplicateFound {
        group_id: String,
        photo_count: usize,
    },
    /// Comparison completed
    Completed {
        total_groups: usize,
        total_duplicates: usize,
    },
}

/// Progress information during comparison
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareProgress {
    /// Number of comparisons completed
    pub comparisons_completed: usize,
    /// Total number of comparisons needed
    pub total_comparisons: usize,
    /// Number of duplicate groups found so far
    pub groups_found: usize,
}

/// Pipeline-level events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PipelineEvent {
    /// Pipeline has started
    Started,
    /// Moving to a new phase
    PhaseChanged { phase: PipelinePhase },
    /// Pipeline completed successfully
    Completed { summary: PipelineSummary },
    /// Pipeline was cancelled
    Cancelled,
    /// Pipeline encountered a fatal error
    Error { message: String },
}

/// Phases of the pipeline
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PipelinePhase {
    Scanning,
    Hashing,
    Comparing,
    Reporting,
}

/// Summary of pipeline results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineSummary {
    /// Total photos scanned
    pub total_photos: usize,
    /// Number of duplicate groups found
    pub duplicate_groups: usize,
    /// Total number of duplicate photos (excluding originals)
    pub duplicate_count: usize,
    /// Potential space savings in bytes
    pub potential_savings_bytes: u64,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

impl std::fmt::Display for PipelinePhase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PipelinePhase::Scanning => write!(f, "Scanning"),
            PipelinePhase::Hashing => write!(f, "Hashing"),
            PipelinePhase::Comparing => write!(f, "Comparing"),
            PipelinePhase::Reporting => write!(f, "Reporting"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_serializable() {
        let event = Event::Scan(ScanEvent::Progress(ScanProgress {
            directories_scanned: 10,
            photos_found: 50,
            current_path: PathBuf::from("/photos"),
        }));

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: Event = serde_json::from_str(&json).unwrap();

        match deserialized {
            Event::Scan(ScanEvent::Progress(p)) => {
                assert_eq!(p.photos_found, 50);
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn pipeline_summary_is_serializable() {
        let summary = PipelineSummary {
            total_photos: 1000,
            duplicate_groups: 50,
            duplicate_count: 150,
            potential_savings_bytes: 500_000_000,
            duration_ms: 5000,
        };

        let json = serde_json::to_string(&summary).unwrap();
        assert!(json.contains("500000000"));
    }
}
