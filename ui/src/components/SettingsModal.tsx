import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import {
  X,
  Database,
  Trash2,
  Sliders,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Zap,
  Shield,
  FolderOpen
} from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onCacheCleared?: () => void
}

interface CacheInfo {
  entries: number
  size_bytes: number
  path: string
}

interface AppSettings {
  defaultThreshold: number
  defaultAlgorithm: string
  confirmBeforeTrash: boolean
  includeHidden: boolean
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function SettingsModal({ isOpen, onClose, onCacheCleared }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'cache' | 'about'>('general')
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)
  const [isLoadingCache, setIsLoadingCache] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [clearSuccess, setClearSuccess] = useState(false)
  const [settings, setSettings] = useState<AppSettings>({
    defaultThreshold: 5,
    defaultAlgorithm: 'difference',
    confirmBeforeTrash: true,
    includeHidden: false
  })

  // Load cache info when opening cache tab
  useEffect(() => {
    if (isOpen && activeTab === 'cache') {
      loadCacheInfo()
    }
  }, [isOpen, activeTab])

  const loadCacheInfo = async () => {
    setIsLoadingCache(true)
    try {
      const info = await invoke<CacheInfo>('get_cache_info')
      setCacheInfo(info)
    } catch (error) {
      console.error('Failed to load cache info:', error)
      setCacheInfo(null)
    } finally {
      setIsLoadingCache(false)
    }
  }

  const handleClearCache = async () => {
    setIsClearingCache(true)
    setClearSuccess(false)
    try {
      await invoke('clear_cache')
      setClearSuccess(true)
      await loadCacheInfo()
      onCacheCleared?.()
      setTimeout(() => setClearSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to clear cache:', error)
    } finally {
      setIsClearingCache(false)
    }
  }

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Sliders },
    { id: 'cache' as const, label: 'Cache', icon: Database },
    { id: 'about' as const, label: 'About', icon: Info }
  ]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-50 w-[600px] -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative overflow-hidden  border border-white/10 bg-[#0a0a12]/95 shadow-2xl backdrop-blur-xl">
              {/* Ambient glow */}
              <div className="pointer-events-none absolute -top-32 -right-32 h-64 w-64  bg-cyan-500/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64  bg-purple-500/10 blur-3xl" />

              {/* Header */}
              <div className="relative flex items-center justify-between border-b border-white/5 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center  text-slate-400 transition hover:bg-white/10 hover:text-white focus-ring btn-press"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="relative flex gap-1 border-b border-white/5 px-6">
                {tabs.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition ${
                        isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                      {isActive && (
                        <motion.div
                          layoutId="settings-tab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500"
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Content */}
              <div className="relative min-h-[400px] p-6">
                <AnimatePresence mode="wait">
                  {activeTab === 'general' && (
                    <motion.div
                      key="general"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-6"
                    >
                      {/* Scan Defaults */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <Zap className="h-3.5 w-3.5" />
                          Scan Defaults
                        </div>

                        {/* Threshold */}
                        <div className=" border border-white/10 bg-white/[0.02] p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">Similarity Threshold</p>
                              <p className="text-xs text-slate-500">Lower values find more exact matches</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min="1"
                                max="20"
                                value={settings.defaultThreshold}
                                onChange={(e) => setSettings(s => ({ ...s, defaultThreshold: parseInt(e.target.value) }))}
                                className="h-1.5 w-24 cursor-pointer appearance-none  bg-white/10 accent-cyan-400"
                              />
                              <span className="w-8 text-right text-sm font-medium text-cyan-300">{settings.defaultThreshold}</span>
                            </div>
                          </div>
                        </div>

                        {/* Algorithm */}
                        <div className=" border border-white/10 bg-white/[0.02] p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">Hash Algorithm</p>
                              <p className="text-xs text-slate-500">Detection method for finding duplicates</p>
                            </div>
                            <select
                              value={settings.defaultAlgorithm}
                              onChange={(e) => setSettings(s => ({ ...s, defaultAlgorithm: e.target.value }))}
                              className=" border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-500/50"
                            >
                              <option value="difference">Difference (Fast)</option>
                              <option value="average">Average</option>
                              <option value="perceptual">Perceptual (Accurate)</option>
                              <option value="fusion">Fusion (Best)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Behavior */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <Shield className="h-3.5 w-3.5" />
                          Behavior
                        </div>

                        {/* Confirm before trash */}
                        <div className=" border border-white/10 bg-white/[0.02] p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">Confirm Before Trash</p>
                              <p className="text-xs text-slate-500">Show confirmation dialog before moving files</p>
                            </div>
                            <button
                              onClick={() => setSettings(s => ({ ...s, confirmBeforeTrash: !s.confirmBeforeTrash }))}
                              className={`relative h-6 w-11  border transition ${
                                settings.confirmBeforeTrash
                                  ? 'border-cyan-400/40 bg-cyan-500/40'
                                  : 'border-white/10 bg-white/5'
                              }`}
                            >
                              <motion.span
                                animate={{ x: settings.confirmBeforeTrash ? 20 : 0 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="absolute left-1 top-1 h-4 w-4  bg-white shadow-lg"
                              />
                            </button>
                          </div>
                        </div>

                        {/* Include hidden */}
                        <div className=" border border-white/10 bg-white/[0.02] p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">Include Hidden Files</p>
                              <p className="text-xs text-slate-500">Scan files starting with a dot</p>
                            </div>
                            <button
                              onClick={() => setSettings(s => ({ ...s, includeHidden: !s.includeHidden }))}
                              className={`relative h-6 w-11  border transition ${
                                settings.includeHidden
                                  ? 'border-cyan-400/40 bg-cyan-500/40'
                                  : 'border-white/10 bg-white/5'
                              }`}
                            >
                              <motion.span
                                animate={{ x: settings.includeHidden ? 20 : 0 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="absolute left-1 top-1 h-4 w-4  bg-white shadow-lg"
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'cache' && (
                    <motion.div
                      key="cache"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-6"
                    >
                      {/* Cache Info */}
                      <div className=" border border-white/10 bg-white/[0.02] p-6">
                        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <HardDrive className="h-3.5 w-3.5" />
                          Hash Cache
                        </div>

                        {isLoadingCache ? (
                          <div className="mt-6 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                          </div>
                        ) : cacheInfo ? (
                          <div className="mt-6 grid grid-cols-2 gap-6">
                            <div>
                              <p className="text-3xl font-bold text-white">{cacheInfo.entries.toLocaleString()}</p>
                              <p className="text-xs text-slate-500">Cached hashes</p>
                            </div>
                            <div>
                              <p className="text-3xl font-bold text-white">{formatBytes(cacheInfo.size_bytes)}</p>
                              <p className="text-xs text-slate-500">Cache size</p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-6 flex items-center gap-2 text-amber-400">
                            <AlertCircle className="h-4 w-4" />
                            <p className="text-sm">Unable to load cache information</p>
                          </div>
                        )}

                        {cacheInfo && (
                          <div className="mt-6 flex items-center gap-2  border border-white/5 bg-white/[0.02] px-3 py-2">
                            <FolderOpen className="h-4 w-4 text-slate-500" />
                            <p className="flex-1 truncate text-xs text-slate-400" title={cacheInfo.path}>
                              {cacheInfo.path}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Clear Cache */}
                      <div className=" border border-white/10 bg-white/[0.02] p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">Clear Cache</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Remove all cached hashes. Next scan will recompute hashes for all photos.
                            </p>
                          </div>
                          <button
                            onClick={handleClearCache}
                            disabled={isClearingCache || !cacheInfo}
                            className={`flex items-center gap-2  border px-4 py-2 text-sm font-medium transition ${
                              clearSuccess
                                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {isClearingCache ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : clearSuccess ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            {clearSuccess ? 'Cleared!' : 'Clear Cache'}
                          </button>
                        </div>
                      </div>

                      {/* Cache explanation */}
                      <div className=" border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <p className="text-xs text-cyan-200/80">
                          <strong>Tip:</strong> The cache stores perceptual hashes of your photos to speed up future scans.
                          Photos that haven't changed will use cached hashes instead of recomputing them.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === 'about' && (
                    <motion.div
                      key="about"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-6"
                    >
                      {/* App Info */}
                      <div className="flex flex-col items-center justify-center py-8">
                        <div className="relative">
                          <div className="absolute -inset-2  bg-cyan-400/20 blur-xl" />
                          <div className="relative flex h-20 w-20 items-center justify-center  bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-500 shadow-2xl">
                            <Zap className="h-10 w-10 text-white" />
                          </div>
                        </div>
                        <h3 className="mt-6 text-xl font-bold text-white">Lensly Duplicate Studio</h3>
                        <p className="mt-1 text-sm text-slate-400">Version 2.4.0</p>
                      </div>

                      {/* Credits */}
                      <div className=" border border-white/10 bg-white/[0.02] p-4">
                        <div className="space-y-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Built with</span>
                            <span className="text-white">Tauri + React + Rust</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Hash Algorithms</span>
                            <span className="text-white">dHash, aHash, pHash</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Platform</span>
                            <span className="text-white">macOS</span>
                          </div>
                        </div>
                      </div>

                      {/* Links */}
                      <div className="flex items-center justify-center gap-4">
                        <button className=" border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus-ring btn-press">
                          View on GitHub
                        </button>
                        <button className=" border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus-ring btn-press">
                          Report Issue
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
