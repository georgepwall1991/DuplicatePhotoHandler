import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { floatAnimation, staggerContainer, staggerItem } from '../lib/animationVariants'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  tips?: string[]
}

/**
 * Enhanced empty state with floating icon animation, optional action, and tips.
 */
export function EmptyState({ icon: Icon, title, message, action, tips }: EmptyStateProps) {
  return (
    <motion.div
      className="text-center py-16 px-6"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Floating icon with ambient glow */}
      <motion.div variants={staggerItem} className="relative mx-auto mb-8">
        {/* Ambient glow ring */}
        <div className="absolute inset-0 w-28 h-28 mx-auto rounded-full bg-brand-primary/10 blur-xl" />

        {/* Icon container */}
        <motion.div
          variants={floatAnimation}
          className="relative w-28 h-28 mx-auto glass-card rounded-2xl flex items-center justify-center border-brand-primary/20"
        >
          <Icon className="w-12 h-12 text-brand-primary" strokeWidth={1.5} />

          {/* Subtle particles */}
          <motion.div
            className="absolute -top-1 -right-1 w-2 h-2 bg-brand-accent rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 2, delay: 0.2 }}
          />
          <motion.div
            className="absolute -bottom-1 -left-1 w-1.5 h-1.5 bg-brand-secondary rounded-full"
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ repeat: Infinity, duration: 2.5, delay: 0.5 }}
          />
        </motion.div>
      </motion.div>

      {/* Title with gradient */}
      <motion.h3
        variants={staggerItem}
        className="text-2xl font-bold bg-gradient-to-r from-white via-white to-text-secondary bg-clip-text text-transparent mb-3"
      >
        {title}
      </motion.h3>

      {/* Message */}
      <motion.p
        variants={staggerItem}
        className="text-text-secondary max-w-sm mx-auto mb-6"
      >
        {message}
      </motion.p>

      {/* Action button */}
      {action && (
        <motion.button
          variants={staggerItem}
          onClick={action.onClick}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold shadow-lg shadow-brand-primary/25 hover:shadow-brand-primary/40 transition-shadow"
        >
          {action.label}
        </motion.button>
      )}

      {/* Tips carousel */}
      {tips && tips.length > 0 && (
        <motion.div
          variants={staggerItem}
          className="mt-8 max-w-md mx-auto"
        >
          <div className="glass-panel-subtle rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-text-muted mb-2 flex items-center gap-2">
              <span className="w-1 h-1 bg-brand-accent rounded-full" />
              Quick Tip
            </div>
            <p className="text-sm text-text-secondary">
              {tips[0]}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
