import { useState, useEffect } from 'react'
import { convertFileSrc } from '../lib/tauri'

interface ImagePreviewProps {
  src: string | null
  onClose: () => void
  onDelete?: () => void
  isSelected?: boolean
}

// Inner component that resets state when key (src) changes
function ImagePreviewContent({ src, onClose, onDelete, isSelected }: ImagePreviewProps & { src: string }) {
  const [loaded, setLoaded] = useState(false)
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!src) return null

  const assetUrl = convertFileSrc(src)
  const fileName = src.split('/').pop() || src

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] animate-fade-in"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-12 h-12  glass-strong flex items-center justify-center text-white hover:bg-white/10 transition-colors z-10 focus-ring btn-press"
      >
        <span className="text-2xl">×</span>
      </button>

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading skeleton */}
        {!loaded && (
          <div className="absolute inset-0 skeleton min-w-[300px] min-h-[300px]" />
        )}

        {/* Image */}
        <img
          src={assetUrl}
          alt={fileName}
          className={`max-w-full max-h-[85vh] object-contain  shadow-2xl transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={(e) => {
            setLoaded(true)
            const img = e.target as HTMLImageElement
            setImageInfo({ width: img.naturalWidth, height: img.naturalHeight })
          }}
        />

        {/* Info bar */}
        <div className="absolute bottom-0 left-0 right-0 glass-strong  p-4 flex items-center justify-between">
          <div>
            <div className="text-white font-medium truncate max-w-[400px]">{fileName}</div>
            {imageInfo && (
              <div className="text-sm text-gray-400">
                {imageInfo.width} × {imageInfo.height}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isSelected !== undefined && (
              <span className={`text-sm px-3 py-1  ${
                isSelected
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-green-500/20 text-green-400'
              }`}>
                {isSelected ? 'Selected for deletion' : 'Keeping'}
              </span>
            )}

            {onDelete && (
              <button
                onClick={onDelete}
                className={`px-4 py-2  font-medium transition-all duration-200 ${
                  isSelected
                    ? 'glass-card text-white hover:bg-white/10'
                    : 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-500 hover:to-red-600'
                }`}
              >
                {isSelected ? 'Unselect' : 'Select for deletion'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* File path tooltip */}
      <div className="absolute bottom-6 left-6 glass-strong  px-4 py-2 max-w-[500px]">
        <div className="text-xs text-gray-500 truncate">{src}</div>
      </div>
    </div>
  )
}

// Wrapper component that uses key to reset state when src changes
export function ImagePreview({ src, onClose, onDelete, isSelected }: ImagePreviewProps) {
  if (!src) return null
  // Key prop forces remount when src changes, resetting all internal state
  return <ImagePreviewContent key={src} src={src} onClose={onClose} onDelete={onDelete} isSelected={isSelected} />
}
