interface ResultsSummaryProps {
  totalPhotos: number
  duplicateGroups: number
  potentialSavingsBytes: number
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ResultsSummary({ totalPhotos, duplicateGroups, potentialSavingsBytes }: ResultsSummaryProps) {
  return (
    <div className="flex gap-4 mt-4 stagger-children">
      <div className="flex-1 glass-card rounded-2xl p-5 transition-all duration-200 hover:bg-white/5 hover:scale-[1.02]">
        <div className="text-3xl font-bold text-white">{totalPhotos.toLocaleString()}</div>
        <div className="text-xs uppercase tracking-wider text-gray-500 mt-1">Photos Scanned</div>
      </div>
      <div className="flex-1 glass-card rounded-2xl p-5 transition-all duration-200 hover:bg-white/5 hover:scale-[1.02]">
        <div className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
          {duplicateGroups}
        </div>
        <div className="text-xs uppercase tracking-wider text-gray-500 mt-1">Duplicate Groups</div>
      </div>
      <div className="flex-1 glass-card rounded-2xl p-5 glow-green border-green-500/20 bg-green-500/5 transition-all duration-200 hover:bg-green-500/10 hover:scale-[1.02]">
        <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
          {formatBytes(potentialSavingsBytes)}
        </div>
        <div className="text-xs uppercase tracking-wider text-green-400/60 font-medium mt-1">Potential Savings</div>
      </div>
    </div>
  )
}

export { formatBytes }
