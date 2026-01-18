import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, FileText, FileSpreadsheet, Code, X, Check, Loader2 } from 'lucide-react'
import { invoke } from '../lib/tauri'

type ExportFormat = 'csv' | 'json' | 'html'

interface ExportModalProps {
    isOpen: boolean
    onClose: () => void
    duplicateCount: number
    groupCount: number
}

interface ExportResult {
    path: string
    groups_exported: number
}

export function ExportModal({
    isOpen,
    onClose,
    duplicateCount,
    groupCount,
}: ExportModalProps) {
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv')
    const [isExporting, setIsExporting] = useState(false)
    const [exportResult, setExportResult] = useState<ExportResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const formats: { id: ExportFormat; name: string; icon: typeof FileText; description: string }[] = [
        {
            id: 'csv',
            name: 'CSV Spreadsheet',
            icon: FileSpreadsheet,
            description: 'Open in Excel, Numbers, or Google Sheets',
        },
        {
            id: 'json',
            name: 'JSON Data',
            icon: Code,
            description: 'Machine-readable format for developers',
        },
        {
            id: 'html',
            name: 'HTML Report',
            icon: FileText,
            description: 'Shareable visual report with thumbnails',
        },
    ]

    const handleExport = async () => {
        setIsExporting(true)
        setError(null)
        setExportResult(null)

        try {
            let result: ExportResult

            if (selectedFormat === 'csv') {
                result = await invoke<ExportResult>('export_results_csv', {})
            } else if (selectedFormat === 'html') {
                result = await invoke<ExportResult>('export_results_html', {
                    reportTitle: `Pixelift Duplicate Report - ${new Date().toLocaleDateString()}`,
                })
            } else {
                // JSON export - use client-side download
                const scanResult = await invoke<{ groups: unknown[] }>('get_results', {})
                if (scanResult) {
                    const blob = new Blob([JSON.stringify(scanResult, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `pixelift-export-${Date.now()}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                    result = { path: 'Downloaded', groups_exported: groupCount }
                } else {
                    throw new Error('No scan results available')
                }
            }

            setExportResult(result)
        } catch (err) {
            setError(String(err))
        } finally {
            setIsExporting(false)
        }
    }

    const handleReset = () => {
        setExportResult(null)
        setError(null)
    }

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
                    className="w-full max-w-md glass-strong border border-white/10 shadow-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-5 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-brand-primary/20 flex items-center justify-center">
                                <Download className="w-5 h-5 text-brand-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Export Results</h3>
                                <p className="text-xs text-text-muted">
                                    {groupCount} groups • {duplicateCount} duplicates found
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

                    {/* Content */}
                    <div className="p-5">
                        {exportResult ? (
                            // Success state
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center py-6"
                            >
                                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-8 h-8 text-green-400" />
                                </div>
                                <h4 className="text-lg font-bold text-white mb-2">Export Complete!</h4>
                                <p className="text-sm text-text-secondary mb-4">
                                    {exportResult.groups_exported} groups exported successfully
                                </p>
                                <p className="text-xs text-text-muted font-mono bg-white/5 p-2 rounded truncate">
                                    {exportResult.path}
                                </p>
                                <div className="mt-6 flex gap-3 justify-center">
                                    <button
                                        onClick={handleReset}
                                        className="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
                                    >
                                        Export Another
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="px-6 py-2 bg-brand-primary hover:bg-brand-secondary text-white text-sm font-bold transition-colors"
                                    >
                                        Done
                                    </button>
                                </div>
                            </motion.div>
                        ) : error ? (
                            // Error state
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center py-6"
                            >
                                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                                    <X className="w-8 h-8 text-red-400" />
                                </div>
                                <h4 className="text-lg font-bold text-white mb-2">Export Failed</h4>
                                <p className="text-sm text-text-secondary mb-4">{error}</p>
                                <button
                                    onClick={handleReset}
                                    className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-colors"
                                >
                                    Try Again
                                </button>
                            </motion.div>
                        ) : (
                            // Format selection
                            <>
                                <div className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">
                                    Export Format
                                </div>
                                <div className="space-y-2">
                                    {formats.map((format) => {
                                        const Icon = format.icon
                                        const isSelected = selectedFormat === format.id
                                        return (
                                            <button
                                                key={format.id}
                                                onClick={() => setSelectedFormat(format.id)}
                                                className={`w-full p-4 text-left transition-all flex items-center gap-4 border ${isSelected
                                                        ? 'bg-brand-primary/10 border-brand-primary/30'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-brand-primary/20' : 'bg-white/10'
                                                        }`}
                                                >
                                                    <Icon
                                                        className={`w-5 h-5 ${isSelected ? 'text-brand-primary' : 'text-text-muted'
                                                            }`}
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <div
                                                        className={`font-semibold ${isSelected ? 'text-white' : 'text-text-secondary'
                                                            }`}
                                                    >
                                                        {format.name}
                                                    </div>
                                                    <div className="text-xs text-text-muted">{format.description}</div>
                                                </div>
                                                {isSelected && (
                                                    <div className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center">
                                                        <Check className="w-3 h-3 text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    {!exportResult && !error && (
                        <div className="p-5 border-t border-white/5 flex items-center justify-end gap-3">
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 text-sm text-text-muted hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                className="px-6 py-2.5 bg-brand-primary hover:bg-brand-secondary disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center gap-2"
                            >
                                {isExporting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4" />
                                        Export
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
