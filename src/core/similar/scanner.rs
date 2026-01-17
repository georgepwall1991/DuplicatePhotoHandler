//! Scanner for finding similar (not exact duplicate) photos.

use super::types::*;
use crate::core::comparator::{find_duplicate_pairs, MatchType, ThresholdStrategy, TransitiveGrouper};
use crate::core::hasher::{HashAlgorithmKind, HasherConfig, ImageHashValue, PerceptualHash};
use crate::core::scanner::{PhotoScanner, ScanConfig, WalkDirScanner};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use rayon::prelude::*;
use uuid::Uuid;

/// Scanner for finding similar photos
pub struct SimilarScanner;


impl SimilarScanner {
    /// Scan for similar photos with progress callback
    ///
    /// The callback receives: (phase, current, total)
    pub fn scan<F>(config: &SimilarConfig, mut on_progress: F) -> Result<SimilarResult, String>
    where
        F: FnMut(&str, usize, usize),
    {
        let start = Instant::now();

        // Phase 1: Scan for photos
        on_progress("Scanning", 0, 0);
        let paths: Vec<PathBuf> = config.source_paths.iter().map(PathBuf::from).collect();

        let scanner = WalkDirScanner::new(ScanConfig::default());
        let scan_result = scanner.scan(&paths).map_err(|e| e.to_string())?;

        let photos = scan_result.photos;
        let total_photos = photos.len();

        if photos.is_empty() {
            return Ok(SimilarResult {
                groups: Vec::new(),
                total_photos_scanned: 0,
                similar_groups_found: 0,
                similar_photos_found: 0,
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }

        on_progress("Scanning", total_photos, total_photos);

        // Phase 2: Hash photos
        on_progress("Hashing", 0, total_photos);

        let algorithm = match config.algorithm.as_deref() {
            Some("average") => HashAlgorithmKind::Average,
            Some("perceptual") => HashAlgorithmKind::Perceptual,
            Some("fusion") => HashAlgorithmKind::Fusion,
            _ => HashAlgorithmKind::Perceptual, // Default to perceptual for similar detection
        };

        let hasher = HasherConfig::new()
            .algorithm(algorithm)
            .build()
            .map_err(|e| e.to_string())?;

        let completed = Arc::new(AtomicUsize::new(0));
        let completed_clone = completed.clone();

        let hashes: Vec<(PathBuf, ImageHashValue)> = photos
            .par_iter()
            .filter_map(|photo| {
                let result = hasher.hash_file(&photo.path).ok()?;
                let _current = completed_clone.fetch_add(1, Ordering::Relaxed) + 1;
                // Progress is updated but callback can't be easily called from par_iter
                Some((photo.path.clone(), result))
            })
            .collect();

        on_progress("Hashing", hashes.len(), total_photos);

        if hashes.is_empty() {
            return Ok(SimilarResult {
                groups: Vec::new(),
                total_photos_scanned: total_photos,
                similar_groups_found: 0,
                similar_photos_found: 0,
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }

        // Phase 3: Compare photos using the max threshold to find all potential matches
        on_progress("Comparing", 0, hashes.len());

        // Use max_distance as threshold to find all potential matches
        let strategy = ThresholdStrategy::new(config.max_distance);
        let all_matches = find_duplicate_pairs(&hashes, &strategy);

        // Filter to only include matches within the min/max range
        let similar_matches: Vec<_> = all_matches
            .into_iter()
            .filter(|m| m.distance >= config.min_distance && m.distance <= config.max_distance)
            .collect();

        on_progress("Comparing", hashes.len(), hashes.len());

        if similar_matches.is_empty() {
            return Ok(SimilarResult {
                groups: Vec::new(),
                total_photos_scanned: total_photos,
                similar_groups_found: 0,
                similar_photos_found: 0,
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }

        // Phase 4: Group similar photos
        on_progress("Grouping", 0, similar_matches.len());

        let grouper = TransitiveGrouper::new();
        let duplicate_groups = grouper.group(&similar_matches);

        // Build photo size map for metadata
        let photo_sizes: HashMap<_, _> = photos
            .iter()
            .map(|p| (p.path.clone(), p.size))
            .collect();

        // Build hash map for similarity calculation
        let hash_map: HashMap<_, _> = hashes.into_iter().collect();

        // Convert to SimilarGroup format
        let groups: Vec<SimilarGroup> = duplicate_groups
            .into_iter()
            .map(|group| {
                let reference = group.representative.clone();
                let reference_size = photo_sizes.get(&reference).copied().unwrap_or(0);
                let reference_hash = hash_map.get(&reference);

                let similar_photos: Vec<SimilarPhoto> = group
                    .photos
                    .iter()
                    .filter(|p| *p != &reference)
                    .filter_map(|path| {
                        let size = photo_sizes.get(path).copied().unwrap_or(0);
                        let hash = hash_map.get(path)?;
                        let distance = reference_hash.map(|rh| rh.distance(hash)).unwrap_or(0);
                        let similarity = reference_hash.map(|rh| rh.similarity(hash)).unwrap_or(0.0);
                        let match_type = MatchType::from_distance(distance);

                        Some(SimilarPhoto {
                            path: path.display().to_string(),
                            distance,
                            similarity_percent: similarity,
                            match_type,
                            size_bytes: size,
                        })
                    })
                    .collect();

                let total_size = reference_size + similar_photos.iter().map(|p| p.size_bytes).sum::<u64>();
                let average_similarity = if similar_photos.is_empty() {
                    0.0
                } else {
                    similar_photos.iter().map(|p| p.similarity_percent).sum::<f64>() / similar_photos.len() as f64
                };

                SimilarGroup {
                    id: Uuid::new_v4().to_string(),
                    reference: reference.display().to_string(),
                    reference_size_bytes: reference_size,
                    similar_photos,
                    average_similarity,
                    total_size_bytes: total_size,
                }
            })
            .filter(|g| !g.similar_photos.is_empty()) // Only keep groups with similar photos
            .collect();

        on_progress("Grouping", groups.len(), groups.len());

        let similar_photos_found: usize = groups.iter().map(|g| g.similar_count()).sum();

        Ok(SimilarResult {
            similar_groups_found: groups.len(),
            similar_photos_found,
            groups,
            total_photos_scanned: total_photos,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_values() {
        let config = SimilarConfig::default();
        assert_eq!(config.min_distance, 5);
        assert_eq!(config.max_distance, 15);
    }

    #[test]
    fn test_scan_empty_paths() {
        let config = SimilarConfig {
            source_paths: vec![],
            ..Default::default()
        };

        let result = SimilarScanner::scan(&config, |_, _, _| {}).unwrap();
        assert_eq!(result.total_photos_scanned, 0);
        assert_eq!(result.similar_groups_found, 0);
    }

    #[test]
    fn test_scan_nonexistent_path() {
        let config = SimilarConfig {
            source_paths: vec!["/nonexistent/path".to_string()],
            ..Default::default()
        };

        // Scanner gracefully handles nonexistent paths (returns empty result)
        let result = SimilarScanner::scan(&config, |_, _, _| {});
        assert!(result.is_ok());
        assert_eq!(result.unwrap().total_photos_scanned, 0);
    }
}
