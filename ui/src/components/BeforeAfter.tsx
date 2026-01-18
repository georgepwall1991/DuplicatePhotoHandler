import { motion } from 'framer-motion'
import { ArrowRight, HardDrive, ImageIcon, Sparkles } from 'lucide-react'

interface BeforeAfterProps {
    totalPhotos: number
    duplicateCount: number
    totalSize: number
    reclaimableSize: number
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function BeforeAfter({
    totalPhotos,
    duplicateCount,
    totalSize,
    reclaimableSize,
}: BeforeAfterProps) {
    const afterPhotos = totalPhotos - duplicateCount
    const afterSize = totalSize - reclaimableSize
    const percentReduction = totalPhotos > 0 ? ((duplicateCount / totalPhotos) * 100).toFixed(0) : '0'

    return (
        <div className="glass-strong border border-white/10 rounded-xl p-6 overflow-hidden relative">
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-emerald-500/5 pointer-events-none" />

            <div className="relative flex items-center justify-between gap-8">
                {/* Before */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 text-center"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full mb-4">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Before</span>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-center gap-2 text-text-muted mb-1">
                                <ImageIcon className="w-4 h-4" />
                                <span className="text-xs font-medium">Photos</span>
                            </div>
                            <div className="text-3xl font-black text-white">{totalPhotos.toLocaleString()}</div>
                        </div>

                        <div>
                            <div className="flex items-center justify-center gap-2 text-text-muted mb-1">
                                <HardDrive className="w-4 h-4" />
                                <span className="text-xs font-medium">Storage</span>
                            </div>
                            <div className="text-2xl font-bold text-text-secondary">{formatBytes(totalSize)}</div>
                        </div>
                    </div>
                </motion.div>

                {/* Arrow */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col items-center gap-2"
                >
                    <div className="w-12 h-12 rounded-full bg-brand-primary/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-brand-primary" />
                    </div>
                    <ArrowRight className="w-6 h-6 text-brand-primary" />
                    <div className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">
                        -{percentReduction}%
                    </div>
                </motion.div>

                {/* After */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex-1 text-center"
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">After</span>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-center gap-2 text-text-muted mb-1">
                                <ImageIcon className="w-4 h-4" />
                                <span className="text-xs font-medium">Photos</span>
                            </div>
                            <div className="text-3xl font-black text-emerald-400">{afterPhotos.toLocaleString()}</div>
                        </div>

                        <div>
                            <div className="flex items-center justify-center gap-2 text-text-muted mb-1">
                                <HardDrive className="w-4 h-4" />
                                <span className="text-xs font-medium">Storage</span>
                            </div>
                            <div className="text-2xl font-bold text-emerald-400/80">{formatBytes(afterSize)}</div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Savings highlight */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 pt-6 border-t border-white/5 text-center"
            >
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-emerald-500/10 to-brand-primary/10 border border-emerald-500/20 rounded-full">
                    <HardDrive className="w-5 h-5 text-emerald-400" />
                    <div>
                        <span className="text-xs text-text-muted mr-2">You can recover</span>
                        <span className="text-lg font-black text-emerald-400">{formatBytes(reclaimableSize)}</span>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
