import { motion } from 'framer-motion'
import {
    Trash2,
    Download,
    RotateCcw,
    Wand2,
    FolderOpen
} from 'lucide-react'

interface QuickActionsProps {
    onAutoSelect: () => void
    onDeleteSelected: () => void
    onExport: () => void
    onUndo: () => void
    onOpenFolder: () => void
    hasSelection: boolean
    canUndo: boolean
    selectedCount: number
}

export function QuickActions({
    onAutoSelect,
    onDeleteSelected,
    onExport,
    onUndo,
    onOpenFolder,
    hasSelection,
    canUndo,
    selectedCount,
}: QuickActionsProps) {
    const actions = [
        {
            label: 'AI Select',
            icon: Wand2,
            onClick: onAutoSelect,
            variant: 'primary' as const,
            disabled: false,
        },
        {
            label: hasSelection ? `Trash(${selectedCount})` : 'Trash Selected',
            icon: Trash2,
            onClick: onDeleteSelected,
            variant: 'danger' as const,
            disabled: !hasSelection,
        },
        {
            label: 'Undo',
            icon: RotateCcw,
            onClick: onUndo,
            variant: 'default' as const,
            disabled: !canUndo,
        },
        {
            label: 'Export',
            icon: Download,
            onClick: onExport,
            variant: 'default' as const,
            disabled: false,
        },
        {
            label: 'Open Folder',
            icon: FolderOpen,
            onClick: onOpenFolder,
            variant: 'default' as const,
            disabled: !hasSelection,
        },
    ]

    const variantStyles = {
        primary: 'bg-brand-primary hover:bg-brand-secondary text-white shadow-lg shadow-brand-primary/20',
        danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
        default: 'bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white border border-white/10',
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {actions.map((action, index) => {
                const Icon = action.icon
                return (
                    <motion.button
                        key={action.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={action.onClick}
                        disabled={action.disabled}
                        className={`
              flex items - center gap - 2 px - 4 py - 2.5 rounded - lg transition - all
              ${variantStyles[action.variant]}
              ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}
`}
                    >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">{action.label}</span>
                    </motion.button>
                )
            })}
        </div>
    )
}
