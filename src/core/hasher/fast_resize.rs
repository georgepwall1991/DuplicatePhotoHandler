//! Fast SIMD-accelerated image resizing.
//!
//! Uses fast_image_resize crate which is 5-14x faster than image crate's resize.
//! Automatically uses AVX2/NEON SIMD when available.

use crate::error::HashError;
use fast_image_resize::{images::Image, PixelType, ResizeOptions, Resizer};
use image::{DynamicImage, GrayImage, ImageBuffer, Luma};
use std::path::PathBuf;

/// Fast image resizer using SIMD acceleration
pub struct FastResizer {
    resizer: Resizer,
}

impl FastResizer {
    /// Create a new fast resizer
    pub fn new() -> Self {
        Self {
            resizer: Resizer::new(),
        }
    }

    /// Resize an image to the specified dimensions and convert to grayscale.
    ///
    /// This is the most common operation for perceptual hashing:
    /// resize to small size + grayscale conversion.
    pub fn resize_to_grayscale(
        &mut self,
        image: &DynamicImage,
        width: u32,
        height: u32,
    ) -> Result<GrayImage, HashError> {
        // Convert to grayscale first (this is faster than resizing RGB then converting)
        let gray = image.to_luma8();

        let src_width = gray.width();
        let src_height = gray.height();

        if src_width == 0 || src_height == 0 {
            return Err(HashError::DecodeError {
                path: PathBuf::new(),
                reason: "Invalid source dimensions".to_string(),
            });
        }

        if width == 0 || height == 0 {
            return Err(HashError::DecodeError {
                path: PathBuf::new(),
                reason: "Invalid destination dimensions".to_string(),
            });
        }

        // Create source image
        let src_image = Image::from_vec_u8(src_width, src_height, gray.into_raw(), PixelType::U8)
            .map_err(|e| HashError::DecodeError {
                path: PathBuf::new(),
                reason: format!("Failed to create source image: {}", e),
            })?;

        // Create destination image
        let mut dst_image = Image::new(width, height, PixelType::U8);

        // Resize using bilinear filter (good balance of speed and quality for hashing)
        let options = ResizeOptions::new()
            .resize_alg(fast_image_resize::ResizeAlg::Convolution(
                fast_image_resize::FilterType::Bilinear,
            ));

        self.resizer
            .resize(&src_image, &mut dst_image, &options)
            .map_err(|e| HashError::DecodeError {
                path: PathBuf::new(),
                reason: format!("Resize failed: {}", e),
            })?;

        // Convert back to image crate format
        let result_buffer: ImageBuffer<Luma<u8>, Vec<u8>> =
            ImageBuffer::from_raw(width, height, dst_image.into_vec()).ok_or_else(|| {
                HashError::DecodeError {
                    path: PathBuf::new(),
                    reason: "Failed to create result buffer".to_string(),
                }
            })?;

        Ok(result_buffer)
    }
}

impl Default for FastResizer {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience function for one-off resizing
pub fn resize_to_grayscale(
    image: &DynamicImage,
    width: u32,
    height: u32,
) -> Result<GrayImage, HashError> {
    let mut resizer = FastResizer::new();
    resizer.resize_to_grayscale(image, width, height)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    fn create_test_image(width: u32, height: u32) -> DynamicImage {
        let img = ImageBuffer::from_fn(width, height, |x, y| {
            let r = (x * 255 / width.max(1)) as u8;
            let g = (y * 255 / height.max(1)) as u8;
            let b = ((x + y) * 128 / (width + height).max(1)) as u8;
            Rgb([r, g, b])
        });
        DynamicImage::ImageRgb8(img)
    }

    #[test]
    fn resize_produces_correct_dimensions() {
        let image = create_test_image(100, 100);
        let resized = resize_to_grayscale(&image, 8, 8).unwrap();

        assert_eq!(resized.width(), 8);
        assert_eq!(resized.height(), 8);
    }

    #[test]
    fn resize_non_square_image() {
        let image = create_test_image(200, 100);
        let resized = resize_to_grayscale(&image, 9, 8).unwrap();

        assert_eq!(resized.width(), 9);
        assert_eq!(resized.height(), 8);
    }

    #[test]
    fn resize_small_to_smaller() {
        let image = create_test_image(16, 16);
        let resized = resize_to_grayscale(&image, 8, 8).unwrap();

        assert_eq!(resized.width(), 8);
        assert_eq!(resized.height(), 8);
    }

    #[test]
    fn resizer_reuse() {
        let mut resizer = FastResizer::new();
        let image = create_test_image(100, 100);

        // Reusing resizer should work correctly
        let resized1 = resizer.resize_to_grayscale(&image, 8, 8).unwrap();
        let resized2 = resizer.resize_to_grayscale(&image, 8, 8).unwrap();

        assert_eq!(resized1.width(), resized2.width());
        assert_eq!(resized1.height(), resized2.height());
    }
}
