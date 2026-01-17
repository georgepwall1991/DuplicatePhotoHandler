//! # Pipeline Module
//!
//! Orchestrates the full duplicate detection workflow.
//!
//! ## Pipeline Stages
//! 1. **Scan** - Discover all photos in specified directories
//! 2. **Hash** - Compute perceptual hashes (with caching)
//! 3. **Compare** - Find duplicates using hash comparison
//! 4. **Report** - Generate human-readable explanations
//!
//! ## Parallelism
//! Uses rayon for parallel hashing across multiple CPU cores.

mod executor;

pub use executor::{CancellationToken, Pipeline, PipelineBuilder, PipelineResult};
