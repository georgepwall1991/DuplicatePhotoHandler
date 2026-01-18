import { useState } from 'react'
import { motion } from 'framer-motion'
import { invoke, open } from '../lib/tauri'
import {
    Shield,
    Layers,
    Images,
    HardDrive,
    Smartphone,
    FolderSearch,
    CheckCircle2,
    Circle,
    Sparkles,
    Loader2,
    X,
} from 'lucide-react'
import type { MasterScanModule, MasterScanResult, MasterModuleResult } from '../lib/types'
import { ScanButton } from './ScanButton'

interface MasterScanViewProps {
    isScanning?: boolean
    moduleProgress?: MasterModuleResult[]
    overallProgress?: number
    currentModule?: MasterScanModule | null
    onScanStart: () => void
    onScanComplete: (result: MasterScanResult) => void
    onScanCancel: () => void
    onProgress: (progress: { current_module: MasterScanModule | null; overall_percent: number; message: string }) => void
}

interface ModuleOption {
    id: MasterScanModule
    name: string
    description: string
    icon: typeof Layers
    color: string
}

const MODULES: ModuleOption[] = [
    {
        id: 'duplicates',
        name: 'Duplicates',
        description: 'Find exact copies',
        icon: Layers,
        color: 'from-violet-500 to-purple-600'
    },
    {
        id: 'similar',
        name: 'Similar Photos',
        description: 'Near-identical images',
        icon: Images,
        color: 'from-blue-500 to-cyan-600'
    },
    {
        id: 'large',
        name: 'Large Files',
        description: 'Space hogs over 10MB',
        icon: HardDrive,
        color: 'from-amber-500 to-orange-600'
    },
    {
        id: 'screenshots',
        name: 'Screenshots',
        description: 'UI captures & snaps',
        icon: Smartphone,
        color: 'from-rose-500 to-pink-600'
    },
    {
        id: 'unorganized',
        name: 'Unorganized',
        description: 'Loose files to sort',
        icon: FolderSearch,
        color: 'from-emerald-500 to-teal-600'
    },
]

export function MasterScanView({
    isScanning = false,
    moduleProgress = [],
    overallProgress = 0,
    currentModule = null,
    onScanStart,
    onScanComplete,
    onScanCancel,
    onProgress,
}: MasterScanViewProps) {
    const [selectedPaths, setSelectedPaths] = useState<string[]>([])
    const [enabledModules, setEnabledModules] = useState<MasterScanModule[]>([
        'duplicates', 'similar', 'large', 'screenshots', 'unorganized'
    ])
    const [isCancelling, setIsCancelling] = useState(false)

    const handleSelectFolder = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: true,
                title: 'Select folders for full library scan',
            })

            if (selected) {
                setSelectedPaths(Array.isArray(selected) ? selected : [selected])
            }
        } catch (error) {
            console.error('Failed to open folder selector:', error)
        }
    }

    const handleDropPaths = (paths: string[]) => {
        setSelectedPaths(paths)
    }

    const toggleModule = (moduleId: MasterScanModule) => {
        setEnabledModules(prev =>
            prev.includes(moduleId)
                ? prev.filter(m => m !== moduleId)
                : [...prev, moduleId]
        )
    }

    const handleStartScan = async () => {
        if (selectedPaths.length === 0 || enabledModules.length === 0) return

        onScanStart()

        try {
            const result = await invoke<MasterScanResult>('start_master_scan', {
                config: {
                    paths: selectedPaths,
                    enabled_modules: enabledModules,
                },
            })
            onScanComplete(result)
        } catch (error) {
            console.error('Master scan failed:', error)
            onProgress({ current_module: null, overall_percent: 0, message: String(error) })
        }
    }

    const handleCancelScan = async () => {
        setIsCancelling(true)
        try {
            await invoke('cancel_scan')
            onScanCancel()
        } catch (error) {
            console.error('Failed to cancel scan:', error)
        }
        setIsCancelling(false)
    }

    // Scanning view
    if (isScanning) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-12">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-2xl"
                >
                    {/* Header */}
                    <div className="text-center mb-12">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            className="inline-flex h-16 w-16 items-center justify-center bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl mb-6"
                        >
                            <Shield className="w-8 h-8 text-white" />
                        </motion.div>
                        <h2 className="text-3xl font-black text-white mb-2">Full Library Scan</h2>
                        <p className="text-text-secondary">
                            Analyzing your photos across {enabledModules.length} modules
                        </p>
                    </div>

                    {/* Overall Progress */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-text-secondary">Overall Progress</span>
                            <span className="text-sm font-bold text-white">{Math.round(overallProgress)}%</span>
                        </div>
                        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${overallProgress}%` }}
                                className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary"
                            />
                        </div>
                    </div>

                    {/* Module Progress List */}
                    <div className="space-y-3 mb-8">
                        {MODULES.filter(m => enabledModules.includes(m.id)).map((module) => {
                            const progress = moduleProgress.find(p => p.module === module.id)
                            const status = progress?.status || 'pending'
                            const percent = progress?.progress || 0
                            const Icon = module.icon
                            const isCurrentModule = currentModule === module.id

                            return (
                                <motion.div
                                    key={module.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`
                    relative overflow-hidden rounded-xl border p-4 transition-all
                    ${isCurrentModule
                                            ? 'border-brand-primary/50 bg-brand-primary/10'
                                            : status === 'completed'
                                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                                : status === 'error'
                                                    ? 'border-red-500/30 bg-red-500/5'
                                                    : 'border-white/10 bg-white/5'
                                        }
                  `}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`
                      h-10 w-10 rounded-lg flex items-center justify-center
                      ${isCurrentModule ? 'bg-brand-primary/20 text-brand-primary' : 'bg-white/10 text-text-secondary'}
                    `}>
                                            {status === 'running' ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : status === 'completed' ? (
                                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                            ) : (
                                                <Icon className="w-5 h-5" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-white">{module.name}</span>
                                                {status === 'running' && (
                                                    <span className="text-xs text-brand-primary">{Math.round(percent)}%</span>
                                                )}
                                                {status === 'completed' && progress?.items_found !== undefined && (
                                                    <span className="text-xs text-emerald-400">
                                                        {progress.items_found} found
                                                    </span>
                                                )}
                                            </div>
                                            {status === 'running' && (
                                                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${percent}%` }}
                                                        className="h-full bg-brand-primary"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>

                    {/* Cancel Button */}
                    <div className="flex justify-center">
                        <motion.button
                            onClick={handleCancelScan}
                            disabled={isCancelling}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-text-secondary hover:text-white transition-all disabled:opacity-50"
                        >
                            {isCancelling ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <X className="w-4 h-4" />
                            )}
                            <span className="font-medium">{isCancelling ? 'Cancelling...' : 'Cancel Scan'}</span>
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        )
    }

    // Configuration view
    return (
        <div className="h-full flex flex-col items-center justify-center p-12 relative overflow-hidden">
            <div className="w-full max-w-3xl flex flex-col items-center">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-accent/10 border border-brand-accent/20 text-brand-accent mb-6 rounded-full">
                        <Shield className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Full Library Guard</span>
                    </div>
                    <h2 className="text-5xl font-black text-white tracking-tighter mb-4">
                        One Scan, <span className="bg-gradient-to-r from-brand-accent to-brand-primary bg-clip-text text-transparent">Complete</span> Protection
                    </h2>
                    <p className="text-text-secondary font-medium max-w-md mx-auto leading-relaxed">
                        Run all analyzers at once to find duplicates, similar photos, large files, screenshots, and unorganized content.
                    </p>
                </motion.div>

                {/* Folder Selection */}
                <div className="mb-10">
                    <ScanButton
                        isReady={selectedPaths.length > 0 && enabledModules.length > 0}
                        onClick={handleStartScan}
                        onSelectFolder={handleSelectFolder}
                        onDropPaths={handleDropPaths}
                    />
                    {selectedPaths.length > 0 && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center mt-3 text-sm text-text-muted"
                        >
                            {selectedPaths.length} folder{selectedPaths.length !== 1 ? 's' : ''} selected
                        </motion.p>
                    )}
                </div>

                {/* Module Selection Grid */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="w-full"
                >
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4 text-center">
                        Select Modules to Run
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        {MODULES.map((module) => {
                            const isEnabled = enabledModules.includes(module.id)
                            const Icon = module.icon

                            return (
                                <motion.button
                                    key={module.id}
                                    onClick={() => toggleModule(module.id)}
                                    whileHover={{ scale: 1.03, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    className={`
                    relative p-4 rounded-xl border transition-all text-left
                    ${isEnabled
                                            ? 'border-brand-primary/50 bg-brand-primary/10'
                                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                                        }
                  `}
                                >
                                    {/* Checkbox indicator */}
                                    <div className="absolute top-3 right-3">
                                        {isEnabled ? (
                                            <CheckCircle2 className="w-4 h-4 text-brand-primary" />
                                        ) : (
                                            <Circle className="w-4 h-4 text-text-muted" />
                                        )}
                                    </div>

                                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${module.color} flex items-center justify-center mb-3`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>

                                    <h4 className={`font-semibold text-sm mb-1 ${isEnabled ? 'text-white' : 'text-text-secondary'}`}>
                                        {module.name}
                                    </h4>
                                    <p className="text-[11px] text-text-muted leading-tight">
                                        {module.description}
                                    </p>
                                </motion.button>
                            )
                        })}
                    </div>
                </motion.div>

                {/* Enable All / Disable All */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-6 flex items-center gap-4"
                >
                    <button
                        onClick={() => setEnabledModules(MODULES.map(m => m.id))}
                        className="text-xs font-medium text-text-muted hover:text-brand-primary transition-colors"
                    >
                        Enable All
                    </button>
                    <span className="text-text-muted">•</span>
                    <button
                        onClick={() => setEnabledModules([])}
                        className="text-xs font-medium text-text-muted hover:text-brand-primary transition-colors"
                    >
                        Disable All
                    </button>
                </motion.div>

                {/* Feature highlights */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-12 flex items-center gap-8 text-text-muted"
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Sequential Processing</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Non-Destructive</span>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}
