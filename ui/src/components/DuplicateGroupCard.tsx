import { useState, useEffect } from 'react'
import { convertFileSrc } from '../lib/tauri'

import type { DuplicateGroup } from '../lib/types'

// Image thumbnail component with loading and error states
function ImageThumbnail({
  src,
  className = '',
  style,
  fallback = '📷'
}: {
  src: string
  className?: string
  style?: React.CSSProperties
  fallback?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  // Reset state when src changes (fixes stale state when reusing component)
  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [src])

  const assetUrl = convertFileSrc(src)

  if (error) {
    return (
      <div className={`flex items-center justify-center text-xl bg-[#1a1a2e] ${className}`} style={style}>
        {fallback}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden bg-[#1a1a2e] ${className}`} style={style}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]">
          <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        </div>
      )}
      <img
        src={assetUrl}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  )
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup
  selectedFiles: Set<string>
  onToggleFile: (path: string) => void
  onPreviewImage?: (path: string) => void
  isFocused?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const getFileName = (path: string): string => {
  return path.split('/').pop() || path
}

const getMatchTypeStyle = (matchType: string): { bg: string; text: string; glow: string } => {
  if (matchType.includes('Exact')) return {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    glow: 'shadow-red-500/20'
  }
  if (matchType.includes('NearExact')) return {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    glow: 'shadow-orange-500/20'
  }
  return {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    glow: 'shadow-yellow-500/20'
  }
}

export function DuplicateGroupCard({
  group,
  selectedFiles,
  onToggleFile,
  onPreviewImage,
  isFocused,
  isExpanded: externalExpanded,
  onToggleExpand,
}: DuplicateGroupCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)

  // Use external expanded state if provided, otherwise use internal state
  const expanded = externalExpanded !== undefined ? externalExpanded : internalExpanded
  const toggleExpand = onToggleExpand ?? (() => setInternalExpanded(!internalExpanded))

  const matchTypeLabel = group.match_type
    .replace('NearExact', 'Near-Exact')
    .replace(/([A-Z])/g, ' $1')
    .trim()

  const matchStyle = getMatchTypeStyle(group.match_type)

  // Count selected files in this group (excluding representative)
  const selectableCount = group.photos.filter(p => p !== group.representative).length
  const selectedInGroup = group.photos.filter(p => selectedFiles.has(p) && p !== group.representative).length

  return (
    <div className={`glass-card rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/5 ${isFocused ? 'ring-2 ring-purple-500 ring-opacity-70' : ''}`}>
      {/* Header */}
      <button
        onClick={toggleExpand}
        className="w-full p-5 flex items-center gap-4 text-left group"
      >
        {/* Thumbnails preview - Fixed stacking */}
        <div className="flex -space-x-3 isolate">
          {group.photos.slice(0, 3).map((photo, i) => (
            <ImageThumbnail
              key={photo}
              src={photo}
              className="w-14 h-14 rounded-xl glass-strong transition-transform duration-200 group-hover:scale-105"
              style={{ zIndex: 3 - i, transitionDelay: `${i * 50}ms` }}
            />
          ))}
          {group.photos.length > 3 && (
            <div className="w-14 h-14 rounded-xl glass-strong flex items-center justify-center text-sm font-medium text-gray-400">
              +{group.photos.length - 3}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 px-2">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${matchStyle.bg} ${matchStyle.text} border border-white/5`}>
              {matchTypeLabel}
            </span>
            <span className="text-sm text-gray-400 font-medium">
              {group.photos.length} photos
            </span>
          </div>
          <div className="text-white truncate mt-1 font-medium text-base tracking-tight" title={getFileName(group.representative)}>
            {getFileName(group.representative)}
          </div>
        </div>

        {/* Selection indicator */}
        {selectedInGroup > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm font-medium text-red-400">
              {selectedInGroup}/{selectableCount}
            </span>
          </div>
        )}

        {/* Size badge */}
        <div className="text-right">
          <div className="text-lg font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
            {formatBytes(group.duplicate_size_bytes)}
          </div>
          <div className="text-xs text-gray-500">to free</div>
        </div>

        {/* Expand icon */}
        <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center transition-all duration-300 ${expanded ? 'rotate-180 bg-purple-500/20' : ''}`}>
          <span className="text-gray-400 text-sm">▼</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/5 p-5">
          <div className="space-y-2">
            {group.photos.map((photo) => {
              const isRepresentative = photo === group.representative
              const isSelected = selectedFiles.has(photo)

              return (
                <div
                  key={photo}
                  className={`flex items-center gap-3 p-4 rounded-xl transition-all duration-200 ${isRepresentative
                    ? 'glass-card border border-green-500/20 glow-green'
                    : isSelected
                      ? 'bg-red-500/10 border border-red-500/30'
                      : 'glass hover:bg-white/5'
                    }`}
                >
                  {/* Checkbox */}
                  {!isRepresentative && (
                    <button
                      onClick={() => onToggleFile(photo)}
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ${isSelected
                        ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30'
                        : 'bg-white/10 hover:bg-white/20'
                        }`}
                    >
                      {isSelected && <span className="text-white text-sm font-bold">✓</span>}
                    </button>
                  )}

                  {/* Keep badge for representative */}
                  {isRepresentative && (
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                      <span className="text-white text-sm">★</span>
                    </div>
                  )}

                  {/* Photo thumbnail - clickable for preview */}
                  <button
                    onClick={() => onPreviewImage?.(photo)}
                    className="focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-xl transition-transform hover:scale-110"
                  >
                    <ImageThumbnail
                      src={photo}
                      className="w-12 h-12 rounded-xl glass-strong cursor-pointer"
                    />
                  </button>

                  {/* Path */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white truncate font-medium">{getFileName(photo)}</div>
                    <div className="text-xs text-gray-500 truncate">{photo}</div>
                  </div>

                  {/* Status */}
                  {isRepresentative && (
                    <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-green-500/20 text-green-400">
                      Keep
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Group actions */}
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              <span className="text-green-400">★</span> marks the recommended photo to keep
            </span>
            <button
              onClick={() => {
                group.photos.forEach((photo) => {
                  if (photo !== group.representative && !selectedFiles.has(photo)) {
                    onToggleFile(photo)
                  }
                })
              }}
              className="text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors"
            >
              Select all duplicates
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
