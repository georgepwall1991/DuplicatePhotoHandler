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
