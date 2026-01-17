import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { convertFileSrc } from '../lib/tauri'
import {
  Check,
  Star,
  ChevronDown,
  Trash2,
  Maximize2,
  Columns,
  Info,
  Layers,
  FileImage
} from 'lucide-react'

import type { DuplicateGroup } from '../lib/types'

function ImageThumbnail({
  src,
  className = '',
  style,
  fallback = <FileImage className="w-5 h-5 text-text-muted" />
}: {
  src: string
  className?: string
  style?: React.CSSProperties
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
      <div className={`flex items-center justify-center bg-white/5 ${className}`} style={style}>
        {fallback}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden bg-white/5 ${className}`} style={style}>
      {!loaded && (
        <div className="absolute inset-0 skeleton" />
      )}
      <img
        src={assetUrl}
        alt=""
        className={`w-full h-full object-cover transition-all duration-500 ${loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`}
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
  onCompare?: (leftPath: string, rightPath: string) => void
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

export function DuplicateGroupCard({
  group,
  selectedFiles,
  onToggleFile,
  onPreviewImage,
  onCompare,
  isFocused,
  isExpanded: externalExpanded,
  onToggleExpand,
}: DuplicateGroupCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const expanded = externalExpanded !== undefined ? externalExpanded : internalExpanded
  const toggleExpand = onToggleExpand ?? (() => setInternalExpanded(!internalExpanded))

  return (
    <motion.div
      layout
      className={`glass-card overflow-hidden border-white/5 group/card transition-all duration-500 ${isFocused ? 'ring-2 ring-brand-primary/50' : ''
        }`}
    >
      <button
        onClick={toggleExpand}
        className="w-full p-6 flex items-center gap-6 text-left focus-ring"
      >
        <div className="flex -space-x-4 isolate group/thumbs">
          {group.photos.slice(0, 3).map((photo, i) => (
            <motion.div
              key={photo}
              whileHover={{ y: -8, scale: 1.1, zIndex: 10 }}
              style={{ zIndex: 3 - i }}
            >
              <ImageThumbnail
                src={photo}
                className="w-16 h-16 glass-strong border-2 border-surface-950 shadow-2xl transition-all duration-300"
              />
            </motion.div>
          ))}
          {group.photos.length > 3 && (
            <div className="w-16 h-16 glass-strong border-2 border-surface-950 flex items-center justify-center text-xs font-black text-brand-primary bg-brand-primary/10 z-0">
              +{group.photos.length - 3}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2.5 py-1 bg-white/5 text-text-muted border border-white/5`}>
              {group.match_type.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
              {group.photos.length} instances
            </span>
          </div>
          <h3 className="text-white text-lg font-bold tracking-tight truncate group-hover/card:text-brand-primary transition-colors">
            {getFileName(group.representative)}
          </h3>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xl font-black text-white tracking-tighter">
              {formatBytes(group.duplicate_size_bytes)}
            </div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">Reclaimable</div>
          </div>

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            className={`w-10 h-10 bg-white/5 flex items-center justify-center text-text-muted group-hover/card:bg-white/10 group-hover/card:text-white transition-all`}
          >
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="px-6 pb-6 pt-2 border-t border-white/5 space-y-3">
              {group.photos.map((photo) => {
                const isRepresentative = photo === group.representative
                const isSelected = selectedFiles.has(photo)

                return (
                  <motion.div
                    key={photo}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className={`group/item flex items-center gap-4 p-4 transition-all duration-300 ${isRepresentative
                        ? 'bg-brand-primary/10 border border-brand-primary/20'
                        : isSelected
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-white/5 border border-transparent hover:border-white/10'
                      }`}
                  >
                    <div className="relative">
                      <ImageThumbnail
                        src={photo}
                        className="w-20 h-20 shadow-xl"
                      />
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onPreviewImage?.(photo)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover/item:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <Maximize2 className="w-6 h-6 text-white" />
                      </motion.button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white truncate">{getFileName(photo)}</span>
                        {isRepresentative && (
                          <div className="px-2 py-0.5 bg-brand-primary text-[8px] font-black uppercase tracking-widest text-white">
                            Optimal
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted font-mono truncate">{photo}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {!isRepresentative && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onToggleFile(photo)}
                          className={`flex items-center gap-2 px-4 py-2 font-bold text-[10px] uppercase tracking-widest transition-all ${isSelected
                              ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                              : 'bg-white/5 text-text-muted hover:bg-white/10 hover:text-white'
                            }`}
                        >
                          {isSelected ? <Trash2 className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                          {isSelected ? 'Remove' : 'Select'}
                        </motion.button>
                      )}

                      {isRepresentative && (
                        <div className="flex items-center gap-2 px-4 py-2 font-bold text-[10px] uppercase tracking-widest bg-brand-primary/20 text-brand-primary border border-brand-primary/20">
                          <Star className="w-3 h-3 fill-current" />
                          Keeper
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}

              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  <Info className="w-3 h-3" />
                  <span>The AI selected the sharpest image as the Keeper</span>
                </div>

                <div className="flex items-center gap-3">
                  {group.photos.length >= 2 && onCompare && (
                    <button
                      onClick={() => onCompare(group.representative, group.photos.find(p => p !== group.representative)!)}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand-accent hover:bg-brand-accent/10 transition-colors focus-ring btn-press"
                    >
                      <Columns className="w-3 h-3" />
                      Side-by-Side
                    </button>
                  )}
                  <button
                    onClick={() => {
                      group.photos.forEach((photo) => {
                        if (photo !== group.representative && !selectedFiles.has(photo)) {
                          onToggleFile(photo)
                        }
                      })
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand-primary hover:bg-brand-primary/10 transition-colors focus-ring btn-press"
                  >
                    <Check className="w-3 h-3" />
                    Select All
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}