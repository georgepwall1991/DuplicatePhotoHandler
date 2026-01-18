import { ScreenshotCard } from './ScreenshotCard'
import { EmptyState } from './EmptyState'
import { Camera } from 'lucide-react'
import type { ScreenshotInfo } from '../lib/types'

interface ScreenshotGridProps {
  screenshots: ScreenshotInfo[]
  selectedPaths: Set<string>
  onToggleSelect: (path: string) => void
  onPreview: (screenshot: ScreenshotInfo) => void
}

export function ScreenshotGrid({
  screenshots,
  selectedPaths,
  onToggleSelect,
  onPreview,
}: ScreenshotGridProps) {
  if (screenshots.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="No Screenshots Found"
        message="No screenshots detected in the selected folder"
      />
    )
  }

  return (
    <div className="overflow-y-auto custom-scrollbar p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {screenshots.map((screenshot) => (
          <ScreenshotCard
            key={screenshot.path}
            screenshot={screenshot}
            isSelected={selectedPaths.has(screenshot.path)}
            onToggleSelect={() => onToggleSelect(screenshot.path)}
            onPreview={() => onPreview(screenshot)}
          />
        ))}
      </div>
    </div>
  )
}
