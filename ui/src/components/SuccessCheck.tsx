import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

interface SuccessCheckProps {
    size?: number
    color?: string
    message?: string
}

export function SuccessCheck({ size = 80, color = '#10B981', message }: SuccessCheckProps) {
    return (
        <div className="flex flex-col items-center gap-4">
            <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                }}
                className="relative"
            >
                {/* Glow effect */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{
                        duration: 1,
                        repeat: Infinity,
                        repeatType: 'loop',
                    }}
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: color, filter: 'blur(20px)' }}
                />

                {/* Circle */}
                <div
                    className="relative flex items-center justify-center rounded-full"
                    style={{
                        width: size,
                        height: size,
                        backgroundColor: `${color}20`,
                        border: `3px solid ${color}`,
                    }}
                >
                    {/* Checkmark */}
                    <motion.div
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 15,
                            delay: 0.2,
                        }}
                    >
                        <Check className="text-white" style={{ width: size * 0.5, height: size * 0.5, color }} />
                    </motion.div>
                </div>
            </motion.div>

            {message && (
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-lg font-bold text-white"
                >
                    {message}
                </motion.p>
            )}
        </div>
    )
}
