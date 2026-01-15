interface SensitivitySliderProps {
  threshold: number
  onThresholdChange: (value: number) => void
}

export function SensitivitySlider({ threshold, onThresholdChange }: SensitivitySliderProps) {
  const getSensitivityLabel = (value: number): string => {
    if (value <= 3) return 'Strict'
    if (value <= 6) return 'Balanced'
    return 'Relaxed'
  }

  return (
    <div className="glass-card rounded-2xl px-6 py-5 transition-all duration-300 hover:bg-white/5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-wider text-gray-500">Sensitivity</span>
        <span className="text-sm font-medium px-3 py-1 rounded-full bg-purple-500/20 text-purple-300">
          {getSensitivityLabel(threshold)}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min="1"
          max="10"
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-gradient-to-br
            [&::-webkit-slider-thumb]:from-purple-400
            [&::-webkit-slider-thumb]:to-purple-600
            [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:duration-200
            [&::-webkit-slider-thumb]:hover:scale-110"
        />
        {/* Track fill */}
        <div
          className="absolute top-0 left-0 h-2 bg-gradient-to-r from-purple-500 to-purple-400 rounded-full pointer-events-none"
          style={{ width: `${((threshold - 1) / 9) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-3">
        <span>Exact only</span>
        <span>More matches</span>
      </div>
    </div>
  )
}
