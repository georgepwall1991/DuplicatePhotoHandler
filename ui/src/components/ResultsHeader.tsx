import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { 
  Search, 
  Download, 
  Plus, 
  Filter, 
  CheckSquare, 
  FileText, 
  Table, 
  ChevronDown,
  AlertCircle,
  Zap,
  Layers
} from 'lucide-react'
import type { ScanResult, ExportResult } from '../lib/types'

export type SortOption = 'size' | 'photos' | 'type'
export type FilterOption = 'all' | 'exact' | 'near' | 'similar'
export type SelectionStrategy = 'duplicates' | 'keepHighestRes' | 'keepMostRecent' | 'keepOldest' | 'keepLargest' | 'keepSharpest'

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
  const [showAutoSelectMenu, setShowAutoSelectMenu] = useState(false)

  const handleExportCsv = async () => {
    try {
      setIsExporting(true)
      const filePath = await save({
        defaultPath: 'duplicates.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (filePath) {
        await invoke<ExportResult>('export_results_csv', { path: filePath })
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
      setShowExportMenu(false)
    }
  }

  const handleExportHtml = async () => {
    try {
      setIsExporting(true)
      const filePath = await save({
        defaultPath: 'duplicate-report.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (filePath) {
        await invoke<ExportResult>('export_results_html', {
          path: filePath,
          title: 'Duplicate Photo Report'
        })
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
      setShowExportMenu(false)
    }
  }

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
    <div className="px-8 py-8 border-b border-white/5 relative z-30">
      <div className="flex items-start justify-between mb-8">
        <div>
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 mb-2"
          >
            <h2 className="text-3xl font-black text-white tracking-tighter">
              Analysis Results
            </h2>
            <div className="px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-black uppercase tracking-widest">
              {formatDuration(results.duration_ms)}
            </div>
          </motion.div>
          <p className="text-gray-500 font-medium">
            Reviewing <span className="text-white">{results.total_photos.toLocaleString()}</span> assets across your library.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasSelection && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={onClearSelection}
              className="px-5 py-3 rounded-2xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
            >
              Reset Selection
            </motion.button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowAutoSelectMenu(!showAutoSelectMenu)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 shadow-lg shadow-purple-500/20"
            >
              <CheckSquare className="w-4 h-4" />
              Smart Select
              <ChevronDown className={`w-3 h-3 transition-transform ${showAutoSelectMenu ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showAutoSelectMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-3 w-64 glass-strong rounded-3xl p-3 shadow-2xl z-50 border border-white/10"
                >
                  {[
                    { id: 'duplicates', label: 'Recommended', sub: 'AI choice for each group' },
                    { id: 'keepHighestRes', label: 'Highest Resolution', sub: 'Keep most detailed' },
                    { id: 'keepLargest', label: 'Largest Size', sub: 'Keep heaviest files' },
                    { id: 'keepSharpest', label: 'Maximum Sharpness', sub: 'Avoid motion blur' },
                    { id: 'keepOldest', label: 'Chronological', sub: 'Keep original file' },
                  ].map((strategy) => (
                    <button
                      key={strategy.id}
                      onClick={() => {
                        onAutoSelect(strategy.id as SelectionStrategy)
                        setShowAutoSelectMenu(false)
                      }}
                      className="w-full p-3 text-left hover:bg-white/5 rounded-2xl transition-colors group"
                    >
                      <div className="text-[10px] font-black uppercase tracking-widest text-white mb-0.5 group-hover:text-purple-400">
                        {strategy.label}
                      </div>
                      <div className="text-[10px] text-gray-500 font-medium">{strategy.sub}</div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl transition-all"
            >
              <Download className="w-5 h-5" />
            </button>
            
            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-3 w-48 glass-strong rounded-3xl p-2 shadow-2xl z-50 border border-white/10"
                >
                  <button
                    onClick={handleExportCsv}
                    className="w-full flex items-center gap-3 p-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 rounded-2xl transition-colors"
                  >
                    <Table className="w-4 h-4 text-green-400" />
                    Export CSV
                  </button>
                  <button
                    onClick={handleExportHtml}
                    className="w-full flex items-center gap-3 p-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/5 rounded-2xl transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-400" />
                    Export HTML
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={onNewScan}
            className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search filenames..."
            className="w-full pl-12 pr-4 py-4 rounded-[1.25rem] bg-white/5 border border-white/5 text-sm font-medium text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/30 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 p-1.5 bg-white/5 rounded-[1.25rem] border border-white/5">
          {[
            { id: 'all', label: 'All' },
            { id: 'exact', label: 'Exact' },
            { id: 'near', label: 'Near' },
            { id: 'similar', label: 'Similar' },
          ].map((option) => {
            const active = filterBy === option.id
            return (
              <button
                key={option.id}
                onClick={() => onFilterChange(option.id as FilterOption)}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  active ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-gray-500 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="w-px h-8 bg-white/10" />

        <div className="flex items-center gap-2 p-1.5 bg-white/5 rounded-[1.25rem] border border-white/5">
          {[
            { id: 'size', label: 'Size', icon: Zap },
            { id: 'photos', label: 'Count', icon: Layers },
            { id: 'type', label: 'Type', icon: Filter },
          ].map((option) => {
            const Icon = option.icon
            const active = sortBy === option.id
            return (
              <button
                key={option.id}
                onClick={() => onSortChange(option.id as SortOption)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  active ? 'bg-white text-[#0a0a0f] shadow-lg' : 'text-gray-500 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {option.label}
              </button>
            )
          })}
        </div>

        {results.errors && results.errors.length > 0 && (
          <button
            onClick={onToggleErrors}
            className={`flex items-center gap-2 px-5 py-3 rounded-[1.25rem] transition-all ${
              showErrors 
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' 
                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20'
            } text-[10px] font-black uppercase tracking-widest`}
          >
            <AlertCircle className="w-4 h-4" />
            {results.errors.length} Warnings
          </button>
        )}
      </div>

      {(filterBy !== 'all' || searchTerm) && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-10 left-8 text-[10px] font-bold text-gray-500 uppercase tracking-widest"
        >
          Filtered view: showing <span className="text-purple-400">{filteredCount}</span> of {results.groups.length} total clusters
        </motion.div>
      )}
    </div>
  )
}