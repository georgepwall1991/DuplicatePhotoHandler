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
export type ActiveModule = 'duplicates' | 'screenshots' | 'large' | 'organize' | 'unorganized' | 'similar' | 'history' | 'master'

// Master Scan types
export type MasterScanModule = 'duplicates' | 'similar' | 'large' | 'screenshots' | 'unorganized'

export interface MasterScanConfig {
  paths: string[]
  enabled_modules: MasterScanModule[]
  // Per-module settings
  duplicate_threshold?: number
  duplicate_algorithm?: string
  similar_min_distance?: number
  similar_max_distance?: number
  large_file_threshold?: number
}

export interface MasterModuleResult {
  module: MasterScanModule
  status: 'pending' | 'running' | 'completed' | 'error'
  progress: number
  error?: string
  // Module-specific counts
  items_found?: number
  groups_found?: number
  savings_bytes?: number
}

export interface MasterScanResult {
  duplicates?: ScanResult
  similar?: SimilarResult
  large?: LargeFileScanResult
  screenshots?: ScreenshotScanResult
  unorganized?: UnorganizedResult
  total_items_found: number
  total_savings_bytes: number
  duration_ms: number
}

export interface MasterScanProgress {
  current_module: MasterScanModule | null
  modules_completed: MasterScanModule[]
  modules_pending: MasterScanModule[]
  overall_percent: number
  current_module_percent: number
  message: string
}

// Similar Photos types
export interface SimilarConfig {
  source_paths: string[]
  min_distance: number
  max_distance: number
  algorithm: string | null
}

export interface SimilarPhoto {
  path: string
  distance: number
  similarity_percent: number
  match_type: string
  size_bytes: number
}

export interface SimilarGroup {
  id: string
  reference: string
  reference_size_bytes: number
  similar_photos: SimilarPhoto[]
  average_similarity: number
  total_size_bytes: number
}

export interface SimilarResult {
  groups: SimilarGroup[]
  total_photos_scanned: number
  similar_groups_found: number
  similar_photos_found: number
  duration_ms: number
}

export interface SimilarProgress {
  phase: string
  current: number
  total: number
}

// Scan History types
export type HistoryModuleType = 'duplicates' | 'screenshots' | 'similar' | 'large_files' | 'unorganized'

export interface ScanHistoryEntry {
  id: string
  module_type: HistoryModuleType
  scan_time: number  // Unix timestamp
  paths: string[]
  total_files: number
  groups_found: number | null
  duplicates_found: number | null
  potential_savings: number | null
  duration_ms: number
  status: 'completed' | 'cancelled' | 'error'
}

export interface ScanHistoryResult {
  entries: ScanHistoryEntry[]
  total_count: number
}

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

// Unorganized file types
export type UnorganizedReason = 'in_root' | 'shallow_folder' | 'no_date_pattern' | 'generic_name'

export interface UnorganizedFile {
  path: string
  filename: string
  size_bytes: number
  file_type: string
  reasons: UnorganizedReason[]
  folder_depth: number
  parent_folder: string
}

export interface UnorganizedConfig {
  source_paths: string[]
  check_root: boolean
  check_date_pattern: boolean
  check_generic_names: boolean
  min_depth: number
}

export interface ReasonSummary {
  reason: UnorganizedReason
  count: number
  size_bytes: number
}

export interface UnorganizedResult {
  files: UnorganizedFile[]
  total_files: number
  total_size_bytes: number
  by_reason: ReasonSummary[]
  duration_ms: number
}

export interface UnorganizedProgress {
  phase: string
  files_scanned: number
  message: string
}
