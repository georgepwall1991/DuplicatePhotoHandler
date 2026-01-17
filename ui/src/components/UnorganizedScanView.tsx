import { useState } from 'react'
import { motion } from 'framer-motion'
import { invoke } from '../lib/tauri'
import { FolderSearch, Layers, AlertTriangle } from 'lucide-react'

import type { UnorganizedResult, UnorganizedConfig } from '../lib/types'
import { ScanButton } from './ScanButton'
import { ScanProgress } from './ScanProgress'
import { FolderSelector } from './FolderSelector'
import { useUnorganizedScanEvents } from '../hooks/useUnorganizedScanEvents'

interface UnorganizedScanViewProps {
  isScanning?: boolean
  progress?: { phase: string; percent: number; message: string }
  onScanStart: () => void
  onScanComplete: (result: UnorganizedResult) => void
  onScanCancel: () => void
  onProgress: (progress: { phase: string; percent: number; message: string }) => void
  onPathsSelected?: (paths: string[]) => void
}

export function UnorganizedScanView({
  isScanning = false,
  progress = { phase: '', percent: 0, message: '' },
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
  onPathsSelected,
}: UnorganizedScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [isCancelling, setIsCancelling] = useState(false)

  const { stats, resetStats } = useUnorganizedScanEvents({ onProgress })

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
      const config: UnorganizedConfig = {
        source_paths: selectedPaths,
        check_root: true,
        check_date_pattern: true,
        check_generic_names: true,
        min_depth: 2,
      }
      const result = await invoke<UnorganizedResult>('scan_unorganized', { config })
      onScanComplete(result)
    } catch (error) {
      console.error('Unorganized scan failed:', error)
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
        photosFound={stats.filesScanned}
        duplicatesFound={stats.unorganizedFound}
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
            <FolderSearch className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Organization Audit</span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter mb-4">
            Find <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Loose Files</span>
          </h2>
          <p className="text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">
            Discover photos sitting in wrong places - root folders, generic names, or missing date organization.
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
            <Layers className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Folder Depth Check</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Generic Names</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
