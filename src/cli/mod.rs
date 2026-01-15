//! # CLI Module
//!
//! Command-line interface for the duplicate photo cleaner.
//!
//! ## Usage
//! ```bash
//! # Scan a directory for duplicates
//! photo-dedup scan ~/Photos
//!
//! # With custom threshold
//! photo-dedup scan ~/Photos --threshold 5
//!
//! # Verbose output
//! photo-dedup scan ~/Photos --verbose
//!
//! # JSON output
//! photo-dedup scan ~/Photos --output json
//! ```

use duplicate_photo_cleaner::core::cache::SqliteCache;
use duplicate_photo_cleaner::core::hasher::HashAlgorithmKind;
use duplicate_photo_cleaner::core::pipeline::{Pipeline, PipelineResult};
use duplicate_photo_cleaner::error::Result;
use duplicate_photo_cleaner::events::{Event, EventChannel, HashEvent, PipelineEvent, ScanEvent};
use clap::{Parser, Subcommand, ValueEnum};
use console::{style, Term};
use indicatif::{ProgressBar, ProgressStyle};
use std::path::PathBuf;
use std::thread;

/// Duplicate Photo Cleaner - Find duplicates without fear
#[derive(Parser, Debug)]
#[command(name = "photo-dedup")]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Scan directories for duplicate photos
    Scan {
        /// Directories to scan
        #[arg(required = true)]
        paths: Vec<PathBuf>,

        /// Comparison threshold (lower = stricter, 0-64)
        #[arg(short, long, default_value = "8")]
        threshold: u32,

        /// Hash algorithm to use
        #[arg(short, long, default_value = "difference")]
        algorithm: Algorithm,

        /// Output format
        #[arg(short, long, default_value = "pretty")]
        output: OutputFormat,

        /// Include hidden files
        #[arg(long)]
        include_hidden: bool,

        /// Verbose output
        #[arg(short, long)]
        verbose: bool,

        /// Cache database path
        #[arg(long)]
        cache: Option<PathBuf>,
    },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum Algorithm {
    /// Average Hash - Fast, good for exact duplicates
    Average,
    /// Difference Hash - Good balance (default)
    Difference,
    /// Perceptual Hash - Most robust to edits
    Perceptual,
}

impl From<Algorithm> for HashAlgorithmKind {
    fn from(algo: Algorithm) -> Self {
        match algo {
            Algorithm::Average => HashAlgorithmKind::Average,
            Algorithm::Difference => HashAlgorithmKind::Difference,
            Algorithm::Perceptual => HashAlgorithmKind::Perceptual,
        }
    }
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum OutputFormat {
    /// Human-readable output with colors
    Pretty,
    /// JSON output for scripting
    Json,
    /// Minimal output (paths only)
    Minimal,
}

/// Run the CLI
pub fn run() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Scan {
            paths,
            threshold,
            algorithm,
            output,
            include_hidden,
            verbose,
            cache,
        } => run_scan(
            paths,
            threshold,
            algorithm.into(),
            output,
            include_hidden,
            verbose,
            cache,
        ),
    }
}

fn run_scan(
    paths: Vec<PathBuf>,
    threshold: u32,
    algorithm: HashAlgorithmKind,
    output: OutputFormat,
    include_hidden: bool,
    verbose: bool,
    cache_path: Option<PathBuf>,
) -> Result<()> {
    let term = Term::stderr();

    // Print header
    if matches!(output, OutputFormat::Pretty) {
        term.write_line(&format!(
            "{} {}",
            style("Duplicate Photo Cleaner").bold().cyan(),
            style("v0.1.0").dim()
        ))
        .ok();
        term.write_line("").ok();
    }

    // Set up cache
    let cache_path = cache_path.unwrap_or_else(|| {
        dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("duplicate-photo-cleaner")
            .join("cache.db")
    });

    let cache = SqliteCache::open(&cache_path)?;

    // Build pipeline
    let builder = Pipeline::builder()
        .paths(paths.clone())
        .algorithm(algorithm)
        .threshold(threshold)
        .include_hidden(include_hidden)
        .cache(Box::new(cache));

    let pipeline = builder.build();

    // Set up event handling
    let (sender, receiver) = EventChannel::new();

    // Progress bar for pretty output
    let progress = if matches!(output, OutputFormat::Pretty) {
        let pb = ProgressBar::new(0);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{spinner:.green} [{bar:40.cyan/blue}] {pos}/{len} {msg}")
                .unwrap()
                .progress_chars("█▓░"),
        );
        Some(pb)
    } else {
        None
    };

    let progress_clone = progress.clone();
    let verbose_clone = verbose;

    // Handle events in a separate thread
    let event_thread = thread::spawn(move || {
        for event in receiver.iter() {
            match event {
                Event::Pipeline(PipelineEvent::PhaseChanged { phase }) => {
                    if let Some(ref pb) = progress_clone {
                        pb.set_message(format!("{}", phase));
                    }
                }
                Event::Scan(ScanEvent::Completed { total_photos }) => {
                    if let Some(ref pb) = progress_clone {
                        pb.set_length(total_photos as u64);
                    }
                }
                Event::Hash(HashEvent::Progress(p)) => {
                    if let Some(ref pb) = progress_clone {
                        pb.set_position(p.completed as u64);
                        if verbose_clone {
                            pb.set_message(format!(
                                "{} (cache: {})",
                                p.current_path.file_name().unwrap_or_default().to_string_lossy(),
                                p.cache_hits
                            ));
                        }
                    }
                }
                Event::Pipeline(PipelineEvent::Completed { .. }) => {
                    if let Some(ref pb) = progress_clone {
                        pb.finish_and_clear();
                    }
                }
                _ => {}
            }
        }
    });

    // Run the pipeline
    let result = pipeline.run_with_events(&sender)?;

    // Drop sender to signal event thread to finish
    drop(sender);
    event_thread.join().ok();

    // Output results
    match output {
        OutputFormat::Pretty => print_pretty_results(&term, &result, verbose),
        OutputFormat::Json => print_json_results(&result),
        OutputFormat::Minimal => print_minimal_results(&result),
    }

    Ok(())
}

fn print_pretty_results(
    term: &Term,
    result: &PipelineResult,
    verbose: bool,
) {
    term.write_line("").ok();
    term.write_line(&format!(
        "{} Scan Complete",
        style("✓").green().bold()
    ))
    .ok();
    term.write_line("").ok();

    // Summary
    term.write_line(&format!(
        "  {} photos scanned in {:.1}s",
        style(result.total_photos).cyan(),
        result.duration_ms as f64 / 1000.0
    ))
    .ok();

    term.write_line(&format!(
        "  {} duplicate groups found",
        style(result.groups.len()).cyan()
    ))
    .ok();

    let duplicate_count: usize = result.groups.iter().map(|g| g.duplicate_count()).sum();
    term.write_line(&format!(
        "  {} duplicate photos",
        style(duplicate_count).cyan()
    ))
    .ok();

    let savings: u64 = result.groups.iter().map(|g| g.duplicate_size_bytes).sum();
    term.write_line(&format!(
        "  {} potential space savings",
        style(format_bytes(savings)).yellow()
    ))
    .ok();

    if result.cache_hits > 0 {
        term.write_line(&format!(
            "  {} cache hits",
            style(result.cache_hits).dim()
        ))
        .ok();
    }

    term.write_line("").ok();

    // Show groups
    if result.groups.is_empty() {
        term.write_line(&format!(
            "  {} No duplicates found!",
            style("🎉").green()
        ))
        .ok();
    } else {
        term.write_line(&format!(
            "{}",
            style("Duplicate Groups:").bold().underlined()
        ))
        .ok();
        term.write_line("").ok();

        for (i, group) in result.groups.iter().enumerate() {
            term.write_line(&format!(
                "  {} {} ({} photos, {})",
                style(format!("Group {}:", i + 1)).bold(),
                style(format!("{}", group.match_type)).yellow(),
                group.photos.len(),
                format_bytes(group.duplicate_size_bytes)
            ))
            .ok();

            for (_idx, photo) in group.photos.iter().enumerate() {
                let marker = if photo == &group.representative {
                    style("★").green().to_string()
                } else {
                    style("○").dim().to_string()
                };

                let display_path = if photo.starts_with(dirs::home_dir().unwrap_or_default()) {
                    format!(
                        "~/{}",
                        photo
                            .strip_prefix(dirs::home_dir().unwrap_or_default())
                            .unwrap()
                            .display()
                    )
                } else {
                    photo.display().to_string()
                };

                term.write_line(&format!("    {} {}", marker, display_path))
                    .ok();
            }

            if verbose && group.photos.len() > 1 {
                term.write_line(&format!(
                    "    {} {}",
                    style("Recommended:").dim(),
                    style("Keep the starred (★) photo").dim()
                ))
                .ok();
            }

            term.write_line("").ok();
        }
    }

    // Footer
    term.write_line(&format!(
        "{}",
        style("Remember: No files were deleted. Review carefully before taking action.").dim()
    ))
    .ok();
}

fn print_json_results(result: &PipelineResult) {
    let output = serde_json::json!({
        "total_photos": result.total_photos,
        "duplicate_groups": result.groups.len(),
        "duplicate_count": result.groups.iter().map(|g| g.duplicate_count()).sum::<usize>(),
        "potential_savings_bytes": result.groups.iter().map(|g| g.duplicate_size_bytes).sum::<u64>(),
        "duration_ms": result.duration_ms,
        "cache_hits": result.cache_hits,
        "groups": result.groups.iter().map(|g| {
            serde_json::json!({
                "id": g.id.to_string(),
                "match_type": format!("{}", g.match_type),
                "photos": g.photos,
                "representative": g.representative,
                "duplicate_size_bytes": g.duplicate_size_bytes,
            })
        }).collect::<Vec<_>>()
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}

fn print_minimal_results(result: &PipelineResult) {
    for group in &result.groups {
        for photo in &group.photos {
            if photo != &group.representative {
                println!("{}", photo.display());
            }
        }
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} bytes", bytes)
    }
}
