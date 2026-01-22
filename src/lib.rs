//! # Duplicate Photo Cleaner
//!
//! A trustworthy duplicate photo finder that explains why photos are duplicates.
//!
//! ## Core Philosophy
//! - **Never auto-delete** - Safety first for users terrified of losing photos
//! - **Show WHY** - Explain why photos are considered duplicates
//! - **Build trust** - Transparent about every decision
//!
//! ## Architecture
//! The library is split into a core engine (GUI-agnostic) and presentation layers:
//! - `core` - The duplicate detection engine
//! - `events` - Event-driven progress reporting (GUI-ready)
//! - `error` - User-friendly error types
//! - `cli` - Command-line interface

pub mod core;
pub mod error;
pub mod events;

// Re-export commonly used types at the crate root
pub use error::{DuplicateFinderError, Result};

/// Initialize tracing for the library
///
/// This should be called by the application entry point (CLI or GUI).
pub fn init_tracing() {
    let subscriber = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set global default tracing subscriber");
}
