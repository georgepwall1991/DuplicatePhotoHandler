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
  return id === 'duplicates' || id === 'screenshots' || id === 'large' || id === 'organize' || id === 'unorganized' || id === 'similar' || id === 'history' || id === 'master'
}

export function Sidebar({
  activeModule,
  onModuleChange,
  onNewScan,
  potentialSavings,
  isWatching,
  watchedPaths: _watchedPaths,
  onToggleWatch,
  onOpenSettings
}: SidebarProps) {
  const guardEnabled = Boolean(isWatching)

  const groups = [
    {
      label: 'Library',
      items: [
        { id: 'master', name: 'Full Library Guard', hint: 'Scan everything', icon: ShieldCheck, available: true, highlight: true },
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
    <aside className="w-full h-full flex flex-col glass-panel rounded-2xl overflow-hidden border border-white/5 bg-surface-900/40">
      <div className="p-5 flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 bg-brand-primary/40 blur-md rounded-lg" />
              <div className="relative flex h-10 w-10 items-center justify-center bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg shadow-lg">
                <Zap className="h-5 w-5 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">Pixel<br /><span className="text-brand-accent">lift</span></h1>
            </div>
          </div>
          <div className={`
            flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
            ${guardEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-text-muted'}
          `}>
            <span className={`h-1.5 w-1.5 rounded-full ${guardEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {guardEnabled ? 'Live' : 'Idle'}
          </div>
        </div>

        {/* Quick Action */}
        <div className="mb-6">
          <motion.button
            type="button"
            onClick={onNewScan}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-brand-primary/20 via-brand-secondary/20 to-brand-accent/20 p-[1px]"
          >
            <div className="relative bg-surface-900/90 backdrop-blur-sm px-4 py-3 rounded-[11px] flex items-center justify-between transition-all group-hover:bg-surface-900/70">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">New Scan</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/50 group-hover:text-white transition-colors" />
            </div>
          </motion.button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <button className="w-full flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors border border-white/5 rounded-lg px-3 py-2 text-sm text-text-muted">
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search...</span>
            <span className="text-[10px] border border-white/10 rounded px-1.5 py-0.5 opacity-50"><Command className="inline h-3 w-3 align-middle" /> K</span>
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-2 px-2 custom-scrollbar space-y-6">
          {groups.map(group => (
            <div key={group.label} className="space-y-1">
              <h3 className="px-3 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{group.label}</h3>
              {group.items.map(item => {
                const Icon = item.icon
                const isActive = item.id === activeModule
                const isHighlight = 'highlight' in item && item.highlight

                return (
                  <button
                    key={item.id}
                    onClick={() => isActiveModule(item.id) && onModuleChange(item.id)}
                    className={`
                         w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all
                         ${isHighlight && !isActive
                        ? 'bg-gradient-to-r from-brand-accent/10 to-brand-primary/10 border border-brand-accent/20 text-brand-accent hover:from-brand-accent/20 hover:to-brand-primary/20'
                        : isActive
                          ? 'bg-brand-primary/10 text-brand-primary'
                          : 'text-text-secondary hover:text-white hover:bg-white/5'}
                       `}
                  >
                    <Icon className={`h-4 w-4 ${isHighlight && !isActive ? 'text-brand-accent' : isActive ? 'text-brand-primary' : 'text-current opacity-70'}`} />
                    <span className="font-medium text-sm">{item.name}</span>
                    {isActive && <motion.div layoutId="active-nav" className="ml-auto w-1 h-1 rounded-full bg-brand-primary shadow-[0_0_8px_currentColor]" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer Stats / Profile */}
        <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
          {/* Auto Guard Status */}
          <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${guardEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-text-muted'}`}>
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-secondary">Auto-Guard</p>
              <p className={`text-xs font-bold ${guardEnabled ? 'text-emerald-400' : 'text-text-muted'}`}>
                {guardEnabled ? 'Active' : 'Standby'}
              </p>
            </div>
            <button
              onClick={onToggleWatch}
              className={`w-8 h-5 rounded-full relative transition-colors ${guardEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
            >
              <motion.div
                animate={{ x: guardEnabled ? 12 : 2 }}
                className="absolute top-1 left-0 w-3 h-3 bg-white rounded-full shadow-sm"
              />
            </button>
          </div>

          {/* Savings */}
          {potentialSavings !== undefined && potentialSavings > 0 && (
            <div className="p-3 bg-gradient-to-br from-brand-accent/10 to-transparent rounded-xl border border-brand-accent/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-brand-accent">
                  <Database className="h-3 w-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Recovery</span>
                </div>
                <span className="text-xs font-bold text-white">{formatBytes(potentialSavings)}</span>
              </div>
              <div className="h-1.5 w-full bg-brand-accent/20 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} className="h-full bg-brand-accent" />
              </div>
            </div>
          )}

          {/* User Profile */}
          <button onClick={onOpenSettings} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-lg">
              GW
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-bold text-white">George Wall</p>
              <p className="text-[10px] text-text-muted group-hover:text-text-secondary">Settings</p>
            </div>
            <Settings className="h-4 w-4 text-text-muted group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  )
}
