use duplicate_photo_cleaner::core::unorganized::{UnorganizedConfig, UnorganizedReason, UnorganizedScanner};
use std::fs;
use std::io::Write;
use tempfile::TempDir;

#[test]
fn test_unorganized_scanner_integration() {
    let temp = TempDir::new().unwrap();

    // Create organized structure: 2024/01/photo.jpg (depth 2, date pattern, non-generic)
    let organized_dir = temp.path().join("2024").join("01");
    fs::create_dir_all(&organized_dir).unwrap();
    let organized_file = organized_dir.join("vacation_photo.jpg");
    fs::File::create(&organized_file).unwrap().write_all(b"test").unwrap();

    // Create unorganized files

    // 1. File in root (depth 0)
    let root_file = temp.path().join("IMG_001.jpg");
    fs::File::create(&root_file).unwrap().write_all(b"test").unwrap();

    // 2. File with generic name in shallow folder
    let shallow_dir = temp.path().join("photos");
    fs::create_dir_all(&shallow_dir).unwrap();
    let shallow_file = shallow_dir.join("DSC_0001.jpg");
    fs::File::create(&shallow_file).unwrap().write_all(b"test").unwrap();

    // 3. File in non-date folder
    let no_date_dir = temp.path().join("vacation").join("beach");
    fs::create_dir_all(&no_date_dir).unwrap();
    let no_date_file = no_date_dir.join("sunset.jpg");
    fs::File::create(&no_date_file).unwrap().write_all(b"test").unwrap();

    let config = UnorganizedConfig {
        source_paths: vec![temp.path().display().to_string()],
        check_root: true,
        check_date_pattern: true,
        check_generic_names: true,
        min_depth: 2,
    };

    let result = UnorganizedScanner::scan(&config, |_, _| {}).unwrap();

    println!("=== Results ===");
    println!("Total unorganized: {}", result.total_files);
    for file in &result.files {
        println!("  {} - {:?}", file.filename, file.reasons);
    }

    // Should find 3 unorganized files (root, shallow, no-date)
    // The organized file should NOT be flagged
    assert!(result.total_files >= 3, "Expected at least 3 unorganized files, got {}", result.total_files);

    // Check root file is flagged
    let root_result = result.files.iter().find(|f| f.filename == "IMG_001.jpg");
    assert!(root_result.is_some(), "Root file should be found");
    let root_result = root_result.unwrap();
    assert!(root_result.reasons.contains(&UnorganizedReason::InRoot), "Root file should have InRoot reason");
    assert!(root_result.reasons.contains(&UnorganizedReason::GenericName), "IMG_001 should have GenericName reason");

    // Check shallow file is flagged
    let shallow_result = result.files.iter().find(|f| f.filename == "DSC_0001.jpg");
    assert!(shallow_result.is_some(), "Shallow file should be found");
    let shallow_result = shallow_result.unwrap();
    assert!(shallow_result.reasons.contains(&UnorganizedReason::ShallowFolder), "Shallow file should have ShallowFolder reason");

    // Check organized file is NOT flagged
    let organized_result = result.files.iter().find(|f| f.filename == "vacation_photo.jpg");
    assert!(organized_result.is_none(), "Organized file should NOT be flagged as unorganized");
}

#[test]
fn test_organize_planner_integration() {
    use duplicate_photo_cleaner::core::organize::{OrganizeConfig, OrganizePlanner, FolderStructure, OperationMode};

    let temp = TempDir::new().unwrap();

    // Create source files
    let source_dir = temp.path().join("source");
    fs::create_dir_all(&source_dir).unwrap();

    let file1 = source_dir.join("photo1.jpg");
    fs::File::create(&file1).unwrap().write_all(b"test1").unwrap();

    let file2 = source_dir.join("photo2.jpg");
    fs::File::create(&file2).unwrap().write_all(b"test2").unwrap();

    // Create destination
    let dest_dir = temp.path().join("organized");
    fs::create_dir_all(&dest_dir).unwrap();

    let config = OrganizeConfig {
        source_paths: vec![source_dir.display().to_string()],
        destination: dest_dir.display().to_string(),
        structure: FolderStructure::YearMonth,
        operation: OperationMode::Copy,
    };

    let plan = OrganizePlanner::create_plan(&config, |_, _| {}).unwrap();

    println!("=== Organize Plan ===");
    println!("Total files: {}", plan.total_files);
    println!("Files with no date: {}", plan.no_date_count);
    for file in &plan.files {
        println!("  {} -> {}", file.source, file.destination);
    }

    assert_eq!(plan.total_files, 2, "Should have 2 files in plan");
}
