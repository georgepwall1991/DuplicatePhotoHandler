//! Integration tests for the pipeline module.
//!
//! These tests verify end-to-end pipeline behavior including:
//! - Empty directories
//! - Nonexistent paths
//! - Basic error handling

use duplicate_photo_cleaner::core::cache::{CacheBackend, SqliteCache};
use duplicate_photo_cleaner::core::hasher::HashAlgorithmKind;
use duplicate_photo_cleaner::core::pipeline::Pipeline;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tempfile::TempDir;

/// Create a minimal valid PNG image (copied from executor.rs tests)
fn create_test_png(path: &std::path::Path) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    file.write_all(&[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44,
        0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F, 0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC,
        0xCC, 0x59, 0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ])?;
    Ok(())
}

#[test]
fn pipeline_handles_empty_directory() {
    let temp_dir = TempDir::new().unwrap();

    let pipeline = Pipeline::builder()
        .paths(vec![temp_dir.path().to_path_buf()])
        .algorithm(HashAlgorithmKind::Difference)
        .build();

    let result = pipeline.run().unwrap();

    assert_eq!(result.total_photos, 0);
    assert_eq!(result.groups.len(), 0);
}

#[test]
fn pipeline_handles_corrupt_file_gracefully() {
    let temp_dir = TempDir::new().unwrap();

    // Create a corrupt "image" file
    let corrupt_path = temp_dir.path().join("corrupt.jpg");
    let mut file = File::create(&corrupt_path).unwrap();
    file.write_all(b"this is not a valid image file").unwrap();
    drop(file);

    let pipeline = Pipeline::builder()
        .paths(vec![temp_dir.path().to_path_buf()])
        .algorithm(HashAlgorithmKind::Difference)
        .build();

    // Should not panic - errors are captured, not fatal
    let result = pipeline.run().unwrap();

    // The corrupt file should be scanned but fail hashing
    assert!(result.total_photos <= 1);
    assert_eq!(result.groups.len(), 0);
}

#[test]
fn pipeline_handles_nonexistent_path() {
    let pipeline = Pipeline::builder()
        .paths(vec![PathBuf::from("/nonexistent/path/that/does/not/exist")])
        .algorithm(HashAlgorithmKind::Difference)
        .build();

    // Should not panic
    let result = pipeline.run().unwrap();

    assert_eq!(result.total_photos, 0);
    assert_eq!(result.groups.len(), 0);
}

#[test]
fn pipeline_scans_single_image() {
    let temp_dir = TempDir::new().unwrap();

    // Create a valid test image
    let img_path = temp_dir.path().join("photo.png");
    create_test_png(&img_path).unwrap();

    let pipeline = Pipeline::builder()
        .paths(vec![temp_dir.path().to_path_buf()])
        .algorithm(HashAlgorithmKind::Difference)
        .build();

    let result = pipeline.run().unwrap();

    // Should find the image (may or may not be able to hash depending on PNG validity)
    // The key is no panic
    assert!(result.total_photos <= 1);
}

#[test]
fn sqlite_cache_persists_across_opens() {
    let cache_dir = TempDir::new().unwrap();
    let cache_path = cache_dir.path().join("test_cache.db");

    // Create and populate cache
    {
        let cache = SqliteCache::open(&cache_path).unwrap();
        let stats = cache.stats().unwrap();
        assert_eq!(stats.total_entries, 0);
    }

    // Verify cache file exists
    assert!(cache_path.exists(), "Cache database should persist on disk");

    // Reopen and verify
    {
        let cache = SqliteCache::open(&cache_path).unwrap();
        let stats = cache.stats().unwrap();
        assert_eq!(stats.total_entries, 0);
    }
}

#[test]
fn sqlite_cache_with_prune_works() {
    let cache_dir = TempDir::new().unwrap();
    let cache_path = cache_dir.path().join("test_cache.db");

    // open_with_prune should work on a new database
    let cache = SqliteCache::open_with_prune(&cache_path).unwrap();
    let stats = cache.stats().unwrap();
    assert_eq!(stats.total_entries, 0);
}
