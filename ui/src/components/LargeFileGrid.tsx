import { LargeFileCard } from './LargeFileCard'
import type { LargeFileInfo } from '../lib/types'

interface LargeFileGridProps {
  files: LargeFileInfo[]
  selectedPaths: Set<string>
  onToggleSelect: (path: string) => void
  onPreview: (file: LargeFileInfo) => void
}

export function LargeFileGrid({ files, selectedPaths, onToggleSelect, onPreview }: LargeFileGridProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-slate-400">No large files found</p>
        <p className="mt-2 text-sm text-slate-500">
          All files in your library are below the size threshold
        </p>
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      role="grid"
      aria-label="Large files"
    >
      {files.map((file) => (
        <LargeFileCard
          key={file.path}
          file={file}
          isSelected={selectedPaths.has(file.path)}
          onToggleSelect={() => onToggleSelect(file.path)}
          onPreview={() => onPreview(file)}
        />
      ))}
    </div>
  )
}
