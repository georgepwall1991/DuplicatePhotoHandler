import { LargeFileCard } from './LargeFileCard'
import { EmptyState } from './EmptyState'
import { HardDrive } from 'lucide-react'
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
      <EmptyState
        icon={HardDrive}
        title="No large files found"
        message="All files in your library are below the size threshold."
      />
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
