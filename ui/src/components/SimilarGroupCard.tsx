import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, ExternalLink, CheckSquare, Square } from 'lucide-react'
import { invoke } from '../lib/tauri'

import type { SimilarGroup } from '../lib/types'

interface SimilarGroupCardProps {
  group: SimilarGroup
  selectedFiles: Set<string>
  onToggleFile: (path: string) => void
  onPreviewImage: (path: string) => void
  isExpanded: boolean
  onToggleExpand: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const getMatchTypeColor = (matchType: string): string => {
  switch (matchType) {
    case 'Similar':
      return 'text-purple-400'
    case 'MaybeSimilar':
      return 'text-pink-400'
    default:
      return 'text-gray-400'
  }
}

const getMatchTypeBg = (matchType: string): string => {
  switch (matchType) {
    case 'Similar':
      return 'bg-purple-500/10 border-purple-500/20'
    case 'MaybeSimilar':
      return 'bg-pink-500/10 border-pink-500/20'
    default:
      return 'bg-gray-500/10 border-gray-500/20'
  }
}

export function SimilarGroupCard({
  group,
  selectedFiles,
  onToggleFile,
  onPreviewImage,
  isExpanded,
  onToggleExpand,
}: SimilarGroupCardProps) {
  const [thumbnailErrors, setThumbnailErrors] = useState<Set<string>>(new Set())

  const handleShowInFolder = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await invoke('show_in_folder', { path })
    } catch (error) {
      console.error('Failed to show in folder:', error)
    }
  }

  const handleThumbnailError = (path: string) => {
    setThumbnailErrors(prev => new Set(prev).add(path))
  }

  const allPhotos = [group.reference, ...group.similar_photos.map(p => p.path)]
  const selectedCount = allPhotos.filter(p => selectedFiles.has(p)).length
  const isPartiallySelected = selectedCount > 0 && selectedCount < allPhotos.length
  const isAllSelected = selectedCount === allPhotos.length

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isAllSelected) {
      // Deselect all
      allPhotos.forEach(p => {
        if (selectedFiles.has(p)) {
          onToggleFile(p)
        }
      })
    } else {
      // Select all
      allPhotos.forEach(p => {
        if (!selectedFiles.has(p)) {
          onToggleFile(p)
        }
      })
    }
  }

  return (
    <div className="border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
      >
        {/* Expand indicator */}
        <div className="text-gray-400">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>

        {/* Reference thumbnail */}
        <div className="relative w-14 h-14 flex-shrink-0 bg-white/5 border border-white/10 overflow-hidden">
          {thumbnailErrors.has(group.reference) ? (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">?</div>
          ) : (
            <img
              src={`asset://localhost${group.reference}`}
              alt="Reference"
              className="w-full h-full object-cover"
              onError={() => handleThumbnailError(group.reference)}
            />
          )}
          <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-purple-500 text-[9px] font-bold text-white">
            REF
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold">
              {group.similar_photos.length} similar photo{group.similar_photos.length !== 1 ? 's' : ''}
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-semibold border ${getMatchTypeBg(group.similar_photos[0]?.match_type || 'Similar')} ${getMatchTypeColor(group.similar_photos[0]?.match_type || 'Similar')}`}>
              {Math.round(group.average_similarity)}% similar
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {formatBytes(group.total_size_bytes)} total
          </div>
        </div>

        {/* Selection indicator */}
        <button
          type="button"
          onClick={handleSelectAll}
          className={`p-2 border transition-colors ${
            isAllSelected
              ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
              : isPartiallySelected
              ? 'border-purple-500/20 bg-purple-500/5 text-purple-400/60'
              : 'border-white/10 bg-white/5 text-gray-500 hover:text-gray-300'
          }`}
        >
          {isAllSelected ? (
            <CheckSquare className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 border-t border-white/5">
              {/* Reference photo */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold mb-2">
                  Reference Photo
                </div>
                <PhotoItem
                  path={group.reference}
                  sizeBytes={group.reference_size_bytes}
                  isSelected={selectedFiles.has(group.reference)}
                  onToggle={() => onToggleFile(group.reference)}
                  onPreview={() => onPreviewImage(group.reference)}
                  onShowInFolder={(e) => handleShowInFolder(group.reference, e)}
                  thumbnailError={thumbnailErrors.has(group.reference)}
                  onThumbnailError={() => handleThumbnailError(group.reference)}
                  isReference
                />
              </div>

              {/* Similar photos */}
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
                Similar Photos
              </div>
              <div className="space-y-2">
                {group.similar_photos.map((photo) => (
                  <PhotoItem
                    key={photo.path}
                    path={photo.path}
                    sizeBytes={photo.size_bytes}
                    similarity={photo.similarity_percent}
                    matchType={photo.match_type}
                    isSelected={selectedFiles.has(photo.path)}
                    onToggle={() => onToggleFile(photo.path)}
                    onPreview={() => onPreviewImage(photo.path)}
                    onShowInFolder={(e) => handleShowInFolder(photo.path, e)}
                    thumbnailError={thumbnailErrors.has(photo.path)}
                    onThumbnailError={() => handleThumbnailError(photo.path)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface PhotoItemProps {
  path: string
  sizeBytes: number
  similarity?: number
  matchType?: string
  isSelected: boolean
  onToggle: () => void
  onPreview: () => void
  onShowInFolder: (e: React.MouseEvent) => void
  thumbnailError: boolean
  onThumbnailError: () => void
  isReference?: boolean
}

function PhotoItem({
  path,
  sizeBytes,
  similarity,
  matchType,
  isSelected,
  onToggle,
  onPreview,
  onShowInFolder,
  thumbnailError,
  onThumbnailError,
  isReference,
}: PhotoItemProps) {
  const filename = path.split('/').pop() || path

  return (
    <div
      className={`flex items-center gap-3 p-3 border transition-all cursor-pointer ${
        isSelected
          ? 'border-purple-500/30 bg-purple-500/10'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10'
      }`}
      onClick={onToggle}
    >
      {/* Thumbnail */}
      <div
        className="w-12 h-12 flex-shrink-0 bg-white/5 border border-white/10 overflow-hidden cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          onPreview()
        }}
      >
        {thumbnailError ? (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">?</div>
        ) : (
          <img
            src={`asset://localhost${path}`}
            alt={filename}
            className="w-full h-full object-cover hover:scale-110 transition-transform"
            onError={onThumbnailError}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-medium truncate">{filename}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{formatBytes(sizeBytes)}</span>
          {similarity !== undefined && matchType && (
            <span className={`text-xs ${getMatchTypeColor(matchType)}`}>
              {Math.round(similarity)}% match
            </span>
          )}
          {isReference && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 font-semibold">
              REFERENCE
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onShowInFolder}
          className="p-2 text-gray-500 hover:text-white transition-colors"
          title="Show in Finder"
        >
          <ExternalLink className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className={`p-2 border transition-colors ${
            isSelected
              ? 'border-purple-500/30 bg-purple-500/20 text-purple-400'
              : 'border-white/10 bg-white/5 text-gray-500 hover:text-gray-300'
          }`}
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}
