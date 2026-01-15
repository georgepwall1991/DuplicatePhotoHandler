//! # Events Module
//!
//! Event-driven architecture for GUI-ready progress reporting.
//!
//! ## Design
//! The core library emits events through channels, allowing any UI
//! (CLI, GUI, web) to subscribe and display progress.
//!
//! ## Example
//! ```rust,ignore
//! let (sender, receiver) = EventChannel::new();
//!
//! // In a separate thread, listen for events
//! std::thread::spawn(move || {
//!     for event in receiver.iter() {
//!         match event {
//!             Event::ScanProgress(p) => println!("Found {} photos", p.photos_found),
//!             Event::HashProgress(p) => println!("Hashed {}/{}", p.completed, p.total),
//!             _ => {}
//!         }
//!     }
//! });
//!
//! // Run the pipeline with the sender
//! pipeline.run_with_events(sender)?;
//! ```

mod channel;
mod types;

pub use channel::{EventChannel, EventReceiver, EventSender, null_sender};
pub use types::*;
