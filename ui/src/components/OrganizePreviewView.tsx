import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Play,
} from 'lucide-react'
import type { OrganizePlan, OperationMode } from '../lib/types'

interface OrganizePreviewViewProps {
  plan: OrganizePlan
  operation: OperationMode
  onExecute: () => void
  onBack: () => void
  isExecuting?: boolean
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function OrganizePreviewView({
  plan,
  operation,
  onExecute,
  onBack,
  isExecuting = false,
}: OrganizePreviewViewProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) {
        next.delete(year)
      } else {
        next.add(year)
      }
      return next
    })
  }

  const dateRangeText = plan.date_range
    ? `${plan.date_range[0]} to ${plan.date_range[1]}`
    : 'No dates found'

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              disabled={isExecuting}
              className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-violet-400" />
              <span className="text-lg font-semibold text-white">Organization Preview</span>
            </div>
          </div>

          <motion.button
            type="button"
            onClick={onExecute}
            disabled={isExecuting || plan.total_files === 0}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 bg-violet-500 px-6 py-2 font-medium text-white transition hover:bg-violet-600 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {isExecuting ? 'Organizing...' : `${operation === 'copy' ? 'Copy' : 'Move'} ${plan.total_files} Files`}
          </motion.button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="text-3xl font-black text-white">
                {plan.total_files.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Total Files</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="text-3xl font-black text-white">
                {formatBytes(plan.total_size_bytes)}
              </div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Total Size</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="text-3xl font-black text-white">{plan.by_year.length}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Years Spanned</div>
            </motion.div>
          </div>

          {/* Date Range */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3 border border-white/10 bg-white/[0.02] p-4"
          >
            <Calendar className="h-5 w-5 text-violet-400" />
            <div>
              <div className="text-sm font-medium text-white">Date Range</div>
              <div className="text-xs text-slate-400">{dateRangeText}</div>
            </div>
          </motion.div>

          {/* Warnings */}
          {(plan.no_date_count > 0 || plan.conflict_count > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="border border-amber-500/30 bg-amber-500/10 p-4 space-y-2"
            >
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Warnings</span>
              </div>
              {plan.no_date_count > 0 && (
                <div className="text-sm text-amber-200/80">
                  {plan.no_date_count} file{plan.no_date_count === 1 ? '' : 's'} have no date
                  metadata and will go to "Unsorted/"
                </div>
              )}
              {plan.conflict_count > 0 && (
                <div className="text-sm text-amber-200/80">
                  {plan.conflict_count} file{plan.conflict_count === 1 ? '' : 's'} have naming
                  conflicts and will be renamed
                </div>
              )}
            </motion.div>
          )}

          {/* Year Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="border border-white/10 bg-white/[0.02]"
          >
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="font-medium text-white">Files by Year</h3>
            </div>
            <div className="divide-y divide-white/5">
              {plan.by_year.map((year) => (
                <div key={year.year}>
                  <button
                    type="button"
                    onClick={() => toggleYear(year.year)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedYears.has(year.year) ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="text-white font-medium">{year.year}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-400">
                        {year.count.toLocaleString()} files
                      </span>
                      <span className="text-sm text-slate-500">{formatBytes(year.size_bytes)}</span>
                    </div>
                  </button>
                  {expandedYears.has(year.year) && (
                    <div className="px-4 pb-3 pl-11">
                      <div className="text-xs text-slate-500">
                        {year.count} photo{year.count === 1 ? '' : 's'} totaling{' '}
                        {formatBytes(year.size_bytes)}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {plan.no_date_count > 0 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-amber-200">Unsorted</span>
                  </div>
                  <span className="text-sm text-slate-400">
                    {plan.no_date_count.toLocaleString()} files
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
