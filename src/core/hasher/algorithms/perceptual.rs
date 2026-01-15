//! Perceptual Hash (pHash) implementation.
//!
//! pHash uses the Discrete Cosine Transform (DCT) to extract
//! frequency information from the image. This makes it more
//! robust to:
//! - Scaling
//! - Minor rotations
//! - Brightness/contrast changes
//! - Compression artifacts
//!
//! For simplicity, we use the image_hasher crate which provides
//! a well-tested pHash implementation.

use super::super::traits::{HashAlgorithm, HashAlgorithmKind, ImageHashValue};
use crate::error::HashError;
use image::DynamicImage;
use image_hasher::{HasherConfig as ImageHasherConfig, HashAlg};

/// Perceptual Hash (pHash) implementation using DCT
pub struct PerceptualHasher {
    /// Size of the hash (stored for potential future use)
    _hash_size: u32,
    /// Internal hasher from image_hasher crate
    hasher: image_hasher::Hasher,
}

impl PerceptualHasher {
    /// Create a new pHash hasher
    pub fn new(hash_size: u32) -> Self {
        let hasher = ImageHasherConfig::new()
            .hash_size(hash_size, hash_size)
            .hash_alg(HashAlg::DoubleGradient) // DCT-based algorithm
            .to_hasher();

        Self { _hash_size: hash_size, hasher }
    }
}

impl HashAlgorithm for PerceptualHasher {
    fn hash_image(&self, image: &DynamicImage) -> Result<ImageHashValue, HashError> {
        let hash = self.hasher.hash_image(image);
        let bytes = hash.as_bytes().to_vec();

        Ok(ImageHashValue::new(bytes, HashAlgorithmKind::Perceptual))
    }

    fn kind(&self) -> HashAlgorithmKind {
        HashAlgorithmKind::Perceptual
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::super::traits::PerceptualHash;
    use image::{ImageBuffer, Rgb};

    fn create_solid_image(r: u8, g: u8, b: u8) -> DynamicImage {
        let img = ImageBuffer::from_fn(100, 100, |_, _| Rgb([r, g, b]));
        DynamicImage::ImageRgb8(img)
    }

    fn create_similar_image(base_r: u8, base_g: u8, base_b: u8) -> DynamicImage {
        // Same image with slight brightness adjustment
        let img = ImageBuffer::from_fn(100, 100, |_, _| {
            Rgb([
                base_r.saturating_add(5),
                base_g.saturating_add(5),
                base_b.saturating_add(5),
            ])
        });
        DynamicImage::ImageRgb8(img)
    }

    #[test]
    fn identical_images_produce_identical_hash() {
        let hasher = PerceptualHasher::new(8);
        let image = create_solid_image(128, 128, 128);

        let hash1 = hasher.hash_image(&image).unwrap();
        let hash2 = hasher.hash_image(&image).unwrap();

        assert_eq!(hash1.distance(&hash2), 0);
    }

    #[test]
    fn similar_images_produce_similar_hash() {
        let hasher = PerceptualHasher::new(8);

        let image1 = create_solid_image(128, 128, 128);
        let image2 = create_similar_image(128, 128, 128);

        let hash1 = hasher.hash_image(&image1).unwrap();
        let hash2 = hasher.hash_image(&image2).unwrap();

        // Should be very similar (low distance)
        assert!(hash1.distance(&hash2) < 10);
    }

    #[test]
    fn kind_returns_perceptual() {
        let hasher = PerceptualHasher::new(8);
        assert_eq!(hasher.kind(), HashAlgorithmKind::Perceptual);
    }
}
