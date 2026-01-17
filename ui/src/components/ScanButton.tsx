import { motion } from 'framer-motion'
import { Rocket, Search } from 'lucide-react'

interface ScanButtonProps {
  isReady: boolean
  onClick: () => void
}

export function ScanButton({ isReady, onClick }: ScanButtonProps) {
  return (
    <motion.button
      whileHover={isReady ? { scale: 1.02, y: -4 } : {}}
      whileTap={isReady ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={!isReady}
      className={`group relative w-56 h-56 transition-all duration-700 ${
        !isReady ? 'opacity-40 grayscale-[0.8] cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      {/* Dynamic Aura */}
      <motion.div
        animate={isReady ? {
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.6, 0.3],
        } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-8 bg-purple-500/20 blur-3xl"
      />

      {/* Rotating Ring - now square */}
      <div className="absolute inset-0 border-2 border-dashed border-purple-500/20 group-hover:border-purple-500/40 animate-[spin_20s_linear_infinite]" />

      {/* Main Button Body */}
      <div className="absolute inset-4 glass-strong border-2 border-white/10 shadow-2xl flex items-center justify-center overflow-hidden">
        {/* Interior Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-700 ${
          isReady ? 'from-purple-600/20 to-blue-600/20 opacity-100' : 'from-gray-800/20 to-gray-900/20 opacity-50'
        }`} />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-4">
          <motion.div
            animate={isReady ? {
              y: [0, -4, 0],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {isReady ? (
              <Rocket className="w-16 h-16 text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
            ) : (
              <Search className="w-16 h-16 text-gray-500" />
            )}
          </motion.div>
          
          <div className="flex flex-col items-center">
            <span className={`text-sm font-black tracking-[0.2em] transition-colors duration-500 ${
              isReady ? 'text-white' : 'text-gray-500'
            }`}>
              {isReady ? 'INITIALIZE' : 'SELECT FOLDER'}
            </span>
            {isReady && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mt-1"
              >
                Deep Scan Ready
              </motion.span>
            )}
          </div>
        </div>

        {/* Shimmer Effect */}
        <div className="absolute inset-0 w-full h-full shimmer opacity-20 pointer-events-none" />
      </div>

      {/* Outer Pulse Ring */}
      {isReady && (
        <motion.div
          animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          className="absolute inset-0 border-2 border-purple-500/50"
        />
      )}
    </motion.button>
  )
}