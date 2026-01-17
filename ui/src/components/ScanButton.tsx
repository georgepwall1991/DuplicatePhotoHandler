import { motion } from 'framer-motion'
import { Rocket, Search, FolderPlus } from 'lucide-react'

interface ScanButtonProps {
  isReady: boolean
  onClick: () => void
  onSelectFolder: () => void
}

export function ScanButton({ isReady, onClick, onSelectFolder }: ScanButtonProps) {
  const handleClick = () => {
    if (isReady) {
      onClick()
    } else {
      onSelectFolder()
    }
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className="group relative w-56 h-56 transition-all duration-700 cursor-pointer"
    >
      {/* Dynamic Aura */}
      <motion.div
        animate={isReady ? {
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.6, 0.3],
        } : {
          scale: [1, 1.05, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className={`absolute -inset-8 blur-3xl ${isReady ? 'bg-purple-500/20' : 'bg-blue-500/10'}`}
      />

      {/* Rotating Ring - now square */}
      <div className={`absolute inset-0 border-2 border-dashed animate-[spin_20s_linear_infinite] ${isReady
          ? 'border-purple-500/20 group-hover:border-purple-500/40'
          : 'border-white/10 group-hover:border-white/20'
        }`} />

      {/* Main Button Body */}
      <div className="absolute inset-4 glass-strong border-2 border-white/10 shadow-2xl flex items-center justify-center overflow-hidden">
        {/* Interior Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br transition-opacity duration-700 ${isReady
            ? 'from-purple-600/20 to-blue-600/20 opacity-100'
            : 'from-gray-800/20 to-gray-900/20 opacity-50 group-hover:opacity-80'
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
              <FolderPlus className="w-16 h-16 text-gray-500 group-hover:text-purple-400 transition-colors duration-500" />
            )}
          </motion.div>

          <div className="flex flex-col items-center">
            <span className={`text-sm font-black tracking-[0.2em] transition-colors duration-500 ${isReady ? 'text-white' : 'text-gray-500 group-hover:text-white'
              }`}>
              {isReady ? 'INITIALIZE' : 'SELECT FOLDER'}
            </span>
            {isReady ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mt-1"
              >
                Deep Scan Ready
              </motion.span>
            ) : (
              <span className="text-[10px] text-gray-600 group-hover:text-purple-400/70 font-bold uppercase tracking-widest mt-1 transition-colors">
                Click to browse
              </span>
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