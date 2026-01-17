import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderPlus, FolderOpen, ArrowRight, Download } from 'lucide-react'
import { open, listen } from '../lib/tauri'

interface FolderSelectorProps {
  selectedPaths: string[]
  onPathsChange: (paths: string[]) => void
}

export function FolderSelector({ selectedPaths, onPathsChange }: FolderSelectorProps) {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const unlisten = listen('tauri://drag-drop', (event: { payload: { paths: string[] } }) => {
      const paths = event.payload.paths
      if (paths && paths.length > 0) {
        onPathsChange(paths)
      }
      setIsDragging(false)
    })

    const unlistenEnter = listen('tauri://drag-enter', () => setIsDragging(true))
    const unlistenLeave = listen('tauri://drag-leave', () => setIsDragging(false))

    return () => {
      unlisten.then(fn => fn())
      unlistenEnter.then(fn => fn())
      unlistenLeave.then(fn => fn())
    }
  }, [onPathsChange])

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: true,
      title: 'Select folders to scan',
    })

    if (selected) {
      onPathsChange(Array.isArray(selected) ? selected : [selected])
    }
  }

  return (
    <motion.button
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={handleSelectFolder}
      className={`w-full glass-card p-1 text-left transition-all duration-500 group relative overflow-hidden border-2 ${
        isDragging ? 'bg-purple-500/10 border-purple-500/50' : 'border-white/10'
      }`}
    >
      <div className="flex items-center gap-6 p-5">
        <div className="relative">
          <AnimatePresence mode="wait">
            {isDragging ? (
              <motion.div
                key="dragging"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="w-16 h-16 bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/20"
              >
                <Download className="w-8 h-8 text-white animate-bounce" />
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="w-16 h-16 bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-2 border-white/10 flex items-center justify-center group-hover:from-purple-500/20 group-hover:to-blue-500/20 transition-colors"
              >
                {selectedPaths.length > 0 ? (
                  <FolderOpen className="w-8 h-8 text-purple-400" />
                ) : (
                  <FolderPlus className="w-8 h-8 text-gray-400 group-hover:text-purple-400 transition-colors" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400/60 mb-1">
            Library Path
          </div>
          <div className="flex flex-col gap-0.5">
            <div className={`truncate text-lg font-bold tracking-tight ${isDragging ? 'text-purple-300' : 'text-white'}`}>
              {isDragging
                ? 'Drop to scan'
                : selectedPaths.length > 0
                  ? selectedPaths.map(p => p.split('/').pop()).join(', ')
                  : 'Add folders to process'}
            </div>
            <div className="text-xs font-medium text-gray-500 truncate">
              {isDragging
                ? 'Ready to import'
                : selectedPaths.length > 0
                  ? `${selectedPaths.length} location${selectedPaths.length > 1 ? 's' : ''} configured`
                  : 'Drag & drop your photo library'}
            </div>
          </div>
        </div>

        <div className={`w-10 h-10 flex items-center justify-center transition-all duration-300 border-2 ${
          isDragging ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-white/5 text-gray-600 border-white/10 group-hover:text-white group-hover:bg-white/10'
        }`}>
          <ArrowRight className={`w-5 h-5 transition-transform duration-500 ${isDragging ? 'translate-y-1 rotate-90' : 'group-hover:translate-x-1'}`} />
        </div>
      </div>

      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
        <FolderPlus className="w-24 h-24 rotate-12" />
      </div>
    </motion.button>
  )
}