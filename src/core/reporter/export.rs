//! Export functionality for duplicate reports.
//!
//! Supports CSV and HTML export formats for sharing and archiving results.

use crate::core::comparator::DuplicateGroup;
use std::io::Write;
use std::path::Path;

/// Export format options
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Csv,
    Html,
}

/// Export duplicates to CSV format
///
/// CSV columns: Group ID, Photo Path, Is Representative, Match Type, File Size
pub fn export_csv<W: Write>(groups: &[DuplicateGroup], mut writer: W) -> std::io::Result<()> {
    // Write header
    writeln!(
        writer,
        "Group ID,Photo Path,Is Representative,Match Type,Duplicate Size (bytes)"
    )?;

    for group in groups {
        for photo in &group.photos {
            let is_representative = photo == &group.representative;
            let duplicate_size = if is_representative {
                0
            } else {
                // Estimate size - actual size would need file access
                0
            };

            writeln!(
                writer,
                "{},{},{},{:?},{}",
                group.id,
                photo.display(),
                is_representative,
                group.match_type,
                duplicate_size
            )?;
        }
    }

    Ok(())
}

/// Export duplicates to HTML format
///
/// Generates a standalone HTML report with styling and thumbnails
pub fn export_html<W: Write>(
    groups: &[DuplicateGroup],
    mut writer: W,
    title: &str,
) -> std::io::Result<()> {
    // Write HTML header
    write!(
        writer,
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        :root {{
            --bg-primary: #0a0a0a;
            --bg-secondary: #1a1a1a;
            --bg-tertiary: #2a2a2a;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
            --accent: #3b82f6;
            --success: #22c55e;
            --warning: #f59e0b;
            --danger: #ef4444;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 2rem;
        }}

        .container {{
            max-width: 1200px;
            margin: 0 auto;
        }}

        header {{
            text-align: center;
            margin-bottom: 3rem;
            padding-bottom: 2rem;
            border-bottom: 1px solid var(--bg-tertiary);
        }}

        h1 {{
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, var(--accent), #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}

        .summary {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }}

        .stat-card {{
            background: var(--bg-secondary);
            padding: 1.5rem;
            border-radius: 12px;
            text-align: center;
        }}

        .stat-value {{
            font-size: 2rem;
            font-weight: bold;
            color: var(--accent);
        }}

        .stat-label {{
            color: var(--text-secondary);
            font-size: 0.875rem;
        }}

        .group {{
            background: var(--bg-secondary);
            border-radius: 16px;
            margin-bottom: 1.5rem;
            overflow: hidden;
        }}

        .group-header {{
            padding: 1rem 1.5rem;
            background: var(--bg-tertiary);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}

        .group-title {{
            font-weight: 600;
        }}

        .match-badge {{
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 500;
        }}

        .match-exact {{ background: var(--success); color: white; }}
        .match-nearexact {{ background: var(--accent); color: white; }}
        .match-similar {{ background: var(--warning); color: black; }}

        .photos {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem;
            padding: 1.5rem;
        }}

        .photo {{
            background: var(--bg-tertiary);
            border-radius: 8px;
            padding: 1rem;
            transition: transform 0.2s;
        }}

        .photo:hover {{
            transform: translateY(-2px);
        }}

        .photo.representative {{
            border: 2px solid var(--success);
        }}

        .photo-path {{
            font-size: 0.75rem;
            color: var(--text-secondary);
            word-break: break-all;
            margin-bottom: 0.5rem;
        }}

        .photo-meta {{
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }}

        .keep-badge {{
            display: inline-block;
            background: var(--success);
            color: white;
            padding: 0.125rem 0.5rem;
            border-radius: 4px;
            font-size: 0.625rem;
            text-transform: uppercase;
            margin-top: 0.5rem;
        }}

        footer {{
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary);
            font-size: 0.875rem;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>{}</h1>
            <p style="color: var(--text-secondary);">Generated by Duplicate Photo Cleaner</p>
        </header>
"#,
        title, title
    )?;

    // Summary stats
    let total_groups = groups.len();
    let total_duplicates: usize = groups.iter().map(|g| g.duplicate_count()).sum();
    let potential_savings: u64 = groups.iter().map(|g| g.duplicate_size_bytes).sum();

    write!(
        writer,
        r#"
        <div class="summary">
            <div class="stat-card">
                <div class="stat-value">{}</div>
                <div class="stat-label">Duplicate Groups</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{}</div>
                <div class="stat-label">Total Duplicates</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{}</div>
                <div class="stat-label">Potential Savings</div>
            </div>
        </div>
"#,
        total_groups,
        total_duplicates,
        format_bytes(potential_savings)
    )?;

    // Groups
    for group in groups {
        let match_class = match group.match_type {
            crate::core::comparator::MatchType::Exact => "match-exact",
            crate::core::comparator::MatchType::NearExact => "match-nearexact",
            _ => "match-similar",
        };

        write!(
            writer,
            r#"
        <div class="group">
            <div class="group-header">
                <span class="group-title">{} photos</span>
                <span class="match-badge {}">{:?}</span>
            </div>
            <div class="photos">
"#,
            group.photos.len(),
            match_class,
            group.match_type
        )?;

        for photo in &group.photos {
            let is_representative = photo == &group.representative;
            let class = if is_representative {
                "photo representative"
            } else {
                "photo"
            };

            let filename = photo
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown");

            write!(
                writer,
                r#"
                <div class="{}">
                    <div class="photo-path">{}</div>
                    <div class="photo-meta">
                        <span>{}</span>
                    </div>
                    {}
                </div>
"#,
                class,
                photo.display(),
                filename,
                if is_representative {
                    "<span class=\"keep-badge\">Keep</span>"
                } else {
                    ""
                }
            )?;
        }

        writeln!(writer, "            </div>\n        </div>")?;
    }

    // Footer
    write!(
        writer,
        r#"
        <footer>
            <p>Report generated by Duplicate Photo Cleaner</p>
        </footer>
    </div>
</body>
</html>
"#
    )?;

    Ok(())
}

/// Format bytes as human-readable string
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
        format!("{} B", bytes)
    }
}

/// Export groups to a file
pub fn export_to_file(
    groups: &[DuplicateGroup],
    path: &Path,
    format: ExportFormat,
) -> std::io::Result<()> {
    let file = std::fs::File::create(path)?;
    let writer = std::io::BufWriter::new(file);

    match format {
        ExportFormat::Csv => export_csv(groups, writer),
        ExportFormat::Html => {
            let title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Duplicate Report");
            export_html(groups, writer, title)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::comparator::MatchType;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn create_test_group() -> DuplicateGroup {
        DuplicateGroup {
            id: Uuid::new_v4(),
            photos: vec![
                PathBuf::from("/photos/original.jpg"),
                PathBuf::from("/photos/copy.jpg"),
                PathBuf::from("/photos/backup/original.jpg"),
            ],
            representative: PathBuf::from("/photos/original.jpg"),
            match_type: MatchType::Exact,
            average_distance: 0.0,
            duplicate_size_bytes: 5_000_000,
        }
    }

    #[test]
    fn csv_export_includes_header() {
        let groups = vec![create_test_group()];
        let mut output = Vec::new();

        export_csv(&groups, &mut output).unwrap();

        let csv = String::from_utf8(output).unwrap();
        assert!(csv.starts_with("Group ID,Photo Path,Is Representative,Match Type"));
    }

    #[test]
    fn csv_export_includes_all_photos() {
        let groups = vec![create_test_group()];
        let mut output = Vec::new();

        export_csv(&groups, &mut output).unwrap();

        let csv = String::from_utf8(output).unwrap();
        assert!(csv.contains("original.jpg"));
        assert!(csv.contains("copy.jpg"));
        assert!(csv.contains("backup/original.jpg"));
    }

    #[test]
    fn csv_marks_representative() {
        let groups = vec![create_test_group()];
        let mut output = Vec::new();

        export_csv(&groups, &mut output).unwrap();

        let csv = String::from_utf8(output).unwrap();
        let lines: Vec<_> = csv.lines().collect();

        // One line should have "true" for representative
        let representative_lines: Vec<_> = lines.iter().filter(|l| l.contains(",true,")).collect();
        assert_eq!(representative_lines.len(), 1);
    }

    #[test]
    fn html_export_generates_valid_html() {
        let groups = vec![create_test_group()];
        let mut output = Vec::new();

        export_html(&groups, &mut output, "Test Report").unwrap();

        let html = String::from_utf8(output).unwrap();
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("<html"));
        assert!(html.contains("</html>"));
    }

    #[test]
    fn html_export_includes_title() {
        let groups = vec![create_test_group()];
        let mut output = Vec::new();

        export_html(&groups, &mut output, "My Duplicate Report").unwrap();

        let html = String::from_utf8(output).unwrap();
        assert!(html.contains("My Duplicate Report"));
    }

    #[test]
    fn html_export_includes_summary_stats() {
        let groups = vec![create_test_group()];
        let mut output = Vec::new();

        export_html(&groups, &mut output, "Test").unwrap();

        let html = String::from_utf8(output).unwrap();
        assert!(html.contains("Duplicate Groups"));
        assert!(html.contains("Total Duplicates"));
        assert!(html.contains("Potential Savings"));
    }

    #[test]
    fn format_bytes_handles_all_sizes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1024), "1.0 KB");
        assert_eq!(format_bytes(1024 * 1024), "1.0 MB");
        assert_eq!(format_bytes(1024 * 1024 * 1024), "1.0 GB");
        assert_eq!(format_bytes(5_000_000), "4.8 MB");
    }
}
