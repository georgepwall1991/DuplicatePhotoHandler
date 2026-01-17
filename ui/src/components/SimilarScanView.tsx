import { useState } from 'react'
import { motion } from 'framer-motion'
import { invoke } from '../lib/tauri'
import { Images, Activity, Sliders } from 'lucide-react'

import type { SimilarResult } from '../lib/types'
import { ScanButton } from './ScanButton'
import { ScanProgress } from './ScanProgress'
import { FolderSelector } from './FolderSelector'
import { useSimilarScanEvents } from '../hooks/useSimilarScanEvents'

interface SimilarScanViewProps {
  isScanning?: boolean
  progress?: { phase: string; percent: number; message: string }
  onScanStart: () => void
  onScanComplete: (result: SimilarResult) => void
  onScanCancel: () => void
  onProgress: (progress: { phase: string; percent: number; message: string }) => void
  onPathsSelected?: (paths: string[]) => void
}

export function SimilarScanView({
  isScanning = false,
  progress = { phase: '', percent: 0, message: '' },
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
  onPathsSelected,
}: SimilarScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [isCancelling, setIsCancelling] = useState(false)
  const [maxDistance, setMaxDistance] = useState(15)

  const { stats, resetStats } = useSimilarScanEvents({ onProgress })

  const handlePathsChange = (paths: string[]) => {
    setSelectedPaths(paths)
    onPathsSelected?.(paths)
  }

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
    if (selectedPaths.length === 0) return

    onScanStart()
    resetStats()

    try {
      const result = await invoke<SimilarResult>('scan_similar', {
        config: {
          source_paths: selectedPaths,
          min_distance: 5, // Exclude exact duplicates
          max_distance: maxDistance,
          algorithm: 'perceptual',
        },
      })
      onScanComplete(result)
    } catch (error) {
      console.error('Similar scan failed:', error)
      onProgress({ phase: 'Error', percent: 0, message: String(error) })
    }
  }

  if (isScanning) {
    return (
      <ScanProgress
        phase={progress.phase}
        percent={progress.percent}
        message={progress.message}
        photosFound={stats.photosScanned}
        duplicatesFound={stats.groupsFound}
        isCancelling={isCancelling}
        onCancel={handleCancelScan}
      />
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-12 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <div className="w-full max-w-2xl flex flex-col items-center">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 mb-6">
            <Images className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Similarity Detection</span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter mb-4">
            Find <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Similar Photos</span>
          </h2>
          <p className="text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">
            Discover photos that look alike but aren&apos;t exact duplicates. Great for finding burst shots and related images.
          </p>
        </motion.div>

        {/* Central Action */}
        <div className="mb-16 relative">
          <ScanButton
            isReady={selectedPaths.length > 0}
            onClick={handleStartScan}
          />
        </div>

        {/* Configuration */}
        <div className="w-full space-y-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <FolderSelector
              selectedPaths={selectedPaths}
              onPathsChange={handlePathsChange}
            />
          </motion.div>

          {/* Sensitivity slider */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="border border-white/10 bg-white/[0.02] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Sliders className="w-4 h-4" />
                <span className="font-medium">Similarity Threshold</span>
              </div>
              <span className="text-sm font-mono text-purple-400">{maxDistance}</span>
            </div>
            <input
              type="range"
              min={8}
              max={20}
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="w-full h-1 bg-white/10 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:rounded-none"
            />
            <div className="flex justify-between mt-2 text-[10px] text-gray-500 uppercase tracking-wider">
              <span>Strict</span>
              <span>Loose</span>
            </div>
          </motion.div>
        </div>

        {/* Feature badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 flex items-center gap-8"
        >
          <div className="flex items-center gap-2 text-gray-500">
            <Images className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Perceptual Hashing</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Real-time Progress</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
