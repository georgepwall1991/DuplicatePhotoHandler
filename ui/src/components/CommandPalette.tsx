import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Search,
    Command,
    Layers,
    Images,
    HardDrive,
    Smartphone,
    FolderTree,
    FolderSearch,
    History,
    ShieldCheck,
    Settings,
    Zap,
    ArrowRight,
    Trash2,
    RefreshCw,
    Download,
    type LucideIcon,
} from 'lucide-react'
import type { ActiveModule } from '../lib/types'

interface CommandAction {
    id: string
    label: string
    category: 'navigation' | 'scan' | 'tools' | 'settings'
    icon: LucideIcon
    shortcut?: string
    description?: string
    action: () => void
}

interface CommandPaletteProps {
    isOpen: boolean
    onClose: () => void
    onNavigate: (module: ActiveModule) => void
    onNewScan: () => void
    onOpenSettings: () => void
}

// Simple fuzzy matching
function fuzzyMatch(query: string, text: string): boolean {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()

    // Simple substring match with word boundaries
    if (lowerText.includes(lowerQuery)) return true

    // Check if all query characters appear in order
    let qi = 0
    for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
        if (lowerText[i] === lowerQuery[qi]) qi++
    }
    return qi === lowerQuery.length
}

export function CommandPalette({
    isOpen,
    onClose,
    onNavigate,
    onNewScan,
    onOpenSettings,
}: CommandPaletteProps) {
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    // Define all available commands
    const commands = useMemo<CommandAction[]>(() => [
        // Navigation
        { id: 'nav-master', label: 'Full Library Guard', category: 'navigation', icon: ShieldCheck, description: 'Comprehensive library scan', action: () => onNavigate('master') },
        { id: 'nav-duplicates', label: 'Duplicates', category: 'navigation', icon: Layers, shortcut: 'D', description: 'Find exact matches', action: () => onNavigate('duplicates') },
        { id: 'nav-similar', label: 'Similar Photos', category: 'navigation', icon: Images, description: 'Find near matches', action: () => onNavigate('similar') },
        { id: 'nav-large', label: 'Large Files', category: 'navigation', icon: HardDrive, description: 'Find space hogs', action: () => onNavigate('large') },
        { id: 'nav-screenshots', label: 'Screenshots', category: 'navigation', icon: Smartphone, description: 'Find UI captures', action: () => onNavigate('screenshots') },
        { id: 'nav-organize', label: 'Organize', category: 'navigation', icon: FolderTree, description: 'Sort by date', action: () => onNavigate('organize') },
        { id: 'nav-unorganized', label: 'Unorganized', category: 'navigation', icon: FolderSearch, description: 'Find loose files', action: () => onNavigate('unorganized') },
        { id: 'nav-history', label: 'Scan History', category: 'navigation', icon: History, description: 'View past sessions', action: () => onNavigate('history') },

        // Scans
        { id: 'scan-new', label: 'New Scan', category: 'scan', icon: Zap, shortcut: 'N', description: 'Start a new scan', action: onNewScan },
        { id: 'scan-rescan', label: 'Rescan Current', category: 'scan', icon: RefreshCw, description: 'Repeat the last scan', action: onNewScan },

        // Tools
        { id: 'tools-export', label: 'Export Results', category: 'tools', icon: Download, description: 'Export as CSV or HTML', action: () => { } },
        { id: 'tools-trash', label: 'Empty Pixelift Trash', category: 'tools', icon: Trash2, description: 'Permanently delete', action: () => { } },

        // Settings
        { id: 'settings-open', label: 'Settings', category: 'settings', icon: Settings, shortcut: ',', description: 'App preferences', action: onOpenSettings },
    ], [onNavigate, onNewScan, onOpenSettings])

    // Filter commands based on query
    const filteredCommands = useMemo(() => {
        if (!query.trim()) return commands
        return commands.filter(cmd =>
            fuzzyMatch(query, cmd.label) ||
            fuzzyMatch(query, cmd.description || '') ||
            fuzzyMatch(query, cmd.category)
        )
    }, [query, commands])

    // Group filtered commands by category
    const groupedCommands = useMemo(() => {
        const groups: Record<string, CommandAction[]> = {}
        for (const cmd of filteredCommands) {
            if (!groups[cmd.category]) groups[cmd.category] = []
            groups[cmd.category].push(cmd)
        }
        return groups
    }, [filteredCommands])

    // Flat list for keyboard navigation
    const flatList = useMemo(() => filteredCommands, [filteredCommands])

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('')
            setSelectedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [isOpen])

    // Keep selected index in bounds
    useEffect(() => {
        if (selectedIndex >= flatList.length) {
            setSelectedIndex(Math.max(0, flatList.length - 1))
        }
    }, [flatList.length, selectedIndex])

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current && flatList.length > 0) {
            const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
            selected?.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex, flatList.length])

    const executeCommand = useCallback((cmd: CommandAction) => {
        cmd.action()
        onClose()
    }, [onClose])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1))
                break
            case 'ArrowUp':
                e.preventDefault()
                setSelectedIndex(prev => Math.max(prev - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                if (flatList[selectedIndex]) {
                    executeCommand(flatList[selectedIndex])
                }
                break
            case 'Escape':
                e.preventDefault()
                onClose()
                break
        }
    }, [flatList, selectedIndex, executeCommand, onClose])

    const categoryLabels: Record<string, string> = {
        navigation: 'Navigate',
        scan: 'Actions',
        tools: 'Tools',
        settings: 'Settings',
    }

    if (!isOpen) return null

    let flatIndex = -1

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
                    onClick={onClose}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Command Palette Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-xl bg-surface-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {/* Search Input */}
                        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
                            <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search commands..."
                                className="flex-1 bg-transparent text-white text-lg placeholder:text-text-muted focus:outline-none"
                            />
                            <div className="flex items-center gap-1 text-xs text-text-muted">
                                <Command className="w-3.5 h-3.5" />
                                <span>K</span>
                            </div>
                        </div>

                        {/* Results */}
                        <div ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                            {flatList.length === 0 ? (
                                <div className="px-4 py-8 text-center text-text-muted">
                                    No commands found for "{query}"
                                </div>
                            ) : (
                                <div className="py-2">
                                    {Object.entries(groupedCommands).map(([category, cmds]) => (
                                        <div key={category}>
                                            <div className="px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                                                {categoryLabels[category] || category}
                                            </div>
                                            {cmds.map((cmd) => {
                                                flatIndex = flatList.indexOf(cmd)
                                                const isSelected = flatIndex === selectedIndex
                                                const Icon = cmd.icon

                                                return (
                                                    <button
                                                        key={cmd.id}
                                                        data-index={flatIndex}
                                                        onClick={() => executeCommand(cmd)}
                                                        onMouseEnter={() => setSelectedIndex(flatIndex)}
                                                        className={`
                              w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                              ${isSelected ? 'bg-brand-primary/20 text-white' : 'text-text-secondary hover:bg-white/5'}
                            `}
                                                    >
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-brand-primary/30 text-brand-primary' : 'bg-white/5 text-text-muted'}`}>
                                                            <Icon className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-sm truncate">{cmd.label}</div>
                                                            {cmd.description && (
                                                                <div className="text-xs text-text-muted truncate">{cmd.description}</div>
                                                            )}
                                                        </div>
                                                        {cmd.shortcut && (
                                                            <div className="text-xs border border-white/10 rounded px-1.5 py-0.5 text-text-muted">
                                                                {cmd.shortcut}
                                                            </div>
                                                        )}
                                                        {isSelected && (
                                                            <ArrowRight className="w-4 h-4 text-brand-primary flex-shrink-0" />
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-2.5 border-t border-white/10 flex items-center justify-between text-xs text-text-muted">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">↑↓</kbd>
                                    Navigate
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">↵</kbd>
                                    Select
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">esc</kbd>
                                    Close
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
