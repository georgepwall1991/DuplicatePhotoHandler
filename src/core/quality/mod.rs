//! # Quality Analysis Module
//!
//! Analyzes image quality metrics like sharpness, contrast, and brightness.
//! Uses Laplacian variance for blur/sharpness detection.

use image::{DynamicImage, GrayImage};
use std::path::Path;

use crate::core::hasher::fast_decode::FastDecoder;
use crate::error::HashError;

/// Quality metrics for an image
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct QualityScore {
    /// Sharpness score from Laplacian variance (higher = sharper)
    /// Typical range: 0-10000+ (very blurry to very sharp)
    pub sharpness: f64,

    /// Contrast score from pixel standard deviation (higher = more contrast)
    /// Range: 0-127.5 (no contrast to max contrast)
    pub contrast: f64,

    /// Average brightness (0-255)
    pub brightness: f64,

    /// Overall quality score (weighted combination)
    /// Range: 0-100
    pub overall: f64,
}

impl Default for QualityScore {
    fn default() -> Self {
        Self {
            sharpness: 0.0,
            contrast: 0.0,
            brightness: 128.0,
            overall: 0.0,
        }
    }
}

impl QualityScore {
    /// Compute overall score from components
    fn compute_overall(sharpness: f64, contrast: f64, brightness: f64) -> f64 {
        // Normalize sharpness to 0-100 range (assuming 5000 is very sharp)
        let sharpness_norm = (sharpness / 50.0).min(100.0);

        // Normalize contrast to 0-100 range (assuming 60 is good contrast)
        let contrast_norm = (contrast / 0.6).min(100.0);

        // Brightness penalty: prefer middle brightness (around 128)
        // Score drops as brightness deviates from 128
        let brightness_deviation = (brightness - 128.0).abs();
        let brightness_score = 100.0 - (brightness_deviation / 1.28);

        // Weighted combination: sharpness is most important for "quality"
        0.6 * sharpness_norm + 0.3 * contrast_norm + 0.1 * brightness_score
    }
}

/// Analyzes image quality metrics
pub struct QualityAnalyzer {
    /// Size to resize images before analysis (smaller = faster)
    analysis_size: u32,
}

impl Default for QualityAnalyzer {
    fn default() -> Self {
        Self { analysis_size: 512 }
    }
}

impl QualityAnalyzer {
    /// Create a new analyzer with custom analysis size
    pub fn new(analysis_size: u32) -> Self {
        Self { analysis_size }
    }

    /// Analyze quality of an image file
    pub fn analyze_file(&self, path: &Path) -> Result<QualityScore, HashError> {
        let image = FastDecoder::decode(path)?;
        Ok(self.analyze_image(&image))
    }

    /// Analyze quality of a loaded image
    pub fn analyze_image(&self, image: &DynamicImage) -> QualityScore {
        // Resize for faster analysis
        let resized = image.resize(
            self.analysis_size,
            self.analysis_size,
            image::imageops::FilterType::Triangle,
        );

        let gray = resized.to_luma8();

        let sharpness = self.compute_laplacian_variance(&gray);
        let (contrast, brightness) = self.compute_contrast_brightness(&gray);
        let overall = QualityScore::compute_overall(sharpness, contrast, brightness);

        QualityScore {
            sharpness,
            contrast,
            brightness,
            overall,
        }
    }

    /// Compute Laplacian variance as a measure of sharpness
    ///
    /// The Laplacian operator detects edges. Sharp images have more defined edges,
    /// resulting in higher variance in the Laplacian output.
    fn compute_laplacian_variance(&self, gray: &GrayImage) -> f64 {
        let (width, height) = gray.dimensions();

        if width < 3 || height < 3 {
            return 0.0;
        }

        // Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
        let mut laplacian_values: Vec<f64> = Vec::with_capacity((width * height) as usize);

        for y in 1..height - 1 {
            for x in 1..width - 1 {
                let center = gray.get_pixel(x, y)[0] as f64;
                let top = gray.get_pixel(x, y - 1)[0] as f64;
                let bottom = gray.get_pixel(x, y + 1)[0] as f64;
                let left = gray.get_pixel(x - 1, y)[0] as f64;
                let right = gray.get_pixel(x + 1, y)[0] as f64;

                let laplacian = top + bottom + left + right - 4.0 * center;
                laplacian_values.push(laplacian);
            }
        }

        if laplacian_values.is_empty() {
            return 0.0;
        }

        // Compute variance
        let n = laplacian_values.len() as f64;
        let mean = laplacian_values.iter().sum::<f64>() / n;
        let variance = laplacian_values
            .iter()
            .map(|&v| (v - mean).powi(2))
            .sum::<f64>()
            / n;

        variance
    }

    /// Compute contrast (standard deviation) and brightness (mean) of grayscale image
    fn compute_contrast_brightness(&self, gray: &GrayImage) -> (f64, f64) {
        let pixels: Vec<f64> = gray.pixels().map(|p| p[0] as f64).collect();

        if pixels.is_empty() {
            return (0.0, 128.0);
        }

        let n = pixels.len() as f64;
        let mean = pixels.iter().sum::<f64>() / n;
        let variance = pixels.iter().map(|&v| (v - mean).powi(2)).sum::<f64>() / n;
        let std_dev = variance.sqrt();

        (std_dev, mean)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Luma};

    fn create_uniform_image(value: u8, size: u32) -> DynamicImage {
        let buffer: ImageBuffer<Luma<u8>, Vec<u8>> =
            ImageBuffer::from_fn(size, size, |_, _| Luma([value]));
        DynamicImage::ImageLuma8(buffer)
    }

    fn create_gradient_image(size: u32) -> DynamicImage {
        let buffer: ImageBuffer<Luma<u8>, Vec<u8>> =
            ImageBuffer::from_fn(size, size, |x, _| Luma([(x % 256) as u8]));
        DynamicImage::ImageLuma8(buffer)
    }

    fn create_checkerboard_image(size: u32) -> DynamicImage {
        let buffer: ImageBuffer<Luma<u8>, Vec<u8>> =
            ImageBuffer::from_fn(size, size, |x, y| {
                if (x + y) % 2 == 0 {
                    Luma([0])
                } else {
                    Luma([255])
                }
            });
        DynamicImage::ImageLuma8(buffer)
    }

    #[test]
    fn uniform_image_has_low_sharpness() {
        let analyzer = QualityAnalyzer::new(64);
        let image = create_uniform_image(128, 64);
        let score = analyzer.analyze_image(&image);

        assert!(
            score.sharpness < 1.0,
            "Uniform image should have near-zero sharpness, got {}",
            score.sharpness
        );
    }

    #[test]
    fn checkerboard_has_high_sharpness() {
        let analyzer = QualityAnalyzer::new(64);
        let image = create_checkerboard_image(64);
        let score = analyzer.analyze_image(&image);

        assert!(
            score.sharpness > 1000.0,
            "Checkerboard should have high sharpness, got {}",
            score.sharpness
        );
    }

    #[test]
    fn uniform_image_has_low_contrast() {
        let analyzer = QualityAnalyzer::new(64);
        let image = create_uniform_image(128, 64);
        let score = analyzer.analyze_image(&image);

        assert!(
            score.contrast < 1.0,
            "Uniform image should have near-zero contrast, got {}",
            score.contrast
        );
    }

    #[test]
    fn gradient_image_has_contrast() {
        let analyzer = QualityAnalyzer::new(256);
        let image = create_gradient_image(256);
        let score = analyzer.analyze_image(&image);

        assert!(
            score.contrast > 50.0,
            "Gradient image should have significant contrast, got {}",
            score.contrast
        );
    }

    #[test]
    fn brightness_computed_correctly() {
        let analyzer = QualityAnalyzer::new(64);

        let dark = create_uniform_image(50, 64);
        let bright = create_uniform_image(200, 64);

        let dark_score = analyzer.analyze_image(&dark);
        let bright_score = analyzer.analyze_image(&bright);

        assert!(
            (dark_score.brightness - 50.0).abs() < 5.0,
            "Dark image brightness should be ~50, got {}",
            dark_score.brightness
        );
        assert!(
            (bright_score.brightness - 200.0).abs() < 5.0,
            "Bright image brightness should be ~200, got {}",
            bright_score.brightness
        );
    }

    #[test]
    fn overall_score_reasonable() {
        let analyzer = QualityAnalyzer::new(64);

        let uniform = create_uniform_image(128, 64);
        let checkerboard = create_checkerboard_image(64);

        let uniform_score = analyzer.analyze_image(&uniform);
        let checkerboard_score = analyzer.analyze_image(&checkerboard);

        assert!(
            checkerboard_score.overall > uniform_score.overall,
            "Checkerboard should have higher overall score"
        );
    }
}
