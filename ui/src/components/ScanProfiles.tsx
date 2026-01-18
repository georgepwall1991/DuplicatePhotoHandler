import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, FolderOpen, Trash2, ChevronDown, Bookmark, Plus, Check } from 'lucide-react'
import type { Algorithm } from './AlgorithmSelector'

export interface ScanProfile {
    id: string
    name: string
    algorithm: Algorithm
    threshold: number
    paths: string[]
    createdAt: number
    lastUsed?: number
}

interface ScanProfilesProps {
    currentAlgorithm: Algorithm
    currentThreshold: number
    currentPaths: string[]
    onLoadProfile: (profile: ScanProfile) => void
}

const STORAGE_KEY = 'pixelift-scan-profiles'

const defaultProfiles: ScanProfile[] = [
    {
        id: 'quick-scan',
        name: 'Quick Scan',
        algorithm: 'difference',
        threshold: 8,
        paths: [],
        createdAt: Date.now(),
    },
    {
        id: 'thorough',
        name: 'Thorough Analysis',
        algorithm: 'perceptual',
        threshold: 3,
        paths: [],
        createdAt: Date.now(),
    },
    {
        id: 'strict-match',
        name: 'Strict Match Only',
        algorithm: 'average',
        threshold: 1,
        paths: [],
        createdAt: Date.now(),
    },
]

export function ScanProfiles({
    currentAlgorithm,
    currentThreshold,
    currentPaths,
    onLoadProfile,
}: ScanProfilesProps) {
    const [profiles, setProfiles] = useState<ScanProfile[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [showSaveDialog, setShowSaveDialog] = useState(false)
    const [newProfileName, setNewProfileName] = useState('')
    const [justSaved, setJustSaved] = useState<string | null>(null)

    // Load profiles from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
                setProfiles(JSON.parse(stored))
            } else {
                // Initialize with default profiles
                setProfiles(defaultProfiles)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProfiles))
            }
        } catch (error) {
            console.error('Failed to load profiles:', error)
            setProfiles(defaultProfiles)
        }
    }, [])

    // Save profiles to localStorage
    const saveProfiles = (newProfiles: ScanProfile[]) => {
        setProfiles(newProfiles)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfiles))
    }

    const handleSaveProfile = () => {
        if (!newProfileName.trim()) return

        const newProfile: ScanProfile = {
            id: `profile-${Date.now()}`,
            name: newProfileName.trim(),
            algorithm: currentAlgorithm,
            threshold: currentThreshold,
            paths: currentPaths,
            createdAt: Date.now(),
        }

        saveProfiles([...profiles, newProfile])
        setNewProfileName('')
        setShowSaveDialog(false)
        setJustSaved(newProfile.id)
        setTimeout(() => setJustSaved(null), 2000)
    }

    const handleLoadProfile = (profile: ScanProfile) => {
        const updatedProfiles = profiles.map((p) =>
            p.id === profile.id ? { ...p, lastUsed: Date.now() } : p
        )
        saveProfiles(updatedProfiles)
        onLoadProfile(profile)
        setIsOpen(false)
    }

    const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        saveProfiles(profiles.filter((p) => p.id !== id))
    }

    const algorithmLabels: Record<Algorithm, string> = {
        difference: 'dHash',
        average: 'aHash',
        perceptual: 'pHash',
        fusion: 'Fusion',
    }

    return (
        <div className="relative">
            <div className="flex items-center gap-2">
                {/* Profiles Dropdown */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-sm"
                >
                    <Bookmark className="w-4 h-4 text-brand-primary" />
                    <span className="text-white font-medium">Profiles</span>
                    <ChevronDown className={`w-3 h-3 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Quick Save Button */}
                <button
                    onClick={() => setShowSaveDialog(true)}
                    className="flex items-center gap-2 px-3 py-2.5 bg-brand-primary/10 border border-brand-primary/20 hover:bg-brand-primary/20 transition-all text-brand-primary"
                    title="Save current settings as profile"
                >
                    <Save className="w-4 h-4" />
                </button>
            </div>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 top-full mt-2 w-72 glass-strong border border-white/10 shadow-2xl z-50 overflow-hidden"
                    >
                        <div className="p-2 border-b border-white/5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-text-muted px-2 py-1">
                                Saved Profiles
                            </div>
                        </div>

                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {profiles.length === 0 ? (
                                <div className="p-4 text-center text-text-muted text-sm">
                                    No profiles saved yet
                                </div>
                            ) : (
                                profiles.map((profile) => (
                                    <motion.button
                                        key={profile.id}
                                        onClick={() => handleLoadProfile(profile)}
                                        className="w-full p-3 text-left hover:bg-white/5 transition-colors group flex items-start gap-3 border-b border-white/5 last:border-b-0"
                                        whileHover={{ x: 2 }}
                                    >
                                        <div className="flex-shrink-0 w-8 h-8 rounded bg-brand-primary/10 flex items-center justify-center mt-0.5">
                                            {justSaved === profile.id ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <FolderOpen className="w-4 h-4 text-brand-primary" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-white group-hover:text-brand-primary transition-colors truncate">
                                                {profile.name}
                                            </div>
                                            <div className="text-[10px] text-text-muted mt-0.5">
                                                {algorithmLabels[profile.algorithm]} • Threshold {profile.threshold}
                                                {profile.paths.length > 0 && ` • ${profile.paths.length} path${profile.paths.length > 1 ? 's' : ''}`}
                                            </div>
                                        </div>
                                        {!profile.id.startsWith('quick-scan') && !profile.id.startsWith('thorough') && !profile.id.startsWith('strict-match') && (
                                            <button
                                                onClick={(e) => handleDeleteProfile(profile.id, e)}
                                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Delete profile"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </motion.button>
                                ))
                            )}
                        </div>

                        <div className="p-2 border-t border-white/5">
                            <button
                                onClick={() => {
                                    setShowSaveDialog(true)
                                    setIsOpen(false)
                                }}
                                className="w-full flex items-center gap-2 p-2 text-sm text-brand-primary hover:bg-brand-primary/10 transition-colors rounded"
                            >
                                <Plus className="w-4 h-4" />
                                Save Current Settings
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Save Dialog */}
            <AnimatePresence>
                {showSaveDialog && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                            onClick={() => setShowSaveDialog(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-96 glass-strong border border-white/10 shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-4 border-b border-white/5">
                                <h3 className="text-lg font-bold text-white">Save Profile</h3>
                                <p className="text-sm text-text-muted mt-1">
                                    Save your current scan settings for quick access later.
                                </p>
                            </div>

                            <div className="p-4">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted mb-2">
                                    Profile Name
                                </label>
                                <input
                                    type="text"
                                    value={newProfileName}
                                    onChange={(e) => setNewProfileName(e.target.value)}
                                    placeholder="My Custom Profile"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white placeholder-text-muted focus:outline-none focus:border-brand-primary/50 transition-colors"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveProfile()
                                        if (e.key === 'Escape') setShowSaveDialog(false)
                                    }}
                                />

                                <div className="mt-4 p-3 bg-white/5 border border-white/5 rounded">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2">
                                        Current Settings
                                    </div>
                                    <div className="text-sm text-white">
                                        {algorithmLabels[currentAlgorithm]} algorithm • Threshold {currentThreshold}
                                    </div>
                                    {currentPaths.length > 0 && (
                                        <div className="text-xs text-text-muted mt-1">
                                            {currentPaths.length} folder{currentPaths.length > 1 ? 's' : ''} selected
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-4 border-t border-white/5 flex items-center gap-3 justify-end">
                                <button
                                    onClick={() => setShowSaveDialog(false)}
                                    className="px-4 py-2 text-sm text-text-muted hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={!newProfileName.trim()}
                                    className="px-6 py-2 bg-brand-primary hover:bg-brand-secondary disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
                                >
                                    Save Profile
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
