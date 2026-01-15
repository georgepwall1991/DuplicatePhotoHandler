interface ProgressRingProps {
  percent: number
  size?: number
  strokeWidth?: number
}

export function ProgressRing({
  percent,
  size = 150,
  strokeWidth = 10,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full blur-xl transition-opacity duration-500"
        style={{
          background: `conic-gradient(from 0deg, rgba(138, 138, 202, ${percent / 200}) ${percent}%, transparent ${percent}%)`,
          opacity: percent > 0 ? 1 : 0,
        }}
      />

      {/* Glass background */}
      <div className="absolute inset-0 rounded-full glass-strong" />

      {/* SVG Ring */}
      <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Glow layer */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#glowGradient)"
          strokeWidth={strokeWidth + 8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-300"
          style={{ filter: 'blur(8px)' }}
        />
        {/* Main progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-300"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(167, 139, 250, 0.5)" />
            <stop offset="100%" stopColor="rgba(124, 58, 237, 0.5)" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">
          {Math.round(percent)}
        </span>
        <span className="text-sm text-gray-400 -mt-1">percent</span>
      </div>
    </div>
  )
}
