import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { invoke } from '../lib/tauri'
import { History, Trash2, RefreshCw, AlertCircle } from 'lucide-react'

import type { ScanHistoryResult, ScanHistoryEntry } from '../lib/types'
import { HistoryCard } from './HistoryCard'
import { EmptyState } from './EmptyState'
import { ConfirmModal } from './ConfirmModal'
import { useToast } from './Toast'

export function HistoryView() {
  const [history, setHistory] = useState<ScanHistoryEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const { showToast } = useToast()

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await invoke<ScanHistoryResult>('get_scan_history', {
        limit: 100,
        offset: 0,
      })
      setHistory(result.entries)
      setTotalCount(result.total_count)
    } catch (err) {
      console.error('Failed to load history:', err)
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await invoke<boolean>('delete_scan_history', { scanId: id })
      setHistory(prev => prev.filter(e => e.id !== id))
      setTotalCount(prev => prev - 1)
      showToast('Scan removed from history', 'success')
    } catch (err) {
      console.error('Failed to delete scan:', err)
      showToast(`Failed to delete: ${err}`, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = async () => {
    setIsClearing(true)
    try {
      const cleared = await invoke<number>('clear_scan_history')
      setHistory([])
      setTotalCount(0)
      setShowClearConfirm(false)
      showToast(`Cleared ${cleared} scan${cleared !== 1 ? 's' : ''} from history`, 'success')
    } catch (err) {
      console.error('Failed to clear history:', err)
      showToast(`Failed to clear: ${err}`, 'error')
    } finally {
      setIsClearing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading history...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Failed to load history</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={loadHistory}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Scan History</h2>
          </div>
        </div>

        <EmptyState
          icon="📜"
          title="No Scan History"
          message="Your scan history will appear here after running scans."
        />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Scan History</h2>
            <span className="px-2 py-0.5 text-xs font-semibold bg-white/10 text-gray-400">
              {totalCount} scan{totalCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={loadHistory}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        <div className="space-y-3">
          <AnimatePresence>
            {history.map((entry) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                onDelete={() => handleDelete(entry.id)}
                isDeleting={deletingId === entry.id}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Clear confirmation modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear All History"
        message={
          <>
            You&apos;re about to clear <span className="text-white font-semibold">{totalCount} scan{totalCount !== 1 ? 's' : ''}</span> from history.
            <br />
            <span className="text-sm text-gray-500">This action cannot be undone.</span>
          </>
        }
        confirmLabel="Clear All"
        loadingLabel="Clearing..."
        isLoading={isClearing}
        variant="danger"
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  )
}
