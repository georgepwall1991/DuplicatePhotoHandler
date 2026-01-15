import { formatBytes } from './ResultsSummary'

interface ActionBarProps {
  selectedCount: number
  selectedSize: number
  isDeleting: boolean
  onTrash: () => void
  canUndo?: boolean
  undoCount?: number
  isRestoring?: boolean
  onUndo?: () => void
}

export function ActionBar({
  selectedCount,
  selectedSize,
  isDeleting,
  onTrash,
  canUndo = false,
  undoCount = 0,
  isRestoring = false,
  onUndo,
}: ActionBarProps) {
  // Show bar if there's a selection OR if undo is available
  if (selectedCount === 0 && !canUndo) return null

  return (
    <div className="p-4 glass-strong border-t border-white/5 relative z-10">
      <div className="flex items-center justify-between">
        <div className="text-gray-400">
          {selectedCount > 0 ? (
            <>
              <span className="text-white font-semibold">{selectedCount}</span> files selected
              <span className="mx-3 text-gray-600">·</span>
              <span className="text-green-400 font-medium">{formatBytes(selectedSize)}</span> to free
            </>
          ) : canUndo ? (
            <>
              <span className="text-amber-400 font-semibold">{undoCount}</span> files moved to Trash
              <span className="mx-2 text-gray-500">·</span>
              <span className="text-gray-500 text-sm">Press ⌘Z to undo</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {canUndo && onUndo && (
            <button
              onClick={onUndo}
              disabled={isRestoring}
              className="px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:from-gray-600 disabled:to-gray-700 rounded-xl text-white font-semibold transition-all duration-200 shadow-lg hover:shadow-amber-500/25 hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <span className="text-lg">↩</span>
              {isRestoring ? 'Restoring...' : 'Undo'}
            </button>
          )}
          {selectedCount > 0 && (
            <button
              onClick={onTrash}
              disabled={isDeleting}
              className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 rounded-xl text-white font-semibold transition-all duration-200 shadow-lg hover:shadow-red-500/25 hover:scale-105 active:scale-95"
            >
              {isDeleting ? 'Moving to Trash...' : 'Move to Trash'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
