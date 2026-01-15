//! # photo-dedup CLI
//!
//! Command-line interface for the duplicate photo cleaner.
//!
//! ## Usage
//! ```bash
//! photo-dedup scan ~/Photos --threshold 8
//! photo-dedup scan ~/Photos --verbose --output json
//! ```

mod cli;

use duplicate_photo_cleaner::Result;

fn main() -> Result<()> {
    cli::run()
}
