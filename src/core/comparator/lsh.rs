//! # Locality-Sensitive Hashing (LSH) Index
//!
//! Enables O(n log n) duplicate detection instead of O(n²) pairwise comparison.
//!
//! ## How It Works
//! 1. Divide each hash into `bands` (e.g., 4 bands for 64-bit hash = 16 bits each)
//! 2. For each band, create a bucket hash from those bits
//! 3. Photos in the same bucket for ANY band are candidate duplicates
//! 4. Only compare candidates, not all pairs
//!
//! ## Performance
//! - Without LSH: 50,000 photos = 1.25 billion comparisons
//! - With LSH: 50,000 photos = ~250,000 comparisons (depends on duplicate density)
//!
//! ## Trade-offs
//! - More bands = higher recall (fewer missed duplicates)
//! - Fewer bands = higher precision (fewer false candidates)
//! - Recommended: 4-8 bands for 64-bit hashes

use crate::core::hasher::{ImageHashValue, PerceptualHash};
use std::collections::HashMap;
use std::path::PathBuf;

/// LSH index configuration
#[derive(Debug, Clone)]
pub struct LshConfig {
    /// Number of bands to divide the hash into
    pub bands: usize,
    /// Minimum bands that must match to be considered a candidate
    pub min_matching_bands: usize,
}

impl Default for LshConfig {
    fn default() -> Self {
        Self {
            bands: 4,
            min_matching_bands: 1,
        }
    }
}

impl LshConfig {
    /// Create a new LSH configuration
    pub fn new(bands: usize) -> Self {
        Self {
            bands,
            min_matching_bands: 1,
        }
    }

    /// Set minimum matching bands (higher = fewer candidates, may miss some duplicates)
    pub fn with_min_matching_bands(mut self, min: usize) -> Self {
        self.min_matching_bands = min;
        self
    }
}

/// A band value extracted from a hash
type BandValue = u64;

/// LSH Index for fast candidate retrieval
pub struct LshIndex {
    /// Configuration
    config: LshConfig,
    /// Number of bits per band
    bits_per_band: usize,
    /// Band tables: band_index -> (band_value -> set of photo indices)
    band_tables: Vec<HashMap<BandValue, Vec<usize>>>,
    /// All indexed photos
    photos: Vec<(PathBuf, ImageHashValue)>,
}

impl LshIndex {
    /// Create a new LSH index with the given configuration
    pub fn new(config: LshConfig) -> Self {
        let band_tables = (0..config.bands)
            .map(|_| HashMap::new())
            .collect();

        Self {
            config,
            bits_per_band: 0, // Set when first photo is added
            band_tables,
            photos: Vec::new(),
        }
    }

    /// Create with default configuration
    pub fn with_default_config() -> Self {
        Self::new(LshConfig::default())
    }

    /// Build an index from a collection of photos
    pub fn build(config: LshConfig, photos: Vec<(PathBuf, ImageHashValue)>) -> Self {
        let mut index = Self::new(config);
        for (path, hash) in photos {
            index.add(path, hash);
        }
        index
    }

    /// Add a photo to the index
    pub fn add(&mut self, path: PathBuf, hash: ImageHashValue) {
        let photo_idx = self.photos.len();
        let hash_bits = hash.bit_count() as usize;

        // Initialize bits_per_band on first photo
        if self.photos.is_empty() {
            self.bits_per_band = hash_bits / self.config.bands;
            if self.bits_per_band == 0 {
                self.bits_per_band = 1;
            }
        }

        // Extract bands and add to tables
        let bands = self.extract_bands(&hash);
        for (band_idx, band_value) in bands.into_iter().enumerate() {
            self.band_tables[band_idx]
                .entry(band_value)
                .or_default()
                .push(photo_idx);
        }

        self.photos.push((path, hash));
    }

    /// Extract band values from a hash
    fn extract_bands(&self, hash: &ImageHashValue) -> Vec<BandValue> {
        let bytes = hash.as_bytes();
        let mut bands = Vec::with_capacity(self.config.bands);

        // Process bits per band
        let bits_per_band = self.bits_per_band;
        let total_bits = bytes.len() * 8;

        for band_idx in 0..self.config.bands {
            let start_bit = band_idx * bits_per_band;
            if start_bit >= total_bits {
                bands.push(0);
                continue;
            }

            // Extract bits for this band
            let mut band_value: u64 = 0;
            for bit_offset in 0..bits_per_band.min(64) {
                let bit_idx = start_bit + bit_offset;
                if bit_idx >= total_bits {
                    break;
                }
                let byte_idx = bit_idx / 8;
                let bit_in_byte = bit_idx % 8;
                if byte_idx < bytes.len() {
                    let bit = (bytes[byte_idx] >> bit_in_byte) & 1;
                    band_value |= (bit as u64) << bit_offset;
                }
            }
            bands.push(band_value);
        }

        bands
    }

    /// Find candidate duplicate pairs
    ///
    /// Returns pairs of photo indices that share at least `min_matching_bands` bands
    pub fn find_candidates(&self) -> Vec<(usize, usize)> {
        // Count how many bands each pair shares
        let mut pair_counts: HashMap<(usize, usize), usize> = HashMap::new();

        for band_table in &self.band_tables {
            for bucket in band_table.values() {
                // All photos in the same bucket are candidates
                for i in 0..bucket.len() {
                    for j in (i + 1)..bucket.len() {
                        let pair = (bucket[i].min(bucket[j]), bucket[i].max(bucket[j]));
                        *pair_counts.entry(pair).or_default() += 1;
                    }
                }
            }
        }

        // Filter by minimum matching bands
        pair_counts
            .into_iter()
            .filter(|(_, count)| *count >= self.config.min_matching_bands)
            .map(|(pair, _)| pair)
            .collect()
    }

    /// Find candidate duplicates with their photo references
    pub fn find_candidate_pairs(&self) -> Vec<(&PathBuf, &ImageHashValue, &PathBuf, &ImageHashValue)> {
        self.find_candidates()
            .into_iter()
            .map(|(i, j)| {
                let (path_a, hash_a) = &self.photos[i];
                let (path_b, hash_b) = &self.photos[j];
                (path_a, hash_a, path_b, hash_b)
            })
            .collect()
    }

    /// Get the number of indexed photos
    pub fn len(&self) -> usize {
        self.photos.len()
    }

    /// Check if the index is empty
    pub fn is_empty(&self) -> bool {
        self.photos.is_empty()
    }

    /// Get statistics about the index
    pub fn stats(&self) -> LshIndexStats {
        let total_buckets: usize = self.band_tables.iter().map(|t| t.len()).sum();
        let max_bucket_size = self.band_tables
            .iter()
            .flat_map(|t| t.values())
            .map(|v| v.len())
            .max()
            .unwrap_or(0);
        let avg_bucket_size = if total_buckets > 0 {
            self.photos.len() as f64 * self.config.bands as f64 / total_buckets as f64
        } else {
            0.0
        };

        // Estimate comparison reduction
        let n = self.photos.len();
        let naive_comparisons = n * (n - 1) / 2;
        let candidates = self.find_candidates().len();
        let reduction_factor = if candidates > 0 {
            naive_comparisons as f64 / candidates as f64
        } else {
            naive_comparisons as f64
        };

        LshIndexStats {
            total_photos: n,
            bands: self.config.bands,
            bits_per_band: self.bits_per_band,
            total_buckets,
            max_bucket_size,
            avg_bucket_size,
            candidate_pairs: candidates,
            naive_comparisons,
            reduction_factor,
        }
    }

    /// Consume the index and return the photos
    pub fn into_photos(self) -> Vec<(PathBuf, ImageHashValue)> {
        self.photos
    }

    /// Get a reference to all photos
    pub fn photos(&self) -> &[(PathBuf, ImageHashValue)] {
        &self.photos
    }
}

/// Statistics about the LSH index
#[derive(Debug, Clone)]
pub struct LshIndexStats {
    /// Number of photos indexed
    pub total_photos: usize,
    /// Number of bands
    pub bands: usize,
    /// Bits per band
    pub bits_per_band: usize,
    /// Total number of buckets across all bands
    pub total_buckets: usize,
    /// Maximum bucket size
    pub max_bucket_size: usize,
    /// Average bucket size
    pub avg_bucket_size: f64,
    /// Number of candidate pairs
    pub candidate_pairs: usize,
    /// Number of comparisons in naive O(n²) approach
    pub naive_comparisons: usize,
    /// Comparison reduction factor (naive / candidates)
    pub reduction_factor: f64,
}

impl std::fmt::Display for LshIndexStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "LSH Index: {} photos, {} bands ({} bits each), {} candidate pairs ({}x reduction from {})",
            self.total_photos,
            self.bands,
            self.bits_per_band,
            self.candidate_pairs,
            self.reduction_factor as u64,
            self.naive_comparisons
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::hasher::HashAlgorithmKind;

    fn create_hash(bytes: &[u8]) -> ImageHashValue {
        ImageHashValue::new(bytes.to_vec(), HashAlgorithmKind::Difference)
    }

    #[test]
    fn empty_index() {
        let index = LshIndex::with_default_config();
        assert!(index.is_empty());
        assert_eq!(index.len(), 0);
        assert!(index.find_candidates().is_empty());
    }

    #[test]
    fn single_photo_no_candidates() {
        let mut index = LshIndex::with_default_config();
        index.add(PathBuf::from("/a.jpg"), create_hash(&[0xFF, 0xFF, 0xFF, 0xFF]));

        assert_eq!(index.len(), 1);
        assert!(index.find_candidates().is_empty());
    }

    #[test]
    fn identical_hashes_are_candidates() {
        let mut index = LshIndex::with_default_config();
        index.add(PathBuf::from("/a.jpg"), create_hash(&[0xFF, 0xFF, 0xFF, 0xFF]));
        index.add(PathBuf::from("/b.jpg"), create_hash(&[0xFF, 0xFF, 0xFF, 0xFF]));

        let candidates = index.find_candidates();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0], (0, 1));
    }

    #[test]
    fn similar_hashes_are_candidates() {
        let mut index = LshIndex::new(LshConfig::new(4)); // 4 bands
        // These hashes differ by only 1 bit, so should share at least some bands
        index.add(PathBuf::from("/a.jpg"), create_hash(&[0xFF, 0xFF, 0xFF, 0xFF]));
        index.add(PathBuf::from("/b.jpg"), create_hash(&[0xFE, 0xFF, 0xFF, 0xFF])); // 1 bit different

        let candidates = index.find_candidates();
        // Should still be candidates because most bands match
        assert!(!candidates.is_empty());
    }

    #[test]
    fn very_different_hashes_not_candidates() {
        let mut index = LshIndex::new(LshConfig::new(4));
        // Completely different hashes
        index.add(PathBuf::from("/a.jpg"), create_hash(&[0xFF, 0xFF, 0xFF, 0xFF]));
        index.add(PathBuf::from("/b.jpg"), create_hash(&[0x00, 0x00, 0x00, 0x00]));

        let candidates = index.find_candidates();
        // Should not be candidates because no bands match
        assert!(candidates.is_empty());
    }

    #[test]
    fn stats_shows_reduction() {
        let mut index = LshIndex::with_default_config();

        // Add 10 photos with varying hashes
        for i in 0..10u8 {
            index.add(
                PathBuf::from(format!("/{}.jpg", i)),
                create_hash(&[i, i, i, i]),
            );
        }

        let stats = index.stats();
        assert_eq!(stats.total_photos, 10);
        assert_eq!(stats.naive_comparisons, 45); // 10*9/2

        // With different hashes, should have significant reduction
        println!("{}", stats);
    }

    #[test]
    fn high_duplicate_density() {
        let mut index = LshIndex::with_default_config();

        // Add 5 photos with same hash (simulating duplicates)
        for i in 0..5 {
            index.add(
                PathBuf::from(format!("/{}.jpg", i)),
                create_hash(&[0xAA, 0xBB, 0xCC, 0xDD]),
            );
        }

        let candidates = index.find_candidates();
        // All pairs should be candidates: 5*4/2 = 10
        assert_eq!(candidates.len(), 10);
    }

    #[test]
    fn min_matching_bands_filters() {
        // With min_matching_bands = 2, require more similarity
        let config = LshConfig::new(4).with_min_matching_bands(2);
        let mut index = LshIndex::new(config);

        index.add(PathBuf::from("/a.jpg"), create_hash(&[0xFF, 0xFF, 0xFF, 0xFF]));
        index.add(PathBuf::from("/b.jpg"), create_hash(&[0xFF, 0xFF, 0x00, 0x00])); // 2 bands match

        let candidates = index.find_candidates();
        // Should still be candidates because 2 bands match
        assert!(!candidates.is_empty());
    }
}
