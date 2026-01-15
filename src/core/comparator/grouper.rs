//! Groups duplicate photos into clusters using transitive relationships.
//!
//! If A matches B and B matches C, then {A, B, C} forms a single group
//! even if A doesn't directly match C.

use super::{DuplicateGroup, MatchResult, MatchType};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// Groups photos into duplicate clusters using transitive relationships
pub struct TransitiveGrouper;

impl TransitiveGrouper {
    /// Create a new transitive grouper
    pub fn new() -> Self {
        Self
    }

    /// Group match results into duplicate clusters
    ///
    /// Uses union-find to efficiently group photos transitively.
    pub fn group(&self, matches: &[MatchResult]) -> Vec<DuplicateGroup> {
        if matches.is_empty() {
            return Vec::new();
        }

        // Collect all unique photos
        let mut photos: HashSet<PathBuf> = HashSet::new();
        for m in matches {
            photos.insert(m.photo_a.clone());
            photos.insert(m.photo_b.clone());
        }

        // Create union-find structure
        let mut parent: HashMap<PathBuf, PathBuf> = HashMap::new();
        for photo in &photos {
            parent.insert(photo.clone(), photo.clone());
        }

        // Find root with path compression
        fn find(parent: &mut HashMap<PathBuf, PathBuf>, x: &PathBuf) -> PathBuf {
            let p = parent.get(x).unwrap().clone();
            if &p != x {
                let root = find(parent, &p);
                parent.insert(x.clone(), root.clone());
                root
            } else {
                x.clone()
            }
        }

        // Union two sets
        fn union(parent: &mut HashMap<PathBuf, PathBuf>, a: &PathBuf, b: &PathBuf) {
            let root_a = find(parent, a);
            let root_b = find(parent, b);
            if root_a != root_b {
                parent.insert(root_a, root_b);
            }
        }

        // Union all matching pairs
        for m in matches {
            union(&mut parent, &m.photo_a, &m.photo_b);
        }

        // Group photos by their root
        let mut groups: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
        for photo in &photos {
            let root = find(&mut parent, photo);
            groups.entry(root).or_default().push(photo.clone());
        }

        // Build match info for each group
        let mut match_info: HashMap<PathBuf, (f64, MatchType)> = HashMap::new();
        for m in matches {
            let root = find(&mut parent, &m.photo_a);
            let entry = match_info.entry(root).or_insert((0.0, MatchType::MaybeSimilar));

            // Track worst (highest) match type and running average distance
            entry.0 += m.distance as f64;
            if (m.match_type as u8) < (entry.1 as u8) {
                entry.1 = m.match_type;
            }
        }

        // Convert to DuplicateGroups
        let mut result = Vec::new();
        for (root, mut group_photos) in groups {
            if group_photos.len() < 2 {
                continue; // Not a duplicate group
            }

            // Sort by path for deterministic ordering
            group_photos.sort();

            // Get match info
            let (total_distance, match_type) = match_info
                .get(&root)
                .copied()
                .unwrap_or((0.0, MatchType::Similar));

            let match_count = matches
                .iter()
                .filter(|m| find(&mut parent.clone(), &m.photo_a) == root)
                .count();

            let avg_distance = if match_count > 0 {
                total_distance / match_count as f64
            } else {
                0.0
            };

            // Select representative (first one for now, could be improved)
            let representative = group_photos[0].clone();

            let mut group = DuplicateGroup::new(group_photos, representative, match_type);
            group.average_distance = avg_distance;

            result.push(group);
        }

        result
    }
}

impl Default for TransitiveGrouper {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_match(a: &str, b: &str, distance: u32) -> MatchResult {
        MatchResult {
            photo_a: PathBuf::from(a),
            photo_b: PathBuf::from(b),
            distance,
            similarity_percent: 100.0 - (distance as f64 * 1.5625),
            match_type: MatchType::from_distance(distance),
        }
    }

    #[test]
    fn empty_matches_returns_empty() {
        let grouper = TransitiveGrouper::new();
        let groups = grouper.group(&[]);
        assert!(groups.is_empty());
    }

    #[test]
    fn single_pair_creates_single_group() {
        let grouper = TransitiveGrouper::new();
        let matches = vec![create_match("/a.jpg", "/b.jpg", 0)];

        let groups = grouper.group(&matches);

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].photos.len(), 2);
    }

    #[test]
    fn transitive_grouping() {
        // A~B and B~C should create {A, B, C}
        let grouper = TransitiveGrouper::new();
        let matches = vec![
            create_match("/a.jpg", "/b.jpg", 2),
            create_match("/b.jpg", "/c.jpg", 3),
        ];

        let groups = grouper.group(&matches);

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].photos.len(), 3);
    }

    #[test]
    fn disjoint_pairs_create_separate_groups() {
        let grouper = TransitiveGrouper::new();
        let matches = vec![
            create_match("/a.jpg", "/b.jpg", 0),
            create_match("/c.jpg", "/d.jpg", 0),
        ];

        let groups = grouper.group(&matches);

        assert_eq!(groups.len(), 2);
        assert!(groups.iter().all(|g| g.photos.len() == 2));
    }

    #[test]
    fn group_has_representative() {
        let grouper = TransitiveGrouper::new();
        let matches = vec![create_match("/a.jpg", "/b.jpg", 0)];

        let groups = grouper.group(&matches);

        assert!(groups[0].photos.contains(&groups[0].representative));
    }

    #[test]
    fn group_tracks_match_type() {
        let grouper = TransitiveGrouper::new();
        let matches = vec![create_match("/a.jpg", "/b.jpg", 0)];

        let groups = grouper.group(&matches);

        assert_eq!(groups[0].match_type, MatchType::Exact);
    }

    #[test]
    fn duplicate_count_excludes_representative() {
        let grouper = TransitiveGrouper::new();
        let matches = vec![
            create_match("/a.jpg", "/b.jpg", 0),
            create_match("/b.jpg", "/c.jpg", 0),
        ];

        let groups = grouper.group(&matches);

        // 3 photos, 2 duplicates
        assert_eq!(groups[0].duplicate_count(), 2);
    }
}
