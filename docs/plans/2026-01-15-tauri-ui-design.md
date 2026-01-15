# Duplicate Photo Cleaner - Tauri UI Design

**Date:** 2026-01-15
**Status:** Approved

## Overview

A CleanMyMac-style desktop app for finding and removing duplicate photos. Built with Tauri + React, leveraging the existing Rust duplicate detection library.

### Design Goals
- **Trust-first**: Never auto-delete, always show what will happen
- **Smart defaults**: Auto-select duplicates to remove, keep highest quality
- **Expandable**: Sidebar designed for future modules (similar photos, large files)
- **Native feel**: Dark mode, macOS integration, lightweight (~10MB)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Tauri 2.0 |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Build Tool | Vite |
| Backend | Existing `duplicate-photo-cleaner` Rust library |

## Architecture

```
┌─────────────────────────────────────────────┐
│           Tauri Window (macOS)              │
├─────────────────────────────────────────────┤
│  React Frontend                             │
│  ┌─────────┐  ┌──────────────────────────┐  │
│  │ Sidebar │  │ Main Content Area        │  │
│  │         │  │ - Scan button            │  │
│  │ • Dupes │  │ - Progress ring          │  │
│  │ • More  │  │ - Results list           │  │
│  │   ...   │  │ - Action button          │  │
│  └─────────┘  └──────────────────────────┘  │
├─────────────────────────────────────────────┤
│  Tauri IPC Bridge (invoke/events)           │
├─────────────────────────────────────────────┤
│  Rust Backend (existing library)            │
│  - Pipeline, Scanner, Hasher, Cache, etc.   │
└─────────────────────────────────────────────┘
```

## UI Layout

### Left Sidebar (fixed, ~200px)
- App logo at top
- Navigation items with icons:
  - **Duplicates** (active for v1)
  - **Similar Photos** (grayed, "Coming Soon")
  - **Large Files** (grayed)
  - **Screenshots** (grayed)
- Settings gear at bottom
- Storage indicator ("X GB to clean")

### Main Content Area

**State 1 - Ready to Scan:**
- Large circular "Scan" button with animated gradient border
- Folder path selector (defaults to Photos library)
- Threshold slider (Strict ↔ Relaxed)

**State 2 - Scanning:**
- Animated progress ring with percentage
- Current phase label (Scanning → Hashing → Comparing)
- Live stats: "2,450 photos found • 124 duplicates"
- Cancel button

**State 3 - Results:**
- Summary card: "Found 302 duplicate groups • 21.9 MB"
- Scrollable list of duplicate groups
  - Each group: thumbnail strip, checkbox, size badge
  - Expand to see all photos in group
  - ★ marks the keeper (auto-selected best quality)
- Bottom action bar: "Review Selected" count + "Move to Trash" button

## Data Flow

### Tauri Commands (React → Rust)

```typescript
// Start a scan
invoke('start_scan', { paths: ['/Users/.../Photos'], threshold: 5 })

// Get duplicate groups after scan
invoke('get_results') → DuplicateGroup[]

// Move selected duplicates to trash
invoke('trash_files', { paths: [...] })

// Cancel running scan
invoke('cancel_scan')
```

### Tauri Events (Rust → React)

```typescript
// Existing event system streams directly
listen('scan-event', (e) => updateProgress(e.payload))
listen('duplicate-found', (e) => addGroup(e.payload))
```

### React State
- Simple `useState` + `useReducer`
- States: `idle` | `scanning` | `results`
- Selected files tracked as `Set<string>`

## Project Structure

```
duplicate-photo-cleaner/
├── src/                    # Existing Rust library (unchanged)
│   ├── core/
│   ├── events/
│   ├── error/
│   └── lib.rs
│
├── src-tauri/              # Tauri backend
│   ├── src/
│   │   ├── main.rs         # Tauri entry point
│   │   ├── commands.rs     # IPC commands
│   │   └── state.rs        # App state
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
│
├── ui/                     # React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ScanButton.tsx
│   │   │   ├── ProgressRing.tsx
│   │   │   ├── ResultsList.tsx
│   │   │   └── DuplicateGroup.tsx
│   │   ├── hooks/
│   │   │   └── useScan.ts
│   │   └── styles/
│   │       └── globals.css
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── Cargo.toml              # Workspace root
└── package.json            # Root scripts
```

## Safety & Trust Features

### Before Any Action
- Confirmation modal shows exactly what will happen
- "You're about to move 46 photos to Trash (21.9 MB)"
- Expandable list of file names
- "Files can be recovered from Trash"

### Visual Trust Indicators
- ★ "Keeping" badge on auto-selected best photo
- Hover thumbnail → full preview overlay
- Each group shows WHY they're duplicates
- "98% similar" badge with visual hash comparison

### Undo Safety
- Files go to macOS Trash (recoverable)
- Post-action: "Moved 46 files to Trash" + "Open Trash" link
- Scan history saved locally

### Error Handling
- Permission denied → "Open System Preferences" button
- File moved during scan → Skip gracefully, show in summary
- Cancelled scan → Partial results viewable

### Keyboard Shortcuts
- `Space` - Toggle selection
- `Enter` - Expand/collapse group
- `⌘+A` - Select all
- `⌘+Delete` - Move to Trash

## Implementation Phases

### Phase 1: Scaffold
- Set up Tauri + React + Tailwind workspace
- Basic command wiring (`ping` → `pong`)
- Verify hot reload

### Phase 2: Core Integration
- Connect library to Tauri commands
- Implement `start_scan` with event streaming
- Basic progress display

### Phase 3: UI Polish
- Dark theme styling
- Sidebar navigation
- Progress ring animation
- Results list with thumbnails

### Phase 4: Actions & Safety
- Trash implementation with confirmation
- Preview overlays
- Keyboard shortcuts

## Testing Strategy

| Layer | Approach |
|-------|----------|
| Rust core | Existing 92 unit tests |
| Tauri commands | Integration tests with mock FS |
| React components | Vitest |
| E2E | Playwright |
