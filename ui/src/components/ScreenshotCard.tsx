import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { convertFileSrc } from '../lib/tauri'
import { CheckCircle2, Circle, FileImage } from 'lucide-react'
import type { ScreenshotInfo } from '../lib/types'

interface ScreenshotCardProps {
  screenshot: ScreenshotInfo
  isSelected: boolean
  onToggleSelect: () => void
  onPreview: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'Unknown'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch {
    return 'Unknown'
  }
}

const getConfidenceBadgeColor = (confidence: string): string => {
  switch (confidence) {
    case 'high':
      return 'bg-green-500/20 text-green-400 border border-green-500/30'
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    case 'low':
      return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  }
}

function ImageThumbnail({
  src,
  alt,
  className = '',
  fallback = <FileImage className="w-5 h-5 text-gray-600" />,
}: {
  src: string
  alt: string
  className?: string
  fallback?: React.ReactNode
}) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [src])

  const assetUrl = convertFileSrc(src)

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-white/5 ${className}`}>
        {fallback}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden bg-white/5 ${className}`}>
      {!loaded && <div className="absolute inset-0 skeleton" />}
      <img
        src={assetUrl}
        alt={alt}
        className={`w-full h-full object-cover transition-all duration-500 ${
          loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-110'
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  )
}

export function ScreenshotCard({
  screenshot,
  isSelected,
  onToggleSelect,
  onPreview,
}: ScreenshotCardProps) {
  const fileName = screenshot.path.split('/').pop() || screenshot.path

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="group glass-card overflow-hidden flex flex-col cursor-pointer transition-all duration-300"
      onClick={onPreview}
    >
      {/* Thumbnail with overlays */}
      <div className="relative aspect-square overflow-hidden bg-white/5">
        <ImageThumbnail src={screenshot.path} alt={`Screenshot: ${fileName}`} className="w-full h-full" />

        {/* Checkbox - top-left */}
        <motion.button
          aria-label={isSelected ? 'Deselect screenshot' : 'Select screenshot'}
          aria-pressed={isSelected}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className="absolute top-3 left-3 z-10 flex items-center justify-center focus-ring"
        >
          {isSelected ? (
            <CheckCircle2 className="w-6 h-6 text-green-400 drop-shadow-lg" />
          ) : (
            <Circle className="w-6 h-6 text-white/40 drop-shadow-lg hover:text-white/60 transition-colors" />
          )}
        </motion.button>

        {/* Confidence badge - top-right */}
        <div
          className={`absolute top-3 right-3 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] ${getConfidenceBadgeColor(
            screenshot.confidence
          )}`}
          onClick={(e) => e.stopPropagation()}
        >
          {screenshot.confidence}
        </div>

        {/* Dark overlay on hover with preview icon */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="text-white/80 text-sm font-bold">Click to preview</div>
          </div>
        </motion.div>
      </div>

      {/* Info section - bottom */}
      <div className="flex-1 flex flex-col p-3 justify-between">
        {/* File name and size */}
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-white truncate mb-1 group-hover:text-purple-400 transition-colors">
            {fileName}
          </h4>
          <p className="text-xs text-gray-500 font-mono truncate">{formatBytes(screenshot.size_bytes)}</p>
        </div>

        {/* Date */}
        <div className="mt-2 pt-2 border-t border-white/5">
          <p className="text-[11px] text-gray-500 uppercase tracking-widest">
            {formatDate(screenshot.date_taken)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
