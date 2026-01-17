//! Types for similar photo detection.

use crate::core::comparator::MatchType;
use serde::{Deserialize, Serialize};

/// Configuration for similar photo scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarConfig {
    pub source_paths: Vec<String>,
    /// Minimum hamming distance to include (excludes exact matches)
    /// Default: 5 (excludes Exact and NearExact matches)
    pub min_distance: u32,
    /// Maximum hamming distance to include
    /// Default: 15 (includes Similar and MaybeSimilar)
    pub max_distance: u32,
    /// Hash algorithm to use
    pub algorithm: Option<String>,
}

impl Default for SimilarConfig {
    fn default() -> Self {
        Self {
            source_paths: Vec::new(),
            min_distance: 5,  // Start from Similar (excludes exact duplicates)
            max_distance: 15, // Include MaybeSimilar
            algorithm: None,
        }
    }
}

/// A photo similar to the reference
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarPhoto {
    pub path: String,
    pub distance: u32,
    pub similarity_percent: f64,
    pub match_type: MatchType,
    pub size_bytes: u64,
}

/// A group of similar photos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarGroup {
    pub id: String,
    /// The reference photo (others are compared to this)
    pub reference: String,
    pub reference_size_bytes: u64,
    /// Photos similar to the reference
    pub similar_photos: Vec<SimilarPhoto>,
    /// Average similarity percentage within the group
    pub average_similarity: f64,
    /// Total size of all photos in the group
    pub total_size_bytes: u64,
}

impl SimilarGroup {
    /// Get the count of similar photos (excluding reference)
    pub fn similar_count(&self) -> usize {
        self.similar_photos.len()
    }
}

/// Result of a similar photo scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarResult {
    pub groups: Vec<SimilarGroup>,
    pub total_photos_scanned: usize,
    pub similar_groups_found: usize,
    pub similar_photos_found: usize,
    pub duration_ms: u64,
}

/// Summary statistics by match type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct MatchTypeSummary {
    pub match_type: MatchType,
    pub count: usize,
    pub size_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SimilarConfig::default();
        assert_eq!(config.min_distance, 5);
        assert_eq!(config.max_distance, 15);
    }

    #[test]
    fn test_similar_group_count() {
        let group = SimilarGroup {
            id: "test".to_string(),
            reference: "/ref.jpg".to_string(),
            reference_size_bytes: 1000,
            similar_photos: vec![
                SimilarPhoto {
                    path: "/a.jpg".to_string(),
                    distance: 8,
                    similarity_percent: 87.5,
                    match_type: MatchType::Similar,
                    size_bytes: 900,
                },
                SimilarPhoto {
                    path: "/b.jpg".to_string(),
                    distance: 12,
                    similarity_percent: 81.25,
                    match_type: MatchType::MaybeSimilar,
                    size_bytes: 800,
                },
            ],
            average_similarity: 84.375,
            total_size_bytes: 2700,
        };

        assert_eq!(group.similar_count(), 2);
    }
}
