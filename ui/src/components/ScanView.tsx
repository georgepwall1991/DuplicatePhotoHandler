import { useState } from 'react'
import { invoke } from '../lib/tauri'

import type { ScanResult } from '../lib/types'
import { ScanButton } from './ScanButton'
import { ScanProgress } from './ScanProgress'
import { FolderSelector } from './FolderSelector'
import { SensitivitySlider } from './SensitivitySlider'
import { useScanEvents } from '../hooks/useScanEvents'

interface ScanViewProps {
  isScanning?: boolean
  progress?: { phase: string; percent: number; message: string }
  onScanStart: () => void
  onScanComplete: (result: ScanResult) => void
  onScanCancel: () => void
  onProgress: (progress: { phase: string; percent: number; message: string }) => void
}

export function ScanView({
  isScanning = false,
  progress = { phase: '', percent: 0, message: '' },
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
}: ScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [threshold, setThreshold] = useState(5)
  const [isCancelling, setIsCancelling] = useState(false)

  const { stats, resetStats } = useScanEvents({ onProgress })

  const handleCancelScan = async () => {
    setIsCancelling(true)
    try {
      await invoke('cancel_scan')
      onScanCancel()
    } catch (error) {
      console.error('Failed to cancel scan:', error)
    }
    setIsCancelling(false)
  }

  const handleStartScan = async () => {
    if (selectedPaths.length === 0) {
      return
    }

    onScanStart()
    resetStats()

    try {
      const result = await invoke<ScanResult>('start_scan', {
        config: {
          paths: selectedPaths.length > 0 ? selectedPaths : ['~/Pictures'],
          threshold,
          algorithm: 'difference',
        },
      })
      onScanComplete(result)
    } catch (error) {
      console.error('Scan failed:', error)
      onProgress({ phase: 'Error', percent: 0, message: String(error) })
    }
  }

  if (isScanning) {
    return (
      <ScanProgress
        phase={progress.phase}
        percent={progress.percent}
        message={progress.message}
        photosFound={stats.photosFound}
        duplicatesFound={stats.duplicatesFound}
        isCancelling={isCancelling}
        onCancel={handleCancelScan}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
      {/* Background ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      {/* Scan Button */}
      <ScanButton
        isReady={selectedPaths.length > 0}
        onClick={handleStartScan}
      />

      {/* Folder Selection */}
      <div className="mt-14 w-full max-w-md relative animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <FolderSelector
          selectedPaths={selectedPaths}
          onPathsChange={setSelectedPaths}
        />
      </div>

      {/* Threshold Slider */}
      <div className="mt-4 w-full max-w-md relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <SensitivitySlider
          threshold={threshold}
          onThresholdChange={setThreshold}
        />
      </div>
    </div>
  )
}
