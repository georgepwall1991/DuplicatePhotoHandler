import { useState, useEffect, DragEvent } from 'react'
import { open, listen } from '../lib/tauri'

interface FolderSelectorProps {
  selectedPaths: string[]
  onPathsChange: (paths: string[]) => void
}

export function FolderSelector({ selectedPaths, onPathsChange }: FolderSelectorProps) {
  const [isDragging, setIsDragging] = useState(false)

  // Listen for Tauri file drop events
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
      const paths = event.payload.paths
      if (paths && paths.length > 0) {
        // Filter to only directories (or accept all and let backend filter)
        onPathsChange(paths)
      }
      setIsDragging(false)
    })

    const unlistenEnter = listen('tauri://drag-enter', () => {
      setIsDragging(true)
    })

    const unlistenLeave = listen('tauri://drag-leave', () => {
      setIsDragging(false)
    })

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

  // HTML5 drag events for visual feedback (Tauri handles actual drops)
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  return (
    <button
      onClick={handleSelectFolder}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      className={`w-full glass-card rounded-2xl px-6 py-5 text-left transition-all duration-300 group ${
        isDragging
          ? 'bg-purple-500/20 border-2 border-dashed border-purple-500/50 scale-[1.02]'
          : 'hover:bg-white/10 hover:scale-[1.02]'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 ${
          isDragging
            ? 'bg-gradient-to-br from-purple-500/30 to-blue-500/30 scale-110'
            : 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 group-hover:scale-110'
        }`}>
          <span className="text-2xl">{isDragging ? '📥' : '📁'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Scan Location</div>
          <div className={`truncate font-medium ${isDragging ? 'text-purple-300' : 'text-white'}`}>
            {isDragging
              ? 'Drop folders here...'
              : selectedPaths.length > 0
                ? selectedPaths.map(p => p.split('/').pop()).join(', ')
                : 'Click or drag folders here...'}
          </div>
          {selectedPaths.length > 0 && !isDragging && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {selectedPaths.length === 1 ? selectedPaths[0] : `${selectedPaths.length} folders selected`}
            </div>
          )}
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          isDragging ? 'bg-purple-500/20' : 'bg-white/5 group-hover:bg-white/10'
        }`}>
          <span className={`transition-colors ${isDragging ? 'text-purple-400' : 'text-gray-400 group-hover:text-white'}`}>
            {isDragging ? '↓' : '→'}
          </span>
        </div>
      </div>
    </button>
  )
}
