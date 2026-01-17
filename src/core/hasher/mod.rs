//! # Hasher Module
//!
//! Computes perceptual hashes for images.
//!
//! ## Supported Algorithms
//! - **dHash (Difference Hash)** - Best balance of speed and accuracy
//! - **aHash (Average Hash)** - Fastest, good for exact duplicates
//! - **pHash (Perceptual Hash)** - Most robust, handles edits well
//!
//! ## How It Works
//! 1. Resize image to small size (8x8 or 16x16)
//! 2. Convert to grayscale
//! 3. Compute hash based on pixel relationships
//! 4. Compare hashes using Hamming distance
//!
//! ## Performance Optimizations
//! - Uses `zune-jpeg` for 1.5-2x faster JPEG decoding
//! - Uses `fast_image_resize` for 5-14x faster SIMD-accelerated resizing
//!
//! ## Example
//! ```rust,ignore
//! use duplicate_photo_cleaner::core::hasher::{HasherConfig, HashAlgorithmKind};
//!
//! let hasher = HasherConfig::new()
//!     .algorithm(HashAlgorithmKind::Difference)
//!     .hash_size(16)
//!     .build();
//!
//! let hash = hasher.hash_file(&path)?;
//! ```

mod algorithms;
pub mod fast_decode;
pub mod fast_resize;
pub mod fusion;
mod traits;

pub use algorithms::{AverageHasher, DifferenceHasher, PerceptualHasher};
pub use fusion::{FusionCompareResult, FusionConfidence, FusionHash, FusionHasher};
pub use traits::{HashAlgorithm, HashAlgorithmKind, ImageHashValue, PerceptualHash};

// Re-export PerceptualHash for external use
pub use traits::PerceptualHash as _;

use crate::error::HashError;

/// Configuration builder for hashers
#[derive(Debug, Clone)]
pub struct HasherConfig {
    /// Hash size (8, 16, or 32)
    hash_size: u32,
    /// Algorithm to use
    algorithm: HashAlgorithmKind,
}

impl HasherConfig {
    /// Create a new hasher configuration with defaults
    pub fn new() -> Self {
        Self {
            hash_size: 8,
            algorithm: HashAlgorithmKind::Difference,
        }
    }

    /// Set the hash size (8, 16, or 32)
    ///
    /// Larger sizes are more accurate but slower.
    /// - 8: 64 bits, fast, good for most uses
    /// - 16: 256 bits, more accurate
    /// - 32: 1024 bits, very accurate, slower
    pub fn hash_size(mut self, size: u32) -> Self {
        self.hash_size = size;
        self
    }

    /// Set the hash algorithm
    pub fn algorithm(mut self, algorithm: HashAlgorithmKind) -> Self {
        self.algorithm = algorithm;
        self
    }

    /// Build the hasher
    pub fn build(self) -> Result<Box<dyn HashAlgorithm>, HashError> {
        match self.algorithm {
            HashAlgorithmKind::Average => {
                Ok(Box::new(AverageHasher::new(self.hash_size)))
            }
            HashAlgorithmKind::Difference => {
                Ok(Box::new(DifferenceHasher::new(self.hash_size)))
            }
            HashAlgorithmKind::Perceptual => {
                Ok(Box::new(PerceptualHasher::new(self.hash_size)))
            }
            HashAlgorithmKind::Fusion => {
                Ok(Box::new(FusionHasher::with_size(self.hash_size)))
            }
        }
    }
}

impl Default for HasherConfig {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults_to_dhash() {
        let config = HasherConfig::new();
        assert_eq!(config.algorithm, HashAlgorithmKind::Difference);
    }

    #[test]
    fn config_builder_works() {
        let config = HasherConfig::new()
            .algorithm(HashAlgorithmKind::Average)
            .hash_size(16);

        assert_eq!(config.algorithm, HashAlgorithmKind::Average);
        assert_eq!(config.hash_size, 16);
    }

    #[test]
    fn build_creates_hasher() {
        let hasher = HasherConfig::new().build();
        assert!(hasher.is_ok());
    }
}
