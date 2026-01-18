import { motion, AnimatePresence } from 'framer-motion'
import { Clock, RotateCcw, Trash2, X, ImageIcon } from 'lucide-react'
import type { UndoAction } from '../hooks/useUndo'

interface UndoTimelineProps {
    isOpen: boolean
    onClose: () => void
    actions: UndoAction[]
    onRestoreAction: (action: UndoAction) => Promise<void>
    isProcessing: boolean
}

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)

    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
}

function getActionIcon(type: string) {
    switch (type) {
        case 'delete':
            return Trash2
        default:
            return ImageIcon
    }
}

export function UndoTimeline({
    isOpen,
    onClose,
    actions,
    onRestoreAction,
    isProcessing,
}: UndoTimelineProps) {
    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="w-full max-w-lg glass-strong border border-white/10 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-brand-primary/20 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-brand-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Action History</h3>
                                <p className="text-xs text-text-muted">
                                    {actions.length} action{actions.length !== 1 ? 's' : ''} available to undo
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-text-muted hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Timeline */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {actions.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                    <Clock className="w-8 h-8 text-text-muted" />
                                </div>
                                <p className="text-text-muted font-medium">No recent actions</p>
                                <p className="text-xs text-text-muted/70 mt-1">
                                    Deleted files will appear here
                                </p>
                            </div>
                        ) : (
                            <div className="p-4">
                                {actions.map((action, index) => {
                                    const Icon = getActionIcon(action.type)
                                    const isFirst = index === 0

                                    return (
                                        <motion.div
                                            key={action.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="relative"
                                        >
                                            {/* Timeline line */}
                                            {index < actions.length - 1 && (
                                                <div className="absolute left-5 top-12 bottom-0 w-px bg-white/10" />
                                            )}

                                            <div className={`flex items-start gap-4 p-3 rounded-lg transition-colors ${isFirst ? 'bg-brand-primary/5 border border-brand-primary/20' : 'hover:bg-white/5'
                                                }`}>
                                                {/* Icon */}
                                                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isFirst
                                                    ? 'bg-brand-primary/20 text-brand-primary'
                                                    : 'bg-white/10 text-text-muted'
                                                    }`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`font-semibold text-sm ${isFirst ? 'text-white' : 'text-text-secondary'}`}>
                                                            {action.description}
                                                        </span>
                                                        {isFirst && (
                                                            <span className="px-1.5 py-0.5 bg-brand-primary/20 text-brand-primary text-[9px] font-bold uppercase tracking-wider rounded">
                                                                Latest
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {action.files.length} file{action.files.length !== 1 ? 's' : ''} • {formatTimeAgo(action.timestamp)}
                                                    </div>

                                                    {/* File list preview */}
                                                    {action.files.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1">
                                                            {action.files.slice(0, 3).map((file, i) => (
                                                                <span
                                                                    key={i}
                                                                    className="px-2 py-0.5 bg-white/5 text-[10px] text-text-muted font-mono truncate max-w-[150px]"
                                                                >
                                                                    {file}
                                                                </span>
                                                            ))}
                                                            {action.files.length > 3 && (
                                                                <span className="px-2 py-0.5 bg-white/5 text-[10px] text-text-muted">
                                                                    +{action.files.length - 3} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Restore button */}
                                                <button
                                                    onClick={() => onRestoreAction(action)}
                                                    disabled={isProcessing}
                                                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded transition-all ${isFirst
                                                        ? 'bg-brand-primary hover:bg-brand-secondary text-white'
                                                        : 'bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white'
                                                        } disabled:opacity-50`}
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Restore</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/5 flex items-center justify-between text-xs text-text-muted flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-white/10 rounded font-mono">⌘Z</kbd>
                            <span>Undo latest</span>
                        </div>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-colors rounded"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
