import { useState, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { Rocket, FolderPlus, Download } from 'lucide-react'

interface ScanButtonProps {
  isReady: boolean
  onClick: () => void
  onSelectFolder?: () => void
  onDropPaths?: (paths: string[]) => void
}

export function ScanButton({ isReady, onClick, onSelectFolder, onDropPaths }: ScanButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleClick = () => {
    if (isReady) {
      onClick()
    } else if (onSelectFolder) {
      onSelectFolder()
    } else {
      onClick()
    }
  }

  const handleDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const items = e.dataTransfer.items
    const paths: string[] = []

    // Extract paths from dropped items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      // In Tauri, dropped files have a path property
      const file = item.getAsFile()
      if (file && (file as unknown as { path?: string }).path) {
        paths.push((file as unknown as { path: string }).path)
      }
    }

    // Fallback: try files directly (for Tauri webview)
    if (paths.length === 0) {
      const files = e.dataTransfer.files
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as unknown as { path?: string }
        if (file.path) {
          paths.push(file.path)
        }
      }
    }

    if (paths.length > 0 && onDropPaths) {
      onDropPaths(paths)
    }
  }

  // Show drop zone state when dragging
  const showDropState = isDragOver && !isReady

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="group relative w-56 h-56 transition-all duration-700 cursor-pointer"
    >
      {/* Dynamic Aura */}
      <motion.div
        animate={isReady ? {
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.6, 0.3],
        } : showDropState ? {
          scale: [1, 1.2, 1],
          opacity: [0.4, 0.7, 0.4],
        } : {
          scale: [1, 1.05, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{ duration: showDropState ? 1.5 : 3, repeat: Infinity, ease: "easeInOut" }}
        className={`absolute -inset-8 blur-3xl ${isReady ? 'bg-purple-500/20' : showDropState ? 'bg-emerald-500/30' : 'bg-blue-500/10'}`}
      />

      {/* Rotating Ring - now square */}
      <div className={`absolute inset-0 border-2 border-dashed transition-colors duration-300 ${showDropState
        ? 'border-emerald-400/60 animate-none'
        : isReady
          ? 'border-purple-500/20 group-hover:border-purple-500/40 animate-[spin_20s_linear_infinite]'
          : 'border-white/10 group-hover:border-white/20 animate-[spin_20s_linear_infinite]'
        }`} />

      {/* Main Button Body */}
      <div className={`absolute inset-4 glass-strong border-2 shadow-2xl flex items-center justify-center overflow-hidden transition-colors duration-300 ${showDropState ? 'border-emerald-400/50' : 'border-white/10'}`}>
        {/* Interior Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-700 ${showDropState
          ? 'from-emerald-600/30 to-green-600/20 opacity-100'
          : isReady
            ? 'from-purple-600/20 to-blue-600/20 opacity-100'
            : 'from-gray-800/20 to-gray-900/20 opacity-50 group-hover:opacity-80'
          }`} />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-4">
          <motion.div
            animate={isReady ? {
              y: [0, -4, 0],
            } : showDropState ? {
              y: [0, -6, 0],
              scale: [1, 1.1, 1],
            } : {}}
            transition={{ duration: showDropState ? 1 : 2, repeat: Infinity }}
          >
            {showDropState ? (
              <Download className="w-16 h-16 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
            ) : isReady ? (
              <Rocket className="w-16 h-16 text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
            ) : (
              <FolderPlus className="w-16 h-16 text-gray-500 group-hover:text-purple-400 transition-colors duration-500" />
            )}
          </motion.div>

          <div className="flex flex-col items-center">
            <span className={`text-sm font-black tracking-[0.2em] transition-colors duration-500 ${showDropState ? 'text-emerald-300' : isReady ? 'text-white' : 'text-gray-500 group-hover:text-white'
              }`}>
              {showDropState ? 'DROP HERE' : isReady ? 'INITIALIZE' : 'SELECT FOLDER'}
            </span>
            {showDropState ? (
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mt-1">
                Release to add
              </span>
            ) : isReady ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mt-1"
              >
                Deep Scan Ready
              </motion.span>
            ) : (
              <span className="text-[10px] text-gray-600 group-hover:text-purple-400/70 font-bold uppercase tracking-widest mt-1 transition-colors">
                Click or drag folder
              </span>
            )}
          </div>
        </div>

        {/* Shimmer Effect */}
        <div className="absolute inset-0 w-full h-full shimmer opacity-20 pointer-events-none" />
      </div>

      {/* Outer Pulse Ring */}
      {(isReady || showDropState) && (
        <motion.div
          animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
          transition={{ duration: showDropState ? 1 : 2, repeat: Infinity, ease: "easeOut" }}
          className={`absolute inset-0 border-2 ${showDropState ? 'border-emerald-400/50' : 'border-purple-500/50'}`}
        />
      )}
    </motion.button>
  )
}