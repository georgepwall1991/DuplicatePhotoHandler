import { motion } from 'framer-motion'

interface SkeletonProps {
    className?: string
}

/**
 * Base skeleton element with shimmer animation.
 */
function SkeletonBase({ className = '' }: SkeletonProps) {
    return (
        <div
            className={`skeleton-shimmer rounded bg-white/[0.06] ${className}`}
            aria-hidden="true"
        />
    )
}

/**
 * Text line skeleton - simulates loading text.
 */
export function SkeletonLine({ className = '' }: SkeletonProps) {
    return <SkeletonBase className={`h-4 ${className}`} />
}

/**
 * Circle skeleton - for avatars/icons.
 */
export function SkeletonCircle({ className = '' }: SkeletonProps) {
    return <SkeletonBase className={`rounded-full aspect-square ${className}`} />
}

/**
 * Card skeleton - simulates a loading card.
 */
export function SkeletonCard({ className = '' }: SkeletonProps) {
    return (
        <div className={`glass-card rounded-xl p-4 ${className}`}>
            <div className="flex items-center gap-4">
                <SkeletonCircle className="w-12 h-12" />
                <div className="flex-1 space-y-2">
                    <SkeletonLine className="w-3/4" />
                    <SkeletonLine className="w-1/2" />
                </div>
            </div>
        </div>
    )
}

/**
 * History card skeleton - matches HistoryCard layout.
 */
export function SkeletonHistoryCard() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card rounded-xl p-4"
        >
            <div className="flex items-start gap-4">
                <SkeletonCircle className="w-10 h-10" />
                <div className="flex-1 space-y-3">
                    <SkeletonLine className="w-2/3" />
                    <SkeletonLine className="w-1/2" />
                    <div className="flex gap-4 pt-2">
                        <SkeletonLine className="w-20" />
                        <SkeletonLine className="w-24" />
                        <SkeletonLine className="w-16" />
                    </div>
                </div>
                <SkeletonLine className="w-20 h-8" />
            </div>
        </motion.div>
    )
}

/**
 * Recovery file skeleton - matches file list item layout.
 */
export function SkeletonRecoveryFile() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card rounded-xl p-4"
        >
            <div className="flex items-center gap-4">
                <SkeletonBase className="w-5 h-5 rounded" />
                <SkeletonBase className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                    <SkeletonLine className="w-1/3" />
                    <SkeletonLine className="w-1/4" />
                </div>
                <div className="text-right space-y-2">
                    <SkeletonLine className="w-16 ml-auto" />
                    <SkeletonLine className="w-12 ml-auto" />
                </div>
            </div>
        </motion.div>
    )
}

/**
 * Stats card skeleton - for dashboard stats.
 */
export function SkeletonStatCard() {
    return (
        <div className="glass-card rounded-xl p-4">
            <div className="space-y-2">
                <SkeletonLine className="w-20 h-3" />
                <SkeletonLine className="w-16 h-7" />
            </div>
        </div>
    )
}

/**
 * Skeleton list - renders multiple skeleton items with stagger.
 */
interface SkeletonListProps {
    count?: number
    type: 'history' | 'recovery' | 'card'
}

export function SkeletonList({ count = 5, type }: SkeletonListProps) {
    const Skeleton = {
        history: SkeletonHistoryCard,
        recovery: SkeletonRecoveryFile,
        card: SkeletonCard,
    }[type]

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={{
                hidden: { opacity: 1 },
                visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.08 }
                }
            }}
            className="space-y-3"
        >
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    variants={{
                        hidden: { opacity: 0 },
                        visible: { opacity: 1 }
                    }}
                >
                    <Skeleton />
                </motion.div>
            ))}
        </motion.div>
    )
}
