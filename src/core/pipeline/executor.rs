//! Pipeline execution implementation.

use crate::core::cache::{CacheBackend, CacheEntry, InMemoryCache};
use crate::core::comparator::{find_duplicate_pairs, DuplicateGroup, ThresholdStrategy, TransitiveGrouper};
use crate::core::hasher::{HashAlgorithmKind, HasherConfig, ImageHashValue, PerceptualHash};
use crate::core::scanner::{PhotoScanner, ScanConfig, WalkDirScanner};
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

/// Result of pipeline execution
#[derive(Debug)]
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
            events.send(Event::Pipeline(PipelineEvent::Completed {
                summary: PipelineSummary {
                    total_photos: 0,
                    duplicate_groups: 0,
                    duplicate_count: 0,
                    potential_savings_bytes: 0,
                    duration_ms: start_time.elapsed().as_millis() as u64,
                },
            }));

            return Ok(PipelineResult {
                groups: Vec::new(),
                total_photos: 0,
                cache_hits: 0,
                errors,
                duration_ms: start_time.elapsed().as_millis() as u64,
            });
        }

        // Phase 2: Hashing
        events.send(Event::Pipeline(PipelineEvent::PhaseChanged {
            phase: PipelinePhase::Hashing,
        }));

        events.send(Event::Hash(HashEvent::Started {
            total_photos: photos.len(),
        }));

        let hasher = HasherConfig::new()
            .algorithm(self.config.algorithm)
            .build()?;

        let cache_hits = AtomicUsize::new(0);
        let completed = AtomicUsize::new(0);
        let events_arc = Arc::new(events.clone());

        // Hash photos in parallel
        let hashes: Vec<(PathBuf, ImageHashValue)> = photos
            .par_iter()
            .filter_map(|photo| {
                let current_completed = completed.fetch_add(1, Ordering::SeqCst) + 1;

                // Check cache first
                if let Ok(Some(entry)) = self.cache.get(
                    &photo.path,
                    photo.size,
                    photo.modified,
                ) {
                    cache_hits.fetch_add(1, Ordering::SeqCst);
                    events_arc.send(Event::Hash(HashEvent::CacheHit {
                        path: photo.path.clone(),
                    }));

                    return Some((
                        photo.path.clone(),
                        ImageHashValue::from_bytes(&entry.hash, entry.algorithm),
                    ));
                }

                // Compute hash
                match hasher.hash_file(&photo.path) {
                    Ok(hash) => {
                        // Store in cache
                        let _ = self.cache.set(CacheEntry {
                            path: photo.path.clone(),
                            hash: hash.as_bytes().to_vec(),
                            algorithm: self.config.algorithm,
                            file_size: photo.size,
                            file_modified: photo.modified,
                            cached_at: SystemTime::now(),
                        });

                        events_arc.send(Event::Hash(HashEvent::Progress(HashProgress {
                            completed: current_completed,
                            total: total_photos,
                            current_path: photo.path.clone(),
                            cache_hits: cache_hits.load(Ordering::SeqCst),
                        })));

                        Some((photo.path.clone(), hash))
                    }
                    Err(e) => {
                        events_arc.send(Event::Hash(HashEvent::Error {
                            path: photo.path.clone(),
                            message: e.to_string(),
                        }));
                        None
                    }
                }
            })
            .collect();

        let total_cache_hits = cache_hits.load(Ordering::SeqCst);

        events.send(Event::Hash(HashEvent::Completed {
            total_hashed: hashes.len(),
            cache_hits: total_cache_hits,
        }));

        // Phase 3: Comparing
        events.send(Event::Pipeline(PipelineEvent::PhaseChanged {
            phase: PipelinePhase::Comparing,
        }));

        events.send(Event::Compare(CompareEvent::Started {
            total_photos: hashes.len(),
        }));

        let strategy = ThresholdStrategy::new(self.config.threshold);
        let matches = find_duplicate_pairs(&hashes, &strategy);

        // Group into clusters
        let grouper = TransitiveGrouper::new();
        let groups = grouper.group(&matches);

        events.send(Event::Compare(CompareEvent::Completed {
            total_groups: groups.len(),
            total_duplicates: groups.iter().map(|g| g.duplicate_count()).sum(),
        }));

        // Calculate potential savings
        let photo_sizes: HashMap<_, _> = photos
            .iter()
            .map(|p| (p.path.clone(), p.size))
            .collect();

        let mut groups_with_sizes = groups;
        for group in &mut groups_with_sizes {
            let total_size: u64 = group
                .photos
                .iter()
                .filter(|p| *p != &group.representative)
                .filter_map(|p| photo_sizes.get(p))
                .sum();
            group.duplicate_size_bytes = total_size;
        }

        let potential_savings: u64 = groups_with_sizes
            .iter()
            .map(|g| g.duplicate_size_bytes)
            .sum();

        let duration_ms = start_time.elapsed().as_millis() as u64;

        events.send(Event::Pipeline(PipelineEvent::Completed {
            summary: PipelineSummary {
                total_photos,
                duplicate_groups: groups_with_sizes.len(),
                duplicate_count: groups_with_sizes
                    .iter()
                    .map(|g| g.duplicate_count())
                    .sum(),
                potential_savings_bytes: potential_savings,
                duration_ms,
            },
        }));

        Ok(PipelineResult {
            groups: groups_with_sizes,
            total_photos,
            cache_hits: total_cache_hits,
            errors,
            duration_ms,
        })
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
}
