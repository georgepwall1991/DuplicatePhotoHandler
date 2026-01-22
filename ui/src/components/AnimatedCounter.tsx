import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

interface AnimatedCounterProps {
    value: number
    duration?: number
    className?: string
    formatFn?: (value: number) => string
}

/**
 * Animated number counter that smoothly transitions between values.
 * Great for stats, metrics, and dashboard numbers.
 */
export function AnimatedCounter({
    value,
    duration = 1,
    className = '',
    formatFn = (v) => Math.round(v).toLocaleString()
}: AnimatedCounterProps) {
    const spring = useSpring(0, { duration: duration * 1000 })
    const display = useTransform(spring, (current) => formatFn(current))
    const [displayValue, setDisplayValue] = useState(formatFn(0))
    const prevValue = useRef(0)

    useEffect(() => {
        // Animate from previous value to new value
        spring.set(prevValue.current)
        spring.set(value)
        prevValue.current = value
    }, [value, spring])

    useEffect(() => {
        const unsubscribe = display.on('change', (latest) => {
            setDisplayValue(latest)
        })
        return unsubscribe
    }, [display])

    return (
        <motion.span className={className}>
            {displayValue}
        </motion.span>
    )
}

/**
 * Animated bytes counter with proper formatting.
 */
interface AnimatedBytesProps {
    bytes: number
    className?: string
}

export function AnimatedBytes({ bytes, className = '' }: AnimatedBytesProps) {
    const formatBytes = (b: number): string => {
        if (b === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(Math.abs(b) || 1) / Math.log(k))
        return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[Math.min(i, sizes.length - 1)]}`
    }

    return (
        <AnimatedCounter
            value={bytes}
            className={className}
            formatFn={formatBytes}
            duration={0.8}
        />
    )
}
