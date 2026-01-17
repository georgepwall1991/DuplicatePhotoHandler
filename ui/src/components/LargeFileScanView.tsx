import { useState } from 'react'
import { motion } from 'framer-motion'
import { invoke } from '../lib/tauri'
import { HardDrive, Activity, Zap } from 'lucide-react'

import type { LargeFileScanResult } from '../lib/types'
import { ScanButton } from './ScanButton'
import { ScanProgress } from './ScanProgress'
import { FolderSelector } from './FolderSelector'

interface LargeFileScanViewProps {
  isScanning?: boolean
  progress?: { phase: string; percent: number; message: string }
  onScanStart: () => void
  onScanComplete: (result: LargeFileScanResult) => void
  onScanCancel: () => void
  onProgress: (progress: { phase: string; percent: number; message: string }) => void
  onPathsSelected?: (paths: string[]) => void
}

export function LargeFileScanView({
  isScanning = false,
  progress = { phase: '', percent: 0, message: '' },
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
  onPathsSelected,
}: LargeFileScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [isCancelling, setIsCancelling] = useState(false)
  const [filesScanned, setFilesScanned] = useState(0)

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
    setFilesScanned(0)
    onProgress({ phase: 'Scanning', percent: 0, message: 'Looking for large files...' })

    try {
      const result = await invoke<LargeFileScanResult>('scan_large_files', {
        paths: selectedPaths,
        minSizeMb: 10,
        maxResults: 50,
      })
      setFilesScanned(result.files_scanned)
      onScanComplete(result)
    } catch (error) {
      console.error('Large file scan failed:', error)
      onProgress({ phase: 'Error', percent: 0, message: String(error) })
      onScanCancel()
    }
  }

  if (isScanning) {
    return (
      <ScanProgress
        phase={progress.phase}
        percent={progress.percent}
        message={progress.message}
        photosFound={filesScanned}
        duplicatesFound={0}
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-6">
            <HardDrive className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Space Recovery</span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter mb-4">
            Find the <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Space Hogs</span>
          </h2>
          <p className="text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">
            Instantly locate files over 10 MB consuming your precious storage space.
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
        <div className="w-full">
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
        </div>

        {/* Feature badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 flex items-center gap-8"
        >
          <div className="flex items-center gap-2 text-gray-500">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Instant Scan</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Top 50 Largest</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
