import { motion } from 'framer-motion'
import { Cpu, Zap, Target, Shield, ChevronDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { Tooltip } from './Tooltip'

export type Algorithm = 'average' | 'difference' | 'perceptual' | 'fusion'

interface AlgorithmSelectorProps {
    algorithm: Algorithm
    onAlgorithmChange: (value: Algorithm) => void
}

interface AlgorithmOption {
    id: Algorithm
    name: string
    shortDesc: string
    tooltip: string
    icon: typeof Zap
    color: string
    bgColor: string
}

const algorithms: AlgorithmOption[] = [
    {
        id: 'average',
        name: 'Quick',
        shortDesc: 'Fast scan',
        tooltip: 'Average Hash (aHash) — Fastest mode, best for finding exact copies. May miss heavily edited photos.',
        icon: Zap,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-400/10 border-yellow-400/30',
    },
    {
        id: 'difference',
        name: 'Balanced',
        shortDesc: 'Recommended',
        tooltip: 'Difference Hash (dHash) — Great balance of speed and accuracy. Handles resizing and minor crops well.',
        icon: Target,
        color: 'text-purple-400',
        bgColor: 'bg-purple-400/10 border-purple-400/30',
    },
    {
        id: 'perceptual',
        name: 'Deep',
        shortDesc: 'Edited photos',
        tooltip: 'Perceptual Hash (pHash) — Best for finding photos with filters, compression, or color adjustments.',
        icon: Cpu,
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/10 border-blue-400/30',
    },
    {
        id: 'fusion',
        name: 'Maximum',
        shortDesc: 'Highest accuracy',
        tooltip: 'Fusion Mode — Combines all 3 algorithms. Only marks duplicates if 2+ agree. Best for irreplaceable photos.',
        icon: Shield,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/10 border-emerald-400/30',
    },
]

export function AlgorithmSelector({ algorithm, onAlgorithmChange }: AlgorithmSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const selected = algorithms.find(a => a.id === algorithm) || algorithms[1]
    const Icon = selected.icon

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    return (
        <div ref={dropdownRef} className="relative">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4 transition-all duration-300 border-white/5"
            >
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <Cpu className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500">Mode</span>
                </div>

                {/* Selected Algorithm Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full p-3 rounded-lg border transition-all ${selected.bgColor} flex items-center justify-between hover:scale-[1.01] active:scale-[0.99]`}
                >
                    <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${selected.color}`} />
                        <div className="text-left">
                            <div className="text-sm font-bold text-white leading-tight">{selected.name}</div>
                            <div className="text-[9px] text-white/50 uppercase tracking-wider">{selected.shortDesc}</div>
                        </div>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-white/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </motion.div>

            {/* Dropdown - positioned above to avoid footer overlap */}
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute left-0 right-0 bottom-full mb-2 z-50 glass-card border border-white/10 rounded-lg overflow-hidden shadow-2xl"
                >
                    {algorithms.map((algo) => {
                        const AlgoIcon = algo.icon
                        const isSelected = algo.id === algorithm
                        return (
                            <Tooltip key={algo.id} content={algo.tooltip} position="bottom" delay={400}>
                                <button
                                    onClick={() => {
                                        onAlgorithmChange(algo.id)
                                        setIsOpen(false)
                                    }}
                                    className={`w-full p-3 flex items-center gap-3 transition-all hover:bg-white/5 ${isSelected ? 'bg-white/5' : ''
                                        }`}
                                >
                                    <div className={`p-1.5 rounded ${algo.bgColor}`}>
                                        <AlgoIcon className={`w-3.5 h-3.5 ${algo.color}`} />
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <div className="text-sm font-bold text-white">{algo.name}</div>
                                        <div className="text-[9px] text-gray-500 uppercase tracking-wider truncate">{algo.shortDesc}</div>
                                    </div>
                                    {isSelected && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    )}
                                </button>
                            </Tooltip>
                        )
                    })}
                </motion.div>
            )}
        </div>
    )
}
