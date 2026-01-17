import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import type { ScanResult, ExportResult } from '../lib/types'

type SortOption = 'size' | 'photos' | 'type'
type FilterOption = 'all' | 'exact' | 'near' | 'similar'
type SelectionStrategy = 'duplicates' | 'keepHighestRes' | 'keepMostRecent' | 'keepOldest' | 'keepLargest' | 'keepSharpest'

interface ResultsHeaderProps {
  results: ScanResult
  sortBy: SortOption
  filterBy: FilterOption
  filteredCount: number
  showErrors: boolean
  searchTerm: string
  onSortChange: (sort: SortOption) => void
  onFilterChange: (filter: FilterOption) => void
  onSearchChange: (search: string) => void
  onToggleErrors: () => void
  onAutoSelect: (strategy: SelectionStrategy) => void
  onClearSelection: () => void
  onNewScan: () => void
  hasSelection: boolean
}

const formatDuration = (ms: number): string => {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function ResultsHeader({
  results,
  sortBy,
  filterBy,
  filteredCount,
  showErrors,
  searchTerm,
  onSortChange,
  onFilterChange,
  onSearchChange,
  onToggleErrors,
  onAutoSelect,
  onClearSelection,
  onNewScan,
  hasSelection,
}: ResultsHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  // Export to CSV
  const handleExportCsv = async () => {
    try {
      setIsExporting(true)
      const filePath = await save({
        defaultPath: 'duplicates.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        const result = await invoke<ExportResult>('export_results_csv', { path: filePath })
        if (result.success) {
          alert(`Exported ${result.groups_exported} groups to CSV`)
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + error)
    } finally {
      setIsExporting(false)
      setShowExportMenu(false)
    }
  }

  // Export to HTML
  const handleExportHtml = async () => {
    try {
      setIsExporting(true)
      const filePath = await save({
        defaultPath: 'duplicate-report.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (filePath) {
        const result = await invoke<ExportResult>('export_results_html', {
          path: filePath,
          title: 'Duplicate Photo Report'
        })
        if (result.success) {
          alert(`Exported ${result.groups_exported} groups to HTML report`)
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed: ' + error)
    } finally {
      setIsExporting(false)
      setShowExportMenu(false)
    }
  }

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="p-6 border-b border-white/5 glass relative z-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Scan Complete
          </h2>
          <p className="text-gray-400 mt-1">
            Found <span className="text-purple-400 font-medium">{results.duplicate_groups}</span> groups with{' '}
            <span className="text-purple-400 font-medium">{results.duplicate_count}</span> duplicates
            <span className="mx-2 text-gray-600">·</span>
            <span className="text-gray-500">{formatDuration(results.duration_ms)}</span>
            {results.errors && results.errors.length > 0 && (
              <>
                <span className="mx-2 text-gray-600">·</span>
                <button
                  onClick={onToggleErrors}
                  className="text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {results.errors.length} warning{results.errors.length !== 1 ? 's' : ''}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {hasSelection && (
            <button
              onClick={onClearSelection}
              className="px-5 py-2.5 glass-card rounded-xl text-gray-300 font-medium transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95"
            >
              Clear Selection
            </button>
          )}
          <div className="relative group">
            <button
              onClick={() => onAutoSelect('duplicates')}
              className="px-6 py-2.5 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 glow-purple shadow-lg shadow-purple-500/20 flex items-center gap-2"
            >
              Auto-Select
              <span className="text-purple-200 text-xs">▼</span>
            </button>
            {/* Dropdown menu */}
            <div className="absolute right-0 top-full mt-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="glass-card rounded-xl p-2 shadow-xl border border-white/10">
                <button
                  onClick={() => onAutoSelect('duplicates')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="font-medium">Select All Duplicates</div>
                  <div className="text-xs text-gray-400">Keep the representative of each group</div>
                </button>
                <button
                  onClick={() => onAutoSelect('keepHighestRes')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="font-medium">Keep Highest Resolution</div>
                  <div className="text-xs text-gray-400">Select lower-res versions for deletion</div>
                </button>
                <button
                  onClick={() => onAutoSelect('keepLargest')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="font-medium">Keep Largest File</div>
                  <div className="text-xs text-gray-400">Select smaller files for deletion</div>
                </button>
                <button
                  onClick={() => onAutoSelect('keepOldest')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="font-medium">Keep Oldest</div>
                  <div className="text-xs text-gray-400">Preserve original, select newer copies</div>
                </button>
                <button
                  onClick={() => onAutoSelect('keepMostRecent')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="font-medium">Keep Most Recent</div>
                  <div className="text-xs text-gray-400">Select older versions for deletion</div>
                </button>
                <button
                  onClick={() => onAutoSelect('keepSharpest')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="font-medium">Keep Sharpest</div>
                  <div className="text-xs text-gray-400">Select blurrier versions for deletion</div>
                </button>
              </div>
            </div>
          </div>
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              className="px-5 py-2.5 glass-card rounded-xl text-gray-300 font-medium transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              {isExporting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Exporting...
                </>
              ) : (
                <>
                  📤 Export
                  <span className="text-gray-500 text-xs">▼</span>
                </>
              )}
            </button>
            {showExportMenu && !isExporting && (
              <div className="absolute right-0 top-full mt-2 w-48 glass-card rounded-xl p-2 shadow-xl border border-white/10 z-50">
                <button
                  onClick={handleExportCsv}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <span>📊</span>
                  <div>
                    <div className="font-medium">Export CSV</div>
                    <div className="text-xs text-gray-400">Spreadsheet format</div>
                  </div>
                </button>
                <button
                  onClick={handleExportHtml}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                >
                  <span>📄</span>
                  <div>
                    <div className="font-medium">Export HTML</div>
                    <div className="text-xs text-gray-400">Visual report</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onNewScan}
            className="px-5 py-2.5 glass-card rounded-xl text-gray-300 font-medium transition-all duration-200 hover:bg-white/10 hover:text-white hover:scale-105 active:scale-95"
          >
            New Scan
          </button>
        </div>
      </div>

      {/* Errors/Warnings Panel */}
      {showErrors && results.errors && results.errors.length > 0 && (
        <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-amber-400 font-medium">Warnings</h3>
            <button
              onClick={onToggleErrors}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
            {results.errors.map((error, idx) => (
              <p key={idx} className="text-gray-300 truncate" title={error}>
                {error}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Sort, Search, and Filter controls */}
      <div className="flex items-center gap-4 mt-6">
        {/* Search */}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">Search:</span>
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter by filename... (/)"
              className="w-48 px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">Sort:</span>
          <div className="flex gap-1">
            {[
              { value: 'size', label: 'Size' },
              { value: 'photos', label: 'Count' },
              { value: 'type', label: 'Type' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => onSortChange(option.value as SortOption)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${sortBy === option.value
                  ? 'glass-purple text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-6 bg-white/10" />

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">Filter:</span>
          <div className="flex gap-1">
            {[
              { value: 'all', label: 'All' },
              { value: 'exact', label: 'Exact' },
              { value: 'near', label: 'Near' },
              { value: 'similar', label: 'Similar' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => onFilterChange(option.value as FilterOption)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${filterBy === option.value
                  ? 'glass-purple text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {(filterBy !== 'all' || searchTerm) && (
          <span className="text-sm text-gray-500">
            Showing {filteredCount} of {results.groups.length} groups
            {searchTerm && <span className="text-purple-400 ml-1">matching "{searchTerm}"</span>}
          </span>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <span className="opacity-60">Keyboard:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">/</kbd>
          <span className="opacity-60">search</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">A</kbd>
          <span className="opacity-60">select</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">↑↓</kbd>
          <span className="opacity-60">navigate</span>
        </div>
      </div>
    </div>
  )
}

export type { SortOption, FilterOption, SelectionStrategy }
