import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '../lib/tauri'

import type { ScreenshotScanResult, ScreenshotInfo } from '../lib/types'
import { ScreenshotGrid } from './ScreenshotGrid'
import { DuplicateGroupCard } from './DuplicateGroupCard'
import { ImagePreview } from './ImagePreview'
import { ActionBar } from './ActionBar'
import { ConfirmModal } from './ConfirmModal'
import { EmptyState } from './EmptyState'
import { useToast } from './Toast'

interface ScreenshotsViewProps {
  results: ScreenshotScanResult | null
  onNewScan: () => void
}

type TabType = 'all' | 'duplicates'

export function ScreenshotsView({ results, onNewScan }: ScreenshotsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [lastTrashedFiles, setLastTrashedFiles] = useState<string[]>([])
  const [isRestoring, setIsRestoring] = useState(false)
  const { showToast } = useToast()
  const containerRef = useRef<HTMLDivElement>(null)

  if (!results) {
    return (
      <EmptyState
        icon="📸"
        title="No Screenshot Data"
        message="Run a scan to find screenshots"
      />
    )
  }

  const togglePath = (path: string) => {
    const newSelected = new Set(selectedPaths)
    if (newSelected.has(path)) {
      newSelected.delete(path)
    } else {
      newSelected.add(path)
    }
    setSelectedPaths(newSelected)
  }

  const selectAllVisible = useCallback(() => {
    const newSelected = new Set(selectedPaths)

    if (activeTab === 'all') {
      results.all_screenshots.forEach(screenshot => {
        newSelected.add(screenshot.path)
      })
    } else {
      results.duplicate_groups.forEach(group => {
        group.photos.forEach(photo => {
          newSelected.add(photo)
        })
      })
    }

    setSelectedPaths(newSelected)
    showToast(`Selected ${newSelected.size} items`, 'info')
  }, [activeTab, results, selectedPaths, showToast])

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set())
    showToast('Selection cleared', 'info')
  }, [showToast])

  const handleTrash = async () => {
    if (selectedPaths.size === 0) return

    setIsDeleting(true)
    const paths = Array.from(selectedPaths)

    try {
      const result = await invoke<{ trashed: number; errors: string[] }>('trash_files', {
        paths,
      })

      if (result.trashed > 0) {
        const filenames = paths
          .filter((_, i) => i < result.trashed)
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
  }

  const handleUndo = async () => {
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
  }

  const selectedSize = Array.from(selectedPaths).reduce((acc, path) => {
    const screenshot = results.all_screenshots.find(s => s.path === path)
    return acc + (screenshot?.size_bytes || 0)
  }, 0)

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

  const handlePreviewScreenshot = (screenshot: ScreenshotInfo) => {
    setPreviewImage(screenshot.path)
  }

  const renderAllTab = () => {
    if (results.all_screenshots.length === 0) {
      return (
        <EmptyState
          icon="📸"
          title="No Screenshots Found"
          message="No screenshots detected in the selected folder"
        />
      )
    }

    return (
      <ScreenshotGrid
        screenshots={results.all_screenshots}
        selectedPaths={selectedPaths}
        onToggleSelect={togglePath}
        onPreview={handlePreviewScreenshot}
      />
    )
  }

  const renderDuplicatesTab = () => {
    if (results.duplicate_groups.length === 0) {
      return (
        <EmptyState
          icon="✨"
          title="No Duplicate Screenshots"
          message="All screenshots are unique"
        />
      )
    }

    return (
      <div ref={containerRef} className="flex-1 overflow-auto p-6 pb-32 custom-scrollbar">
        <div className="space-y-4">
          <AnimatePresence>
            {results.duplicate_groups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.5) }}
              >
                <DuplicateGroupCard
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
    )
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 flex items-center h-16 gap-8">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-4 pt-2 font-medium text-sm transition-all relative ${
              activeTab === 'all'
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            All Screenshots
            {activeTab === 'all' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('duplicates')}
            className={`pb-4 pt-2 font-medium text-sm transition-all relative ${
              activeTab === 'duplicates'
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Duplicates
            {activeTab === 'duplicates' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Top right actions */}
          <div className="flex items-center gap-4">
            {selectedPaths.size > 0 && (
              <>
                <button
                  onClick={selectAllVisible}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Select All Visible
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
              className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-300 border border-white/10 hover:border-white/20 transition-all rounded"
            >
              New Scan
            </button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            {activeTab === 'all' ? renderAllTab() : renderDuplicatesTab()}
          </motion.div>
        </AnimatePresence>
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
            You're about to move <span className="text-white font-semibold">{selectedPaths.size} files</span> to Trash.
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
