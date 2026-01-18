import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '../lib/tauri'

import type { SimilarResult } from '../lib/types'
import { SimilarGroupCard } from './SimilarGroupCard'
import { ImagePreview } from './ImagePreview'
import { ActionBar } from './ActionBar'
import { ConfirmModal } from './ConfirmModal'
import { EmptyState } from './EmptyState'
import { Search, Sparkles } from 'lucide-react'
import { useToast } from './Toast'

interface SimilarViewProps {
  results: SimilarResult | null
  onNewScan: () => void
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function SimilarView({ results, onNewScan }: SimilarViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [lastTrashedFiles, setLastTrashedFiles] = useState<string[]>([])
  const [isRestoring, setIsRestoring] = useState(false)
  const { showToast } = useToast()
  const containerRef = useRef<HTMLDivElement>(null)

  const togglePath = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const newSelected = new Set(prev)
      if (newSelected.has(path)) {
        newSelected.delete(path)
      } else {
        newSelected.add(path)
      }
      return newSelected
    })
  }, [])

  const selectAllVisible = useCallback(() => {
    if (!results) return
    const newSelected = new Set(selectedPaths)

    results.groups.forEach(group => {
      newSelected.add(group.reference)
      group.similar_photos.forEach(photo => {
        newSelected.add(photo.path)
      })
    })

    setSelectedPaths(newSelected)
    showToast(`Selected ${newSelected.size} items`, 'info')
  }, [results, selectedPaths, showToast])

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set())
    showToast('Selection cleared', 'info')
  }, [showToast])

  const handleTrash = useCallback(async () => {
    if (selectedPaths.size === 0) return

    setIsDeleting(true)
    const paths = Array.from(selectedPaths)

    try {
      const result = await invoke<{ trashed: number; errors: string[] }>('trash_files', {
        paths,
      })

      if (result.trashed > 0) {
        const filenames = paths
          .slice(0, result.trashed)
          .map(p => p.split('/').pop() || p)
        setLastTrashedFiles(filenames)
      }

      if (result.errors.length > 0) {
        showToast(`Moved ${result.trashed} files to Trash (${result.errors.length} failed)`, 'warning')
        console.warn('Trash errors:', result.errors)
      } else {
        showToast(`Moved ${result.trashed} files to Trash`, 'success')
      }
      setSelectedPaths(new Set())
      setShowConfirm(false)
    } catch (error) {
      console.error('Failed to trash files:', error)
      showToast(`Error: ${error}`, 'error')
    } finally {
      setIsDeleting(false)
    }
  }, [selectedPaths, showToast])

  const handleUndo = useCallback(async () => {
    if (lastTrashedFiles.length === 0) return

    setIsRestoring(true)
    try {
      const result = await invoke<{ restored: number; errors: string[] }>('restore_from_trash', {
        filenames: lastTrashedFiles,
      })

      if (result.restored > 0) {
        showToast(`Restored ${result.restored} files from Trash`, 'success')
        setLastTrashedFiles([])
      } else if (result.errors.length > 0) {
        showToast(`Could not restore: ${result.errors[0]}`, 'warning')
      }
    } catch (error) {
      console.error('Failed to restore files:', error)
      showToast(`Restore failed: ${error}`, 'error')
    } finally {
      setIsRestoring(false)
    }
  }, [lastTrashedFiles, showToast])

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  if (!results) {
    return (
      <EmptyState
        icon={Search}
        title="No Similar Photos Data"
        message="Run a scan to find similar photos"
      />
    )
  }

  if (results.groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Similar Photos</h2>
              <p className="text-sm text-gray-400">
                Scanned {results.total_photos_scanned} photos in {formatDuration(results.duration_ms)}
              </p>
            </div>
            <button
              onClick={onNewScan}
              className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20 transition-all"
            >
              New Scan
            </button>
          </div>
        </div>

        <EmptyState
          icon={Sparkles}
          title="No Similar Photos Found"
          message="All your photos are unique! No similar photos were detected."
        />
      </div>
    )
  }

  const selectedSize = Array.from(selectedPaths).reduce((acc, path) => {
    for (const group of results.groups) {
      if (group.reference === path) {
        return acc + group.reference_size_bytes
      }
      const photo = group.similar_photos.find(p => p.path === path)
      if (photo) {
        return acc + photo.size_bytes
      }
    }
    return acc
  }, 0)

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Similar Photos</h2>
              <span className="px-2 py-0.5 text-xs font-semibold bg-purple-500/10 border border-purple-500/20 text-purple-400">
                {results.similar_groups_found} groups
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Found {results.similar_photos_found} similar photos in {results.total_photos_scanned} scanned
              <span className="text-gray-500"> ({formatDuration(results.duration_ms)})</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            {selectedPaths.size > 0 && (
              <>
                <button
                  onClick={selectAllVisible}
                  className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Clear
                </button>
              </>
            )}

            <button
              onClick={onNewScan}
              className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20 transition-all"
            >
              New Scan
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-auto p-6 pb-32 custom-scrollbar">
        <div className="space-y-4">
          <AnimatePresence>
            {results.groups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.5) }}
              >
                <SimilarGroupCard
                  group={group}
                  selectedFiles={selectedPaths}
                  onToggleFile={togglePath}
                  onPreviewImage={setPreviewImage}
                  isExpanded={expandedGroups.has(group.id)}
                  onToggleExpand={() => toggleGroupExpanded(group.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Action bar */}
      <ActionBar
        selectedCount={selectedPaths.size}
        selectedSize={selectedSize}
        isDeleting={isDeleting}
        onTrash={() => setShowConfirm(true)}
        canUndo={lastTrashedFiles.length > 0}
        undoCount={lastTrashedFiles.length}
        isRestoring={isRestoring}
        onUndo={handleUndo}
      />

      {/* Confirmation modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title="Confirm Deletion"
        message={
          <>
            You&apos;re about to move <span className="text-white font-semibold">{selectedPaths.size} files</span> to Trash.
            <br />
            <span className="text-sm text-gray-500">Files can be recovered from the Trash if needed.</span>
          </>
        }
        confirmLabel="Move to Trash"
        loadingLabel="Moving..."
        isLoading={isDeleting}
        variant="danger"
        onConfirm={handleTrash}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Image Preview Modal */}
      <ImagePreview
        src={previewImage}
        onClose={() => setPreviewImage(null)}
        isSelected={previewImage ? selectedPaths.has(previewImage) : undefined}
        onDelete={previewImage ? () => togglePath(previewImage) : undefined}
      />
    </div>
  )
}
