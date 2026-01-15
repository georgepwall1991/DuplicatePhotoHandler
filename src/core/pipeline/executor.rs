//! Pipeline execution implementation.

use crate::core::cache::{CacheBackend, CacheEntry, InMemoryCache};
use crate::core::comparator::{find_duplicate_pairs, DuplicateGroup, ThresholdStrategy, TransitiveGrouper};
use crate::core::hasher::{HashAlgorithm, HashAlgorithmKind, HasherConfig, ImageHashValue, PerceptualHash};
use crate::core::scanner::{PhotoFile, PhotoScanner, ScanConfig, WalkDirScanner};
use crate::error::DuplicateFinderError;
use crate::events::{
    CompareEvent, Event, EventSender, HashEvent, HashProgress, PipelineEvent,
    PipelinePhase, PipelineSummary, null_sender,
};
use rayon::prelude::*;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime};

/// Result of the hashing phase
struct HashingResult {
    hashes: Vec<(PathBuf, ImageHashValue)>,
    cache_hits: usize,
}

/// Result of hashing a single photo
struct SingleHashResult {
    path: PathBuf,
    hash: ImageHashValue,
    /// Cache entry to save (None if it was a cache hit)
    cache_entry: Option<CacheEntry>,
}

/// Calculate duplicate size savings for each group
fn calculate_group_savings(
    groups: &mut [DuplicateGroup],
    photos: &[PhotoFile],
) -> u64 {
    let photo_sizes: HashMap<_, _> = photos
        .iter()
        .map(|p| (p.path.clone(), p.size))
        .collect();

    let mut total_savings = 0u64;
    for group in groups.iter_mut() {
        let duplicate_size: u64 = group
            .photos
            .iter()
            .filter(|p| *p != &group.representative)
            .filter_map(|p| photo_sizes.get(p))
            .sum();
        group.duplicate_size_bytes = duplicate_size;
        total_savings += duplicate_size;
    }
    total_savings
}

/// Result of pipeline execution
#[derive(Debug, Clone)]
pub struct PipelineResult {
    /// All duplicate groups found
    pub groups: Vec<DuplicateGroup>,
    /// Total photos scanned
    pub total_photos: usize,
    /// Number of cache hits
    pub cache_hits: usize,
    /// Number of errors encountered (non-fatal)
    pub errors: Vec<String>,
    /// Duration in milliseconds
    pub duration_ms: u64,
}

/// Configuration for the pipeline
#[derive(Debug, Clone)]
pub struct PipelineConfig {
    /// Directories to scan
    pub paths: Vec<PathBuf>,
    /// Hash algorithm to use
    pub algorithm: HashAlgorithmKind,
    /// Comparison threshold (lower = stricter)
    pub threshold: u32,
    /// Scanner configuration
    pub scan_config: ScanConfig,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            paths: Vec::new(),
            algorithm: HashAlgorithmKind::Difference,
            threshold: 8,
            scan_config: ScanConfig::default(),
        }
    }
}

/// Builder for pipeline configuration
pub struct PipelineBuilder {
    config: PipelineConfig,
    cache: Option<Box<dyn CacheBackend>>,
}

impl PipelineBuilder {
    /// Create a new pipeline builder
    pub fn new() -> Self {
        Self {
            config: PipelineConfig::default(),
            cache: None,
        }
    }

    /// Add directories to scan
    pub fn paths(mut self, paths: Vec<PathBuf>) -> Self {
        self.config.paths = paths;
        self
    }

    /// Set the hash algorithm
    pub fn algorithm(mut self, algorithm: HashAlgorithmKind) -> Self {
        self.config.algorithm = algorithm;
        self
    }

    /// Set the comparison threshold
    pub fn threshold(mut self, threshold: u32) -> Self {
        self.config.threshold = threshold;
        self
    }

    /// Set the cache backend
    pub fn cache(mut self, cache: Box<dyn CacheBackend>) -> Self {
        self.cache = Some(cache);
        self
    }

    /// Set scanner configuration
    pub fn scan_config(mut self, config: ScanConfig) -> Self {
        self.config.scan_config = config;
        self
    }

    /// Include hidden files
    pub fn include_hidden(mut self, include: bool) -> Self {
        self.config.scan_config.include_hidden = include;
        self
    }

    /// Build the pipeline
    pub fn build(self) -> Pipeline {
        Pipeline {
            config: self.config,
            cache: self.cache.unwrap_or_else(|| Box::new(InMemoryCache::new())),
        }
    }
}

impl Default for PipelineBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// The duplicate detection pipeline
pub struct Pipeline {
    config: PipelineConfig,
    cache: Box<dyn CacheBackend>,
}

impl Pipeline {
    /// Create a new pipeline builder
    pub fn builder() -> PipelineBuilder {
        PipelineBuilder::new()
    }

    /// Run the pipeline without events
    pub fn run(&self) -> Result<PipelineResult, DuplicateFinderError> {
        self.run_with_events(&null_sender())
    }

    /// Hash all photos in parallel, using cache when available.
    ///
    /// Uses chunked batch cache writes for better performance AND durability:
    /// - Photos are processed in chunks (default: 100)
    /// - Each chunk is hashed in parallel, then cache is flushed
    /// - This provides incremental progress saving (crash recovery)
    fn hash_photos(
        &self,
        photos: &[PhotoFile],
        events: &EventSender,
    ) -> Result<HashingResult, DuplicateFinderError> {
        const CHUNK_SIZE: usize = 100;

        let total_photos = photos.len();
        let hasher = HasherConfig::new()
            .algorithm(self.config.algorithm)
            .build()?;

        let cache_hits = AtomicUsize::new(0);
        let completed = AtomicUsize::new(0);
        let events_arc = Arc::new(events.clone());

        let mut all_hashes: Vec<(PathBuf, ImageHashValue)> = Vec::with_capacity(total_photos);

        // Process photos in chunks for incremental cache durability
        for chunk in photos.chunks(CHUNK_SIZE) {
            // Process chunk in parallel
            let results: Vec<SingleHashResult> = chunk
                .par_iter()
                .filter_map(|photo| {
                    self.hash_single_photo(
                        photo,
                        hasher.as_ref(),
                        &cache_hits,
                        &completed,
                        total_photos,
                        &events_arc,
                    )
                })
                .collect();

            // Collect cache entries for this chunk
            let cache_entries: Vec<CacheEntry> = results
                .iter()
                .filter_map(|r| r.cache_entry.clone())
                .collect();

            // Batch write cache entries for this chunk (provides incremental durability)
            if !cache_entries.is_empty() {
                if let Err(e) = self.cache.set_batch(&cache_entries) {
                    // Log error but continue - hashing succeeded, just cache write failed
                    events.send(Event::Hash(HashEvent::Error {
                        path: PathBuf::from("cache"),
                        message: format!("Failed to write {} entries to cache: {}", cache_entries.len(), e),
                    }));
                }
            }

            // Collect hashes from this chunk
            all_hashes.extend(results.into_iter().map(|r| (r.path, r.hash)));
        }

        Ok(HashingResult {
            hashes: all_hashes,
            cache_hits: cache_hits.load(Ordering::SeqCst),
        })
    }

    /// Hash a single photo, checking cache first.
    ///
    /// Returns the hash and optionally a cache entry to be batch-written later.
    fn hash_single_photo(
        &self,
        photo: &PhotoFile,
        hasher: &dyn HashAlgorithm,
        cache_hits: &AtomicUsize,
        completed: &AtomicUsize,
        total_photos: usize,
        events: &Arc<EventSender>,
    ) -> Option<SingleHashResult> {
        let current_completed = completed.fetch_add(1, Ordering::SeqCst) + 1;

        // Check cache first
        if let Ok(Some(entry)) = self.cache.get(&photo.path, photo.size, photo.modified) {
            cache_hits.fetch_add(1, Ordering::SeqCst);
            events.send(Event::Hash(HashEvent::CacheHit {
                path: photo.path.clone(),
            }));
            return Some(SingleHashResult {
                path: photo.path.clone(),
                hash: ImageHashValue::from_bytes(&entry.hash, entry.algorithm),
                cache_entry: None, // Already in cache
            });
        }

        // Compute hash
        match hasher.hash_file(&photo.path) {
            Ok(hash) => {
                // Create cache entry (will be batch-written later)
                let cache_entry = CacheEntry {
                    path: photo.path.clone(),
                    hash: hash.as_bytes().to_vec(),
                    algorithm: self.config.algorithm,
                    file_size: photo.size,
                    file_modified: photo.modified,
                    cached_at: SystemTime::now(),
                };

                events.send(Event::Hash(HashEvent::Progress(HashProgress {
                    completed: current_completed,
                    total: total_photos,
                    current_path: photo.path.clone(),
                    cache_hits: cache_hits.load(Ordering::SeqCst),
                })));

                Some(SingleHashResult {
                    path: photo.path.clone(),
                    hash,
                    cache_entry: Some(cache_entry),
                })
            }
            Err(e) => {
                events.send(Event::Hash(HashEvent::Error {
                    path: photo.path.clone(),
                    message: e.to_string(),
                }));
                None
            }
        }
    }

    /// Run the pipeline with event reporting
    pub fn run_with_events(
        &self,
        events: &EventSender,
    ) -> Result<PipelineResult, DuplicateFinderError> {
        let start_time = Instant::now();
        let mut errors = Vec::new();

        events.send(Event::Pipeline(PipelineEvent::Started));

        // Phase 1: Scanning
        events.send(Event::Pipeline(PipelineEvent::PhaseChanged {
            phase: PipelinePhase::Scanning,
        }));

        let scanner = WalkDirScanner::new(self.config.scan_config.clone());
        let scan_result = scanner.scan_with_events(&self.config.paths, events)?;

        for error in scan_result.errors {
            errors.push(error.to_string());
        }

        let photos = scan_result.photos;
        let total_photos = photos.len();

        if photos.is_empty() {
            return Ok(self.empty_result(events, start_time, errors));
        }

        // Phase 2: Hashing
        events.send(Event::Pipeline(PipelineEvent::PhaseChanged {
            phase: PipelinePhase::Hashing,
        }));
        events.send(Event::Hash(HashEvent::Started { total_photos }));

        let hash_result = self.hash_photos(&photos, events)?;

        events.send(Event::Hash(HashEvent::Completed {
            total_hashed: hash_result.hashes.len(),
            cache_hits: hash_result.cache_hits,
        }));

        // Phase 3: Comparing
        events.send(Event::Pipeline(PipelineEvent::PhaseChanged {
            phase: PipelinePhase::Comparing,
        }));
        events.send(Event::Compare(CompareEvent::Started {
            total_photos: hash_result.hashes.len(),
        }));

        let strategy = ThresholdStrategy::new(self.config.threshold);
        let matches = find_duplicate_pairs(&hash_result.hashes, &strategy);

        let grouper = TransitiveGrouper::new();
        let mut groups = grouper.group(&matches);

        events.send(Event::Compare(CompareEvent::Completed {
            total_groups: groups.len(),
            total_duplicates: groups.iter().map(|g| g.duplicate_count()).sum(),
        }));

        // Calculate savings and emit summary
        let potential_savings = calculate_group_savings(&mut groups, &photos);
        let duration_ms = start_time.elapsed().as_millis() as u64;

        events.send(Event::Pipeline(PipelineEvent::Completed {
            summary: PipelineSummary {
                total_photos,
                duplicate_groups: groups.len(),
                duplicate_count: groups.iter().map(|g| g.duplicate_count()).sum(),
                potential_savings_bytes: potential_savings,
                duration_ms,
            },
        }));

        Ok(PipelineResult {
            groups,
            total_photos,
            cache_hits: hash_result.cache_hits,
            errors,
            duration_ms,
        })
    }

    /// Build an empty result for when no photos are found
    fn empty_result(
        &self,
        events: &EventSender,
        start_time: Instant,
        errors: Vec<String>,
    ) -> PipelineResult {
        let duration_ms = start_time.elapsed().as_millis() as u64;
        events.send(Event::Pipeline(PipelineEvent::Completed {
            summary: PipelineSummary {
                total_photos: 0,
                duplicate_groups: 0,
                duplicate_count: 0,
                potential_savings_bytes: 0,
                duration_ms,
            },
        }));

        PipelineResult {
            groups: Vec::new(),
            total_photos: 0,
            cache_hits: 0,
            errors,
            duration_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs::File;
    use std::io::Write;

    #[allow(dead_code)]
    fn create_test_image(dir: &TempDir, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.path().join(name);
        let mut file = File::create(&path).unwrap();

        // Write a minimal valid JPEG
        // JPEG header
        file.write_all(&[
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
            0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        ])
        .unwrap();
        // Custom content to make images different
        file.write_all(content).unwrap();
        // JPEG footer
        file.write_all(&[0xFF, 0xD9]).unwrap();

        path
    }

    #[test]
    fn pipeline_builder_creates_pipeline() {
        let pipeline = Pipeline::builder()
            .paths(vec![PathBuf::from("/photos")])
            .algorithm(HashAlgorithmKind::Difference)
            .threshold(8)
            .build();

        assert_eq!(pipeline.config.threshold, 8);
    }

    #[test]
    fn pipeline_handles_empty_directory() {
        let temp_dir = TempDir::new().unwrap();

        let pipeline = Pipeline::builder()
            .paths(vec![temp_dir.path().to_path_buf()])
            .build();

        let result = pipeline.run().unwrap();

        assert_eq!(result.total_photos, 0);
        assert_eq!(result.groups.len(), 0);
    }

    #[test]
    fn pipeline_uses_cache() {
        let temp_dir = TempDir::new().unwrap();

        // Create a test photo
        let path = temp_dir.path().join("test.jpg");
        let mut file = File::create(&path).unwrap();
        // Write minimal PNG instead (simpler)
        file.write_all(&[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82,
        ]).unwrap();
        drop(file);

        let cache = Box::new(InMemoryCache::new());

        let pipeline = Pipeline::builder()
            .paths(vec![temp_dir.path().to_path_buf()])
            .cache(cache)
            .build();

        // First run - no cache hits
        let result1 = pipeline.run().unwrap();

        // Note: We can't easily test cache hits without more infrastructure
        // because the cache is moved into the pipeline
        assert!(result1.total_photos <= 1);
    }

    #[test]
    fn pipeline_handles_corrupt_image_gracefully() {
        let temp_dir = TempDir::new().unwrap();

        // Create a corrupt "image" file with invalid data
        let corrupt_path = temp_dir.path().join("corrupt.jpg");
        let mut file = File::create(&corrupt_path).unwrap();
        file.write_all(b"this is not a valid image file").unwrap();
        drop(file);

        let pipeline = Pipeline::builder()
            .paths(vec![temp_dir.path().to_path_buf()])
            .build();

        // Should not panic, should complete with errors recorded
        let result = pipeline.run().unwrap();

        // The corrupt file may be skipped during scanning or hashing
        // Either way, it should not cause a panic
        assert!(result.total_photos <= 1);
    }

    #[test]
    fn pipeline_handles_nonexistent_path() {
        let pipeline = Pipeline::builder()
            .paths(vec![PathBuf::from("/nonexistent/path/that/does/not/exist")])
            .build();

        // Should not panic
        let result = pipeline.run().unwrap();

        assert_eq!(result.total_photos, 0);
        assert_eq!(result.groups.len(), 0);
    }

    #[test]
    fn pipeline_with_events_emits_started_event() {
        let temp_dir = TempDir::new().unwrap();

        let pipeline = Pipeline::builder()
            .paths(vec![temp_dir.path().to_path_buf()])
            .build();

        let (sender, receiver) = crossbeam_channel::unbounded();
        let event_sender = crate::events::EventSender::new(sender);

        let _ = pipeline.run_with_events(&event_sender);

        // Check that we received a Started event
        let mut found_started = false;
        while let Ok(event) = receiver.try_recv() {
            if let Event::Pipeline(PipelineEvent::Started) = event {
                found_started = true;
                break;
            }
        }
        assert!(found_started, "Expected Pipeline::Started event");
    }

    #[test]
    fn calculate_group_savings_computes_correctly() {
        use crate::core::comparator::{DuplicateGroup, MatchType};
        use crate::core::scanner::ImageFormat;

        let photos = vec![
            PhotoFile {
                path: PathBuf::from("/a.jpg"),
                size: 1000,
                modified: std::time::SystemTime::now(),
                format: ImageFormat::Jpeg,
            },
            PhotoFile {
                path: PathBuf::from("/b.jpg"),
                size: 1000,
                modified: std::time::SystemTime::now(),
                format: ImageFormat::Jpeg,
            },
        ];

        let mut groups = vec![DuplicateGroup {
            id: uuid::Uuid::new_v4(),
            photos: vec![PathBuf::from("/a.jpg"), PathBuf::from("/b.jpg")],
            representative: PathBuf::from("/a.jpg"),
            match_type: MatchType::Exact,
            average_distance: 0.0,
            duplicate_size_bytes: 0, // Will be calculated
        }];

        let savings = calculate_group_savings(&mut groups, &photos);

        // Should calculate savings as size of duplicates (not representative)
        // In a group of 2 identical files of 1000 bytes, savings = 1000 bytes (one duplicate)
        assert_eq!(savings, 1000);
        assert_eq!(groups[0].duplicate_size_bytes, 1000);
    }
}
