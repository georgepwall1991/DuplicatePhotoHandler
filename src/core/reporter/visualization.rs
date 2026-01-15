//! Hash difference visualization.
//!
//! Provides visual representations of hash differences
//! to help users understand why photos are considered duplicates.

/// Visualizes hash differences
pub struct HashVisualizer {
    /// Size of the hash grid (typically 8 or 16)
    grid_size: usize,
}

impl HashVisualizer {
    /// Create a new visualizer for the given hash size
    pub fn new(hash_bytes: usize) -> Self {
        // Calculate grid size from byte count
        // 8 bytes = 64 bits = 8x8 grid
        let bits = hash_bytes * 8;
        let grid_size = (bits as f64).sqrt() as usize;
        Self { grid_size }
    }

    /// Generate an ASCII visualization of hash difference
    ///
    /// Shows a grid where:
    /// - `.` = bits match
    /// - `X` = bits differ
    pub fn visualize_difference(&self, hash_a: &[u8], hash_b: &[u8]) -> String {
        let mut output = String::new();
        output.push_str("Hash Difference Map (. = same, X = different):\n\n");

        for row in 0..self.grid_size {
            output.push_str("  ");
            for col in 0..self.grid_size {
                let bit_idx = row * self.grid_size + col;
                let byte_idx = bit_idx / 8;
                let bit_offset = 7 - (bit_idx % 8);

                let bit_a = hash_a
                    .get(byte_idx)
                    .map(|b| (b >> bit_offset) & 1)
                    .unwrap_or(0);
                let bit_b = hash_b
                    .get(byte_idx)
                    .map(|b| (b >> bit_offset) & 1)
                    .unwrap_or(0);

                if bit_a == bit_b {
                    output.push('.');
                } else {
                    output.push('X');
                }
                output.push(' ');
            }
            output.push('\n');
        }

        output
    }

    /// Generate a summary of the difference
    pub fn summarize_difference(&self, hash_a: &[u8], hash_b: &[u8]) -> String {
        let total_bits = hash_a.len() * 8;
        let differing: u32 = hash_a
            .iter()
            .zip(hash_b.iter())
            .map(|(a, b)| (a ^ b).count_ones())
            .sum();

        let similarity = 100.0 - (differing as f64 / total_bits as f64 * 100.0);

        format!(
            "{} of {} bits differ ({:.1}% similar)",
            differing, total_bits, similarity
        )
    }

    /// Generate a compact difference indicator
    ///
    /// Returns a visual bar showing similarity:
    /// `[████████░░] 80%`
    pub fn similarity_bar(&self, similarity_percent: f64) -> String {
        let filled = (similarity_percent / 10.0).round() as usize;
        let empty = 10 - filled;

        format!(
            "[{}{}] {:.0}%",
            "█".repeat(filled),
            "░".repeat(empty),
            similarity_percent
        )
    }
}

impl Default for HashVisualizer {
    fn default() -> Self {
        Self::new(8) // 8 bytes = 8x8 grid
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visualize_identical_hashes() {
        let visualizer = HashVisualizer::new(8); // 8 bytes = 64 bits = 8x8 grid
        let hash = vec![0xFF; 8];

        let output = visualizer.visualize_difference(&hash, &hash);

        // Should show dots (no differences)
        assert!(output.contains('.'));
        // Identical hashes should produce mostly dots - allow for header text
        let dot_count = output.chars().filter(|&c| c == '.').count();
        assert!(dot_count >= 64, "Expected at least 64 dots, got {}", dot_count);
    }

    #[test]
    fn visualize_different_hashes() {
        // Use 8 bytes for an 8x8 grid (64 bits)
        let visualizer = HashVisualizer::new(8);
        let hash_a = vec![0xFF; 8]; // All 1s
        let hash_b = vec![0x00; 8]; // All 0s

        let output = visualizer.visualize_difference(&hash_a, &hash_b);

        // Should show X's for differences
        assert!(output.contains('X'));
        // All bits differ, so should have at least 64 X's
        let x_count = output.chars().filter(|&c| c == 'X').count();
        assert!(x_count >= 64, "Expected at least 64 X's, got {}", x_count);
    }

    #[test]
    fn summarize_identical() {
        let visualizer = HashVisualizer::new(8);
        let hash = vec![0xFF; 8];

        let summary = visualizer.summarize_difference(&hash, &hash);

        assert!(summary.contains("0 of 64"));
        assert!(summary.contains("100"));
    }

    #[test]
    fn summarize_different() {
        let visualizer = HashVisualizer::new(1);
        let hash_a = vec![0xFF];
        let hash_b = vec![0x00];

        let summary = visualizer.summarize_difference(&hash_a, &hash_b);

        assert!(summary.contains("8 of 8"));
        assert!(summary.contains("0")); // 0% similar
    }

    #[test]
    fn similarity_bar_full() {
        let visualizer = HashVisualizer::default();
        let bar = visualizer.similarity_bar(100.0);

        assert!(bar.contains("██████████"));
        assert!(bar.contains("100%"));
    }

    #[test]
    fn similarity_bar_partial() {
        let visualizer = HashVisualizer::default();
        let bar = visualizer.similarity_bar(50.0);

        assert!(bar.contains("█████"));
        assert!(bar.contains("░░░░░"));
        assert!(bar.contains("50%"));
    }
}
