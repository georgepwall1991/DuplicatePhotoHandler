//! # Multi-Algorithm Fusion Hasher
//!
//! Combines aHash, dHash, and pHash for higher confidence duplicate detection.
//!
//! ## How It Works
//! 1. Compute all three hashes from a single image decode
//! 2. Compare using voting: a match requires 2+ algorithms to agree
//! 3. Confidence level based on how many algorithms agree
//!
//! ## Benefits
//! - Higher accuracy through consensus
//! - Reduces false positives (single algorithm quirks)
//! - Handles different types of edits better

use super::fast_decode::FastDecoder;
use super::traits::PerceptualHash;
use super::{AverageHasher, DifferenceHasher, HashAlgorithm, ImageHashValue, PerceptualHasher};
use crate::error::HashError;
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A fusion hash containing results from multiple algorithms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FusionHash {
    /// Average hash (aHash)
    pub ahash: ImageHashValue,
    /// Difference hash (dHash)
    pub dhash: ImageHashValue,
    /// Perceptual hash (pHash)
    pub phash: ImageHashValue,
}

impl FusionHash {
    /// Create a new fusion hash from individual hashes
    pub fn new(ahash: ImageHashValue, dhash: ImageHashValue, phash: ImageHashValue) -> Self {
        Self {
            ahash,
            dhash,
            phash,
        }
    }

    /// Compare two fusion hashes and return a detailed result
    pub fn compare(&self, other: &FusionHash, threshold: u32) -> FusionCompareResult {
        let ahash_dist = self.ahash.distance(&other.ahash);
        let dhash_dist = self.dhash.distance(&other.dhash);
        let phash_dist = self.phash.distance(&other.phash);

        let ahash_match = ahash_dist <= threshold;
        let dhash_match = dhash_dist <= threshold;
        let phash_match = phash_dist <= threshold;

        let votes = ahash_match as u8 + dhash_match as u8 + phash_match as u8;

        let confidence = match votes {
            3 => FusionConfidence::High,
            2 => FusionConfidence::Medium,
            1 => FusionConfidence::Low,
            0 => FusionConfidence::None,
            _ => unreachable!(),
        };

        // Use the minimum distance among matching algorithms for classification
        let min_distance = [
            if ahash_match { Some(ahash_dist) } else { None },
            if dhash_match { Some(dhash_dist) } else { None },
            if phash_match { Some(phash_dist) } else { None },
        ]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(u32::MAX);

        FusionCompareResult {
            ahash_distance: ahash_dist,
            dhash_distance: dhash_dist,
            phash_distance: phash_dist,
            votes,
            confidence,
            min_distance,
            is_duplicate: votes >= 2, // Require at least 2 algorithms to agree
        }
    }

    /// Quick check if this is a duplicate (requires 2+ algorithms to agree)
    pub fn is_duplicate_of(&self, other: &FusionHash, threshold: u32) -> bool {
        self.compare(other, threshold).is_duplicate
    }

    /// Get the combined hash bytes for caching
    /// Format: [ahash_len:2][ahash][dhash_len:2][dhash][phash_len:2][phash]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // aHash
        let ahash_bytes = self.ahash.as_bytes();
        bytes.extend_from_slice(&(ahash_bytes.len() as u16).to_le_bytes());
        bytes.extend_from_slice(ahash_bytes);

        // dHash
        let dhash_bytes = self.dhash.as_bytes();
        bytes.extend_from_slice(&(dhash_bytes.len() as u16).to_le_bytes());
        bytes.extend_from_slice(dhash_bytes);

        // pHash
        let phash_bytes = self.phash.as_bytes();
        bytes.extend_from_slice(&(phash_bytes.len() as u16).to_le_bytes());
        bytes.extend_from_slice(phash_bytes);

        bytes
    }

    /// Restore from cached bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        use super::HashAlgorithmKind;

        let mut offset = 0;

        // aHash
        if bytes.len() < offset + 2 {
            return None;
        }
        let ahash_len = u16::from_le_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        offset += 2;
        if bytes.len() < offset + ahash_len {
            return None;
        }
        let ahash = ImageHashValue::from_bytes(&bytes[offset..offset + ahash_len], HashAlgorithmKind::Average);
        offset += ahash_len;

        // dHash
        if bytes.len() < offset + 2 {
            return None;
        }
        let dhash_len = u16::from_le_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        offset += 2;
        if bytes.len() < offset + dhash_len {
            return None;
        }
        let dhash = ImageHashValue::from_bytes(&bytes[offset..offset + dhash_len], HashAlgorithmKind::Difference);
        offset += dhash_len;

        // pHash
        if bytes.len() < offset + 2 {
            return None;
        }
        let phash_len = u16::from_le_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        offset += 2;
        if bytes.len() < offset + phash_len {
            return None;
        }
        let phash = ImageHashValue::from_bytes(&bytes[offset..offset + phash_len], HashAlgorithmKind::Perceptual);

        Some(Self {
            ahash,
            dhash,
            phash,
        })
    }
}

/// Result of comparing two fusion hashes
#[derive(Debug, Clone)]
pub struct FusionCompareResult {
    /// Distance from aHash comparison
    pub ahash_distance: u32,
    /// Distance from dHash comparison
    pub dhash_distance: u32,
    /// Distance from pHash comparison
    pub phash_distance: u32,
    /// Number of algorithms that agree (0-3)
    pub votes: u8,
    /// Confidence level based on agreement
    pub confidence: FusionConfidence,
    /// Minimum distance among agreeing algorithms
    pub min_distance: u32,
    /// Whether this is considered a duplicate (2+ votes)
    pub is_duplicate: bool,
}

/// Confidence level based on algorithm agreement
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FusionConfidence {
    /// All three algorithms agree
    High,
    /// Two algorithms agree
    Medium,
    /// Only one algorithm matches (not considered a duplicate)
    Low,
    /// No algorithms match
    None,
}

impl std::fmt::Display for FusionConfidence {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FusionConfidence::High => write!(f, "High (3/3)"),
            FusionConfidence::Medium => write!(f, "Medium (2/3)"),
            FusionConfidence::Low => write!(f, "Low (1/3)"),
            FusionConfidence::None => write!(f, "No match"),
        }
    }
}

/// Computes fusion hashes using all three algorithms
pub struct FusionHasher {
    ahash: AverageHasher,
    dhash: DifferenceHasher,
    phash: PerceptualHasher,
}

impl FusionHasher {
    /// Create a new fusion hasher with default hash size (8)
    pub fn new() -> Self {
        Self::with_size(8)
    }

    /// Create a fusion hasher with a specific hash size
    pub fn with_size(size: u32) -> Self {
        Self {
            ahash: AverageHasher::new(size),
            dhash: DifferenceHasher::new(size),
            phash: PerceptualHasher::new(size),
        }
    }

    /// Compute fusion hash from a file
    pub fn hash_file(&self, path: &Path) -> Result<FusionHash, HashError> {
        let image = FastDecoder::decode(path)?;
        self.hash_image(&image)
    }

    /// Compute fusion hash from a loaded image
    pub fn hash_image(&self, image: &DynamicImage) -> Result<FusionHash, HashError> {
        // Compute all three hashes from the same image
        let ahash = self.ahash.hash_image(image)?;
        let dhash = self.dhash.hash_image(image)?;
        let phash = self.phash.hash_image(image)?;

        Ok(FusionHash::new(ahash, dhash, phash))
    }
}

impl Default for FusionHasher {
    fn default() -> Self {
        Self::new()
    }
}

impl HashAlgorithm for FusionHasher {
    fn hash_image(&self, image: &DynamicImage) -> Result<ImageHashValue, HashError> {
        let fusion = FusionHasher::hash_image(self, image)?;
        // Store fusion hash as combined bytes - can be decoded back to FusionHash
        Ok(ImageHashValue::new(
            fusion.to_bytes(),
            super::HashAlgorithmKind::Fusion,
        ))
    }

    fn kind(&self) -> super::HashAlgorithmKind {
        super::HashAlgorithmKind::Fusion
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::hasher::HashAlgorithmKind;

    fn create_fusion_hash(a: u8, d: u8, p: u8) -> FusionHash {
        FusionHash::new(
            ImageHashValue::new(vec![a], HashAlgorithmKind::Average),
            ImageHashValue::new(vec![d], HashAlgorithmKind::Difference),
            ImageHashValue::new(vec![p], HashAlgorithmKind::Perceptual),
        )
    }

    #[test]
    fn identical_hashes_have_high_confidence() {
        let hash1 = create_fusion_hash(0xFF, 0xFF, 0xFF);
        let hash2 = create_fusion_hash(0xFF, 0xFF, 0xFF);

        let result = hash1.compare(&hash2, 5);

        assert_eq!(result.votes, 3);
        assert_eq!(result.confidence, FusionConfidence::High);
        assert!(result.is_duplicate);
        assert_eq!(result.min_distance, 0);
    }

    #[test]
    fn two_matching_has_medium_confidence() {
        let hash1 = create_fusion_hash(0xFF, 0xFF, 0xFF);
        let hash2 = create_fusion_hash(0xFF, 0xFF, 0x00); // pHash differs by 8 bits

        let result = hash1.compare(&hash2, 5);

        assert_eq!(result.votes, 2);
        assert_eq!(result.confidence, FusionConfidence::Medium);
        assert!(result.is_duplicate);
    }

    #[test]
    fn one_matching_has_low_confidence() {
        let hash1 = create_fusion_hash(0xFF, 0xFF, 0xFF);
        let hash2 = create_fusion_hash(0xFF, 0x00, 0x00); // dHash and pHash differ

        let result = hash1.compare(&hash2, 5);

        assert_eq!(result.votes, 1);
        assert_eq!(result.confidence, FusionConfidence::Low);
        assert!(!result.is_duplicate); // Not enough votes
    }

    #[test]
    fn no_matching_has_no_confidence() {
        let hash1 = create_fusion_hash(0xFF, 0xFF, 0xFF);
        let hash2 = create_fusion_hash(0x00, 0x00, 0x00); // All differ by 8 bits

        let result = hash1.compare(&hash2, 5);

        assert_eq!(result.votes, 0);
        assert_eq!(result.confidence, FusionConfidence::None);
        assert!(!result.is_duplicate);
    }

    #[test]
    fn bytes_roundtrip() {
        let hash = create_fusion_hash(0xDE, 0xAD, 0xBE);
        let bytes = hash.to_bytes();
        let restored = FusionHash::from_bytes(&bytes).unwrap();

        assert_eq!(hash.ahash.as_bytes(), restored.ahash.as_bytes());
        assert_eq!(hash.dhash.as_bytes(), restored.dhash.as_bytes());
        assert_eq!(hash.phash.as_bytes(), restored.phash.as_bytes());
    }

    #[test]
    fn fusion_hasher_creates_all_hashes() {
        use image::{DynamicImage, ImageBuffer, Luma};

        let hasher = FusionHasher::new();

        // Create a simple gradient image
        let buffer: ImageBuffer<Luma<u8>, Vec<u8>> =
            ImageBuffer::from_fn(64, 64, |x, y| Luma([((x + y) % 256) as u8]));
        let image = DynamicImage::ImageLuma8(buffer);

        let hash = hasher.hash_image(&image).unwrap();

        // All hashes should have been computed
        assert!(!hash.ahash.as_bytes().is_empty());
        assert!(!hash.dhash.as_bytes().is_empty());
        assert!(!hash.phash.as_bytes().is_empty());
    }
}
