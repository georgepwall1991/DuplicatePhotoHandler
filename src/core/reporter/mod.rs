//! # Reporter Module
//!
//! Explains WHY photos are considered duplicates.
//!
//! This is the trust-building core - users need to understand
//! why the tool thinks two photos are duplicates before they
//! feel safe taking any action.
//!
//! ## Explanation Levels
//! 1. **Simple**: "These photos are 98% identical"
//! 2. **Comparative**: Resolution, file size, dates comparison
//! 3. **Technical**: Hash values, Hamming distance, bit differences

mod explanation;
mod visualization;

pub use explanation::{DuplicateExplanation, DetailedReporter};
pub use visualization::HashVisualizer;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::SystemTime;

/// Complete report for a duplicate group
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupReport {
    /// Unique identifier matching the group
    pub group_id: String,
    /// One-line summary for quick scanning
    pub summary: String,
    /// All photos in the group with metadata
    pub photos: Vec<PhotoInfo>,
    /// The recommended photo to keep
    pub recommended_keep: PathBuf,
    /// Why we recommend keeping this one
    pub keep_reason: KeepReason,
    /// Detailed explanation of why these are duplicates
    pub explanation: DuplicateExplanation,
}

/// Metadata about a photo
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoInfo {
    /// Path to the photo
    pub path: PathBuf,
    /// Image dimensions (width, height)
    pub dimensions: Option<(u32, u32)>,
    /// File size in bytes
    pub file_size: u64,
    /// Image format
    pub format: String,
    /// File creation time (if available)
    pub created: Option<SystemTime>,
    /// File modification time
    pub modified: SystemTime,
}

/// Reason for recommending a specific photo to keep
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum KeepReason {
    /// Has the highest resolution
    HighestResolution,
    /// Largest file size (usually means less compression)
    LargestFileSize,
    /// Original format (e.g., RAW over JPEG)
    OriginalFormat,
    /// Oldest timestamp (likely the original)
    OldestTimestamp,
    /// Has the most complete metadata
    BestMetadata,
    /// First alphabetically (fallback)
    FirstAlphabetically,
}

impl std::fmt::Display for KeepReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeepReason::HighestResolution => write!(f, "Highest resolution"),
            KeepReason::LargestFileSize => write!(f, "Largest file size (best quality)"),
            KeepReason::OriginalFormat => write!(f, "Original format"),
            KeepReason::OldestTimestamp => write!(f, "Oldest file (likely original)"),
            KeepReason::BestMetadata => write!(f, "Most complete metadata"),
            KeepReason::FirstAlphabetically => write!(f, "First alphabetically"),
        }
    }
}

/// Select the best photo to keep from a group
pub fn select_representative(photos: &[PhotoInfo]) -> (PathBuf, KeepReason) {
    if photos.is_empty() {
        panic!("Cannot select from empty photo list");
    }

    // Strategy: Prefer highest resolution, then largest file size, then oldest

    // Find highest resolution
    let max_resolution = photos
        .iter()
        .filter_map(|p| p.dimensions.map(|(w, h)| (w as u64 * h as u64, p)))
        .max_by_key(|(res, _)| *res);

    if let Some((max_res, _)) = max_resolution {
        // If there's a clear winner by resolution
        let high_res: Vec<_> = photos
            .iter()
            .filter(|p| {
                p.dimensions
                    .map(|(w, h)| w as u64 * h as u64 == max_res)
                    .unwrap_or(false)
            })
            .collect();

        if high_res.len() == 1 {
            return (high_res[0].path.clone(), KeepReason::HighestResolution);
        }
    }

    // Fall back to largest file size
    let largest = photos.iter().max_by_key(|p| p.file_size);
    if let Some(photo) = largest {
        // Check if it's clearly larger
        let second_largest = photos
            .iter()
            .filter(|p| p.path != photo.path)
            .max_by_key(|p| p.file_size);

        if let Some(second) = second_largest {
            if photo.file_size > second.file_size * 110 / 100 {
                // 10% larger
                return (photo.path.clone(), KeepReason::LargestFileSize);
            }
        } else {
            return (photo.path.clone(), KeepReason::LargestFileSize);
        }
    }

    // Fall back to oldest timestamp
    let oldest = photos
        .iter()
        .filter_map(|p| p.created.or(Some(p.modified)).map(|t| (t, p)))
        .min_by_key(|(t, _)| *t);

    if let Some((_, photo)) = oldest {
        return (photo.path.clone(), KeepReason::OldestTimestamp);
    }

    // Final fallback: first alphabetically
    let first = photos.iter().min_by(|a, b| a.path.cmp(&b.path)).unwrap();
    (first.path.clone(), KeepReason::FirstAlphabetically)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_photo_info(path: &str, size: u64, dims: Option<(u32, u32)>) -> PhotoInfo {
        PhotoInfo {
            path: PathBuf::from(path),
            dimensions: dims,
            file_size: size,
            format: "JPEG".to_string(),
            created: None,
            modified: SystemTime::now(),
        }
    }

    #[test]
    fn select_prefers_highest_resolution() {
        let photos = vec![
            create_photo_info("/small.jpg", 1000, Some((800, 600))),
            create_photo_info("/large.jpg", 900, Some((1920, 1080))),
        ];

        let (path, reason) = select_representative(&photos);

        assert_eq!(path, PathBuf::from("/large.jpg"));
        assert_eq!(reason, KeepReason::HighestResolution);
    }

    #[test]
    fn select_falls_back_to_file_size() {
        let photos = vec![
            create_photo_info("/small.jpg", 1000, Some((800, 600))),
            create_photo_info("/large.jpg", 5000, Some((800, 600))), // Same resolution
        ];

        let (path, reason) = select_representative(&photos);

        assert_eq!(path, PathBuf::from("/large.jpg"));
        assert_eq!(reason, KeepReason::LargestFileSize);
    }

    #[test]
    fn keep_reason_display() {
        assert!(KeepReason::HighestResolution.to_string().contains("resolution"));
        assert!(KeepReason::LargestFileSize.to_string().contains("quality"));
    }
}
