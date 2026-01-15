//! Fast image decoding with format-specific optimizations.
//!
//! Uses zune-jpeg for JPEG files (1.5-2x faster than image crate),
//! falls back to image crate for other formats.

use crate::error::HashError;
use image::{DynamicImage, ImageBuffer, Luma, Rgb, Rgba};
use std::fs;
use std::path::Path;
use zune_core::colorspace::ColorSpace;
use zune_core::options::DecoderOptions;
use zune_jpeg::JpegDecoder;

/// Supported image formats for fast decoding
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Jpeg,
    Png,
    WebP,
    Heic,
    Other,
}

impl ImageFormat {
    /// Detect format from file extension
    pub fn from_path(path: &Path) -> Self {
        match path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .as_deref()
        {
            Some("jpg" | "jpeg") => Self::Jpeg,
            Some("png") => Self::Png,
            Some("webp") => Self::WebP,
            Some("heic" | "heif") => Self::Heic,
            _ => Self::Other,
        }
    }
}

/// Fast image decoder that uses optimized decoders per format
pub struct FastDecoder;

impl FastDecoder {
    /// Decode an image from a file path using the fastest available decoder.
    ///
    /// - JPEG: Uses zune-jpeg (1.5-2x faster)
    /// - Other formats: Falls back to image crate
    pub fn decode(path: &Path) -> Result<DynamicImage, HashError> {
        let format = ImageFormat::from_path(path);

        match format {
            ImageFormat::Jpeg => Self::decode_jpeg(path).or_else(|_| Self::decode_fallback(path)),
            _ => Self::decode_fallback(path),
        }
    }

    /// Fast JPEG decoding using zune-jpeg
    fn decode_jpeg(path: &Path) -> Result<DynamicImage, HashError> {
        let file_bytes = fs::read(path).map_err(|e| HashError::IoError {
            path: path.to_path_buf(),
            source: e,
        })?;

        // Configure decoder to output RGB
        let options = DecoderOptions::new_fast().jpeg_set_out_colorspace(ColorSpace::RGB);
        let mut decoder = JpegDecoder::new_with_options(&file_bytes, options);

        // Decode the image
        let pixels = decoder.decode().map_err(|e| HashError::DecodeError {
            path: path.to_path_buf(),
            reason: format!("zune-jpeg decode failed: {:?}", e),
        })?;

        let info = decoder.info().ok_or_else(|| HashError::DecodeError {
            path: path.to_path_buf(),
            reason: "Failed to get image info".to_string(),
        })?;

        let width = info.width as u32;
        let height = info.height as u32;

        // Get actual output colorspace after decoding
        let out_colorspace = decoder.get_output_colorspace().unwrap_or(ColorSpace::RGB);

        // Convert to DynamicImage based on actual output colorspace
        let image = match out_colorspace {
            ColorSpace::RGB => {
                let buffer: ImageBuffer<Rgb<u8>, Vec<u8>> =
                    ImageBuffer::from_raw(width, height, pixels).ok_or_else(|| {
                        HashError::DecodeError {
                            path: path.to_path_buf(),
                            reason: "Failed to create RGB buffer".to_string(),
                        }
                    })?;
                DynamicImage::ImageRgb8(buffer)
            }
            ColorSpace::RGBA => {
                let buffer: ImageBuffer<Rgba<u8>, Vec<u8>> =
                    ImageBuffer::from_raw(width, height, pixels).ok_or_else(|| {
                        HashError::DecodeError {
                            path: path.to_path_buf(),
                            reason: "Failed to create RGBA buffer".to_string(),
                        }
                    })?;
                DynamicImage::ImageRgba8(buffer)
            }
            ColorSpace::Luma => {
                let buffer: ImageBuffer<Luma<u8>, Vec<u8>> =
                    ImageBuffer::from_raw(width, height, pixels).ok_or_else(|| {
                        HashError::DecodeError {
                            path: path.to_path_buf(),
                            reason: "Failed to create Luma buffer".to_string(),
                        }
                    })?;
                DynamicImage::ImageLuma8(buffer)
            }
            _ => {
                // Unsupported colorspace, fall back to image crate
                return Self::decode_fallback(path);
            }
        };

        Ok(image)
    }

    /// Fallback to image crate for non-JPEG formats
    fn decode_fallback(path: &Path) -> Result<DynamicImage, HashError> {
        image::open(path).map_err(|e| HashError::DecodeError {
            path: path.to_path_buf(),
            reason: e.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_detection_jpeg() {
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.jpg")),
            ImageFormat::Jpeg
        );
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.JPEG")),
            ImageFormat::Jpeg
        );
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.JPG")),
            ImageFormat::Jpeg
        );
    }

    #[test]
    fn format_detection_png() {
        assert_eq!(
            ImageFormat::from_path(Path::new("image.png")),
            ImageFormat::Png
        );
        assert_eq!(
            ImageFormat::from_path(Path::new("image.PNG")),
            ImageFormat::Png
        );
    }

    #[test]
    fn format_detection_heic() {
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.heic")),
            ImageFormat::Heic
        );
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.HEIF")),
            ImageFormat::Heic
        );
    }

    #[test]
    fn format_detection_other() {
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.bmp")),
            ImageFormat::Other
        );
        assert_eq!(
            ImageFormat::from_path(Path::new("photo.gif")),
            ImageFormat::Other
        );
    }
}
