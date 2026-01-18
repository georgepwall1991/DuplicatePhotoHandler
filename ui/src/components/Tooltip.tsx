import { useState, useRef, useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface TooltipProps {
    content: string
    children: ReactNode
    position?: 'top' | 'bottom'
    delay?: number
}

export function Tooltip({ content, children, position = 'top', delay = 300 }: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [coords, setCoords] = useState({ x: 0, y: 0 })
    const triggerRef = useRef<HTMLDivElement>(null)
    const timeoutRef = useRef<number | null>(null)

    const showTooltip = () => {
        timeoutRef.current = window.setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect()
                setCoords({
                    x: rect.left + rect.width / 2,
                    y: position === 'top' ? rect.top : rect.bottom,
                })
            }
            setIsVisible(true)
        }, delay)
    }

    const hideTooltip = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
        }
        setIsVisible(false)
    }

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={showTooltip}
                onBlur={hideTooltip}
                className="inline-flex cursor-help"
            >
                {children}
            </div>

            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: position === 'top' ? 8 : -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: position === 'top' ? 8 : -8, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="fixed z-[100] pointer-events-none"
                        style={{
                            left: coords.x,
                            top: position === 'top' ? coords.y - 8 : coords.y + 8,
                            transform: `translateX(-50%) translateY(${position === 'top' ? '-100%' : '0'})`,
                        }}
                    >
                        <div className="px-3 py-2 max-w-xs text-xs font-medium text-white bg-surface-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl">
                            {content}
                            {/* Arrow */}
                            <div
                                className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-surface-900/95 border-white/10 rotate-45 ${position === 'top'
                                        ? 'bottom-0 translate-y-1/2 border-r border-b'
                                        : 'top-0 -translate-y-1/2 border-l border-t'
                                    }`}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
