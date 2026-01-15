import { useState, useEffect } from 'react'
import { invoke, convertFileSrc } from '../lib/tauri'
import type { FileInfo } from '../lib/types'

interface ComparisonViewProps {
  leftPath: string
  rightPath: string
  onClose: () => void
  onKeepLeft: () => void
  onKeepRight: () => void
  onKeepBoth: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function ImagePanel({
  info,
  label,
  isLoading,
  isSelected,
}: {
  info: FileInfo | null
  label: string
  isLoading: boolean
  isSelected?: boolean
}) {
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    setImageLoaded(false)
  }, [info?.path])

  if (isLoading || !info) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center glass-card rounded-2xl p-6">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <p className="text-gray-500 mt-4">Loading...</p>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col glass-card rounded-2xl overflow-hidden ${isSelected ? 'ring-2 ring-green-500' : ''}`}>
      {/* Image */}
      <div className="flex-1 relative bg-black/20 min-h-[300px]">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        )}
        <img
          src={convertFileSrc(info.path)}
          alt={info.filename}
          className={`w-full h-full object-contain transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
        />
        {isSelected && (
          <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-green-500/90 text-white text-sm font-medium">
            Keep
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 border-t border-white/5">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">{label}</div>
        <h3 className="text-white font-medium truncate mb-3" title={info.filename}>
          {info.filename}
        </h3>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-gray-500">Dimensions</div>
            <div className="text-white font-medium">
              {info.dimensions ? `${info.dimensions[0]} × ${info.dimensions[1]}` : 'Unknown'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Size</div>
            <div className="text-white font-medium">{formatBytes(info.size_bytes)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-gray-500">Modified</div>
            <div className="text-white font-medium">{info.modified || 'Unknown'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ComparisonView({
  leftPath,
  rightPath,
  onClose,
  onKeepLeft,
  onKeepRight,
  onKeepBoth,
}: ComparisonViewProps) {
  const [leftInfo, setLeftInfo] = useState<FileInfo | null>(null)
  const [rightInfo, setRightInfo] = useState<FileInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true)
      try {
        const [left, right] = await Promise.all([
          invoke<FileInfo>('get_file_info', { path: leftPath }),
          invoke<FileInfo>('get_file_info', { path: rightPath }),
        ])
        setLeftInfo(left)
        setRightInfo(right)
      } catch (error) {
        console.error('Failed to fetch file info:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchInfo()
  }, [leftPath, rightPath])

  // Determine which is "better" based on resolution
  const leftPixels = leftInfo?.dimensions ? leftInfo.dimensions[0] * leftInfo.dimensions[1] : 0
  const rightPixels = rightInfo?.dimensions ? rightInfo.dimensions[0] * rightInfo.dimensions[1] : 0
  const leftIsBetter = leftPixels > rightPixels
  const rightIsBetter = rightPixels > leftPixels

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' || e.key === '1') {
        onKeepLeft()
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        onKeepRight()
      } else if (e.key === 'b' || e.key === '3') {
        onKeepBoth()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onKeepLeft, onKeepRight, onKeepBoth])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-6xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Compare Photos</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl glass-card flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Comparison panels */}
        <div className="flex gap-4 flex-1">
          <ImagePanel
            info={leftInfo}
            label="Photo A"
            isLoading={loading}
            isSelected={leftIsBetter && !rightIsBetter}
          />
          <ImagePanel
            info={rightInfo}
            label="Photo B"
            isLoading={loading}
            isSelected={rightIsBetter && !leftIsBetter}
          />
        </div>

        {/* Difference summary */}
        {leftInfo && rightInfo && (
          <div className="glass-card rounded-xl p-4 text-center">
            {leftPixels === rightPixels ? (
              <span className="text-gray-400">Both photos have the same resolution</span>
            ) : leftIsBetter ? (
              <span className="text-green-400">
                Photo A is higher resolution ({Math.round((leftPixels / rightPixels - 1) * 100)}% more pixels)
              </span>
            ) : (
              <span className="text-green-400">
                Photo B is higher resolution ({Math.round((rightPixels / leftPixels - 1) * 100)}% more pixels)
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onKeepLeft}
            className="px-6 py-3 rounded-xl glass-card text-white font-medium transition-all hover:bg-green-500/20 hover:border-green-500/50 flex items-center gap-2"
          >
            <span className="text-gray-500">←</span> Keep Photo A
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-xs text-gray-400">1</kbd>
          </button>
          <button
            onClick={onKeepBoth}
            className="px-6 py-3 rounded-xl glass-card text-gray-300 font-medium transition-all hover:bg-white/10"
          >
            Keep Both
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-xs text-gray-400">B</kbd>
          </button>
          <button
            onClick={onKeepRight}
            className="px-6 py-3 rounded-xl glass-card text-white font-medium transition-all hover:bg-green-500/20 hover:border-green-500/50 flex items-center gap-2"
          >
            Keep Photo B <span className="text-gray-500">→</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-xs text-gray-400">2</kbd>
          </button>
        </div>

        <p className="text-center text-gray-500 text-sm">
          Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400">Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
