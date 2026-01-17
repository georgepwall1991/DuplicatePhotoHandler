import { motion } from 'framer-motion'
import { CheckCircle, FolderTree, AlertTriangle, FolderOpen, RotateCcw } from 'lucide-react'
import { invoke } from '../lib/tauri'
import type { OrganizeResult } from '../lib/types'

interface OrganizeResultViewProps {
  result: OrganizeResult
  destination: string
  onNewOrganize: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function OrganizeResultView({
  result,
  destination,
  onNewOrganize,
}: OrganizeResultViewProps) {
  const hasErrors = result.errors.length > 0
  const success = result.files_processed > 0

  const handleOpenInFinder = async () => {
    try {
      await invoke('show_in_folder', { path: destination })
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-12">
      <div className="max-w-lg w-full text-center">
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="mb-8"
        >
          {success ? (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/30">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
            </div>
          )}
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl font-black text-white mb-2"
        >
          {success ? 'Organization Complete!' : 'Organization Failed'}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-slate-400 mb-8"
        >
          {success
            ? `Successfully organized ${result.files_processed.toLocaleString()} files into ${result.folders_created} folders.`
            : 'No files were organized. Check the errors below.'}
        </motion.p>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-3 gap-4 mb-8"
        >
          <div className="border border-white/10 bg-white/[0.02] p-4">
            <div className="text-2xl font-bold text-white">
              {result.files_processed.toLocaleString()}
            </div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Files Processed</div>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-4">
            <div className="text-2xl font-bold text-white">{result.folders_created}</div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Folders Created</div>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-4">
            <div className="text-2xl font-bold text-white">
              {(result.duration_ms / 1000).toFixed(1)}s
            </div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Duration</div>
          </div>
        </motion.div>

        {/* Size info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex items-center justify-center gap-2 text-slate-400 mb-8"
        >
          <FolderTree className="w-4 h-4" />
          <span>{formatBytes(result.total_size_bytes)} organized</span>
        </motion.div>

        {/* Errors */}
        {hasErrors && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="border border-red-500/30 bg-red-500/10 p-4 mb-8 text-left"
          >
            <div className="flex items-center gap-2 text-red-400 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                {result.errors.length} Error{result.errors.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="max-h-32 overflow-auto custom-scrollbar">
              {result.errors.map((error, i) => (
                <div key={i} className="text-sm text-red-200/80 py-1">
                  {error}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex gap-3 justify-center"
        >
          <button
            type="button"
            onClick={handleOpenInFinder}
            className="flex items-center gap-2 px-6 py-3 border border-white/10 bg-white/[0.02] text-white hover:border-white/20 hover:bg-white/[0.04] transition-all"
          >
            <FolderOpen className="w-4 h-4" />
            Open in Finder
          </button>
          <button
            type="button"
            onClick={onNewOrganize}
            className="flex items-center gap-2 px-6 py-3 bg-violet-500 text-white hover:bg-violet-600 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            Organize More
          </button>
        </motion.div>
      </div>
    </div>
  )
}
