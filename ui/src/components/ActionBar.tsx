import { formatBytes } from './ResultsSummary'

interface ActionBarProps {
  selectedCount: number
  selectedSize: number
  isDeleting: boolean
  onTrash: () => void
}

export function ActionBar({ selectedCount, selectedSize, isDeleting, onTrash }: ActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="p-4 glass-strong border-t border-white/5 relative z-10">
      <div className="flex items-center justify-between">
        <div className="text-gray-400">
          <span className="text-white font-semibold">{selectedCount}</span> files selected
          <span className="mx-3 text-gray-600">·</span>
          <span className="text-green-400 font-medium">{formatBytes(selectedSize)}</span> to free
        </div>
        <button
          onClick={onTrash}
          disabled={isDeleting}
          className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 rounded-xl text-white font-semibold transition-all duration-200 shadow-lg hover:shadow-red-500/25 hover:scale-105 active:scale-95"
        >
          {isDeleting ? 'Moving to Trash...' : 'Move to Trash'}
        </button>
      </div>
    </div>
  )
}
