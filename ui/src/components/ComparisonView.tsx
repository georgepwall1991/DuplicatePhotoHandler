import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke, convertFileSrc } from '../lib/tauri'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
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

interface ImagePanelProps {
  info: FileInfo | null
  label: string
  isLoading: boolean
  isSelected: boolean
  transform: { scale: number; x: number; y: number }
  onInteract: (e: React.WheelEvent | React.MouseEvent | React.TouchEvent) => void
  highlights?: {
    dims: boolean
    size: boolean
    date: boolean // true implies "better" (e.g. older or newer depending on pref, here we'll highlight newer? actually for photos usually older is original, but let's highlight higher res/size for sure)
  }
}

function ImagePanel({
  info,
  label,
  isLoading,
  isSelected,
  transform,
  onInteract,
  highlights
}: ImagePanelProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Forward wheel events to parent
  const handleWheel = (e: React.WheelEvent) => {
    // e.preventDefault() // React synthetic events can't be always prevented, but we'll try
    onInteract(e)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    onInteract(e)
  }

  if (isLoading || !info) {
    return (
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        <div className="flex-1 skeleton min-h-[300px]" />
        <div className="p-4 border-t border-white/5">
          <div className="h-4 w-16 skeleton mb-2" />
          <div className="h-5 w-32 skeleton mb-3" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10 skeleton" />
            <div className="h-10 skeleton" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex-1 flex flex-col glass-card overflow-hidden ${isSelected ? 'ring-2 ring-emerald-500' : ''}`}>
      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-black/40 min-h-[300px] overflow-hidden cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 skeleton" />
        )}

        {/* Transform Container */}
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'center',
            transition: 'transform 0.1s ease-out'
          }}
          className="w-full h-full flex items-center justify-center"
        >
          <img
            src={convertFileSrc(info.path)}
            alt={info.filename}
            className={`max-w-none transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              userSelect: 'none',
              pointerEvents: 'none' // Let container handle events
            }}
            onLoad={() => setImageLoaded(true)}
          />
        </div>

        {isSelected && (
          <div className="absolute top-3 right-3 px-3 py-1 bg-emerald-500/90 text-white text-sm font-bold tracking-wide shadow-lg rounded">
            KEEP
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 border-t border-white/5 bg-surface-900/50">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-text-muted">{label}</div>
          {highlights?.dims && highlights.size && (
            <div className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Best Match</div>
          )}
        </div>

        <h3 className="text-white font-medium truncate mb-4 text-sm" title={info.filename}>
          {info.filename}
        </h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className={`p-2 rounded border ${highlights?.dims ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
            <div className={`mb-0.5 ${highlights?.dims ? 'text-emerald-400 font-bold' : 'text-text-muted'}`}>Dimensions</div>
            <div className={`font-medium ${highlights?.dims ? 'text-white' : 'text-gray-300'}`}>
              {info.dimensions ? `${info.dimensions[0]} × ${info.dimensions[1]}` : 'Unknown'}
            </div>
          </div>

          <div className={`p-2 rounded border ${highlights?.size ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
            <div className={`mb-0.5 ${highlights?.size ? 'text-emerald-400 font-bold' : 'text-text-muted'}`}>Size</div>
            <div className={`font-medium ${highlights?.size ? 'text-white' : 'text-gray-300'}`}>
              {formatBytes(info.size_bytes)}
            </div>
          </div>

          <div className="col-span-2 p-2 rounded border bg-white/5 border-white/5">
            <div className="text-text-muted mb-0.5">Modified</div>
            <div className="text-gray-300 font-medium">{info.modified || 'Unknown'}</div>
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

  // Zoom/Pan State
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 })
  const isDragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

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
        setTransform({ scale: 1, x: 0, y: 0 }) // Reset zoom on new diff
      } catch (error) {
        console.error('Failed to fetch file info:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchInfo()
  }, [leftPath, rightPath])

  // Mouse/Wheel Interaction Handlers
  const handleInteraction = useCallback((e: React.WheelEvent | React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'wheel') {
      // Zoom
      const we = e as React.WheelEvent
      const scaleChange = -we.deltaY * 0.002
      setTransform(prev => ({
        ...prev,
        scale: Math.min(Math.max(0.5, prev.scale + scaleChange), 5)
      }))
    } else if (e.type === 'mousedown') {
      const me = e as React.MouseEvent
      isDragging.current = true
      lastPos.current = { x: me.clientX, y: me.clientY }
    }
  }, [])

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        const dx = e.clientX - lastPos.current.x
        const dy = e.clientY - lastPos.current.y
        lastPos.current = { x: e.clientX, y: e.clientY }
        setTransform(prev => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy
        }))
      }
    }

    const handleGlobalMouseUp = () => {
      isDragging.current = false
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])


  // Calculate Highlights
  const leftPixels = leftInfo?.dimensions ? leftInfo.dimensions[0] * leftInfo.dimensions[1] : 0
  const rightPixels = rightInfo?.dimensions ? rightInfo.dimensions[0] * rightInfo.dimensions[1] : 0
  const leftSize = leftInfo?.size_bytes ?? 0
  const rightSize = rightInfo?.size_bytes ?? 0

  const highlights = {
    left: {
      dims: leftPixels > rightPixels,
      size: leftSize > rightSize,
      date: false
    },
    right: {
      dims: rightPixels > leftPixels,
      size: rightSize > leftSize,
      date: false
    }
  }

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
      } else if (e.key === '=' || e.key === '+') {
        setTransform(t => ({ ...t, scale: Math.min(5, t.scale + 0.5) }))
      } else if (e.key === '-' || e.key === '_') {
        setTransform(t => ({ ...t, scale: Math.max(0.5, t.scale - 0.5) }))
      } else if (e.key === '0' || e.key === 'r') {
        setTransform({ scale: 1, x: 0, y: 0 })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onKeepLeft, onKeepRight, onKeepBoth])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-[90vw] h-[85vh] flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white tracking-tight">Compare Photos</h2>
            <div className="h-6 w-px bg-white/10" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/5">
              <button
                onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.5, t.scale - 0.25) }))}
                className="p-1.5 text-text-muted hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="w-12 text-center text-xs font-mono text-gray-400">
                {Math.round(transform.scale * 100)}%
              </span>
              <button
                onClick={() => setTransform(t => ({ ...t, scale: Math.min(5, t.scale + 0.25) }))}
                className="p-1.5 text-text-muted hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
                className="p-1.5 text-text-muted hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Reset (0)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-text-muted">
              Use <span className="text-gray-300">Scroll</span> to zoom, <span className="text-gray-300">Drag</span> to pan
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Comparison panels */}
        <div className="flex gap-4 flex-1 min-h-0">
          <ImagePanel
            key={leftInfo?.path ?? 'left'}
            info={leftInfo}
            label="Photo A"
            isLoading={loading}
            isSelected={highlights.left.dims || highlights.left.size}
            transform={transform}
            onInteract={handleInteraction}
            highlights={highlights.left}
          />
          <ImagePanel
            key={rightInfo?.path ?? 'right'}
            info={rightInfo}
            label="Photo B"
            isLoading={loading}
            isSelected={highlights.right.dims || highlights.right.size}
            transform={transform}
            onInteract={handleInteraction}
            highlights={highlights.right}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            onClick={onKeepLeft}
            className="group px-8 py-4 glass-card text-white font-bold transition-all hover:bg-emerald-500/20 hover:border-emerald-500/50 flex items-center gap-3 active:scale-95"
          >
            <div className="flex flex-col items-end">
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Keep Left</span>
              <span>Photo A</span>
            </div>
            <kbd className="w-6 h-6 rounded bg-white/10 text-xs flex items-center justify-center font-mono text-emerald-200 group-hover:bg-emerald-500/20">1</kbd>
          </button>

          <button
            onClick={onKeepBoth}
            className="px-6 py-4 glass-card text-gray-400 font-bold transition-all hover:bg-white/10 hover:text-white active:scale-95 flex items-center gap-3"
          >
            <span>Keep Both</span>
            <kbd className="w-6 h-6 rounded bg-white/5 text-xs flex items-center justify-center font-mono">B</kbd>
          </button>

          <button
            onClick={onKeepRight}
            className="group px-8 py-4 glass-card text-white font-bold transition-all hover:bg-emerald-500/20 hover:border-emerald-500/50 flex items-center gap-3 active:scale-95"
          >
            <kbd className="w-6 h-6 rounded bg-white/10 text-xs flex items-center justify-center font-mono text-emerald-200 group-hover:bg-emerald-500/20">2</kbd>
            <div className="flex flex-col items-start">
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Keep Right</span>
              <span>Photo B</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
