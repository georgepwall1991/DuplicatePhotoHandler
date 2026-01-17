import { useState, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  FolderSearch,
  Filter,
  FolderRoot,
  Calendar,
  FileText,
  Layers,
  ExternalLink,
  CheckSquare,
  Square,
} from 'lucide-react'
import { ImagePreview } from './ImagePreview'
import type { UnorganizedResult, UnorganizedFile, UnorganizedReason } from '../lib/types'

interface UnorganizedViewProps {
  results: UnorganizedResult
  onNewScan: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const reasonLabels: Record<UnorganizedReason, { label: string; icon: typeof FolderRoot; color: string }> = {
  in_root: { label: 'In Root', icon: FolderRoot, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  shallow_folder: { label: 'Shallow', icon: Layers, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  no_date_pattern: { label: 'No Date', icon: Calendar, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  generic_name: { label: 'Generic Name', icon: FileText, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
}

function ReasonBadge({ reason }: { reason: UnorganizedReason }) {
  const config = reasonLabels[reason]
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs border ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

export function UnorganizedView({ results, onNewScan }: UnorganizedViewProps) {
  const [selectedFilter, setSelectedFilter] = useState<UnorganizedReason | 'all'>('all')
  const [previewFile, setPreviewFile] = useState<UnorganizedFile | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  const filteredFiles = useMemo(() => {
    if (selectedFilter === 'all') return results.files
    return results.files.filter(f => f.reasons.includes(selectedFilter))
  }, [results.files, selectedFilter])

  const handleShowInFolder = useCallback(async (path: string) => {
    try {
      await invoke('show_in_folder', { path })
    } catch (error) {
      console.error('Failed to show in folder:', error)
    }
  }, [])

  const handleToggleSelect = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedPaths.size === filteredFiles.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(filteredFiles.map(f => f.path)))
    }
  }, [selectedPaths.size, filteredFiles])

  const allSelected = selectedPaths.size === filteredFiles.length && filteredFiles.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onNewScan}
              className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              New scan
            </button>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <FolderSearch className="h-5 w-5 text-purple-400" />
              <span className="text-lg font-semibold text-white">
                {results.total_files} Unorganized Files
              </span>
              <span className="text-sm text-slate-400">
                ({formatBytes(results.total_size_bytes)} total)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              {allSelected ? (
                <CheckSquare className="h-4 w-4 text-purple-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1 text-xs font-medium transition ${
                selectedFilter === 'all'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              All ({results.total_files})
            </button>
            {results.by_reason.map(summary => (
              <button
                key={summary.reason}
                type="button"
                onClick={() => setSelectedFilter(summary.reason)}
                className={`px-3 py-1 text-xs font-medium transition ${
                  selectedFilter === summary.reason
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {reasonLabels[summary.reason]?.label || summary.reason} ({summary.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        <div className="space-y-2">
          {filteredFiles.map((file, index) => (
            <motion.div
              key={file.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className={`group flex items-center gap-4 p-3 border transition cursor-pointer ${
                selectedPaths.has(file.path)
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
              }`}
              onClick={() => setPreviewFile(file)}
            >
              {/* Selection checkbox */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleSelect(file.path)
                }}
                className="text-slate-400 hover:text-white"
              >
                {selectedPaths.has(file.path) ? (
                  <CheckSquare className="h-4 w-4 text-purple-400" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {file.filename}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatBytes(file.size_bytes)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {file.parent_folder || 'Root'} • Depth: {file.folder_depth}
                </div>
              </div>

              {/* Reason badges */}
              <div className="flex gap-1">
                {file.reasons.map(reason => (
                  <ReasonBadge key={reason} reason={reason} />
                ))}
              </div>

              {/* Actions */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleShowInFolder(file.path)
                }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition"
                title="Show in Finder"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Stats footer */}
      <div className="border-t border-white/10 bg-white/[0.02] px-6 py-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Scanned in {(results.duration_ms / 1000).toFixed(1)}s</span>
          <span>{selectedPaths.size} selected</span>
        </div>
      </div>

      {/* Image preview modal */}
      <ImagePreview
        src={previewFile?.path ?? null}
        onClose={() => setPreviewFile(null)}
        isSelected={previewFile ? selectedPaths.has(previewFile.path) : undefined}
        onDelete={previewFile ? () => handleToggleSelect(previewFile.path) : undefined}
      />
    </div>
  )
}
