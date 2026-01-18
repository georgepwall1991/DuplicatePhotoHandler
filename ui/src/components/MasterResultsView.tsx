import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Shield,
    Layers,
    Images,
    HardDrive,
    Smartphone,
    FolderSearch,
    CheckCircle2,
    ArrowRight,
    RefreshCw,
    Sparkles,
    TrendingUp,
} from 'lucide-react'
import type {
    MasterScanResult,
    MasterScanModule,
    ScanResult,
    SimilarResult,
    LargeFileScanResult,
    ScreenshotScanResult,
    UnorganizedResult,
} from '../lib/types'

interface MasterResultsViewProps {
    results: MasterScanResult
    onNewScan: () => void
    onNavigateToModule: (module: MasterScanModule) => void
}

interface ModuleSummary {
    id: MasterScanModule
    name: string
    icon: typeof Layers
    color: string
    bgColor: string
    hasResults: boolean
    itemCount: number
    groupCount: number | null
    savingsBytes: number
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
}

export function MasterResultsView({
    results,
    onNewScan,
    onNavigateToModule,
}: MasterResultsViewProps) {
    const [hoveredModule, setHoveredModule] = useState<MasterScanModule | null>(null)

    // Build module summaries from results
    const getModuleSummaries = (): ModuleSummary[] => {
        const summaries: ModuleSummary[] = []

        // Duplicates
        if (results.duplicates) {
            const r = results.duplicates as ScanResult
            summaries.push({
                id: 'duplicates',
                name: 'Duplicates',
                icon: Layers,
                color: 'text-violet-400',
                bgColor: 'from-violet-500/20 to-purple-600/20',
                hasResults: r.duplicate_groups > 0,
                itemCount: r.duplicate_count,
                groupCount: r.duplicate_groups,
                savingsBytes: r.potential_savings_bytes,
            })
        }

        // Similar
        if (results.similar) {
            const r = results.similar as SimilarResult
            summaries.push({
                id: 'similar',
                name: 'Similar Photos',
                icon: Images,
                color: 'text-blue-400',
                bgColor: 'from-blue-500/20 to-cyan-600/20',
                hasResults: r.similar_groups_found > 0,
                itemCount: r.similar_photos_found,
                groupCount: r.similar_groups_found,
                savingsBytes: 0, // Similar doesn't track savings directly
            })
        }

        // Large files
        if (results.large) {
            const r = results.large as LargeFileScanResult
            summaries.push({
                id: 'large',
                name: 'Large Files',
                icon: HardDrive,
                color: 'text-amber-400',
                bgColor: 'from-amber-500/20 to-orange-600/20',
                hasResults: r.files.length > 0,
                itemCount: r.files.length,
                groupCount: null,
                savingsBytes: r.total_size_bytes,
            })
        }

        // Screenshots
        if (results.screenshots) {
            const r = results.screenshots as ScreenshotScanResult
            summaries.push({
                id: 'screenshots',
                name: 'Screenshots',
                icon: Smartphone,
                color: 'text-rose-400',
                bgColor: 'from-rose-500/20 to-pink-600/20',
                hasResults: r.all_screenshots.length > 0,
                itemCount: r.all_screenshots.length,
                groupCount: r.duplicate_groups.length > 0 ? r.duplicate_groups.length : null,
                savingsBytes: r.total_size_bytes,
            })
        }

        // Unorganized
        if (results.unorganized) {
            const r = results.unorganized as UnorganizedResult
            summaries.push({
                id: 'unorganized',
                name: 'Unorganized',
                icon: FolderSearch,
                color: 'text-emerald-400',
                bgColor: 'from-emerald-500/20 to-teal-600/20',
                hasResults: r.files.length > 0,
                itemCount: r.files.length,
                groupCount: null,
                savingsBytes: r.total_size_bytes,
            })
        }

        return summaries
    }

    const moduleSummaries = getModuleSummaries()
    const modulesWithFindings = moduleSummaries.filter(m => m.hasResults)
    const totalFindings = moduleSummaries.reduce((sum, m) => sum + m.itemCount, 0)

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute -inset-1 bg-brand-accent/40 blur-md rounded-xl" />
                            <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-brand-accent to-brand-primary flex items-center justify-center">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Library Scan Complete</h1>
                            <p className="text-sm text-text-secondary">
                                Analyzed in {formatDuration(results.duration_ms)}
                            </p>
                        </div>
                    </div>

                    <motion.button
                        onClick={onNewScan}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span className="font-medium">New Scan</span>
                    </motion.button>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="flex-shrink-0 p-6 border-b border-white/10">
                <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 rounded-xl border border-brand-primary/20">
                        <div className="flex items-center gap-2 text-brand-primary mb-2">
                            <TrendingUp className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Total Findings</span>
                        </div>
                        <p className="text-3xl font-black text-white">{totalFindings.toLocaleString()}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-brand-accent/10 to-transparent rounded-xl border border-brand-accent/20">
                        <div className="flex items-center gap-2 text-brand-accent mb-2">
                            <Sparkles className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Potential Savings</span>
                        </div>
                        <p className="text-3xl font-black text-white">{formatBytes(results.total_savings_bytes)}</p>
                    </div>

                    <div className="p-4 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-xl border border-emerald-500/20">
                        <div className="flex items-center gap-2 text-emerald-400 mb-2">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Modules Run</span>
                        </div>
                        <p className="text-3xl font-black text-white">{moduleSummaries.length}</p>
                    </div>
                </div>
            </div>

            {/* Module Results Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4">
                    Module Breakdown
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AnimatePresence>
                        {moduleSummaries.map((module, index) => {
                            const Icon = module.icon
                            const isHovered = hoveredModule === module.id

                            return (
                                <motion.button
                                    key={module.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    onClick={() => onNavigateToModule(module.id)}
                                    onMouseEnter={() => setHoveredModule(module.id)}
                                    onMouseLeave={() => setHoveredModule(null)}
                                    className={`
                    relative p-5 rounded-xl border text-left transition-all
                    ${module.hasResults
                                            ? 'border-white/15 bg-gradient-to-br hover:border-white/30'
                                            : 'border-white/5 bg-white/5'
                                        }
                    ${module.bgColor}
                  `}
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`
                      h-12 w-12 rounded-xl flex items-center justify-center
                      ${module.hasResults ? 'bg-white/10' : 'bg-white/5'}
                    `}>
                                            <Icon className={`w-6 h-6 ${module.color}`} />
                                        </div>

                                        <motion.div
                                            animate={{ x: isHovered ? 0 : -5, opacity: isHovered ? 1 : 0.5 }}
                                            className="flex items-center gap-1 text-text-secondary"
                                        >
                                            <span className="text-xs font-medium">View Details</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </motion.div>
                                    </div>

                                    <h3 className="text-lg font-bold text-white mb-1">{module.name}</h3>

                                    {module.hasResults ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-text-secondary">
                                                    {module.groupCount !== null ? 'Groups' : 'Items'} Found
                                                </span>
                                                <span className="text-sm font-bold text-white">
                                                    {module.groupCount !== null ? module.groupCount : module.itemCount}
                                                </span>
                                            </div>

                                            {module.groupCount !== null && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-text-secondary">Total Items</span>
                                                    <span className="text-sm font-bold text-white">{module.itemCount}</span>
                                                </div>
                                            )}

                                            {module.savingsBytes > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-text-secondary">Size</span>
                                                    <span className={`text-sm font-bold ${module.color}`}>
                                                        {formatBytes(module.savingsBytes)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-text-muted flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                            All clear – no issues found
                                        </p>
                                    )}
                                </motion.button>
                            )
                        })}
                    </AnimatePresence>
                </div>

                {modulesWithFindings.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-8 text-center p-12 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl"
                    >
                        <div className="inline-flex h-16 w-16 items-center justify-center bg-emerald-500/20 rounded-full mb-4">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Your Library is Clean!</h3>
                        <p className="text-text-secondary max-w-sm mx-auto">
                            No duplicates, similar photos, or organizational issues were found. Your photo library is in great shape.
                        </p>
                    </motion.div>
                )}
            </div>
        </div>
    )
}
