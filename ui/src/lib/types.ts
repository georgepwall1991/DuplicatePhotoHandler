// Shared types for the duplicate photo finder

export type AppState = 'idle' | 'scanning' | 'results'

export interface ScanResult {
  total_photos: number
  duplicate_groups: number
  duplicate_count: number
  potential_savings_bytes: number
  duration_ms: number
  groups: DuplicateGroup[]
  errors: string[]
}

export interface DuplicateGroup {
  id: string
  photos: string[]
  representative: string
  match_type: string
  duplicate_count: number
  duplicate_size_bytes: number
}

export interface ScanProgress {
  phase: string
  percent: number
  message: string
}

export interface FileInfo {
  path: string
  filename: string
  size_bytes: number
  modified: string | null
  dimensions: [number, number] | null
}

export interface QualityScore {
  path: string
  sharpness: number
  contrast: number
  brightness: number
  overall: number
}

// Export result from backend
export interface ExportResult {
  success: boolean
  path: string
  format: string
  groups_exported: number
}

// Watcher events from backend
export interface WatcherEvent {
  Watcher: {
    Started?: { path: string }
    Stopped?: { path: string }
    PhotoAdded?: { path: string }
    PhotoModified?: { path: string }
    PhotoRemoved?: { path: string }
    Error?: { message: string }
  }
}

// Screenshot confidence level
export type ScreenshotConfidence = 'high' | 'medium' | 'low'

// Screenshot information
export interface ScreenshotInfo {
  path: string
  size_bytes: number
  width: number
  height: number
  date_taken: string | null
  confidence: ScreenshotConfidence
  detection_reason: string
  source_app: string | null
}

// Screenshot scan result - returned from scan_screenshots command
export interface ScreenshotScanResult {
  all_screenshots: ScreenshotInfo[]
  duplicate_groups: DuplicateGroup[]
  total_size_bytes: number
  scan_duration_ms: number
}

// Large file information
export interface LargeFileInfo {
  path: string
  filename: string
  size_bytes: number
  file_type: string
  modified: number  // Unix timestamp
}

// Large file scan result
export interface LargeFileScanResult {
  files: LargeFileInfo[]
  total_size_bytes: number
  files_scanned: number
  scan_duration_ms: number
}

// Module routing
export type ActiveModule = 'duplicates' | 'screenshots' | 'large' | 'organize'

// Organization types
export type FolderStructure = 'year_month' | 'year_month_day' | 'year_month_flat'
export type OperationMode = 'copy' | 'move'

export interface OrganizeConfig {
  source_paths: string[]
  destination: string
  structure: FolderStructure
  operation: OperationMode
}

export interface PlannedFile {
  source: string
  destination: string
  filename: string
  date: string | null
  size_bytes: number
  has_conflict: boolean
}

export interface YearSummary {
  year: number
  count: number
  size_bytes: number
}

export interface OrganizePlan {
  id: string
  files: PlannedFile[]
  total_files: number
  total_size_bytes: number
  date_range: [string, string] | null
  by_year: YearSummary[]
  no_date_count: number
  conflict_count: number
}

export interface OrganizeResult {
  files_processed: number
  folders_created: number
  total_size_bytes: number
  duration_ms: number
  errors: string[]
}

export interface OrganizeProgress {
  phase: string
  current: number
  total: number
  current_file: string
}
