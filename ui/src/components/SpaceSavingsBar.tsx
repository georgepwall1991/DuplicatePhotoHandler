import { motion } from 'framer-motion'
import { useSpaceSavings } from '../context/SpaceSavingsContext'
import { TrendingUp, Award, Target, Sparkles } from 'lucide-react'
import { AnimatedBytes } from './AnimatedCounter'

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function SpaceSavingsBar() {
    const {
        sessionBytes,
        lifetimeBytes,
        nextMilestone,
        progressToNextMilestone,
        lastMilestone,
    } = useSpaceSavings()

    return (
        <div className="space-savings-bar glass-panel-subtle rounded-xl p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-text-secondary text-xs font-medium uppercase tracking-wider">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Space Recovered
                </div>
                {lastMilestone && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primary text-xs"
                    >
                        <Award className="w-3 h-3" />
                        {lastMilestone.label}
                    </motion.div>
                )}
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-2 gap-3">
                {/* Session */}
                <div className="text-center">
                    <motion.div
                        key={sessionBytes > 0 ? 'has-session' : 'no-session'}
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="text-lg font-bold text-text-primary"
                    >
                        <AnimatedBytes bytes={sessionBytes} className="text-emerald-400" />
                    </motion.div>
                    <div className="text-xs text-text-tertiary">This Session</div>
                </div>

                {/* Lifetime */}
                <div className="text-center">
                    <div className="text-lg font-bold">
                        <AnimatedBytes bytes={lifetimeBytes} className="text-brand-secondary" />
                    </div>
                    <div className="text-xs text-text-tertiary">All Time</div>
                </div>
            </div>

            {/* Progress to Next Milestone */}
            {nextMilestone && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-text-secondary">
                            <Target className="w-3 h-3" />
                            <span>Next: {nextMilestone.label}</span>
                        </div>
                        <span className="text-text-tertiary">{Math.round(progressToNextMilestone)}%</span>
                    </div>
                    <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressToNextMilestone}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                    </div>
                </div>
            )}

            {/* All milestones achieved */}
            {!nextMilestone && lifetimeBytes > 0 && (
                <div className="flex items-center justify-center gap-2 text-xs text-brand-primary py-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>All milestones achieved!</span>
                    <Sparkles className="w-3.5 h-3.5" />
                </div>
            )}
        </div>
    )
}
