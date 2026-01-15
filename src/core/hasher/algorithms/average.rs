//! Average Hash (aHash) implementation.
//!
//! aHash works by:
//! 1. Resizing the image to hash_size x hash_size
//! 2. Converting to grayscale
//! 3. Computing the average brightness
//! 4. For each pixel: if brighter than average, set bit to 1, else 0
//!
//! This is the fastest hash but less robust to edits.

use super::super::traits::{HashAlgorithm, HashAlgorithmKind, ImageHashValue};
use crate::error::HashError;
use image::DynamicImage;

/// Average Hash (aHash) implementation
pub struct AverageHasher {
    /// Size of the hash (width and height)
    hash_size: u32,
}

impl AverageHasher {
    /// Create a new aHash hasher
    pub fn new(hash_size: u32) -> Self {
        Self { hash_size }
    }
}

impl HashAlgorithm for AverageHasher {
    fn hash_image(&self, image: &DynamicImage) -> Result<ImageHashValue, HashError> {
        // Resize to hash_size x hash_size
        let resized = image.resize_exact(
            self.hash_size,
            self.hash_size,
            image::imageops::FilterType::Lanczos3,
        );

        // Convert to grayscale
        let gray = resized.to_luma8();

        // Calculate average brightness
        let total: u64 = gray.pixels().map(|p| p[0] as u64).sum();
        let count = (self.hash_size * self.hash_size) as u64;
        let average = (total / count) as u8;

        // Build hash: 1 if pixel > average, 0 otherwise
        let mut hash_bytes = Vec::with_capacity((self.hash_size * self.hash_size / 8) as usize + 1);
        let mut current_byte: u8 = 0;
        let mut bit_position = 0;

        for y in 0..self.hash_size {
            for x in 0..self.hash_size {
                let pixel = gray.get_pixel(x, y)[0];

                if pixel > average {
                    current_byte |= 1 << (7 - bit_position);
                }

                bit_position += 1;

                if bit_position == 8 {
                    hash_bytes.push(current_byte);
                    current_byte = 0;
                    bit_position = 0;
                }
            }
        }

        if bit_position > 0 {
            hash_bytes.push(current_byte);
        }

        Ok(ImageHashValue::new(hash_bytes, HashAlgorithmKind::Average))
    }

    fn kind(&self) -> HashAlgorithmKind {
        HashAlgorithmKind::Average
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

    #[test]
    fn identical_images_produce_identical_hash() {
        let hasher = AverageHasher::new(8);
        let image = create_solid_image(128, 128, 128);

        let hash1 = hasher.hash_image(&image).unwrap();
        let hash2 = hasher.hash_image(&image).unwrap();

        assert_eq!(hash1.distance(&hash2), 0);
    }

    #[test]
    fn solid_image_produces_uniform_hash() {
        let hasher = AverageHasher::new(8);
        let image = create_solid_image(128, 128, 128);

        let hash = hasher.hash_image(&image).unwrap();

        // A solid color image should produce all 0s or all 1s
        // (depending on rounding of average)
        let all_same = hash.as_bytes().iter().all(|&b| b == 0x00)
            || hash.as_bytes().iter().all(|&b| b == 0xFF);
        assert!(all_same);
    }

    #[test]
    fn kind_returns_average() {
        let hasher = AverageHasher::new(8);
        assert_eq!(hasher.kind(), HashAlgorithmKind::Average);
    }
}
