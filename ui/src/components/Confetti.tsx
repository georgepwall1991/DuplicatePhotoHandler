import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfettiPiece {
    id: number
    x: number
    y: number
    rotation: number
    color: string
    delay: number
    size: number
}

interface ConfettiProps {
    isActive: boolean
    duration?: number
    particleCount?: number
}

const colors = [
    '#00D9FF', // Brand primary
    '#A855F7', // Purple
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#EC4899', // Pink
]

export function Confetti({ isActive, duration = 3000, particleCount = 50 }: ConfettiProps) {
    const [pieces, setPieces] = useState<ConfettiPiece[]>([])

    useEffect(() => {
        if (isActive) {
            const newPieces: ConfettiPiece[] = []
            for (let i = 0; i < particleCount; i++) {
                newPieces.push({
                    id: i,
                    x: Math.random() * 100,
                    y: -10,
                    rotation: Math.random() * 360,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    delay: Math.random() * 0.5,
                    size: 4 + Math.random() * 8,
                })
            }
            setPieces(newPieces)

            const timeout = setTimeout(() => {
                setPieces([])
            }, duration)

            return () => clearTimeout(timeout)
        } else {
            setPieces([])
        }
    }, [isActive, duration, particleCount])

    return (
        <AnimatePresence>
            {pieces.length > 0 && (
                <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
                    {pieces.map((piece) => (
                        <motion.div
                            key={piece.id}
                            initial={{
                                x: `${piece.x}vw`,
                                y: '-10vh',
                                rotate: 0,
                                opacity: 1,
                            }}
                            animate={{
                                y: '110vh',
                                rotate: piece.rotation + 720,
                                opacity: [1, 1, 0.5, 0],
                            }}
                            transition={{
                                duration: 2.5 + Math.random(),
                                delay: piece.delay,
                                ease: [0.25, 0.1, 0.25, 1],
                            }}
                            style={{
                                position: 'absolute',
                                width: piece.size,
                                height: piece.size,
                                backgroundColor: piece.color,
                                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                            }}
                        />
                    ))}
                </div>
            )}
        </AnimatePresence>
    )
}
