import { useState } from 'react'
import { motion } from 'framer-motion'
import { invoke } from '../lib/tauri'
import { Sparkles, Activity, ShieldCheck, Cpu } from 'lucide-react'

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
  onPathsSelected?: (paths: string[]) => void
}

export function ScanView({
  isScanning = false,
  progress = { phase: '', percent: 0, message: '' },
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
  onPathsSelected,
}: ScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [threshold, setThreshold] = useState(5)
  const [isCancelling, setIsCancelling] = useState(false)

  const { stats, resetStats } = useScanEvents({ onProgress })

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
      const result = await invoke<ScanResult>('start_scan', {
        config: {
          paths: selectedPaths,
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Next-Gen Intelligence</span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter mb-4">
            Purify your <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Library</span>
          </h2>
          <p className="text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">
            State-of-the-art perceptual hashing to find and eliminate duplicates with surgical precision.
          </p>
        </motion.div>

        {/* Central Action */}
        <div className="mb-16 relative">
          <ScanButton
            isReady={selectedPaths.length > 0}
            onClick={handleStartScan}
          />
        </div>

        {/* Configuration Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
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

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SensitivitySlider
              threshold={threshold}
              onThresholdChange={setThreshold}
            />
          </motion.div>
        </div>

        {/* Feature badges */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-12 flex items-center gap-8"
        >
          <div className="flex items-center gap-2 text-gray-500">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Real-time Stats</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Non-Destructive</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <Cpu className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">LSH Accelerated</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}