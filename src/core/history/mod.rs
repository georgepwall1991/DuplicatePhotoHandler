//! # Scan History Module
//!
//! Stores and retrieves scan history for browsing past results.
//!
//! ## Features
//! - Persistent storage using SQLite
//! - Pagination support for large histories
//! - Per-module filtering
//! - Clear and delete operations

mod repository;
mod types;

pub use repository::HistoryRepository;
pub use types::{ModuleType, ScanHistoryEntry, ScanHistoryResult, ScanStatus};
