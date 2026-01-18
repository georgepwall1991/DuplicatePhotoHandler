import { motion } from 'framer-motion'
import { HardDrive, ImageIcon, Layers, TrendingDown, Clock, Zap } from 'lucide-react'
import type { ScanResult } from '../lib/types'

interface StatsDashboardProps {
    result: ScanResult
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function StatsDashboard({ result }: StatsDashboardProps) {
    const duplicateCount = result.groups.reduce((acc, g) => acc + g.photos.length - 1, 0)
    const duplicatePercentage = result.total_photos > 0
        ? ((duplicateCount / result.total_photos) * 100).toFixed(1)
        : '0'

    const stats = [
        {
            label: 'Photos Scanned',
            value: result.total_photos.toLocaleString(),
            icon: ImageIcon,
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/20',
        },
        {
            label: 'Duplicate Groups',
            value: result.groups.length.toLocaleString(),
            icon: Layers,
            color: 'text-amber-400',
            bgColor: 'bg-amber-500/10',
            borderColor: 'border-amber-500/20',
        },
        {
            label: 'Duplicates Found',
            value: duplicateCount.toLocaleString(),
            subvalue: `${duplicatePercentage}% of library`,
            icon: TrendingDown,
            color: 'text-red-400',
            bgColor: 'bg-red-500/10',
            borderColor: 'border-red-500/20',
        },
        {
            label: 'Space Recoverable',
            value: formatBytes(result.potential_savings_bytes),
            icon: HardDrive,
            color: 'text-emerald-400',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'border-emerald-500/20',
            highlight: true,
        },
        {
            label: 'Scan Duration',
            value: formatDuration(result.duration_ms),
            icon: Clock,
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/10',
            borderColor: 'border-purple-500/20',
        },
        {
            label: 'Scan Speed',
            value: result.duration_ms > 0
                ? `${Math.round(result.total_photos / (result.duration_ms / 1000))}/s`
                : '∞/s',
            icon: Zap,
            color: 'text-brand-primary',
            bgColor: 'bg-brand-primary/10',
            borderColor: 'border-brand-primary/20',
        },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stats.map((stat, index) => {
                const Icon = stat.icon
                return (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-4 rounded-lg border ${stat.bgColor} ${stat.borderColor} ${stat.highlight ? 'ring-1 ring-emerald-500/30' : ''
                            }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-4 h-4 ${stat.color}`} />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                {stat.label}
                            </span>
                        </div>
                        <div className={`text-xl font-black ${stat.highlight ? 'text-emerald-400' : 'text-white'}`}>
                            {stat.value}
                        </div>
                        {stat.subvalue && (
                            <div className="text-[10px] text-text-muted mt-0.5">{stat.subvalue}</div>
                        )}
                    </motion.div>
                )
            })}
        </div>
    )
}
