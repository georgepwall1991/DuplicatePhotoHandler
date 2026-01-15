//! Difference Hash (dHash) implementation.
//!
//! dHash works by:
//! 1. Resizing the image to (hash_size+1) x hash_size
//! 2. Converting to grayscale
//! 3. Comparing each pixel to the one to its right
//! 4. If left pixel is brighter, set bit to 1, else 0
//!
//! This captures the relative gradient of brightness changes.
//!
//! Uses SIMD-accelerated resizing via fast_image_resize for 5-14x speedup.

use super::super::fast_resize::resize_to_grayscale;
use super::super::traits::{HashAlgorithm, HashAlgorithmKind, ImageHashValue};
use crate::error::HashError;
use image::DynamicImage;

/// Difference Hash (dHash) implementation
pub struct DifferenceHasher {
    /// Size of the hash (width and height of comparison grid)
    hash_size: u32,
}

impl DifferenceHasher {
    /// Create a new dHash hasher
    pub fn new(hash_size: u32) -> Self {
        Self { hash_size }
    }
}

impl HashAlgorithm for DifferenceHasher {
    fn hash_image(&self, image: &DynamicImage) -> Result<ImageHashValue, HashError> {
        // Resize to (hash_size + 1) x hash_size using SIMD-accelerated resizer
        // We need one extra column to compute differences
        // This also converts to grayscale (5-14x faster than image crate)
        let gray = resize_to_grayscale(image, self.hash_size + 1, self.hash_size)?;

        // Compute the hash
        let mut hash_bytes = Vec::with_capacity((self.hash_size * self.hash_size / 8) as usize + 1);
        let mut current_byte: u8 = 0;
        let mut bit_position = 0;

        for y in 0..self.hash_size {
            for x in 0..self.hash_size {
                // Compare current pixel to the one on its right
                let left_pixel = gray.get_pixel(x, y)[0];
                let right_pixel = gray.get_pixel(x + 1, y)[0];

                // Set bit if left is brighter than right
                if left_pixel > right_pixel {
                    current_byte |= 1 << (7 - bit_position);
                }

                bit_position += 1;

                // When we've filled a byte, save it
                if bit_position == 8 {
                    hash_bytes.push(current_byte);
                    current_byte = 0;
                    bit_position = 0;
                }
            }
        }

        // Don't forget the last partial byte
        if bit_position > 0 {
            hash_bytes.push(current_byte);
        }

        Ok(ImageHashValue::new(hash_bytes, HashAlgorithmKind::Difference))
    }

    fn kind(&self) -> HashAlgorithmKind {
        HashAlgorithmKind::Difference
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

    fn create_left_to_right_gradient() -> DynamicImage {
        // Gradient: left is dark, right is bright (left < right)
        let img = ImageBuffer::from_fn(100, 100, |x, _| {
            let brightness = (x * 255 / 99) as u8;
            Rgb([brightness, brightness, brightness])
        });
        DynamicImage::ImageRgb8(img)
    }

    fn create_right_to_left_gradient() -> DynamicImage {
        // Gradient: right is dark, left is bright (left > right)
        let img = ImageBuffer::from_fn(100, 100, |x, _| {
            let brightness = ((99 - x) * 255 / 99) as u8;
            Rgb([brightness, brightness, brightness])
        });
        DynamicImage::ImageRgb8(img)
    }

    #[test]
    fn identical_images_produce_identical_hash() {
        let hasher = DifferenceHasher::new(8);
        let image = create_solid_image(128, 128, 128);

        let hash1 = hasher.hash_image(&image).unwrap();
        let hash2 = hasher.hash_image(&image).unwrap();

        assert_eq!(hash1.distance(&hash2), 0);
    }

    #[test]
    fn different_images_produce_different_hash() {
        let hasher = DifferenceHasher::new(8);

        // Left-to-right gradient: all comparisons yield left < right (bits = 0)
        // Right-to-left gradient: all comparisons yield left > right (bits = 1)
        // These should produce maximally different hashes!
        let image1 = create_left_to_right_gradient();
        let image2 = create_right_to_left_gradient();

        let hash1 = hasher.hash_image(&image1).unwrap();
        let hash2 = hasher.hash_image(&image2).unwrap();

        // These gradients are opposites, so they should be very different
        let distance = hash1.distance(&hash2);
        assert!(
            distance > 0,
            "Expected opposite gradients to produce different hashes, got distance {}",
            distance
        );
    }

    #[test]
    fn hash_size_affects_output_length() {
        let hasher_8 = DifferenceHasher::new(8);
        let hasher_16 = DifferenceHasher::new(16);

        let image = create_solid_image(128, 128, 128);

        let hash_8 = hasher_8.hash_image(&image).unwrap();
        let hash_16 = hasher_16.hash_image(&image).unwrap();

        // 8x8 = 64 bits = 8 bytes
        assert_eq!(hash_8.as_bytes().len(), 8);

        // 16x16 = 256 bits = 32 bytes
        assert_eq!(hash_16.as_bytes().len(), 32);
    }

    #[test]
    fn kind_returns_difference() {
        let hasher = DifferenceHasher::new(8);
        assert_eq!(hasher.kind(), HashAlgorithmKind::Difference);
    }
}
