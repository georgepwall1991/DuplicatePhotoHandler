# Screenshots Feature Design

**Date:** 2026-01-17
**Status:** Approved

## Overview

Add a Screenshots module to the sidebar that helps users find and manage screenshot files. The feature has two modes:
1. **Duplicate Screenshots** - Find near-identical screenshots using existing duplicate detection
2. **All Screenshots** - Browse and bulk-manage all detected screenshots

## Detection Strategy

### 3-Tier Detection

**Tier 1: Filename Patterns (fast, first pass)**
- `Screenshot*`, `Screen Shot*`, `Capture*`
- `Simulator Screen Shot*` (iOS development)
- `CleanShot*`, `Snagit*`, `Monosnap*` (popular tools)

**Tier 2: EXIF Software Tag (accurate, second pass)**
- Software = "screencaptureui" (macOS native)
- Software = "Grab" (macOS legacy)
- Software contains "Screenshot", "Snip", "Capture"
- No camera make/model present (screenshots typically lack these)

**Tier 3: Dimension Heuristics (fallback)**
- Exact match to known device screens (e.g., 1170×2532 = iPhone 14 Pro)
- Aspect ratios typical of monitors (16:9, 16:10)
- PNG format with no EXIF camera data

### Confidence Scoring

| Confidence | Criteria |
|------------|----------|
| **High** | Filename match + EXIF confirms |
| **Medium** | Filename match only OR EXIF software match |
| **Low** | Dimension heuristic only |

## Data Model

### Rust Types

```rust
/// Confidence level for screenshot detection
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScreenshotConfidence {
    High,
    Medium,
    Low,
}

/// Information about a detected screenshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotInfo {
    pub path: PathBuf,
    pub size_bytes: u64,
    pub dimensions: (u32, u32),
    pub date_taken: Option<DateTime<Utc>>,
    pub confidence: ScreenshotConfidence,
    pub detection_reason: String,
    pub source_app: Option<String>,
}

/// Results from a screenshot scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotScanResult {
    pub all_screenshots: Vec<ScreenshotInfo>,
    pub duplicate_groups: Vec<DuplicateGroup>,
    pub total_size_bytes: u64,
    pub scan_duration_ms: u64,
}
```

### TypeScript Types

```typescript
type ScreenshotConfidence = 'high' | 'medium' | 'low'

interface ScreenshotInfo {
  path: string
  size_bytes: number
  dimensions: [number, number]
  date_taken: string | null
  confidence: ScreenshotConfidence
  detection_reason: string
  source_app: string | null
}

interface ScreenshotScanResult {
  all_screenshots: ScreenshotInfo[]
  duplicate_groups: DuplicateGroup[]
  total_size_bytes: number
  scan_duration_ms: number
}
```

## Tauri Commands

| Command | Input | Output | Description |
|---------|-------|--------|-------------|
| `scan_screenshots` | `{ paths: string[], threshold: number }` | `void` (streams events) | Start screenshot scan |
| `cancel_screenshot_scan` | `void` | `void` | Cancel running scan |
| `get_screenshot_results` | `void` | `ScreenshotScanResult` | Get cached results |

## Backend Changes

### 1. Metadata Module Enhancement

Add `Software` tag extraction to `PhotoMetadata`:

```rust
pub struct PhotoMetadata {
    // ... existing fields ...
    pub software: Option<String>,  // NEW: EXIF Software tag
}
```

### 2. New Screenshot Module

```
src/core/screenshot/
├── mod.rs           # Module exports
└── detector.rs      # Detection logic
```

**detector.rs responsibilities:**
- `is_screenshot(path, metadata) -> Option<ScreenshotInfo>`
- `detect_from_filename(filename) -> Option<(Confidence, String)>`
- `detect_from_metadata(metadata) -> Option<(Confidence, String)>`
- `detect_from_dimensions(width, height) -> Option<(Confidence, String)>`

### 3. Pipeline Integration

Reuse existing `Pipeline` for duplicate detection:
1. Filter scan results to screenshots only
2. Run perceptual hash comparison on filtered set
3. Return both all screenshots and duplicate groups

## UI Components

### New Components

**`ScreenshotsView.tsx`** - Main view container
- Tab bar: "Duplicates" | "All Screenshots"
- Conditionally renders appropriate content
- Manages tab state

**`ScreenshotGrid.tsx`** - Grid layout for "All" tab
- 4-column responsive grid
- Virtual scrolling for performance
- Multi-select support

**`ScreenshotCard.tsx`** - Individual screenshot tile
- Thumbnail with lazy loading
- Confidence badge (color-coded)
- Checkbox for selection
- Size and date labels

### Reused Components

- `DuplicateGroupCard` - For duplicate tab
- `ImagePreview` - Full-screen preview overlay
- `ActionBar` - Bottom action bar
- `ConfirmModal` - Deletion confirmation
- `ResultsHeader` - Search, sort, filter (adapted)

## App State Changes

### State Shape

```typescript
// Module routing
type ActiveModule = 'duplicates' | 'screenshots'

// App-level state additions
const [activeModule, setActiveModule] = useState<ActiveModule>('duplicates')
const [screenshotResults, setScreenshotResults] = useState<ScreenshotScanResult | null>(null)
const [screenshotAppState, setScreenshotAppState] = useState<AppState>('idle')
```

### Sidebar Integration

Update `Sidebar.tsx`:
- Change screenshots item to `available: true`
- Accept `onModuleChange` callback
- Pass click handler to navigate between modules

### Routing Logic

```typescript
// In App.tsx render
{activeModule === 'duplicates' && (
  // Existing duplicate views
)}
{activeModule === 'screenshots' && (
  <ScreenshotsView
    results={screenshotResults}
    appState={screenshotAppState}
    onScanStart={...}
    onScanComplete={...}
  />
)}
```

## User Flow

1. User clicks "Screenshots" in sidebar
2. `activeModule` changes to `'screenshots'`
3. If no cached results → show idle state with "Scan for Screenshots" button
4. User selects folders and clicks scan
5. Backend streams `screenshot-scan-event` progress
6. On complete, results populate both tabs
7. User browses tabs, selects unwanted screenshots
8. User clicks "Move to Trash" → confirmation modal
9. Files moved to trash, UI updates

## Event Streaming

Reuse existing event pattern:

```typescript
listen('screenshot-scan-event', (event) => {
  const payload = event.payload as ScanProgress
  setProgress(payload)
})

listen('screenshot-scan-complete', (event) => {
  const results = event.payload as ScreenshotScanResult
  setScreenshotResults(results)
  setScreenshotAppState('results')
})
```

## File Structure

```
src/core/
├── screenshot/
│   ├── mod.rs
│   └── detector.rs
└── metadata/
    └── mod.rs          # Add software field

src-tauri/src/
└── commands.rs         # Add screenshot commands

ui/src/
├── components/
│   ├── ScreenshotsView.tsx
│   ├── ScreenshotGrid.tsx
│   └── ScreenshotCard.tsx
└── lib/
    └── types.ts        # Add screenshot types
```

## Implementation Phases

### Phase 1: Backend Detection
- Add `software` to `PhotoMetadata`
- Create `screenshot/detector.rs` with detection logic
- Unit tests for detection patterns

### Phase 2: Tauri Commands
- Add `scan_screenshots` command
- Add `get_screenshot_results` command
- Wire up event streaming

### Phase 3: UI - All Screenshots Tab
- Create `ScreenshotsView` with tab structure
- Create `ScreenshotGrid` and `ScreenshotCard`
- Wire up to Tauri commands

### Phase 4: UI - Duplicates Tab
- Integrate existing `DuplicateGroupCard`
- Add duplicate-specific summary stats

### Phase 5: Integration
- Enable sidebar navigation
- Add module state to App.tsx
- Test full user flow

## Testing

| Layer | Approach |
|-------|----------|
| Detection logic | Unit tests with mock filenames/metadata |
| Tauri commands | Integration tests with test images |
| React components | Vitest with mock data |
| E2E | Playwright flow test |

## Known Screenshot Dimensions

Reference dimensions for heuristic detection:

| Device | Dimensions |
|--------|------------|
| iPhone 14 Pro | 1179×2556 |
| iPhone 14 | 1170×2532 |
| iPhone SE | 750×1334 |
| MacBook Pro 14" | 3024×1964 |
| MacBook Air M2 | 2560×1664 |
| iMac 24" | 4480×2520 |
| 1080p Monitor | 1920×1080 |
| 4K Monitor | 3840×2160 |
