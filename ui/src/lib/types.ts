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
