//! # Folder Watcher Module
//!
//! Monitors directories for photo file changes in real-time.
//!
//! ## Features
//! - Watches for new, modified, and deleted photos
//! - Filters to only supported image formats
//! - Debounces rapid file changes
//! - Sends events through the existing event system
//!
//! ## Example
//! ```rust,ignore
//! use duplicate_photo_cleaner::core::watcher::{FolderWatcher, WatcherConfig};
//!
//! let (tx, rx) = crossbeam_channel::unbounded();
//! let watcher = FolderWatcher::new(WatcherConfig::default(), tx)?;
//! watcher.watch("/Users/photos")?;
//!
//! // In another thread
//! for event in rx {
//!     match event {
//!         WatcherEvent::PhotoAdded(path) => println!("New: {:?}", path),
//!         WatcherEvent::PhotoModified(path) => println!("Changed: {:?}", path),
//!         WatcherEvent::PhotoRemoved(path) => println!("Deleted: {:?}", path),
//!     }
//! }
//! ```

use crate::core::scanner::ImageFormat;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Configuration for the folder watcher
#[derive(Debug, Clone)]
pub struct WatcherConfig {
    /// Debounce duration for rapid file changes
    pub debounce_duration: Duration,
    /// Whether to watch subdirectories recursively
    pub recursive: bool,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self {
            debounce_duration: Duration::from_millis(500),
            recursive: true,
        }
    }
}

/// Events emitted when photos change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WatcherEvent {
    /// A new photo was added
    PhotoAdded(PathBuf),
    /// A photo was modified
    PhotoModified(PathBuf),
    /// A photo was removed
    PhotoRemoved(PathBuf),
    /// An error occurred while watching
    Error(String),
}

/// Watches folders for photo file changes
pub struct FolderWatcher {
    watcher: RecommendedWatcher,
    config: WatcherConfig,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
}

impl FolderWatcher {
    /// Create a new folder watcher that sends events to the provided channel
    pub fn new<F>(config: WatcherConfig, event_handler: F) -> Result<Self, WatcherError>
    where
        F: Fn(WatcherEvent) + Send + 'static,
    {
        let watched_paths = Arc::new(Mutex::new(HashSet::new()));

        let watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
            match result {
                Ok(event) => {
                    if let Some(watcher_event) = Self::process_event(event) {
                        event_handler(watcher_event);
                    }
                }
                Err(e) => {
                    event_handler(WatcherEvent::Error(e.to_string()));
                }
            }
        })
        .map_err(|e| WatcherError::InitFailed(e.to_string()))?;

        Ok(Self {
            watcher,
            config,
            watched_paths,
        })
    }

    /// Process a notify event and convert to WatcherEvent if it's a photo
    fn process_event(event: Event) -> Option<WatcherEvent> {
        // Only process events for photo files
        let paths: Vec<_> = event
            .paths
            .into_iter()
            .filter(|p| Self::is_photo_file(p))
            .collect();

        if paths.is_empty() {
            return None;
        }

        let path = paths.into_iter().next()?;

        match event.kind {
            EventKind::Create(_) => Some(WatcherEvent::PhotoAdded(path)),
            EventKind::Modify(_) => Some(WatcherEvent::PhotoModified(path)),
            EventKind::Remove(_) => Some(WatcherEvent::PhotoRemoved(path)),
            _ => None,
        }
    }

    /// Check if a path is a supported photo file
    fn is_photo_file(path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ImageFormat::from_extension(ext).is_supported())
            .unwrap_or(false)
    }

    /// Start watching a directory
    pub fn watch(&mut self, path: impl AsRef<Path>) -> Result<(), WatcherError> {
        let path = path.as_ref().to_path_buf();

        if !path.exists() {
            return Err(WatcherError::PathNotFound(path));
        }

        let mode = if self.config.recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };

        self.watcher
            .watch(&path, mode)
            .map_err(|e| WatcherError::WatchFailed {
                path: path.clone(),
                reason: e.to_string(),
            })?;

        if let Ok(mut paths) = self.watched_paths.lock() {
            paths.insert(path);
        }

        Ok(())
    }

    /// Stop watching a directory
    pub fn unwatch(&mut self, path: impl AsRef<Path>) -> Result<(), WatcherError> {
        let path = path.as_ref();

        self.watcher
            .unwatch(path)
            .map_err(|e| WatcherError::UnwatchFailed {
                path: path.to_path_buf(),
                reason: e.to_string(),
            })?;

        if let Ok(mut paths) = self.watched_paths.lock() {
            paths.remove(path);
        }

        Ok(())
    }

    /// Get list of currently watched paths
    pub fn watched_paths(&self) -> Vec<PathBuf> {
        self.watched_paths
            .lock()
            .map(|paths| paths.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Check if a path is being watched
    pub fn is_watching(&self, path: impl AsRef<Path>) -> bool {
        self.watched_paths
            .lock()
            .map(|paths| paths.contains(path.as_ref()))
            .unwrap_or(false)
    }
}

/// Errors that can occur during watching
#[derive(Debug, Clone)]
pub enum WatcherError {
    /// Failed to initialize the watcher
    InitFailed(String),
    /// The path to watch doesn't exist
    PathNotFound(PathBuf),
    /// Failed to start watching a path
    WatchFailed { path: PathBuf, reason: String },
    /// Failed to stop watching a path
    UnwatchFailed { path: PathBuf, reason: String },
}

impl std::fmt::Display for WatcherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WatcherError::InitFailed(reason) => {
                write!(f, "Failed to initialize watcher: {}", reason)
            }
            WatcherError::PathNotFound(path) => {
                write!(f, "Path not found: {}", path.display())
            }
            WatcherError::WatchFailed { path, reason } => {
                write!(f, "Failed to watch {}: {}", path.display(), reason)
            }
            WatcherError::UnwatchFailed { path, reason } => {
                write!(f, "Failed to unwatch {}: {}", path.display(), reason)
            }
        }
    }
}

impl std::error::Error for WatcherError {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use tempfile::TempDir;

    #[test]
    fn watcher_config_default() {
        let config = WatcherConfig::default();
        assert_eq!(config.debounce_duration, Duration::from_millis(500));
        assert!(config.recursive);
    }

    #[test]
    fn is_photo_file_detects_photos() {
        assert!(FolderWatcher::is_photo_file(Path::new("/test/photo.jpg")));
        assert!(FolderWatcher::is_photo_file(Path::new("/test/photo.jpeg")));
        assert!(FolderWatcher::is_photo_file(Path::new("/test/photo.png")));
        assert!(FolderWatcher::is_photo_file(Path::new("/test/photo.heic")));
        assert!(FolderWatcher::is_photo_file(Path::new("/test/photo.webp")));
    }

    #[test]
    fn is_photo_file_rejects_non_photos() {
        assert!(!FolderWatcher::is_photo_file(Path::new("/test/file.txt")));
        assert!(!FolderWatcher::is_photo_file(Path::new("/test/file.pdf")));
        assert!(!FolderWatcher::is_photo_file(Path::new("/test/file.doc")));
        assert!(!FolderWatcher::is_photo_file(Path::new("/test/noext")));
    }

    #[test]
    fn watcher_creates_successfully() {
        let (tx, _rx) = mpsc::channel();
        let result = FolderWatcher::new(WatcherConfig::default(), move |event| {
            let _ = tx.send(event);
        });
        assert!(result.is_ok());
    }

    #[test]
    fn watcher_fails_for_nonexistent_path() {
        let (tx, _rx) = mpsc::channel();
        let mut watcher = FolderWatcher::new(WatcherConfig::default(), move |event| {
            let _ = tx.send(event);
        })
        .unwrap();

        let result = watcher.watch("/nonexistent/path/that/doesnt/exist");
        assert!(result.is_err());
    }

    #[test]
    fn watcher_tracks_watched_paths() {
        let temp_dir = TempDir::new().unwrap();
        let (tx, _rx) = mpsc::channel();
        let mut watcher = FolderWatcher::new(WatcherConfig::default(), move |event| {
            let _ = tx.send(event);
        })
        .unwrap();

        watcher.watch(temp_dir.path()).unwrap();
        assert!(watcher.is_watching(temp_dir.path()));

        let paths = watcher.watched_paths();
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], temp_dir.path());
    }

    #[test]
    fn watcher_can_unwatch() {
        let temp_dir = TempDir::new().unwrap();
        let (tx, _rx) = mpsc::channel();
        let mut watcher = FolderWatcher::new(WatcherConfig::default(), move |event| {
            let _ = tx.send(event);
        })
        .unwrap();

        watcher.watch(temp_dir.path()).unwrap();
        assert!(watcher.is_watching(temp_dir.path()));

        watcher.unwatch(temp_dir.path()).unwrap();
        assert!(!watcher.is_watching(temp_dir.path()));
    }

    #[test]
    fn watcher_event_serializable() {
        let event = WatcherEvent::PhotoAdded(PathBuf::from("/test/photo.jpg"));
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: WatcherEvent = serde_json::from_str(&json).unwrap();

        match deserialized {
            WatcherEvent::PhotoAdded(path) => {
                assert_eq!(path, PathBuf::from("/test/photo.jpg"));
            }
            _ => panic!("Wrong event type"),
        }
    }
}
