import { motion } from 'framer-motion'
import { Copy, Camera, Images, HardDrive, FolderOpen, Trash2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

import type { ScanHistoryEntry, HistoryModuleType } from '../lib/types'

interface HistoryCardProps {
  entry: ScanHistoryEntry
  onDelete: () => void
  isDeleting: boolean
}

const moduleIcons: Record<HistoryModuleType, typeof Copy> = {
  duplicates: Copy,
  screenshots: Camera,
  similar: Images,
  large_files: HardDrive,
  unorganized: FolderOpen,
}

const moduleColors: Record<HistoryModuleType, string> = {
  duplicates: 'from-blue-500 to-cyan-500',
  screenshots: 'from-cyan-500 to-teal-500',
  similar: 'from-purple-500 to-pink-500',
  large_files: 'from-amber-500 to-orange-500',
  unorganized: 'from-emerald-500 to-green-500',
}

const moduleNames: Record<HistoryModuleType, string> = {
  duplicates: 'Duplicates',
  screenshots: 'Screenshots',
  similar: 'Similar Photos',
  large_files: 'Large Files',
  unorganized: 'Unorganized',
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function HistoryCard({ entry, onDelete, isDeleting }: HistoryCardProps) {
  const Icon = moduleIcons[entry.module_type] || Copy
  const gradient = moduleColors[entry.module_type] || moduleColors.duplicates
  const moduleName = moduleNames[entry.module_type] || 'Scan'

  const statusIcon = {
    completed: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    cancelled: <XCircle className="w-4 h-4 text-amber-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
  }[entry.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-white/10 bg-white/[0.02] overflow-hidden hover:border-white/20 transition-colors"
    >
      <div className="p-4 flex items-start gap-4">
        {/* Module icon */}
        <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold">{moduleName}</span>
            {statusIcon}
          </div>

          <div className="text-sm text-gray-400 truncate mb-2">
            {entry.paths.length === 1
              ? entry.paths[0]
              : `${entry.paths.length} folders`}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDate(entry.scan_time)}</span>
            </div>

            <span>{entry.total_files} files</span>

            {entry.groups_found !== null && entry.groups_found > 0 && (
              <span>{entry.groups_found} groups</span>
            )}

            {entry.duplicates_found !== null && entry.duplicates_found > 0 && (
              <span>{entry.duplicates_found} found</span>
            )}

            {entry.potential_savings !== null && entry.potential_savings > 0 && (
              <span className="text-emerald-400">{formatBytes(entry.potential_savings)} savings</span>
            )}

            <span>{formatDuration(entry.duration_ms)}</span>
          </div>
        </div>

        {/* Actions */}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-2 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
          title="Delete from history"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  )
}
