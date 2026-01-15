//! # Comparator Module
//!
//! Finds duplicates by comparing perceptual hashes.
//!
//! ## How It Works
//! 1. Compare all photo pairs using Hamming distance
//! 2. Apply comparison strategy to determine duplicates
//! 3. Group duplicates into clusters (transitive grouping)
//!
//! ## Comparison Thresholds
//! | Distance | Classification |
//! |----------|---------------|
//! | 0        | Exact match   |
//! | 1-4      | Near-exact    |
//! | 5-10     | Similar       |
//! | 11+      | Different     |

mod grouper;
mod traits;

pub use grouper::TransitiveGrouper;
pub use traits::{ComparisonStrategy, ThresholdStrategy};

use crate::core::hasher::{ImageHashValue, PerceptualHash};
use crate::events::{CompareEvent, CompareProgress, Event, EventSender};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// Result of comparing two photos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    /// Path to the first photo
    pub photo_a: PathBuf,
    /// Path to the second photo
    pub photo_b: PathBuf,
    /// Hamming distance between hashes
    pub distance: u32,
    /// Similarity as a percentage (0-100)
    pub similarity_percent: f64,
    /// Classification of the match
    pub match_type: MatchType,
}

/// Classification of match types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MatchType {
    /// Distance = 0, identical perceptual content
    Exact,
    /// Distance 1-4, virtually identical
    NearExact,
    /// Distance 5-10, likely duplicates
    Similar,
    /// Distance 11-15, possibly related
    MaybeSimilar,
}

impl MatchType {
    /// Classify based on Hamming distance
    pub fn from_distance(distance: u32) -> Self {
        match distance {
            0 => MatchType::Exact,
            1..=4 => MatchType::NearExact,
            5..=10 => MatchType::Similar,
            _ => MatchType::MaybeSimilar,
        }
    }

    /// Check if this match type is considered a duplicate
    pub fn is_duplicate(&self) -> bool {
        matches!(self, MatchType::Exact | MatchType::NearExact | MatchType::Similar)
    }
}

impl std::fmt::Display for MatchType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MatchType::Exact => write!(f, "Exact Match"),
            MatchType::NearExact => write!(f, "Near-Exact Match"),
            MatchType::Similar => write!(f, "Similar"),
            MatchType::MaybeSimilar => write!(f, "Possibly Similar"),
        }
    }
}

/// A group of duplicate photos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    /// Unique identifier for this group
    pub id: Uuid,
    /// All photos in the group
    pub photos: Vec<PathBuf>,
    /// The recommended photo to keep (usually highest quality)
    pub representative: PathBuf,
    /// The type of match for this group
    pub match_type: MatchType,
    /// Average distance within the group
    pub average_distance: f64,
    /// Total file size of duplicates (excluding representative)
    pub duplicate_size_bytes: u64,
}

impl DuplicateGroup {
    /// Create a new duplicate group
    pub fn new(photos: Vec<PathBuf>, representative: PathBuf, match_type: MatchType) -> Self {
        Self {
            id: Uuid::new_v4(),
            photos,
            representative,
            match_type,
            average_distance: 0.0,
            duplicate_size_bytes: 0,
        }
    }

    /// Get the number of duplicates (excluding the representative)
    pub fn duplicate_count(&self) -> usize {
        self.photos.len().saturating_sub(1)
    }
}

/// Find all duplicate pairs from a collection of hashes
pub fn find_duplicate_pairs(
    photos: &[(PathBuf, ImageHashValue)],
    strategy: &dyn ComparisonStrategy,
) -> Vec<MatchResult> {
    let mut matches = Vec::new();

    // Compare all pairs
    for i in 0..photos.len() {
        for j in (i + 1)..photos.len() {
            let (path_a, hash_a) = &photos[i];
            let (path_b, hash_b) = &photos[j];

            let distance = hash_a.distance(hash_b);

            if strategy.is_duplicate(distance) {
                let similarity = hash_a.similarity(hash_b);
                let match_type = strategy.classify(distance);

                matches.push(MatchResult {
                    photo_a: path_a.clone(),
                    photo_b: path_b.clone(),
                    distance,
                    similarity_percent: similarity,
                    match_type,
                });
            }
        }
    }

    matches
}

/// Find all duplicate pairs with progress events
///
/// Emits progress events every ~1000 comparisons to update the UI.
pub fn find_duplicate_pairs_with_events(
    photos: &[(PathBuf, ImageHashValue)],
    strategy: &dyn ComparisonStrategy,
    events: &EventSender,
) -> Vec<MatchResult> {
    let n = photos.len();
    let total_comparisons = n.saturating_sub(1) * n / 2;

    // Emit started event
    events.send(Event::Compare(CompareEvent::Started { total_photos: n }));

    let mut matches = Vec::new();
    let mut comparisons_completed = 0;
    let mut last_progress_update = 0;

    // Progress update interval (every 1000 comparisons or 2% of total, whichever is smaller)
    let update_interval = std::cmp::min(1000, std::cmp::max(1, total_comparisons / 50));

    // Compare all pairs
    for i in 0..n {
        for j in (i + 1)..n {
            let (path_a, hash_a) = &photos[i];
            let (path_b, hash_b) = &photos[j];

            let distance = hash_a.distance(hash_b);

            if strategy.is_duplicate(distance) {
                let similarity = hash_a.similarity(hash_b);
                let match_type = strategy.classify(distance);

                matches.push(MatchResult {
                    photo_a: path_a.clone(),
                    photo_b: path_b.clone(),
                    distance,
                    similarity_percent: similarity,
                    match_type,
                });
            }

            comparisons_completed += 1;

            // Emit progress update at intervals
            if comparisons_completed - last_progress_update >= update_interval {
                events.send(Event::Compare(CompareEvent::Progress(CompareProgress {
                    comparisons_completed,
                    total_comparisons,
                    groups_found: 0, // Groups are calculated after all comparisons
                })));
                last_progress_update = comparisons_completed;
            }
        }
    }

    // Emit completed event
    events.send(Event::Compare(CompareEvent::Completed {
        total_groups: 0, // Will be updated by grouper
        total_duplicates: matches.len(),
    }));

    matches
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::hasher::HashAlgorithmKind;

    #[test]
    fn match_type_from_distance() {
        assert_eq!(MatchType::from_distance(0), MatchType::Exact);
        assert_eq!(MatchType::from_distance(3), MatchType::NearExact);
        assert_eq!(MatchType::from_distance(7), MatchType::Similar);
        assert_eq!(MatchType::from_distance(15), MatchType::MaybeSimilar);
    }

    #[test]
    fn match_type_is_duplicate() {
        assert!(MatchType::Exact.is_duplicate());
        assert!(MatchType::NearExact.is_duplicate());
        assert!(MatchType::Similar.is_duplicate());
        assert!(!MatchType::MaybeSimilar.is_duplicate());
    }

    #[test]
    fn find_duplicate_pairs_empty_input() {
        let strategy = ThresholdStrategy::new(10);
        let pairs = find_duplicate_pairs(&[], &strategy);
        assert!(pairs.is_empty());
    }

    #[test]
    fn find_duplicate_pairs_single_photo() {
        let strategy = ThresholdStrategy::new(10);
        let photos = vec![(
            PathBuf::from("/photo.jpg"),
            ImageHashValue::new(vec![0xFF], HashAlgorithmKind::Difference),
        )];
        let pairs = find_duplicate_pairs(&photos, &strategy);
        assert!(pairs.is_empty());
    }

    #[test]
    fn find_duplicate_pairs_finds_matches() {
        let strategy = ThresholdStrategy::new(5); // Stricter threshold
        let photos = vec![
            (
                PathBuf::from("/a.jpg"),
                ImageHashValue::new(vec![0xFF], HashAlgorithmKind::Difference),
            ),
            (
                PathBuf::from("/b.jpg"),
                ImageHashValue::new(vec![0xFF], HashAlgorithmKind::Difference), // Same hash
            ),
            (
                PathBuf::from("/c.jpg"),
                ImageHashValue::new(vec![0x00], HashAlgorithmKind::Difference), // Different (8 bits away)
            ),
        ];

        let pairs = find_duplicate_pairs(&photos, &strategy);

        // Only a-b should match (distance 0), a-c and b-c are 8 bits apart (> threshold of 5)
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].distance, 0);
        assert_eq!(pairs[0].match_type, MatchType::Exact);
    }

    #[test]
    fn find_duplicate_pairs_with_events_emits_progress() {
        use crate::events::EventChannel;

        let (sender, receiver) = EventChannel::new();
        let strategy = ThresholdStrategy::new(10);

        // Create enough photos to trigger progress events
        let photos: Vec<_> = (0..50)
            .map(|i| {
                (
                    PathBuf::from(format!("/{}.jpg", i)),
                    ImageHashValue::new(vec![i as u8], HashAlgorithmKind::Difference),
                )
            })
            .collect();

        let _ = find_duplicate_pairs_with_events(&photos, &strategy, &sender);

        // Drop sender so receiver can iterate
        drop(sender);

        // Collect all events
        let events: Vec<_> = receiver.iter().collect();

        // Should have at least Started and Completed events
        assert!(events.len() >= 2);

        // First event should be Started
        match &events[0] {
            Event::Compare(CompareEvent::Started { total_photos }) => {
                assert_eq!(*total_photos, 50);
            }
            _ => panic!("Expected Started event"),
        }

        // Last event should be Completed
        match events.last().unwrap() {
            Event::Compare(CompareEvent::Completed { .. }) => {}
            _ => panic!("Expected Completed event"),
        }
    }
}
