//! Event channel implementation using crossbeam-channel.
//!
//! Provides a thread-safe way to send events from the core library
//! to any UI layer.

use crossbeam_channel::{bounded, unbounded, Receiver, Sender};

use super::Event;

/// Sends events from the core library.
///
/// This is a thin wrapper around crossbeam's Sender that can be
/// cloned and sent across threads.
#[derive(Clone)]
pub struct EventSender {
    inner: Sender<Event>,
}

impl EventSender {
    /// Create a new EventSender from a raw crossbeam sender.
    pub fn new(sender: Sender<Event>) -> Self {
        Self { inner: sender }
    }

    /// Send an event. Non-blocking if the channel isn't full.
    ///
    /// If the receiver is dropped, the event is silently discarded.
    /// This allows progress reporting to be optional.
    pub fn send(&self, event: Event) {
        // Ignore send errors - if the receiver is dropped, we just
        // continue without progress reporting
        let _ = self.inner.send(event);
    }
}

/// Receives events from the core library.
///
/// Used by UI layers to subscribe to progress updates.
pub struct EventReceiver {
    inner: Receiver<Event>,
}

impl EventReceiver {
    /// Block until the next event is received
    pub fn recv(&self) -> Option<Event> {
        self.inner.recv().ok()
    }

    /// Try to receive an event without blocking
    pub fn try_recv(&self) -> Option<Event> {
        self.inner.try_recv().ok()
    }

    /// Returns an iterator over received events
    pub fn iter(&self) -> impl Iterator<Item = Event> + '_ {
        self.inner.iter()
    }
}

/// A bidirectional event channel for communication between
/// the core library and UI layers.
pub struct EventChannel;

impl EventChannel {
    /// Create a new unbounded event channel.
    ///
    /// Use this for most cases - events are small and fast.
    pub fn new() -> (EventSender, EventReceiver) {
        let (sender, receiver) = unbounded();
        (
            EventSender { inner: sender },
            EventReceiver { inner: receiver },
        )
    }

    /// Create a bounded event channel with the specified capacity.
    ///
    /// Use this if you need backpressure (e.g., slow UI that can't
    /// keep up with events).
    pub fn bounded(capacity: usize) -> (EventSender, EventReceiver) {
        let (sender, receiver) = bounded(capacity);
        (
            EventSender { inner: sender },
            EventReceiver { inner: receiver },
        )
    }
}

impl Default for EventChannel {
    fn default() -> Self {
        EventChannel
    }
}

/// A no-op event sender for when you don't need progress reporting.
///
/// This is useful for tests or when running without a UI.
pub fn null_sender() -> EventSender {
    let (sender, _receiver) = EventChannel::new();
    sender
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{ScanEvent, ScanProgress};
    use std::path::PathBuf;
    use std::thread;

    #[test]
    fn events_can_be_sent_across_threads() {
        let (sender, receiver) = EventChannel::new();

        let handle = thread::spawn(move || {
            sender.send(Event::Scan(ScanEvent::Progress(ScanProgress {
                directories_scanned: 5,
                photos_found: 25,
                current_path: PathBuf::from("/test"),
            })));
        });

        handle.join().unwrap();

        let event = receiver.recv().unwrap();
        match event {
            Event::Scan(ScanEvent::Progress(p)) => {
                assert_eq!(p.photos_found, 25);
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn null_sender_does_not_panic() {
        let sender = null_sender();
        sender.send(Event::Pipeline(super::super::PipelineEvent::Started));
        // Should not panic even though no one is receiving
    }

    #[test]
    fn bounded_channel_respects_capacity() {
        let (sender, receiver) = EventChannel::bounded(2);

        sender.send(Event::Pipeline(super::super::PipelineEvent::Started));
        sender.send(Event::Pipeline(super::super::PipelineEvent::Started));

        // Third send would block, but we can still receive
        assert!(receiver.try_recv().is_some());
        assert!(receiver.try_recv().is_some());
        assert!(receiver.try_recv().is_none());
    }
}
