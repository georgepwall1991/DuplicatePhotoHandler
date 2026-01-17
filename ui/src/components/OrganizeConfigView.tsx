import { useState } from 'react'
import { motion } from 'framer-motion'
import { FolderTree, Copy, Move, Calendar, ChevronDown } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'

import { FolderSelector } from './FolderSelector'
import { ScanButton } from './ScanButton'
import type { FolderStructure, OperationMode } from '../lib/types'

interface OrganizeConfigViewProps {
  onStartPreview: (config: {
    sourcePaths: string[]
    destination: string
    structure: FolderStructure
    operation: OperationMode
  }) => void
  isLoading?: boolean
  initialPaths?: string[]
}

const STRUCTURE_OPTIONS: { value: FolderStructure; label: string; example: string }[] = [
  { value: 'year_month', label: 'Year / Month', example: '2024/01 - January/' },
  { value: 'year_month_day', label: 'Year / Month / Day', example: '2024/01/15/' },
  { value: 'year_month_flat', label: 'Year-Month (flat)', example: '2024-01/' },
]

export function OrganizeConfigView({ onStartPreview, isLoading = false, initialPaths = [] }: OrganizeConfigViewProps) {
  const [sourcePaths, setSourcePaths] = useState<string[]>(initialPaths)
  const [destination, setDestination] = useState<string>('')
  const [structure, setStructure] = useState<FolderStructure>('year_month')
  const [operation, setOperation] = useState<OperationMode>('copy')
  const [showStructureDropdown, setShowStructureDropdown] = useState(false)

  const handleSelectDestination = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Destination Folder',
    })
    if (selected && typeof selected === 'string') {
      setDestination(selected)
    }
  }

  const isReady = sourcePaths.length > 0 && destination.length > 0

  const handlePreview = () => {
    if (isReady) {
      onStartPreview({ sourcePaths, destination, structure, operation })
    }
  }

  const selectedStructure = STRUCTURE_OPTIONS.find((o) => o.value === structure)

  return (
    <div className="h-full flex flex-col items-center justify-center p-12 relative overflow-hidden">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-2xl flex flex-col items-center">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 mb-6">
            <FolderTree className="w-3.5 h-3.5" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              Photo Organization
            </span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter mb-4">
            Organize by{' '}
            <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
              Date
            </span>
          </h2>
          <p className="text-gray-400 font-medium max-w-sm mx-auto leading-relaxed">
            Sort your photos into neat Year/Month folders using EXIF metadata.
          </p>
        </motion.div>

        {/* Scan Button */}
        <div className="mb-12">
          <ScanButton isReady={isReady && !isLoading} onClick={handlePreview} />
        </div>

        {/* Configuration */}
        <div className="w-full space-y-6">
          {/* Source folders */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Source Folders
            </label>
            <FolderSelector selectedPaths={sourcePaths} onPathsChange={setSourcePaths} />
          </motion.div>

          {/* Destination folder */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Destination Folder
            </label>
            <button
              type="button"
              onClick={handleSelectDestination}
              className="w-full flex items-center gap-3 px-4 py-3 border border-white/10 bg-white/[0.02] text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
            >
              <FolderTree className="w-5 h-5 text-violet-400" />
              {destination ? (
                <span className="text-white truncate flex-1">{destination}</span>
              ) : (
                <span className="text-slate-500">Select destination folder...</span>
              )}
            </button>
          </motion.div>

          {/* Folder structure */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="relative"
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Folder Structure
            </label>
            <button
              type="button"
              onClick={() => setShowStructureDropdown(!showStructureDropdown)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 border border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] transition-all"
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-violet-400" />
                <div className="text-left">
                  <div className="text-white">{selectedStructure?.label}</div>
                  <div className="text-xs text-slate-500">{selectedStructure?.example}</div>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${showStructureDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            {showStructureDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute z-10 w-full mt-1 border border-white/10 bg-slate-900/95 backdrop-blur-sm"
              >
                {STRUCTURE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStructure(opt.value)
                      setShowStructureDropdown(false)
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-white/10 transition-colors ${
                      structure === opt.value ? 'bg-violet-500/20' : ''
                    }`}
                  >
                    <div className="text-white">{opt.label}</div>
                    <div className="text-xs text-slate-500">{opt.example}</div>
                  </button>
                ))}
              </motion.div>
            )}
          </motion.div>

          {/* Operation mode */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Operation Mode
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOperation('copy')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border transition-all ${
                  operation === 'copy'
                    ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20'
                }`}
              >
                <Copy className="w-4 h-4" />
                <span className="font-medium">Copy</span>
                <span className="text-xs opacity-60">(Keep originals)</span>
              </button>
              <button
                type="button"
                onClick={() => setOperation('move')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border transition-all ${
                  operation === 'move'
                    ? 'border-violet-400/40 bg-violet-500/20 text-violet-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20'
                }`}
              >
                <Move className="w-4 h-4" />
                <span className="font-medium">Move</span>
                <span className="text-xs opacity-60">(Relocate files)</span>
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
