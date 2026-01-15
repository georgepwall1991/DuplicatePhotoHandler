//! Trait definitions for comparison strategies.

use super::MatchType;

/// Strategy trait for determining if photos are duplicates
pub trait ComparisonStrategy: Send + Sync {
    /// Determine if two photos should be considered duplicates based on distance
    fn is_duplicate(&self, distance: u32) -> bool;

    /// Classify the match type based on distance
    fn classify(&self, distance: u32) -> MatchType;

    /// Get the threshold used
    fn threshold(&self) -> u32;

    /// Human-readable description of the strategy
    fn description(&self) -> String;
}

/// Simple threshold-based comparison strategy
#[derive(Debug, Clone)]
pub struct ThresholdStrategy {
    /// Maximum distance to consider as duplicate
    threshold: u32,
}

impl ThresholdStrategy {
    /// Create a new threshold strategy
    ///
    /// Recommended thresholds:
    /// - 5: Conservative, few false positives
    /// - 8: Balanced (default)
    /// - 10: Permissive, catches more near-duplicates
    pub fn new(threshold: u32) -> Self {
        Self { threshold }
    }

    /// Create a conservative strategy (threshold = 5)
    pub fn conservative() -> Self {
        Self::new(5)
    }

    /// Create a balanced strategy (threshold = 8)
    pub fn balanced() -> Self {
        Self::new(8)
    }

    /// Create a permissive strategy (threshold = 10)
    pub fn permissive() -> Self {
        Self::new(10)
    }
}

impl Default for ThresholdStrategy {
    fn default() -> Self {
        Self::balanced()
    }
}

impl ComparisonStrategy for ThresholdStrategy {
    fn is_duplicate(&self, distance: u32) -> bool {
        distance <= self.threshold
    }

    fn classify(&self, distance: u32) -> MatchType {
        MatchType::from_distance(distance)
    }

    fn threshold(&self) -> u32 {
        self.threshold
    }

    fn description(&self) -> String {
        format!(
            "Threshold strategy: photos with distance ≤ {} are considered duplicates",
            self.threshold
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threshold_strategy_at_boundary() {
        let strategy = ThresholdStrategy::new(5);

        assert!(strategy.is_duplicate(4));
        assert!(strategy.is_duplicate(5));
        assert!(!strategy.is_duplicate(6));
    }

    #[test]
    fn threshold_strategy_classifies_correctly() {
        let strategy = ThresholdStrategy::new(10);

        assert_eq!(strategy.classify(0), MatchType::Exact);
        assert_eq!(strategy.classify(3), MatchType::NearExact);
        assert_eq!(strategy.classify(7), MatchType::Similar);
        assert_eq!(strategy.classify(12), MatchType::MaybeSimilar);
    }

    #[test]
    fn preset_strategies() {
        assert_eq!(ThresholdStrategy::conservative().threshold(), 5);
        assert_eq!(ThresholdStrategy::balanced().threshold(), 8);
        assert_eq!(ThresholdStrategy::permissive().threshold(), 10);
    }

    #[test]
    fn description_includes_threshold() {
        let strategy = ThresholdStrategy::new(7);
        let desc = strategy.description();

        assert!(desc.contains("7"));
    }
}
