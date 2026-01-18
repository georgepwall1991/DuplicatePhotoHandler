import { motion, AnimatePresence } from 'framer-motion'
import { Undo2, Redo2, X } from 'lucide-react'
import type { UndoAction } from '../hooks/useUndo'

interface UndoToastProps {
    action: UndoAction | null
    canUndo: boolean
    canRedo: boolean
    isProcessing: boolean
    onUndo: () => void
    onRedo: () => void
    onDismiss: () => void
}

export function UndoToast({
    action,
    canUndo,
    canRedo,
    isProcessing,
    onUndo,
    onRedo,
    onDismiss,
}: UndoToastProps) {
    if (!action) return null

    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modKey = isMac ? '⌘' : 'Ctrl'

    return (
        <AnimatePresence>
            {canUndo && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.9 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                >
                    <div className="glass-strong border border-white/10 shadow-2xl px-5 py-3 flex items-center gap-4 rounded-lg">
                        {/* Message */}
                        <div className="text-sm text-white">
                            <span className="font-medium">{action.files.length}</span>
                            <span className="text-text-secondary ml-1">
                                {action.files.length === 1 ? 'file' : 'files'} moved to trash
                            </span>
                        </div>

                        {/* Undo Button */}
                        <button
                            onClick={onUndo}
                            disabled={isProcessing || !canUndo}
                            className="flex items-center gap-2 px-3 py-1.5 bg-brand-primary/20 hover:bg-brand-primary/30 text-brand-primary transition-colors rounded disabled:opacity-50"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold uppercase tracking-wide">Undo</span>
                            <span className="text-[10px] text-brand-primary/70 ml-1">{modKey}Z</span>
                        </button>

                        {/* Redo Button (if available) */}
                        {canRedo && (
                            <button
                                onClick={onRedo}
                                disabled={isProcessing}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-colors rounded disabled:opacity-50"
                            >
                                <Redo2 className="w-3.5 h-3.5" />
                                <span className="text-xs font-bold uppercase tracking-wide">Redo</span>
                                <span className="text-[10px] text-text-muted ml-1">{modKey}⇧Z</span>
                            </button>
                        )}

                        {/* Dismiss */}
                        <button
                            onClick={onDismiss}
                            className="text-text-muted hover:text-white transition-colors ml-2"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
