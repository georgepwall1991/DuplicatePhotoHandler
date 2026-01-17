import { motion } from 'framer-motion'
import { SlidersHorizontal, Info } from 'lucide-react'

interface SensitivitySliderProps {
  threshold: number
  onThresholdChange: (value: number) => void
}

export function SensitivitySlider({ threshold, onThresholdChange }: SensitivitySliderProps) {
  const getSensitivityLabel = (value: number): string => {
    if (value <= 3) return 'Surgical Precision'
    if (value <= 6) return 'Standard Balance'
    return 'Extended Similarity'
  }

  const getSensitivityColor = (value: number): string => {
    if (value <= 3) return 'text-blue-400 bg-blue-400/10'
    if (value <= 6) return 'text-purple-400 bg-purple-400/10'
    return 'text-pink-400 bg-pink-400/10'
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl p-6 transition-all duration-300 border-white/5"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/5 rounded-xl">
            <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          </div>
          <span className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Threshold engine</span>
        </div>
        <motion.span 
          key={threshold}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase tracking-widest border border-white/5 ${getSensitivityColor(threshold)}`}
        >
          {getSensitivityLabel(threshold)}
        </motion.span>
      </div>

      <div className="relative h-12 flex items-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
              animate={{ width: `${((threshold - 1) / 9) * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          </div>
        </div>
        
        <input
          type="range"
          min="1"
          max="10"
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        <motion.div 
          animate={{ left: `${((threshold - 1) / 9) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute w-6 h-6 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.4)] pointer-events-none -ml-3 flex items-center justify-center"
        >
          <div className="w-1.5 h-1.5 bg-purple-600 rounded-full" />
        </motion.div>
      </div>

      <div className="flex justify-between mt-4">
        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest">
          <Info className="w-3 h-3" />
          <span>Strict</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest">
          <span>Flexible</span>
          <Info className="w-3 h-3" />
        </div>
      </div>
    </motion.div>
  )
}