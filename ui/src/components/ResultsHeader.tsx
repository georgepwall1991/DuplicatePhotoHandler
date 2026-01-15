import type { ScanResult } from '../lib/types'

type SortOption = 'size' | 'photos' | 'type'
type FilterOption = 'all' | 'exact' | 'near' | 'similar'

interface ResultsHeaderProps {
  results: ScanResult
  sortBy: SortOption
  filterBy: FilterOption
  filteredCount: number
  showErrors: boolean
  onSortChange: (sort: SortOption) => void
  onFilterChange: (filter: FilterOption) => void
  onToggleErrors: () => void
  onAutoSelect: () => void
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
  onSortChange,
  onFilterChange,
  onToggleErrors,
  onAutoSelect,
  onClearSelection,
  onNewScan,
  hasSelection,
}: ResultsHeaderProps) {
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
          <button
            onClick={onAutoSelect}
            className="px-6 py-2.5 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 glow-purple shadow-lg shadow-purple-500/20"
          >
            Auto-Select All
          </button>
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

      {/* Sort and Filter controls */}
      <div className="flex items-center gap-4 mt-6">
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

        {filterBy !== 'all' && (
          <span className="text-sm text-gray-500">
            Showing {filteredCount} of {results.groups.length} groups
          </span>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <span className="opacity-60">Keyboard:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">A</kbd>
          <span className="opacity-60">select</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">D</kbd>
          <span className="opacity-60">clear</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">↑↓</kbd>
          <span className="opacity-60">navigate</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400">Space</kbd>
          <span className="opacity-60">expand</span>
        </div>
      </div>
    </div>
  )
}

export type { SortOption, FilterOption }
