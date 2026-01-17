//! Groups duplicate photos into clusters using transitive relationships.
//!
//! # Algorithm
//!
//! Uses the Union-Find (Disjoint Set Union) algorithm to efficiently
//! group photos based on pairwise similarity matches.
//!
//! ## Transitive Grouping
//!
//! If A matches B and B matches C, then {A, B, C} forms a single group
//! even if A doesn't directly match C. This is because similarity is
//! transitive within a configurable threshold.
//!
//! ## Complexity
//!
//! - Time: O(n * α(n)) where α is the inverse Ackermann function (~constant)
//! - Space: O(n) for the parent map
//!
//! # Example
//!
//! ```text
//! Matches: (A,B), (B,C), (X,Y)
//! Result:  Group1{A,B,C}, Group2{X,Y}
//! ```

use super::{DuplicateGroup, MatchResult, MatchType};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

/// Union-Find data structure for grouping paths.
///
/// Uses path compression for near-constant time operations.
struct UnionFind {
    parent: HashMap<PathBuf, PathBuf>,
}

impl UnionFind {
    /// Create a new UnionFind with the given items
    fn new(items: impl IntoIterator<Item = PathBuf>) -> Self {
        let mut parent = HashMap::new();
        for item in items {
            parent.insert(item.clone(), item);
        }
        Self { parent }
    }

    /// Find the root of an item with path compression
    fn find(&mut self, x: &PathBuf) -> PathBuf {
        let p = self.parent.get(x).cloned().unwrap_or_else(|| x.clone());
        if &p != x {
            let root = self.find(&p);
            self.parent.insert(x.clone(), root.clone());
            root
        } else {
            x.clone()
        }
    }

    /// Union two sets, making them share the same root
    fn union(&mut self, a: &PathBuf, b: &PathBuf) {
        let root_a = self.find(a);
        let root_b = self.find(b);
        if root_a != root_b {
            self.parent.insert(root_a, root_b);
        }
    }

    /// Group all items by their root
    fn groups(&mut self) -> HashMap<PathBuf, Vec<PathBuf>> {
        let items: Vec<_> = self.parent.keys().cloned().collect();
        let mut groups: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
        for item in items {
            let root = self.find(&item);
            groups.entry(root).or_default().push(item);
        }
        groups
    }
}

/// Tracks aggregate match statistics for a group
#[derive(Clone)]
struct GroupStats {
    total_distance: f64,
    match_count: usize,
    best_match_type: MatchType,
}

impl GroupStats {
    fn new() -> Self {
        Self {
            total_distance: 0.0,
            match_count: 0,
            best_match_type: MatchType::MaybeSimilar,
        }
    }

    fn add_match(&mut self, distance: u32, match_type: MatchType) {
        self.total_distance += distance as f64;
        self.match_count += 1;
        // Keep the best (lowest ordinal = more exact) match type
        if (match_type as u8) < (self.best_match_type as u8) {
            self.best_match_type = match_type;
        }
    }

    fn average_distance(&self) -> f64 {
        if self.match_count > 0 {
            self.total_distance / self.match_count as f64
        } else {
            0.0
        }
    }
}

/// Groups photos into duplicate clusters using transitive relationships
pub struct TransitiveGrouper;

impl TransitiveGrouper {
    /// Create a new transitive grouper
    pub fn new() -> Self {
        Self
    }

    /// Collect all unique photos from matches
    fn collect_photos(matches: &[MatchResult]) -> HashSet<PathBuf> {
        let mut photos = HashSet::new();
        for m in matches {
            photos.insert(m.photo_a.clone());
            photos.insert(m.photo_b.clone());
        }
        photos
    }

    /// Build statistics for each group based on matches
    fn build_group_stats(
        matches: &[MatchResult],
        uf: &mut UnionFind,
    ) -> HashMap<PathBuf, GroupStats> {
        let mut stats: HashMap<PathBuf, GroupStats> = HashMap::new();
        for m in matches {
            let root = uf.find(&m.photo_a);
            stats
                .entry(root)
                .or_insert_with(GroupStats::new)
                .add_match(m.distance, m.match_type);
        }
        stats
    }

    /// Convert a grouped set of photos into a DuplicateGroup
    fn build_duplicate_group(
        mut photos: Vec<PathBuf>,
        stats: &GroupStats,
    ) -> DuplicateGroup {
        photos.sort(); // Deterministic ordering
        let representative = photos[0].clone();
        let mut group = DuplicateGroup::new(photos, representative, stats.best_match_type);
        group.average_distance = stats.average_distance();
        group
    }

    /// Group match results into duplicate clusters
    ///
    /// Uses union-find to efficiently group photos transitively.
    pub fn group(&self, matches: &[MatchResult]) -> Vec<DuplicateGroup> {
        if matches.is_empty() {
            return Vec::new();
        }

        // Build union-find structure from all photos
        let photos = Self::collect_photos(matches);
        let mut uf = UnionFind::new(photos);

        // Union all matching pairs
        for m in matches {
            uf.union(&m.photo_a, &m.photo_b);
        }

        // Get statistics for each group
        let stats = Self::build_group_stats(matches, &mut uf);

        // Convert to DuplicateGroups
        uf.groups()
            .into_iter()
            .filter(|(_, photos)| photos.len() >= 2)
            .map(|(root, photos)| {
                let group_stats = stats.get(&root).cloned().unwrap_or_else(GroupStats::new);
                Self::build_duplicate_group(photos, &group_stats)
            })
            .collect()
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

    #[test]
    fn union_find_basic_operations() {
        let a = PathBuf::from("/a.jpg");
        let b = PathBuf::from("/b.jpg");
        let c = PathBuf::from("/c.jpg");

        let mut uf = UnionFind::new(vec![a.clone(), b.clone(), c.clone()]);

        // Initially each element is its own parent
        assert_eq!(uf.find(&a), a);
        assert_eq!(uf.find(&b), b);

        // After union, they should have the same root
        uf.union(&a, &b);
        assert_eq!(uf.find(&a), uf.find(&b));

        // C is still separate
        assert_ne!(uf.find(&a), uf.find(&c));

        // Union A-C through transitivity (A already connected to B)
        uf.union(&b, &c);
        assert_eq!(uf.find(&a), uf.find(&c));
    }

    #[test]
    fn complex_transitive_chain() {
        // A~B, C~D, B~C should create one group {A, B, C, D}
        let grouper = TransitiveGrouper::new();
        let matches = vec![
            create_match("/a.jpg", "/b.jpg", 1),
            create_match("/c.jpg", "/d.jpg", 2),
            create_match("/b.jpg", "/c.jpg", 3), // Links the two pairs
        ];

        let groups = grouper.group(&matches);

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].photos.len(), 4);
    }

    #[test]
    fn best_match_type_is_preserved() {
        // When grouping photos with different match types, best should be preserved
        let grouper = TransitiveGrouper::new();
        let matches = vec![
            create_match("/a.jpg", "/b.jpg", 0),  // Exact
            create_match("/b.jpg", "/c.jpg", 10), // Similar
        ];

        let groups = grouper.group(&matches);

        // The group should have the "best" match type (Exact)
        assert_eq!(groups[0].match_type, MatchType::Exact);
    }

    #[test]
    fn large_group_handling() {
        // Test with a larger group to ensure no performance issues
        let grouper = TransitiveGrouper::new();
        let mut matches = Vec::new();

        // Create a chain: 1~2, 2~3, 3~4, ... 99~100
        for i in 1..100 {
            matches.push(create_match(
                &format!("/{}.jpg", i),
                &format!("/{}.jpg", i + 1),
                0,
            ));
        }

        let groups = grouper.group(&matches);

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].photos.len(), 100);
    }
}
