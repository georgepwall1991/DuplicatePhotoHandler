//! Trait definitions for perceptual hashing.

use super::fast_decode::FastDecoder;
use crate::error::HashError;
use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A computed perceptual hash that can be compared
pub trait PerceptualHash: Clone + Send + Sync {
    /// Compute the Hamming distance to another hash
    ///
    /// Returns the number of bits that differ between the two hashes.
    /// Lower distance = more similar images.
    fn distance(&self, other: &Self) -> u32;

    /// Get the raw hash bytes
    fn as_bytes(&self) -> &[u8];

    /// Get the hash as a hexadecimal string
    fn to_hex(&self) -> String {
        self.as_bytes()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }

    /// Get the total number of bits in this hash
    fn bit_count(&self) -> u32 {
        (self.as_bytes().len() * 8) as u32
    }

    /// Calculate similarity as a percentage (0-100)
    fn similarity(&self, other: &Self) -> f64 {
        let distance = self.distance(other);
        let max_distance = self.bit_count();
        if max_distance == 0 {
            return 100.0;
        }
        (1.0 - (distance as f64 / max_distance as f64)) * 100.0
    }
}

/// Available hash algorithms
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HashAlgorithmKind {
    /// Average Hash (aHash) - Fast, good for exact duplicates
    Average,
    /// Difference Hash (dHash) - Good balance of speed and accuracy
    Difference,
    /// Perceptual Hash (pHash) - Most robust, handles edits well
    Perceptual,
}

impl HashAlgorithmKind {
    /// Get a human-readable description of the algorithm
    pub fn description(&self) -> &'static str {
        match self {
            HashAlgorithmKind::Average => {
                "Average Hash (aHash) - Fast comparison based on average brightness"
            }
            HashAlgorithmKind::Difference => {
                "Difference Hash (dHash) - Compares brightness gradients between pixels"
            }
            HashAlgorithmKind::Perceptual => {
                "Perceptual Hash (pHash) - DCT-based, robust to edits and transformations"
            }
        }
    }
}

impl std::fmt::Display for HashAlgorithmKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HashAlgorithmKind::Average => write!(f, "aHash"),
            HashAlgorithmKind::Difference => write!(f, "dHash"),
            HashAlgorithmKind::Perceptual => write!(f, "pHash"),
        }
    }
}

/// Trait for hash algorithm implementations
pub trait HashAlgorithm: Send + Sync {
    /// Compute a hash from an already-loaded image
    fn hash_image(&self, image: &DynamicImage) -> Result<ImageHashValue, HashError>;

    /// Compute a hash directly from a file path.
    ///
    /// Uses fast decoders for optimal performance:
    /// - JPEG: zune-jpeg (1.5-2x faster)
    /// - Other formats: image crate fallback
    fn hash_file(&self, path: &Path) -> Result<ImageHashValue, HashError> {
        let image = FastDecoder::decode(path)?;
        self.hash_image(&image)
    }

    /// Get the algorithm kind
    fn kind(&self) -> HashAlgorithmKind;
}

/// Concrete hash value type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHashValue {
    /// The raw hash bytes
    bytes: Vec<u8>,
    /// The algorithm that produced this hash
    algorithm: HashAlgorithmKind,
}

impl ImageHashValue {
    /// Create a new hash value
    pub fn new(bytes: Vec<u8>, algorithm: HashAlgorithmKind) -> Self {
        Self { bytes, algorithm }
    }

    /// Create from raw bytes (for cache restoration)
    pub fn from_bytes(bytes: &[u8], algorithm: HashAlgorithmKind) -> Self {
        Self {
            bytes: bytes.to_vec(),
            algorithm,
        }
    }

    /// Get the algorithm that produced this hash
    pub fn algorithm(&self) -> HashAlgorithmKind {
        self.algorithm
    }
}

impl PerceptualHash for ImageHashValue {
    fn distance(&self, other: &Self) -> u32 {
        // Hamming distance: count differing bits
        self.bytes
            .iter()
            .zip(other.bytes.iter())
            .map(|(a, b)| (a ^ b).count_ones())
            .sum()
    }

    fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_hash(bytes: &[u8]) -> ImageHashValue {
        ImageHashValue::new(bytes.to_vec(), HashAlgorithmKind::Difference)
    }

    #[test]
    fn distance_to_self_is_zero() {
        let hash = create_test_hash(&[0xFF, 0x00, 0xAA, 0x55]);
        assert_eq!(hash.distance(&hash), 0);
    }

    #[test]
    fn distance_is_symmetric() {
        let hash_a = create_test_hash(&[0xFF, 0x00]);
        let hash_b = create_test_hash(&[0x00, 0xFF]);

        assert_eq!(hash_a.distance(&hash_b), hash_b.distance(&hash_a));
    }

    #[test]
    fn distance_counts_differing_bits() {
        let hash_a = create_test_hash(&[0b11111111]); // 8 ones
        let hash_b = create_test_hash(&[0b00000000]); // 8 zeros

        assert_eq!(hash_a.distance(&hash_b), 8);
    }

    #[test]
    fn similarity_is_100_for_identical() {
        let hash = create_test_hash(&[0xFF, 0x00]);
        assert_eq!(hash.similarity(&hash), 100.0);
    }

    #[test]
    fn similarity_is_0_for_opposite() {
        let hash_a = create_test_hash(&[0xFF]);
        let hash_b = create_test_hash(&[0x00]);

        assert_eq!(hash_a.similarity(&hash_b), 0.0);
    }

    #[test]
    fn to_hex_produces_correct_string() {
        let hash = create_test_hash(&[0xDE, 0xAD, 0xBE, 0xEF]);
        assert_eq!(hash.to_hex(), "deadbeef");
    }

    #[test]
    fn algorithm_kind_display() {
        assert_eq!(HashAlgorithmKind::Average.to_string(), "aHash");
        assert_eq!(HashAlgorithmKind::Difference.to_string(), "dHash");
        assert_eq!(HashAlgorithmKind::Perceptual.to_string(), "pHash");
    }
}
