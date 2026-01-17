import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import { Trash2, CheckSquare, Square, ArrowLeft, HardDrive } from 'lucide-react'
import { LargeFileGrid } from './LargeFileGrid'
import { ConfirmModal } from './ConfirmModal'
import type { LargeFileScanResult } from '../lib/types'

interface LargeFilesViewProps {
  results: LargeFileScanResult
  onNewScan: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function LargeFilesView({ results, onNewScan }: LargeFilesViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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
    if (selectedPaths.size === results.files.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(results.files.map(f => f.path)))
    }
  }, [selectedPaths.size, results.files])

  const selectedSize = results.files
    .filter(f => selectedPaths.has(f.path))
    .reduce((sum, f) => sum + f.size_bytes, 0)

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const pathsToDelete = Array.from(selectedPaths)
      await invoke('delete_files', { paths: pathsToDelete })
      setSelectedPaths(new Set())
      onNewScan()
    } catch (error) {
      console.error('Delete failed:', error)
    } finally {
      setIsDeleting(false)
      setShowConfirm(false)
    }
  }, [selectedPaths, onNewScan])

  const allSelected = selectedPaths.size === results.files.length && results.files.length > 0

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
              <HardDrive className="h-5 w-5 text-amber-400" />
              <span className="text-lg font-semibold text-white">
                {results.files.length} Large Files
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
                <CheckSquare className="h-4 w-4 text-cyan-400" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>

            {selectedPaths.size > 0 && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 transition hover:border-red-500/50 hover:bg-red-500/30"
              >
                <Trash2 className="h-4 w-4" />
                Delete {selectedPaths.size} ({formatBytes(selectedSize)})
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        <LargeFileGrid
          files={results.files}
          selectedPaths={selectedPaths}
          onToggleSelect={handleToggleSelect}
        />
      </div>

      {/* Stats footer */}
      <div className="border-t border-white/10 bg-white/[0.02] px-6 py-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Scanned {results.files_scanned.toLocaleString()} files in {(results.scan_duration_ms / 1000).toFixed(1)}s</span>
          <span>{selectedPaths.size} selected</span>
        </div>
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title="Delete Large Files"
        message={`Are you sure you want to permanently delete ${selectedPaths.size} file${selectedPaths.size === 1 ? '' : 's'}? This will free up ${formatBytes(selectedSize)}.`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
        isDestructive
      />
    </div>
  )
}
