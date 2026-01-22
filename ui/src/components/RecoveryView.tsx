import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '../lib/tauri'
import type { TrashedFile, TrashedFilesResult } from '../lib/types'
import {
    RotateCcw,
    Trash2,
    Clock,
    HardDrive,
    AlertCircle,
    CheckCircle,
    RefreshCw,
    FolderOpen,
} from 'lucide-react'
import { useToast } from './Toast'
import { ConfirmModal } from './ConfirmModal'
import { Confetti } from './Confetti'
import { SkeletonList, SkeletonStatCard } from './SkeletonLoader'

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatTimeAgo(timestamp: number): string {
    const now = Date.now() / 1000
    const diff = now - timestamp

    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return new Date(timestamp * 1000).toLocaleDateString()
}

export function RecoveryView() {
    const [trashedFiles, setTrashedFiles] = useState<TrashedFile[]>([])
    const [totalSize, setTotalSize] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [isRestoring, setIsRestoring] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [showCelebration, setShowCelebration] = useState(false)
    const { showToast } = useToast()

    const loadTrashedFiles = useCallback(async () => {
        setIsLoading(true)
        try {
            const result = await invoke<TrashedFilesResult>('get_trashed_files')
            setTrashedFiles(result.files)
            setTotalSize(result.total_size_bytes)
        } catch (error) {
            console.error('Failed to load trashed files:', error)
            showToast('Failed to load trashed files', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadTrashedFiles()
    }, [loadTrashedFiles])

    const toggleFile = (filename: string) => {
        const newSelected = new Set(selectedFiles)
        if (newSelected.has(filename)) {
            newSelected.delete(filename)
        } else {
            newSelected.add(filename)
        }
        setSelectedFiles(newSelected)
    }

    const selectAll = () => {
        setSelectedFiles(new Set(trashedFiles.map(f => f.filename)))
    }

    const clearSelection = () => {
        setSelectedFiles(new Set())
    }

    const handleRestore = async () => {
        if (selectedFiles.size === 0) return

        setIsRestoring(true)
        try {
            const filenames = Array.from(selectedFiles)
            const result = await invoke<{ restored: number; errors: string[] }>('restore_from_trash', {
                filenames,
            })

            if (result.restored > 0) {
                showToast(`Restored ${result.restored} file(s) successfully`, 'success')
                setShowCelebration(true)
                setTimeout(() => setShowCelebration(false), 3000)
                // Refresh the list
                await loadTrashedFiles()
                setSelectedFiles(new Set())
            }

            if (result.errors.length > 0) {
                showToast(`${result.errors.length} file(s) failed to restore`, 'warning')
                console.warn('Restore errors:', result.errors)
            }
        } catch (error) {
            console.error('Failed to restore files:', error)
            showToast(`Restore failed: ${error}`, 'error')
        } finally {
            setIsRestoring(false)
            setShowConfirm(false)
        }
    }

    const selectedSize = Array.from(selectedFiles).reduce((acc, filename) => {
        const file = trashedFiles.find(f => f.filename === filename)
        return acc + (file?.size_bytes || 0)
    }, 0)

    return (
        <div className="flex-1 flex flex-col relative overflow-hidden">
            {/* Celebration */}
            <Confetti isActive={showCelebration} />

            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                                <RotateCcw className="w-6 h-6" />
                            </div>
                            Recovery Zone
                        </h1>
                        <p className="text-sm text-text-secondary mt-1">
                            Restore files that were deleted via Pixelift
                        </p>
                    </div>

                    <button
                        onClick={loadTrashedFiles}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-all border border-white/5"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Stats */}
                <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="glass-card rounded-xl p-4">
                        <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider mb-1">
                            <Trash2 className="w-3.5 h-3.5" />
                            In Recovery
                        </div>
                        <div className="text-2xl font-bold text-white">{trashedFiles.length}</div>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider mb-1">
                            <HardDrive className="w-3.5 h-3.5" />
                            Total Size
                        </div>
                        <div className="text-2xl font-bold text-amber-400">{formatBytes(totalSize)}</div>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wider mb-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Selected
                        </div>
                        <div className="text-2xl font-bold text-brand-primary">{selectedFiles.size}</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 pb-32 custom-scrollbar">
                {isLoading ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <SkeletonStatCard />
                            <SkeletonStatCard />
                            <SkeletonStatCard />
                        </div>
                        <SkeletonList count={5} type="recovery" />
                    </div>
                ) : trashedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                            <CheckCircle className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2">Recovery Zone Empty</h3>
                        <p className="text-sm text-text-secondary max-w-sm">
                            Files you delete via Pixelift will appear here for easy recovery.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {/* Select All Bar */}
                        <div className="flex items-center justify-between mb-4">
                            <button
                                onClick={selectedFiles.size === trashedFiles.length ? clearSelection : selectAll}
                                className="text-sm text-text-secondary hover:text-white transition-colors"
                            >
                                {selectedFiles.size === trashedFiles.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <span className="text-xs text-text-muted">
                                {trashedFiles.length} file{trashedFiles.length !== 1 ? 's' : ''} in recovery
                            </span>
                        </div>

                        {/* File List */}
                        <AnimatePresence>
                            {trashedFiles.map((file) => {
                                const isSelected = selectedFiles.has(file.filename)

                                return (
                                    <motion.div
                                        key={file.filename}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className={`
                      glass-card rounded-xl p-4 cursor-pointer transition-all
                      ${isSelected ? 'border-brand-primary/50 bg-brand-primary/10' : ''}
                    `}
                                        onClick={() => toggleFile(file.filename)}
                                    >
                                        <div className="flex items-center gap-4">
                                            {/* Checkbox */}
                                            <div className={`
                        w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                        ${isSelected
                                                    ? 'bg-brand-primary border-brand-primary'
                                                    : 'border-white/30 hover:border-white/50'}
                      `}>
                                                {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                            </div>

                                            {/* File Icon */}
                                            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                                <Trash2 className="w-5 h-5 text-text-muted" />
                                            </div>

                                            {/* File Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-white truncate">{file.filename}</div>
                                                <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                                                    <span className="flex items-center gap-1">
                                                        <FolderOpen className="w-3 h-3" />
                                                        <span className="truncate max-w-[200px]">{file.original_path}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Size and Time */}
                                            <div className="text-right flex-shrink-0">
                                                <div className="text-sm font-medium text-white">{formatBytes(file.size_bytes)}</div>
                                                <div className="text-xs text-text-muted flex items-center gap-1 justify-end">
                                                    <Clock className="w-3 h-3" />
                                                    {formatTimeAgo(file.trashed_at)}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Action Bar */}
            <AnimatePresence>
                {selectedFiles.size > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-surface-950 via-surface-950/95 to-transparent pt-12"
                    >
                        <div className="glass-panel rounded-2xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="text-sm">
                                    <span className="text-text-muted">Selected:</span>{' '}
                                    <span className="text-white font-semibold">{selectedFiles.size} files</span>
                                    <span className="text-text-muted"> · </span>
                                    <span className="text-amber-400 font-semibold">{formatBytes(selectedSize)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={clearSelection}
                                    className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white transition-all border border-white/5"
                                >
                                    Cancel
                                </button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setShowConfirm(true)}
                                    disabled={isRestoring}
                                    className="px-6 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
                                    {isRestoring ? 'Restoring...' : 'Restore'}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirmation Modal */}
            <ConfirmModal
                isOpen={showConfirm}
                title="Restore Files"
                message={
                    <>
                        Restore <span className="text-white font-semibold">{selectedFiles.size} files</span> to their original locations?
                        <br />
                        <span className="text-sm text-gray-500">Files will be moved out of Trash back to where they were.</span>
                    </>
                }
                confirmLabel="Restore"
                loadingLabel="Restoring..."
                isLoading={isRestoring}
                variant="info"
                onConfirm={handleRestore}
                onCancel={() => setShowConfirm(false)}
            />

            {/* Warning for old files */}
            {trashedFiles.some(f => (Date.now() / 1000) - f.trashed_at > 604800) && (
                <div className="absolute top-24 right-6 max-w-xs">
                    <div className="glass-card rounded-xl p-3 border-amber-500/30 bg-amber-500/10">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-200">
                                Some files have been in recovery for over a week. Consider restoring or permanently deleting them.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
