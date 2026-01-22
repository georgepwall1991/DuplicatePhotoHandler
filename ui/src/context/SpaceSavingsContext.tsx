import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { invoke } from '../lib/tauri'

// Milestone thresholds in bytes
const MILESTONES = [
    { bytes: 100 * 1024 * 1024, label: '100 MB', emoji: '🎉' },
    { bytes: 500 * 1024 * 1024, label: '500 MB', emoji: '🚀' },
    { bytes: 1024 * 1024 * 1024, label: '1 GB', emoji: '⭐' },
    { bytes: 5 * 1024 * 1024 * 1024, label: '5 GB', emoji: '💎' },
    { bytes: 10 * 1024 * 1024 * 1024, label: '10 GB', emoji: '🏆' },
    { bytes: 25 * 1024 * 1024 * 1024, label: '25 GB', emoji: '👑' },
    { bytes: 50 * 1024 * 1024 * 1024, label: '50 GB', emoji: '🌟' },
    { bytes: 100 * 1024 * 1024 * 1024, label: '100 GB', emoji: '🎖️' },
]

export interface Milestone {
    bytes: number
    label: string
    emoji: string
}

interface SpaceSavingsContextType {
    sessionBytes: number
    lifetimeBytes: number
    lastMilestone: Milestone | null
    pendingCelebration: Milestone | null
    addSavings: (bytes: number) => void
    clearCelebration: () => void
    nextMilestone: Milestone | null
    progressToNextMilestone: number // 0-100
}

const SpaceSavingsContext = createContext<SpaceSavingsContextType | null>(null)

export function useSpaceSavings() {
    const context = useContext(SpaceSavingsContext)
    if (!context) {
        throw new Error('useSpaceSavings must be used within SpaceSavingsProvider')
    }
    return context
}

interface SpaceSavingsProviderProps {
    children: ReactNode
}

export function SpaceSavingsProvider({ children }: SpaceSavingsProviderProps) {
    const [sessionBytes, setSessionBytes] = useState(0)
    const [lifetimeBytes, setLifetimeBytes] = useState(0)
    const [lastMilestone, setLastMilestone] = useState<Milestone | null>(null)
    const [pendingCelebration, setPendingCelebration] = useState<Milestone | null>(null)

    // Load lifetime savings on mount
    useEffect(() => {
        invoke<number>('get_lifetime_savings')
            .then((bytes) => {
                setLifetimeBytes(bytes)
                // Find the last achieved milestone
                const achieved = MILESTONES.filter(m => bytes >= m.bytes)
                if (achieved.length > 0) {
                    setLastMilestone(achieved[achieved.length - 1])
                }
            })
            .catch((err) => {
                console.warn('Failed to load lifetime savings:', err)
            })
    }, [])

    // Get next milestone
    const nextMilestone = MILESTONES.find(m => lifetimeBytes < m.bytes) || null

    // Calculate progress to next milestone
    const progressToNextMilestone = (() => {
        if (!nextMilestone) return 100
        const prevMilestone = MILESTONES.filter(m => lifetimeBytes >= m.bytes).pop()
        const start = prevMilestone?.bytes || 0
        const end = nextMilestone.bytes
        const progress = ((lifetimeBytes - start) / (end - start)) * 100
        return Math.min(100, Math.max(0, progress))
    })()

    const addSavings = useCallback((bytes: number) => {
        if (bytes <= 0) return

        setSessionBytes(prev => prev + bytes)
        setLifetimeBytes(prev => {
            const newTotal = prev + bytes

            // Check for new milestones
            const previouslyAchieved = MILESTONES.filter(m => prev >= m.bytes)
            const nowAchieved = MILESTONES.filter(m => newTotal >= m.bytes)

            // Trigger celebration for newly achieved milestones
            if (nowAchieved.length > previouslyAchieved.length) {
                const newMilestone = nowAchieved[nowAchieved.length - 1]
                setLastMilestone(newMilestone)
                setPendingCelebration(newMilestone)
            }

            // Persist to backend
            invoke('save_lifetime_savings', { bytes: newTotal }).catch(err => {
                console.warn('Failed to save lifetime savings:', err)
            })

            return newTotal
        })
    }, [])

    const clearCelebration = useCallback(() => {
        setPendingCelebration(null)
    }, [])

    return (
        <SpaceSavingsContext.Provider
            value={{
                sessionBytes,
                lifetimeBytes,
                lastMilestone,
                pendingCelebration,
                addSavings,
                clearCelebration,
                nextMilestone,
                progressToNextMilestone,
            }}
        >
            {children}
        </SpaceSavingsContext.Provider>
    )
}
