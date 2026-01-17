//! # Similar Photos Module
//!
//! Finds photos that are perceptually similar but not exact duplicates.
//!
//! ## Difference from Duplicates
//! - Duplicates: exact or near-exact matches (distance 0-4)
//! - Similar: visually related images (distance 5-15)
//!
//! ## Use Cases
//! - Find burst shots that are slightly different
//! - Discover photos of the same scene from different angles
//! - Group related images for review

mod scanner;
mod types;

pub use scanner::SimilarScanner;
pub use types::{SimilarConfig, SimilarGroup, SimilarPhoto, SimilarResult};
