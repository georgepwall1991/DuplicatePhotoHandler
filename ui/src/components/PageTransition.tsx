import { motion, AnimatePresence } from 'framer-motion'
import { pageTransition } from '../lib/animationVariants'
import type { ReactNode } from 'react'

interface PageTransitionProps {
    children: ReactNode
    pageKey: string
}

/**
 * Wraps page content with smooth cross-fade transitions.
 * Use the pageKey prop to trigger transitions when switching views.
 */
export function PageTransition({ children, pageKey }: PageTransitionProps) {
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={pageKey}
                variants={pageTransition}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="h-full w-full"
            >
                {children}
            </motion.div>
        </AnimatePresence>
    )
}
