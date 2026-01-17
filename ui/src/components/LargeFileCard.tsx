import { motion } from 'framer-motion'
import { File, Film, Image, Check } from 'lucide-react'
import type { LargeFileInfo } from '../lib/types'

interface LargeFileCardProps {
  file: LargeFileInfo
  isSelected: boolean
  onToggleSelect: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('video') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(fileType)) return Film
  if (fileType.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'heic', 'webp'].includes(fileType)) return Image
  return File
}

export function LargeFileCard({ file, isSelected, onToggleSelect }: LargeFileCardProps) {
  const FileIcon = getFileIcon(file.file_type)

  return (
    <motion.button
      type="button"
      onClick={onToggleSelect}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`group relative w-full overflow-hidden border bg-white/[0.02] p-4 text-left transition-all ${
        isSelected
          ? 'border-cyan-400/40 bg-cyan-500/10'
          : 'border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
      }`}
      aria-pressed={isSelected}
      aria-label={`${file.filename}, ${formatBytes(file.size_bytes)}${isSelected ? ', selected' : ''}`}
    >
      {/* Selection indicator */}
      <div
        className={`absolute top-3 right-3 flex h-6 w-6 items-center justify-center border transition-all ${
          isSelected
            ? 'border-cyan-400 bg-cyan-500 text-white'
            : 'border-white/20 bg-white/5 text-transparent group-hover:border-white/40'
        }`}
      >
        <Check className="h-4 w-4" />
      </div>

      {/* File icon */}
      <div className={`mb-3 flex h-12 w-12 items-center justify-center border ${
        isSelected
          ? 'border-cyan-400/30 bg-cyan-500/20 text-cyan-200'
          : 'border-white/10 bg-white/5 text-slate-400'
      }`}>
        <FileIcon className="h-6 w-6" />
      </div>

      {/* File info */}
      <p className="truncate text-sm font-medium text-white" title={file.filename}>
        {file.filename}
      </p>

      {/* Size badge */}
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold ${
          isSelected
            ? 'border-cyan-400/30 bg-cyan-500/20 text-cyan-200'
            : 'border-amber-400/30 bg-amber-500/20 text-amber-200'
        }`}>
          {formatBytes(file.size_bytes)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {file.file_type}
        </span>
      </div>
    </motion.button>
  )
}
