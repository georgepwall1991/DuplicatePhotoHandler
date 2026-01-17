interface SidebarProps {
  activeModule: string
  onNewScan: () => void
  potentialSavings?: number
  isWatching?: boolean
  watchedPaths?: string[]
  onToggleWatch?: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function Sidebar({ activeModule, onNewScan, potentialSavings, isWatching, watchedPaths, onToggleWatch }: SidebarProps) {
  const modules = [
    { id: 'duplicates', name: 'Duplicates', icon: '📸', available: true },
    { id: 'similar', name: 'Similar Photos', icon: '🖼️', available: false },
    { id: 'large', name: 'Large Files', icon: '📦', available: false },
    { id: 'screenshots', name: 'Screenshots', icon: '📱', available: false },
  ]

  return (
    <aside className="w-64 glass-strong rounded-3xl flex flex-col relative overflow-hidden shadow-2xl z-10">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <div className="relative p-6 border-b border-white/5">
        <h1 className="text-xl font-semibold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg glow-purple-sm">
            <span className="text-lg">🔍</span>
          </div>
          <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Photo Dedup
          </span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 relative">
        <ul className="space-y-1">
          {modules.map((module) => (
            <li key={module.id}>
              <button
                onClick={module.available ? onNewScan : undefined}
                disabled={!module.available}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${module.id === activeModule
                    ? 'glass-purple text-white shadow-lg shadow-purple-500/20'
                    : module.available
                      ? 'text-gray-400 hover:text-white hover:bg-white/5 hover:translate-x-1'
                      : 'text-gray-600 cursor-not-allowed opacity-50'
                  }`}
              >
                <span className={`text-lg transition-transform duration-300 ${module.id === activeModule ? 'scale-110 drop-shadow-md' : 'group-hover:scale-110'
                  }`}>{module.icon}</span>
                <span className="font-medium">{module.name}</span>
                {!module.available && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-600 bg-gray-800/50 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Storage indicator */}
      {potentialSavings !== undefined && potentialSavings > 0 && (
        <div className="p-4 relative">
          <div className="glass-card rounded-xl p-4 glow-green">
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">
              Potential Savings
            </div>
            <div className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              {formatBytes(potentialSavings)}
            </div>
          </div>
        </div>
      )}

      {/* Folder Watcher */}
      {onToggleWatch && (
        <div className="p-4 relative">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-lg ${isWatching ? 'animate-pulse' : ''}`}>
                  {isWatching ? '👁️' : '👁️‍🗨️'}
                </span>
                <span className="text-sm font-medium text-white">Auto-Watch</span>
              </div>
              <button
                onClick={onToggleWatch}
                className={`w-12 h-6 rounded-full transition-all duration-300 ${
                  isWatching
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : 'bg-gray-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ${
                    isWatching ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              {isWatching
                ? `Monitoring ${watchedPaths?.length || 0} folder${(watchedPaths?.length || 0) !== 1 ? 's' : ''}`
                : 'Watch folders for new photos'}
            </p>
            {isWatching && watchedPaths && watchedPaths.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 truncate" title={watchedPaths.join(', ')}>
                {watchedPaths[0].split('/').slice(-2).join('/')}
                {watchedPaths.length > 1 && ` +${watchedPaths.length - 1} more`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="p-4 border-t border-white/5 relative">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group">
          <span className="text-lg transition-transform duration-200 group-hover:rotate-90">⚙️</span>
          <span className="font-medium">Settings</span>
        </button>
      </div>
    </aside>
  )
}
