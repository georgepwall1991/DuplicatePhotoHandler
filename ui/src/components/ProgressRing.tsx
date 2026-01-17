import { motion } from 'framer-motion'

interface ProgressRingProps {
  percent: number
  size?: number
  strokeWidth?: number
}

export function ProgressRing({
  percent,
  size = 200,
  strokeWidth = 8,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Dynamic Background Glow */}
      <motion.div
        animate={{ 
          opacity: [0.1, 0.3, 0.1],
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 rounded-full blur-3xl bg-purple-500/20"
      />

      <div className="absolute inset-0 rounded-full border border-white/5 bg-[#0a0a0f]/40 backdrop-blur-md shadow-2xl" />

      {/* SVG Ring */}
      <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth={strokeWidth}
        />
        
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
          strokeDasharray={circumference}
        />

        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          key={Math.round(percent)}
          initial={{ opacity: 0, scale: 0.8, y: 5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="flex items-baseline"
        >
          <span className="text-6xl font-black text-white tracking-tighter">
            {Math.round(percent)}
          </span>
          <span className="text-xl font-bold text-purple-400 ml-1">%</span>
        </motion.div>
        <motion.div 
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mt-1"
        >
          Processing
        </motion.div>
      </div>

      {/* Scanning Radar Line */}
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 rounded-full pointer-events-none"
      >
        <div className="absolute top-0 left-1/2 w-0.5 h-1/2 bg-gradient-to-t from-transparent via-purple-500/50 to-white/80 origin-bottom" />
      </motion.div>
    </div>
  )
}