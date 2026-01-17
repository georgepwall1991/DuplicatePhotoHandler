//! Large file detection module.
//!
//! Finds files above a size threshold for disk space cleanup.

mod scanner;

pub use scanner::{LargeFileInfo, LargeFileScanner, LargeFileScanResult};
