//! File filtering logic for the scanner.

use super::ImageFormat;
use std::path::Path;

/// Filters files to determine if they are supported images
pub struct ImageFilter {
    /// File extensions to include
    extensions: std::collections::HashSet<String>,
    /// Whether to include hidden files
    include_hidden: bool,
}

impl ImageFilter {
    /// Create a new filter with default supported extensions
    pub fn new() -> Self {
        Self {
            extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "webp".to_string(),
                "heic".to_string(),
                "heif".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ]
            .into_iter()
            .collect(),
            include_hidden: false,
        }
    }

    /// Include hidden files (starting with .)
    pub fn with_hidden(mut self, include: bool) -> Self {
        self.include_hidden = include;
        self
    }

    /// Override the list of extensions to accept
    pub fn with_extensions(mut self, extensions: Vec<String>) -> Self {
        self.extensions = extensions.into_iter().collect();
        self
    }

    /// Check if a file should be included
    pub fn should_include(&self, path: &Path) -> bool {
        // Check if hidden
        if !self.include_hidden {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') {
                    return false;
                }
            }
        }

        // Check extension
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            self.extensions.contains(&ext_lower)
        } else {
            false
        }
    }

    /// Get the image format for a path
    pub fn get_format(&self, path: &Path) -> ImageFormat {
        path.extension()
            .and_then(|e| e.to_str())
            .map(ImageFormat::from_extension)
            .unwrap_or(ImageFormat::Unknown)
    }
}

impl Default for ImageFilter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_includes_jpeg() {
        let filter = ImageFilter::new();
        assert!(filter.should_include(Path::new("/photos/image.jpg")));
        assert!(filter.should_include(Path::new("/photos/image.JPEG")));
    }

    #[test]
    fn filter_includes_heic() {
        let filter = ImageFilter::new();
        assert!(filter.should_include(Path::new("/photos/IMG_1234.HEIC")));
    }

    #[test]
    fn filter_excludes_non_images() {
        let filter = ImageFilter::new();
        assert!(!filter.should_include(Path::new("/photos/document.pdf")));
        assert!(!filter.should_include(Path::new("/photos/video.mp4")));
    }

    #[test]
    fn filter_excludes_hidden_by_default() {
        let filter = ImageFilter::new();
        assert!(!filter.should_include(Path::new("/photos/.hidden.jpg")));
    }

    #[test]
    fn filter_can_include_hidden() {
        let filter = ImageFilter::new().with_hidden(true);
        assert!(filter.should_include(Path::new("/photos/.hidden.jpg")));
    }

    #[test]
    fn filter_handles_no_extension() {
        let filter = ImageFilter::new();
        assert!(!filter.should_include(Path::new("/photos/no_extension")));
    }
}
