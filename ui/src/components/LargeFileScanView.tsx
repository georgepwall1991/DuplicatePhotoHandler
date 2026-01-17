import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import { HardDrive, Search, Loader2 } from 'lucide-react'
import { FolderSelector } from './FolderSelector'
import type { LargeFileScanResult } from '../lib/types'

interface LargeFileScanViewProps {
  isScanning?: boolean
  progress?: { phase: string; percent: number; message: string }
  onScanStart: () => void
  onScanComplete: (result: LargeFileScanResult) => void
  onScanCancel: () => void
  onProgress: (progress: { phase: string; percent: number; message: string }) => void
}

export function LargeFileScanView({
  isScanning = false,
  progress,
  onScanStart,
  onScanComplete,
  onScanCancel,
  onProgress,
}: LargeFileScanViewProps) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])

  const handleStartScan = async () => {
    if (selectedPaths.length === 0) return

    onScanStart()
    onProgress({ phase: 'Scanning', percent: 0, message: 'Looking for large files...' })

    try {
      const result = await invoke<LargeFileScanResult>('scan_large_files', {
        paths: selectedPaths,
        minSizeMb: 10,
        maxResults: 50,
      })
      onScanComplete(result)
    } catch (error) {
      console.error('Large file scan failed:', error)
      onScanCancel()
    }
  }

  if (isScanning) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center"
        >
          <div className="relative">
            <div className="absolute -inset-4 bg-amber-400/20 blur-xl" />
            <div className="relative flex h-20 w-20 items-center justify-center border border-amber-400/30 bg-amber-500/20">
              <Loader2 className="h-10 w-10 text-amber-300 animate-spin" />
            </div>
          </div>
          <p className="mt-6 text-lg font-medium text-white">{progress?.phase || 'Scanning'}</p>
          <p className="mt-2 text-sm text-slate-400">{progress?.message || 'Looking for large files...'}</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="relative">
            <div className="absolute -inset-2 bg-amber-400/20 blur-lg" />
            <div className="relative flex h-16 w-16 items-center justify-center border border-amber-400/30 bg-gradient-to-br from-amber-500/30 to-orange-500/20">
              <HardDrive className="h-8 w-8 text-amber-300" />
            </div>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white">Find Large Files</h2>
        <p className="mt-2 text-slate-400">
          Discover files over 10 MB taking up space in your photo library
        </p>
      </div>

      <div className="flex-1">
        <FolderSelector
          selectedPaths={selectedPaths}
          onPathsChange={setSelectedPaths}
        />
      </div>

      <div className="mt-8 flex justify-center">
        <motion.button
          type="button"
          onClick={handleStartScan}
          disabled={selectedPaths.length === 0}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`flex items-center gap-3 px-8 py-4 text-lg font-semibold transition ${
            selectedPaths.length > 0
              ? 'border border-amber-400/40 bg-gradient-to-r from-amber-500/30 to-orange-500/20 text-amber-100 hover:from-amber-500/40 hover:to-orange-500/30'
              : 'border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Search className="h-5 w-5" />
          Scan for Large Files
        </motion.button>
      </div>
    </div>
  )
}
