//! Human-readable explanations for duplicate matches.

use crate::core::comparator::MatchType;
use crate::core::hasher::HashAlgorithmKind;
use crate::error::ReportError;
use serde::{Deserialize, Serialize};

/// Detailed explanation of why photos are considered duplicates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateExplanation {
    /// One-line summary (e.g., "These photos are 98% visually identical")
    pub summary: String,
    /// The match classification
    pub match_type: MatchType,
    /// Hamming distance between hashes
    pub hash_distance: u32,
    /// Similarity as a percentage (0-100)
    pub similarity_percent: f64,
    /// Technical details for advanced users
    pub technical: TechnicalDetails,
    /// Human-friendly explanation
    pub human_readable: String,
}

/// Technical details about the hash comparison
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TechnicalDetails {
    /// Algorithm used for hashing
    pub algorithm: HashAlgorithmKind,
    /// Hash of first photo (hex)
    pub hash_a: String,
    /// Hash of second photo (hex)
    pub hash_b: String,
    /// Number of bits that differ
    pub differing_bits: u32,
    /// Total bits in hash
    pub total_bits: u32,
}

impl DuplicateExplanation {
    /// Create an explanation for a match
    pub fn new(
        match_type: MatchType,
        distance: u32,
        similarity: f64,
        algorithm: HashAlgorithmKind,
        hash_a: String,
        hash_b: String,
        total_bits: u32,
    ) -> Self {
        let summary = Self::generate_summary(match_type, similarity);
        let human_readable = Self::generate_human_readable(match_type, distance, total_bits);

        Self {
            summary,
            match_type,
            hash_distance: distance,
            similarity_percent: similarity,
            technical: TechnicalDetails {
                algorithm,
                hash_a,
                hash_b,
                differing_bits: distance,
                total_bits,
            },
            human_readable,
        }
    }

    /// Generate a one-line summary
    fn generate_summary(match_type: MatchType, similarity: f64) -> String {
        match match_type {
            MatchType::Exact => "These photos are identical".to_string(),
            MatchType::NearExact => {
                format!("These photos are virtually identical ({:.0}% match)", similarity)
            }
            MatchType::Similar => {
                format!(
                    "These photos are very similar ({:.0}% match) - likely the same photo with different edits",
                    similarity
                )
            }
            MatchType::MaybeSimilar => {
                format!(
                    "These photos might be related ({:.0}% match) - please review carefully",
                    similarity
                )
            }
        }
    }

    /// Generate a human-readable explanation
    fn generate_human_readable(match_type: MatchType, distance: u32, total_bits: u32) -> String {
        match match_type {
            MatchType::Exact => {
                "These photos produce the exact same visual fingerprint. \
                 They show identical content - they may be exact file copies, \
                 or have only metadata differences (like EXIF data or file names)."
                    .to_string()
            }
            MatchType::NearExact => {
                format!(
                    "These photos are virtually identical. \
                     Only {} out of {} comparison points differ, which is typically \
                     due to minor compression differences or format conversion. \
                     They show the same image.",
                    distance, total_bits
                )
            }
            MatchType::Similar => {
                format!(
                    "These photos are very similar with {} differences out of {} comparison points. \
                     This typically means they are the same photo with different edits \
                     (cropping, filters, brightness adjustment), or photos taken moments apart.",
                    distance, total_bits
                )
            }
            MatchType::MaybeSimilar => {
                format!(
                    "These photos share significant visual elements with {} differences \
                     out of {} comparison points. They have notable differences and may be \
                     similar scenes rather than true duplicates. Please review both photos \
                     carefully before deciding.",
                    distance, total_bits
                )
            }
        }
    }
}

/// Reporter that generates detailed explanations
pub struct DetailedReporter {
    algorithm: HashAlgorithmKind,
}

impl DetailedReporter {
    /// Create a new detailed reporter
    pub fn new(algorithm: HashAlgorithmKind) -> Self {
        Self { algorithm }
    }

    /// Generate an explanation for a match
    pub fn explain(
        &self,
        distance: u32,
        similarity: f64,
        hash_a: &[u8],
        hash_b: &[u8],
    ) -> Result<DuplicateExplanation, ReportError> {
        let match_type = MatchType::from_distance(distance);
        let total_bits = (hash_a.len() * 8) as u32;

        let hash_a_hex = hash_a.iter().map(|b| format!("{:02x}", b)).collect();
        let hash_b_hex = hash_b.iter().map(|b| format!("{:02x}", b)).collect();

        Ok(DuplicateExplanation::new(
            match_type,
            distance,
            similarity,
            self.algorithm,
            hash_a_hex,
            hash_b_hex,
            total_bits,
        ))
    }
}

impl Default for DetailedReporter {
    fn default() -> Self {
        Self::new(HashAlgorithmKind::Difference)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_summary_is_clear() {
        let explanation = DuplicateExplanation::new(
            MatchType::Exact,
            0,
            100.0,
            HashAlgorithmKind::Difference,
            "ff00".to_string(),
            "ff00".to_string(),
            16,
        );

        assert!(explanation.summary.contains("identical"));
    }

    #[test]
    fn near_exact_includes_percentage() {
        let explanation = DuplicateExplanation::new(
            MatchType::NearExact,
            2,
            96.875,
            HashAlgorithmKind::Difference,
            "ff00".to_string(),
            "ff03".to_string(),
            64,
        );

        // Check it includes a percentage (rounded to whole number)
        assert!(explanation.summary.contains("97") || explanation.summary.contains("96"));
        assert!(explanation.summary.contains("virtually identical"));
    }

    #[test]
    fn technical_details_included() {
        let explanation = DuplicateExplanation::new(
            MatchType::Similar,
            5,
            92.0,
            HashAlgorithmKind::Perceptual,
            "deadbeef".to_string(),
            "deadbeee".to_string(),
            32,
        );

        assert_eq!(explanation.technical.algorithm, HashAlgorithmKind::Perceptual);
        assert_eq!(explanation.technical.differing_bits, 5);
        assert_eq!(explanation.technical.hash_a, "deadbeef");
    }

    #[test]
    fn human_readable_is_non_technical() {
        let explanation = DuplicateExplanation::new(
            MatchType::Exact,
            0,
            100.0,
            HashAlgorithmKind::Difference,
            "ff".to_string(),
            "ff".to_string(),
            8,
        );

        // Should not contain technical jargon
        assert!(!explanation.human_readable.contains("Hamming"));
        assert!(!explanation.human_readable.contains("hash"));
        // Should be understandable
        assert!(explanation.human_readable.contains("fingerprint")
            || explanation.human_readable.contains("identical"));
    }

    #[test]
    fn reporter_generates_explanation() {
        let reporter = DetailedReporter::new(HashAlgorithmKind::Difference);

        let explanation = reporter
            .explain(3, 95.0, &[0xFF, 0x00], &[0xFF, 0x07])
            .unwrap();

        assert_eq!(explanation.match_type, MatchType::NearExact);
        assert_eq!(explanation.hash_distance, 3);
    }
}
