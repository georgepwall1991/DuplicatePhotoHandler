import { motion } from 'framer-motion'
import type { ActiveModule } from '../lib/types'
import {
  Images,
  Layers,
  HardDrive,
  Smartphone,
  Settings,
  Search,
  Zap,
  Activity,
  ChevronRight,
  Command,
  FolderSearch,
  History,
  ShieldCheck,
  Database,
  FolderTree,
} from 'lucide-react'

interface SidebarProps {
  activeModule: ActiveModule
  onModuleChange: (module: ActiveModule) => void
  onNewScan: () => void
  potentialSavings?: number
  isWatching?: boolean
  watchedPaths?: string[]
  onToggleWatch?: () => void
  onOpenSettings?: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Type guard to check if an item id is a valid ActiveModule
const isActiveModule = (id: string): id is ActiveModule => {
  return id === 'duplicates' || id === 'screenshots' || id === 'large' || id === 'organize' || id === 'unorganized' || id === 'similar' || id === 'history'
}

export function Sidebar({
  activeModule,
  onModuleChange,
  onNewScan,
  potentialSavings,
  isWatching,
  watchedPaths,
  onToggleWatch,
  onOpenSettings
}: SidebarProps) {
  const guardEnabled = Boolean(isWatching)
  const guardedCount = watchedPaths?.length ?? 0
  const guardedLabel = guardEnabled
    ? `${guardedCount} folder${guardedCount === 1 ? '' : 's'} armed`
    : 'No folders armed'

  const groups = [
    {
      label: 'Library',
      items: [
        { id: 'duplicates', name: 'Duplicates', hint: 'Exact matches', icon: Layers, available: true },
        { id: 'similar', name: 'Similar Photos', hint: 'Near matches', icon: Images, available: true },
        { id: 'history', name: 'Scan History', hint: 'Recent sessions', icon: History, available: true }
      ]
    },
    {
      label: 'Analysis',
      items: [
        { id: 'large', name: 'Large Files', hint: 'Space hogs', icon: HardDrive, available: true },
        { id: 'screenshots', name: 'Screenshots', hint: 'UI captures', icon: Smartphone, available: true },
        { id: 'organize', name: 'Organize', hint: 'Sort by date', icon: FolderTree, available: true },
        { id: 'unorganized', name: 'Unorganized', hint: 'Loose files', icon: FolderSearch, available: true }
      ]
    }
  ]

  return (
    <aside className="w-[340px] shrink-0 ml-10">
      <div className="h-full p-5">
        <div className="relative h-full bg-gradient-to-b from-white/15 via-white/5 to-white/10 p-[1px] shadow-[0_40px_120px_rgba(0,0,0,0.65)]">
          <div className="relative flex h-full flex-col overflow-hidden bg-[#07070c]/90 backdrop-blur-2xl">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-24 -right-20 h-64 w-64 bg-cyan-500/20 blur-3xl" />
              <div className="absolute bottom-[-120px] left-[-80px] h-72 w-72 bg-fuchsia-500/15 blur-3xl" />
              <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_35%,rgba(255,255,255,0.05)_100%)]" />
            </div>

            <div className="relative z-10 flex h-full flex-col m-6">
            <div className="px-4 pt-8 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute -inset-1 bg-cyan-400/30 blur-md" />
                    <div className="relative flex h-12 w-12 items-center justify-center bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-500 shadow-[0_8px_30px_rgba(56,189,248,0.4)]">
                      <Zap className="h-5 w-5 text-slate-900" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-400">Lensly</p>
                    <h1 className="text-xl font-semibold text-white tracking-tight">Duplicate Studio</h1>
                    <p className="text-[11px] text-slate-500">Workspace v2.4.0</p>
                  </div>
                </div>
                <div
                  className={`flex items-center gap-2 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                    guardEnabled ? 'border-emerald-400/30 text-emerald-300' : 'border-white/10 text-slate-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 ${guardEnabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  {guardEnabled ? 'Live' : 'Idle'}
                </div>
              </div>
            </div>

            <div className="px-4">
              <motion.button
                type="button"
                onClick={onNewScan}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="group relative w-full overflow-hidden border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/35 via-blue-500/25 to-indigo-500/15 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/80">Quick action</p>
                    <p className="text-base font-semibold text-white">Start new scan</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-cyan-100">
                    <Zap className="h-4 w-4" />
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </motion.button>
            </div>

            <div className="mt-4 px-4">
              <button
                type="button"
                className="flex w-full items-center gap-3 border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-xs font-medium text-slate-400 transition hover:border-white/20 hover:text-white"
              >
                <Search className="h-4 w-4 text-slate-400" />
                <span className="flex-1">Search or command</span>
                <span className="flex items-center gap-1 border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold tracking-[0.24em] text-slate-500">
                  <Command className="h-3 w-3" /> K
                </span>
              </button>
            </div>

            <div className="flex-1 min-h-0 space-y-5 overflow-y-auto px-2 pb-4 pt-4 custom-scrollbar">
              {groups.map((group) => (
                <div key={group.label} className="space-y-3">
                  <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                    {group.label}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = item.id === activeModule
                      const canNavigate = item.available && isActiveModule(item.id)

                      const handleClick = canNavigate
                        ? () => {
                            if (isActiveModule(item.id)) {
                              onModuleChange(item.id)
                            }
                          }
                        : undefined

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={handleClick}
                          disabled={!item.available}
                          className={`group relative w-full overflow-hidden px-3 py-3 text-left transition ${
                            isActive
                              ? 'text-white'
                              : item.available
                                ? 'text-slate-400 hover:text-white'
                                : 'cursor-not-allowed text-slate-600 opacity-60'
                          }`}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="nav-active"
                              className="pointer-events-none absolute inset-0 border border-cyan-400/20 bg-gradient-to-r from-cyan-500/20 via-slate-900/30 to-transparent shadow-[0_10px_30px_rgba(56,189,248,0.15)]"
                            />
                          )}
                          <div className="relative z-10 flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center border ${
                                isActive
                                  ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-200'
                                  : item.available
                                    ? 'border-white/10 bg-white/5 text-slate-400 group-hover:border-white/20 group-hover:text-white'
                                    : 'border-white/5 bg-white/5 text-slate-600'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold">{item.name}</p>
                              <p className={`text-[10px] ${isActive ? 'text-cyan-100/80' : 'text-slate-500'}`}>
                                {item.hint}
                              </p>
                            </div>
                            {item.available ? (
                              <ChevronRight
                                className={`h-4 w-4 ${
                                  isActive ? 'text-cyan-200' : 'text-slate-600 group-hover:text-slate-300'
                                }`}
                              />
                            ) : (
                              <span className="border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                Soon
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto space-y-3 px-4 pb-6">
              <div className="border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                    <Activity className={`h-3 w-3 ${guardEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
                    Auto-guard
                  </div>
                  <button
                    type="button"
                    onClick={onToggleWatch}
                    className={`relative h-6 w-11 border transition ${
                      guardEnabled ? 'border-emerald-400/40 bg-emerald-500/40' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <motion.span
                      animate={{ x: guardEnabled ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute left-1 top-1 h-4 w-4 bg-white shadow-lg"
                    />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div
                    className={`relative flex h-11 w-11 items-center justify-center border ${
                      guardEnabled
                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/10 bg-white/5 text-slate-500'
                    }`}
                  >
                    {guardEnabled && (
                      <motion.span
                        className="absolute inset-0 border border-emerald-400/40"
                        animate={{ opacity: [0.8, 0, 0.8], scale: [1, 1.2, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity }}
                      />
                    )}
                    <ShieldCheck className="relative h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{guardEnabled ? 'Guarding' : 'Standby'}</p>
                    <p className="text-[10px] text-slate-500">{guardedLabel}</p>
                  </div>
                </div>
              </div>

              {potentialSavings !== undefined && potentialSavings > 0 && (
                <div className="border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-300">
                      <Database className="h-3 w-3" />
                      Recovery
                    </div>
                    <span className="text-sm font-semibold text-white">{formatBytes(potentialSavings)}</span>
                  </div>
                  <div className="mt-3 h-2 w-full bg-white/10">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '68%' }}
                      className="h-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-sky-400"
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">Estimated reclaimable space</p>
                </div>
              )}

              <button
                type="button"
                onClick={onOpenSettings}
                className="group flex w-full items-center gap-3 border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/5"
              >
                <div className="relative flex h-10 w-10 items-center justify-center border border-white/10 bg-gradient-to-br from-slate-700 to-slate-900">
                  <span className="text-xs font-semibold text-cyan-200">GW</span>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 border-2 border-[#07070c] bg-emerald-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white truncate">George Wall</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Admin</p>
                </div>
                <Settings className="h-4 w-4 text-slate-500 transition group-hover:text-white group-hover:rotate-90" />
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
