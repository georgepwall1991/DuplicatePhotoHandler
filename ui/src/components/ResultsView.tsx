import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '../lib/tauri'
import { useVirtualizer } from '@tanstack/react-virtual'

import type { ScanResult, FileInfo, QualityScore } from '../lib/types'
import { DuplicateGroupCard } from './DuplicateGroupCard'
import { ImagePreview } from './ImagePreview'
import { ComparisonView } from './ComparisonView'
import { ShortcutsHelp } from './ShortcutsHelp'
import { BeforeAfter } from './BeforeAfter'
import { Search, Check, Keyboard, ChevronDown } from 'lucide-react'
import { ResultsHeader, type SortOption, type FilterOption, type SelectionStrategy } from './ResultsHeader'
import { ResultsSummary } from './ResultsSummary'
import { ActionBar } from './ActionBar'
import { ConfirmModal } from './ConfirmModal'
import { EmptyState } from './EmptyState'
import { useToast } from './Toast'
import { useSpaceSavings } from '../context/SpaceSavingsContext'

interface ResultsViewProps {
  results: ScanResult
  onNewScan: () => void
}

// Convert glob pattern to regex (supports *, ?)
const globToRegex = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars except * and ?
    .replace(/\*/g, '.*')                    // * matches anything
    .replace(/\?/g, '.')                     // ? matches single char
  return new RegExp(escaped, 'i')
}

// Check if any filename in the group matches the search term
const groupMatchesSearch = (group: { photos: string[] }, searchTerm: string): boolean => {
  if (!searchTerm.trim()) return true

  // Check if it looks like a glob pattern
  const isGlob = searchTerm.includes('*') || searchTerm.includes('?')

  if (isGlob) {
    const regex = globToRegex(searchTerm)
    return group.photos.some(path => {
      const filename = path.split('/').pop() || path
      return regex.test(filename)
    })
  }

  // Simple case-insensitive substring match
  const lowerSearch = searchTerm.toLowerCase()
  return group.photos.some(path => {
    const filename = path.split('/').pop() || path
    return filename.toLowerCase().includes(lowerSearch)
  })
}

export function ResultsView({ results, onNewScan }: ResultsViewProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [comparison, setComparison] = useState<{ left: string; right: string } | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('size')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [lastTrashedFiles, setLastTrashedFiles] = useState<string[]>([])
  const [isRestoring, setIsRestoring] = useState(false)
  const [showImpact, setShowImpact] = useState(true)
  const { showToast } = useToast()
  const { addSavings } = useSpaceSavings()
  const containerRef = useRef<HTMLDivElement>(null)

  // Sort and filter groups
  const filteredAndSortedGroups = results.groups
    .filter(group => {
      // Filter by match type
      if (filterBy === 'exact' && !(group.match_type.includes('Exact') && !group.match_type.includes('NearExact'))) return false
      if (filterBy === 'near' && !group.match_type.includes('NearExact')) return false
      if (filterBy === 'similar' && !group.match_type.includes('Similar')) return false

      // Filter by search term
      if (!groupMatchesSearch(group, searchTerm)) return false

      return true
    })
    .sort((a, b) => {
      if (sortBy === 'size') return b.duplicate_size_bytes - a.duplicate_size_bytes
      if (sortBy === 'photos') return b.photos.length - a.photos.length
      if (sortBy === 'type') {
        const typeOrder = { 'Exact': 0, 'NearExact': 1, 'Similar': 2 }
        const aOrder = typeOrder[a.match_type as keyof typeof typeOrder] ?? 3
        const bOrder = typeOrder[b.match_type as keyof typeof typeOrder] ?? 3
        return aOrder - bOrder
      }
      return 0
    })

  // Smart selection based on strategy
  const handleSmartSelect = useCallback(async (strategy: SelectionStrategy) => {
    if (strategy === 'duplicates') {
      // Original behavior: select all duplicates (not the representative)
      const duplicates = new Set<string>()
      results.groups.forEach((group) => {
        group.photos.forEach((photo) => {
          if (photo !== group.representative) {
            duplicates.add(photo)
          }
        })
      })
      setSelectedFiles(duplicates)
      showToast(`Selected ${duplicates.size} duplicate files`, 'info')
      return
    }

    // For other strategies, we need file info or quality scores
    const analysisMessage = strategy === 'keepSharpest' ? 'Analyzing sharpness...'
      : strategy === 'aiComposite' ? 'Running AI analysis...'
        : strategy === 'keepMostMetadata' ? 'Checking EXIF data...'
          : 'Analyzing photos...'
    showToast(analysisMessage, 'info')

    const toDelete = new Set<string>()

    for (const group of results.groups) {
      if (group.photos.length < 2) continue

      try {
        if (strategy === 'keepSharpest' || strategy === 'aiComposite') {
          // Fetch quality scores for all photos in the group
          const scores = await Promise.all(
            group.photos.map(path => invoke<QualityScore>('get_quality_score', { path }))
          )

          // Find the best photo based on quality score
          let bestIdx = 0
          for (let i = 1; i < scores.length; i++) {
            if (scores[i].overall > scores[bestIdx].overall) {
              bestIdx = i
            }
          }

          // Select all except the best for deletion
          scores.forEach((score, idx) => {
            if (idx !== bestIdx) {
              toDelete.add(score.path)
            }
          })
        } else if (strategy === 'keepRaw') {
          // Prioritize RAW formats: ARW, CR2, NEF, DNG, RAF, ORF, RW2
          const rawExtensions = ['.arw', '.cr2', '.cr3', '.nef', '.dng', '.raf', '.orf', '.rw2', '.raw']

          // Find if there's a RAW file in the group
          let rawIdx = -1
          for (let i = 0; i < group.photos.length; i++) {
            const ext = group.photos[i].toLowerCase().slice(group.photos[i].lastIndexOf('.'))
            if (rawExtensions.includes(ext)) {
              rawIdx = i
              break
            }
          }

          // If no RAW found, fall back to representative
          const keepIdx = rawIdx >= 0 ? rawIdx : group.photos.indexOf(group.representative)
          group.photos.forEach((photo, idx) => {
            if (idx !== keepIdx) {
              toDelete.add(photo)
            }
          })
        } else if (strategy === 'keepMostMetadata') {
          // Fetch file info to check for metadata (using file size as a proxy - larger files often have more metadata)
          const infos = await Promise.all(
            group.photos.map(path => invoke<FileInfo>('get_file_info', { path }))
          )

          // Find the file with most metadata (largest size as proxy, or check dimensions)
          let bestIdx = 0
          for (let i = 1; i < infos.length; i++) {
            // Prefer files with dimensions info (indicates metadata read)
            const hasDimensions = infos[i].dimensions !== null
            const bestHasDimensions = infos[bestIdx].dimensions !== null

            if (hasDimensions && !bestHasDimensions) {
              bestIdx = i
            } else if (hasDimensions === bestHasDimensions && infos[i].size_bytes > infos[bestIdx].size_bytes) {
              bestIdx = i
            }
          }

          infos.forEach((info, idx) => {
            if (idx !== bestIdx) {
              toDelete.add(info.path)
            }
          })
        } else {
          // Fetch file info for all photos in the group
          const infos = await Promise.all(
            group.photos.map(path => invoke<FileInfo>('get_file_info', { path }))
          )

          // Find the "best" photo based on strategy
          let bestIdx = 0
          for (let i = 1; i < infos.length; i++) {
            const current = infos[i]
            const best = infos[bestIdx]

            if (strategy === 'keepHighestRes') {
              const currentPixels = current.dimensions ? current.dimensions[0] * current.dimensions[1] : 0
              const bestPixels = best.dimensions ? best.dimensions[0] * best.dimensions[1] : 0
              if (currentPixels > bestPixels) bestIdx = i
            } else if (strategy === 'keepLargest') {
              if (current.size_bytes > best.size_bytes) bestIdx = i
            } else if (strategy === 'keepOldest') {
              if (current.modified && best.modified && current.modified < best.modified) bestIdx = i
            } else if (strategy === 'keepMostRecent') {
              if (current.modified && best.modified && current.modified > best.modified) bestIdx = i
            }
          }

          // Select all except the best for deletion
          infos.forEach((info, idx) => {
            if (idx !== bestIdx) {
              toDelete.add(info.path)
            }
          })
        }
      } catch (error) {
        console.error('Failed to analyze group:', error)
        // Fall back to selecting all except representative
        group.photos.forEach(photo => {
          if (photo !== group.representative) {
            toDelete.add(photo)
          }
        })
      }
    }

    setSelectedFiles(toDelete)
    const strategyNames: Record<SelectionStrategy, string> = {
      duplicates: 'duplicates',
      keepHighestRes: 'lower resolution',
      keepLargest: 'smaller',
      keepOldest: 'newer',
      keepMostRecent: 'older',
      keepSharpest: 'blurrier',
      keepRaw: 'non-RAW',
      keepMostMetadata: 'less metadata',
      aiComposite: 'lower quality',
    }
    showToast(`Selected ${toDelete.size} ${strategyNames[strategy]} files for deletion`, 'info')
  }, [results.groups, showToast])

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set())
    showToast('Selection cleared', 'info')
  }, [showToast])

  const toggleFile = (path: string) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(path)) {
      newSelected.delete(path)
    } else {
      newSelected.add(path)
    }
    setSelectedFiles(newSelected)
  }

  const handleTrash = async () => {
    if (selectedFiles.size === 0) return

    setIsDeleting(true)
    const paths = Array.from(selectedFiles)

    try {
      const result = await invoke<{ trashed: number; errors: string[] }>('trash_files', {
        paths,
      })

      if (result.trashed > 0) {
        // Save trashed file names for potential undo
        const filenames = paths
          .filter((_, i) => i < result.trashed)
          .map(p => p.split('/').pop() || p)
        setLastTrashedFiles(filenames)

        // Calculate and add recovered space
        const recoveredBytes = paths.slice(0, result.trashed).reduce((acc, path) => {
          for (const group of results.groups) {
            const idx = group.photos.indexOf(path)
            if (idx !== -1) {
              // Estimate size per file from the group
              return acc + Math.floor(group.duplicate_size_bytes / group.duplicate_count)
            }
          }
          return acc
        }, 0)
        if (recoveredBytes > 0) {
          addSavings(recoveredBytes)
        }
      }

      if (result.errors.length > 0) {
        showToast(`Moved ${result.trashed} files to Trash (${result.errors.length} failed)`, 'warning')
        console.warn('Trash errors:', result.errors)
      } else {
        showToast(`Moved ${result.trashed} files to Trash`, 'success')
      }
      setSelectedFiles(new Set())
      setShowConfirm(false)
    } catch (error) {
      console.error('Failed to trash files:', error)
      showToast(`Error: ${error}`, 'error')
    } finally {
      setIsDeleting(false)
    }
  }

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

  const selectedSize = Array.from(selectedFiles).reduce((acc, path) => {
    for (const group of results.groups) {
      const idx = group.photos.indexOf(path)
      if (idx !== -1) {
        // Estimate size per file
        return acc + group.duplicate_size_bytes / group.duplicate_count
      }
    }
    return acc
  }, 0)

  // Toggle group expansion
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

  // Open comparison view
  const handleCompare = useCallback((leftPath: string, rightPath: string) => {
    setComparison({ left: leftPath, right: rightPath })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if modal is open or user is typing in an input
      if (showConfirm || previewImage || comparison || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const groupCount = filteredAndSortedGroups.length
      if (groupCount === 0) return

      switch (e.key.toLowerCase()) {
        case 'a':
          // Select all duplicates
          e.preventDefault()
          handleSmartSelect('duplicates')
          break

        case 'd':
          // Deselect all
          e.preventDefault()
          clearSelection()
          break

        case 'delete':
        case 'backspace':
          // Trash selected (if any)
          if (selectedFiles.size > 0) {
            e.preventDefault()
            setShowConfirm(true)
          }
          break

        case 'arrowdown':
        case 'j':
          // Navigate down
          e.preventDefault()
          setFocusedIndex(prev => {
            if (prev === null) return 0
            return Math.min(prev + 1, groupCount - 1)
          })
          break

        case 'arrowup':
        case 'k':
          // Navigate up
          e.preventDefault()
          setFocusedIndex(prev => {
            if (prev === null) return groupCount - 1
            return Math.max(prev - 1, 0)
          })
          break

        case ' ':
          // Toggle expand focused group
          if (focusedIndex !== null && focusedIndex < groupCount) {
            e.preventDefault()
            const groupId = filteredAndSortedGroups[focusedIndex].id
            toggleGroupExpanded(groupId)
          }
          break

        case 'enter':
          // Preview first photo of focused group
          if (focusedIndex !== null && focusedIndex < groupCount) {
            e.preventDefault()
            const group = filteredAndSortedGroups[focusedIndex]
            setPreviewImage(group.representative)
          }
          break

        case 'escape':
          // Clear focus
          setFocusedIndex(null)
          break

        case 'z':
          // Cmd+Z / Ctrl+Z to undo
          if ((e.metaKey || e.ctrlKey) && lastTrashedFiles.length > 0 && !isRestoring) {
            e.preventDefault()
            handleUndo()
          }
          break

        case '?':
          e.preventDefault()
          setShowShortcuts(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredAndSortedGroups, focusedIndex, selectedFiles.size, showConfirm, previewImage, comparison, handleSmartSelect, clearSelection, toggleGroupExpanded, lastTrashedFiles.length, isRestoring, handleUndo])

  // Scroll focused group into view
  useEffect(() => {
    if (focusedIndex !== null && containerRef.current) {
      const groupElements = containerRef.current.querySelectorAll('[data-group-card]')
      const focusedElement = groupElements[focusedIndex]
      if (focusedElement) {
        focusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedIndex])

  // Virtual scrolling configuration
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedGroups.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => {
      // Estimate row height - expanded cards are taller
      const group = filteredAndSortedGroups[index]
      const isExpanded = expandedGroups.has(group?.id)
      return isExpanded ? 400 : 180
    },
    overscan: 5,
  })

  // Re-measure when expanded groups change
  useEffect(() => {
    rowVirtualizer.measure()
  }, [expandedGroups, rowVirtualizer])

  const renderContent = () => {
    if (filteredAndSortedGroups.length === 0) {
      const isFiltered = results.groups.length > 0
      return (
        <EmptyState
          icon={isFiltered ? Search : Check}
          title={isFiltered ? 'No matches for filter' : 'No Duplicates Found!'}
          message={isFiltered ? 'Try changing the filter to see more results.' : 'Your photo library is clean.'}
        />
      )
    }

    return (
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const group = filteredAndSortedGroups[virtualRow.index]
          return (
            <div
              key={group.id}
              data-group-card
              data-index={virtualRow.index}
              className="absolute left-0 right-0 px-0"
              style={{
                top: `${virtualRow.start}px`,
                height: `${virtualRow.size}px`,
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="pb-4"
              >
                <DuplicateGroupCard
                  group={group}
                  selectedFiles={selectedFiles}
                  onToggleFile={toggleFile}
                  onPreviewImage={setPreviewImage}
                  onCompare={handleCompare}
                  isFocused={focusedIndex === virtualRow.index}
                  isExpanded={expandedGroups.has(group.id)}
                  onToggleExpand={() => toggleGroupExpanded(group.id)}
                />
              </motion.div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Header with controls */}
      <ResultsHeader
        results={results}
        sortBy={sortBy}
        filterBy={filterBy}
        filteredCount={filteredAndSortedGroups.length}
        showErrors={showErrors}
        searchTerm={searchTerm}
        onSortChange={setSortBy}
        onFilterChange={setFilterBy}
        onSearchChange={setSearchTerm}
        onToggleErrors={() => setShowErrors(!showErrors)}
        onAutoSelect={handleSmartSelect}
        onClearSelection={clearSelection}
        onNewScan={onNewScan}
        hasSelection={selectedFiles.size > 0}
      />

      {/* Summary cards */}
      <div className="px-6 pb-4">
        <ResultsSummary
          totalPhotos={results.total_photos}
          duplicateGroups={results.duplicate_groups}
          potentialSavingsBytes={results.potential_savings_bytes}
        />
      </div>

      {/* Impact Visualization */}
      {results.duplicate_groups > 0 && (
        <div className="px-6 pb-4">
          <button
            onClick={() => setShowImpact(!showImpact)}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-muted hover:text-white transition-colors mb-3"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showImpact ? 'rotate-180' : ''}`} />
            {showImpact ? 'Hide' : 'Show'} Cleanup Impact
          </button>
          <AnimatePresence>
            {showImpact && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <BeforeAfter
                  totalPhotos={results.total_photos}
                  duplicateCount={results.groups.reduce((acc, g) => acc + g.photos.length - 1, 0)}
                  totalSize={results.total_photos * 5000000}
                  reclaimableSize={results.potential_savings_bytes}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Results list */}
      <div ref={containerRef} className="flex-1 overflow-auto p-6 pb-32 custom-scrollbar scroll-shadow">
        {renderContent()}
      </div>

      {/* Floating Shortcuts Trigger */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-6 right-6 z-40 w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-brand-primary/20 hover:border-brand-primary/50 transition-all shadow-lg backdrop-blur-sm"
        title="Keyboard Shortcuts (?)"
      >
        <Keyboard className="w-5 h-5" />
      </motion.button>

      {/* Action bar */}
      <ActionBar
        selectedCount={selectedFiles.size}
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
            You're about to move <span className="text-white font-semibold">{selectedFiles.size} files</span> to Trash.
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
        isSelected={previewImage ? selectedFiles.has(previewImage) : undefined}
        onDelete={previewImage ? () => toggleFile(previewImage) : undefined}
      />

      {/* Shortcuts Help Modal */}
      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />

      {/* Comparison View Modal */}
      {comparison && (
        <ComparisonView
          leftPath={comparison.left}
          rightPath={comparison.right}
          onClose={() => setComparison(null)}
          onKeepLeft={() => {
            // Select right (non-kept) for deletion
            if (!selectedFiles.has(comparison.right)) {
              toggleFile(comparison.right)
            }
            setComparison(null)
            showToast('Selected Photo B for deletion', 'info')
          }}
          onKeepRight={() => {
            // Select left (non-kept) for deletion
            if (!selectedFiles.has(comparison.left)) {
              toggleFile(comparison.left)
            }
            setComparison(null)
            showToast('Selected Photo A for deletion', 'info')
          }}
          onKeepBoth={() => {
            // Deselect both if selected
            if (selectedFiles.has(comparison.left)) {
              toggleFile(comparison.left)
            }
            if (selectedFiles.has(comparison.right)) {
              toggleFile(comparison.right)
            }
            setComparison(null)
            showToast('Keeping both photos', 'info')
          }}
        />
      )}
    </div>
  )
}
