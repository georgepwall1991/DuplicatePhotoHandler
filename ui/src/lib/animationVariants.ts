import type { Variants } from 'framer-motion'

/**
 * Shared animation variants for consistent motion throughout Pixelift.
 * Uses spring physics for natural feeling animations.
 */

// Standard fade in animation
export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { duration: 0.3, ease: 'easeOut' }
    },
    exit: { opacity: 0, transition: { duration: 0.2 } }
}

// Slide up with fade - great for cards and modals
export const slideUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } }
}

// Slide in from left - for sidebar items
export const slideInLeft: Variants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    exit: { opacity: 0, x: -20, transition: { duration: 0.15 } }
}

// Scale pop-in - modals, popovers, tooltips
export const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { type: 'spring', stiffness: 400, damping: 25 }
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
}

// Stagger container - wrap lists for staggered child animations
export const staggerContainer: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1
        }
    }
}

// Stagger item - individual list items
export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 300, damping: 24 }
    }
}

// Page transition - for switching between views
export const pageTransition: Variants = {
    hidden: { opacity: 0, x: 10 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }
    },
    exit: {
        opacity: 0,
        x: -10,
        transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
    }
}

// Floating effect - for icons in empty states
export const floatAnimation: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
        opacity: 1,
        y: [0, -6, 0],
        transition: {
            opacity: { duration: 0.3 },
            y: { repeat: Infinity, duration: 3, ease: 'easeInOut' }
        }
    }
}

// Pulse glow - for active/scanning states
export const pulseGlow: Variants = {
    initial: { boxShadow: '0 0 0 0 rgba(var(--color-brand-primary), 0)' },
    animate: {
        boxShadow: [
            '0 0 0 0 rgba(139, 92, 246, 0.4)',
            '0 0 20px 4px rgba(139, 92, 246, 0.2)',
            '0 0 0 0 rgba(139, 92, 246, 0)'
        ],
        transition: { repeat: Infinity, duration: 2, ease: 'easeInOut' }
    }
}

// Button hover micro-interaction
export const buttonHover = {
    scale: 1.02,
    transition: { type: 'spring', stiffness: 400, damping: 17 }
}

export const buttonTap = {
    scale: 0.98
}

// Success checkmark animation
export const successCheck: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
        pathLength: 1,
        opacity: 1,
        transition: { duration: 0.4, ease: 'easeOut', delay: 0.2 }
    }
}
