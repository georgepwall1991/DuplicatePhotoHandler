import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'

interface ShortcutsHelpProps {
    isOpen: boolean
    onClose: () => void
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="relative w-full max-w-2xl bg-surface-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Decorative header */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent" />

                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
                                        <Keyboard className="w-6 h-6 text-brand-primary" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Keyboard Shortcuts</h2>
                                        <p className="text-sm text-text-muted">Power user navigation guide</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <ShortcutSection title="Navigation">
                                        <ShortcutRow keys={['j', '↓']} label="Next Group" />
                                        <ShortcutRow keys={['k', '↑']} label="Previous Group" />
                                        <ShortcutRow keys={['Space']} label="Expand/Collapse Group" />
                                        <ShortcutRow keys={['Enter']} label="View Details / Preview" />
                                    </ShortcutSection>

                                    <ShortcutSection title="Selection">
                                        <ShortcutRow keys={['a']} label="Select All Duplicates" />
                                        <ShortcutRow keys={['d']} label="Clear Selection" />
                                    </ShortcutSection>
                                </div>

                                <div className="space-y-6">
                                    <ShortcutSection title="Actions">
                                        <ShortcutRow keys={['Delete']} label="Move to Trash" />
                                        <ShortcutRow keys={['Cmd', 'Z']} label="Undo Last Trash" />
                                        <ShortcutRow keys={['Cmd', 'Shift', 'Z']} label="Redo Trash" />
                                        <ShortcutRow keys={['/']} label="Focus Search" />
                                    </ShortcutSection>

                                    <ShortcutSection title="Comparison View">
                                        <ShortcutRow keys={['1', '←']} label="Keep Photo A" />
                                        <ShortcutRow keys={['2', '→']} label="Keep Photo B" />
                                        <ShortcutRow keys={['b']} label="Keep Both" />
                                        <ShortcutRow keys={['Scroll']} label="Zoom Image" />
                                    </ShortcutSection>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/5 flex justify-center text-xs text-text-muted">
                                Press <span className="mx-1.5 px-1.5 py-0.5 bg-white/10 rounded font-mono text-white">?</span> anytime to show this guide
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

function ShortcutSection({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-brand-secondary mb-4">{title}</h3>
            <div className="space-y-2">
                {children}
            </div>
        </div>
    )
}

function ShortcutRow({ keys, label }: { keys: string[], label: string }) {
    return (
        <div className="flex items-center justify-between group">
            <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{label}</span>
            <div className="flex items-center gap-1">
                {keys.map((k, i) => (
                    <kbd key={i} className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-white/5 border border-white/10 rounded text-[10px] font-bold font-mono text-gray-400 shadow-sm">
                        {k}
                    </kbd>
                ))}
            </div>
        </div>
    )
}
