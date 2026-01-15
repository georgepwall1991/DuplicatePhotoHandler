import { open } from '../lib/tauri'

interface FolderSelectorProps {
  selectedPaths: string[]
  onPathsChange: (paths: string[]) => void
}

export function FolderSelector({ selectedPaths, onPathsChange }: FolderSelectorProps) {
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
    <button
      onClick={handleSelectFolder}
      className="w-full glass-card rounded-2xl px-6 py-5 text-left transition-all duration-300 hover:bg-white/10 hover:scale-[1.02] group"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          <span className="text-2xl">📁</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Scan Location</div>
          <div className="text-white truncate font-medium">
            {selectedPaths.length > 0
              ? selectedPaths.join(', ')
              : 'Click to select folders...'}
          </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
          <span className="text-gray-400 group-hover:text-white transition-colors">→</span>
        </div>
      </div>
    </button>
  )
}
