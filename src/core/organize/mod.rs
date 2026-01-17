//! Photo organization module.
//!
//! Organizes photos into date-based folder structures using EXIF metadata.

mod types;
mod scanner;
mod planner;
mod executor;

pub use types::*;
pub use scanner::OrganizeScanner;
pub use planner::OrganizePlanner;
pub use executor::OrganizeExecutor;
