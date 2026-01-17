import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { File, Film, Image, Check, Eye, FolderOpen } from 'lucide-react'
import { convertFileSrc, invoke } from '../lib/tauri'
import type { LargeFileInfo } from '../lib/types'

interface LargeFileCardProps {
  file: LargeFileInfo
  isSelected: boolean
  onToggleSelect: () => void
  onPreview?: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const isImageType = (fileType: string): boolean => {
  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif']
  return imageTypes.includes(fileType.toLowerCase())
}

const isVideoType = (fileType: string): boolean => {
  const videoTypes = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v']
  return videoTypes.includes(fileType.toLowerCase())
}

function ImageThumbnail({
  src,
  alt,
  className = '',
}: {
  src: string
  alt: string
  className?: string
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
        <Image className="w-8 h-8 text-slate-600" />
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

export function LargeFileCard({ file, isSelected, onToggleSelect, onPreview }: LargeFileCardProps) {
  const isImage = isImageType(file.file_type)
  const isVideo = isVideoType(file.file_type)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const handleClick = () => {
    if (onPreview && isImage) {
      onPreview()
    } else {
      onToggleSelect()
    }
  }

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleShowInFolder = useCallback(async () => {
    setContextMenu(null)
    try {
      await invoke('show_in_folder', { path: file.path })
    } catch (error) {
      console.error('Failed to show in folder:', error)
    }
  }, [file.path])

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = () => setContextMenu(null)
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu])

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={`group relative overflow-hidden border bg-white/[0.02] transition-all cursor-pointer ${
        isSelected
          ? 'border-cyan-400/40 bg-cyan-500/10'
          : 'border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
      }`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-square overflow-hidden">
        {isImage ? (
          <ImageThumbnail src={file.path} alt={file.filename} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
            {isVideo ? (
              <Film className="w-12 h-12 text-slate-500" />
            ) : (
              <File className="w-12 h-12 text-slate-500" />
            )}
          </div>
        )}

        {/* Selection checkbox - top left */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center border transition-all ${
            isSelected
              ? 'border-cyan-400 bg-cyan-500 text-white'
              : 'border-white/30 bg-black/40 text-transparent hover:border-white/50 hover:text-white/50'
          }`}
          aria-pressed={isSelected}
          aria-label={`${file.filename}${isSelected ? ', selected' : ''}`}
        >
          <Check className="h-4 w-4" />
        </button>

        {/* Size badge - top right */}
        <div
          className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold ${
            isSelected
              ? 'bg-cyan-500/80 text-white'
              : 'bg-amber-500/80 text-white'
          }`}
        >
          {formatBytes(file.size_bytes)}
        </div>

        {/* Preview overlay for images */}
        {isImage && onPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="absolute inset-0 bg-black/50 flex items-center justify-center"
          >
            <div className="flex items-center gap-2 text-white/90">
              <Eye className="w-5 h-5" />
              <span className="text-sm font-medium">Preview</span>
            </div>
          </motion.div>
        )}

        {/* Video duration placeholder */}
        {isVideo && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 text-white text-[10px] font-mono">
            VIDEO
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-3">
        <p className="truncate text-sm font-medium text-white" title={file.filename}>
          {file.filename}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
          {file.file_type}
        </p>
      </div>
    </motion.div>

    {/* Context Menu */}
    <AnimatePresence>
      {contextMenu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="fixed z-50 min-w-[160px] border border-white/10 bg-slate-900/95 backdrop-blur-sm shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleShowInFolder}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <FolderOpen className="h-4 w-4" />
            Show in Finder
          </button>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
