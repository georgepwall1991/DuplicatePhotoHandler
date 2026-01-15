interface ScanButtonProps {
  isReady: boolean
  onClick: () => void
}

export function ScanButton({ isReady, onClick }: ScanButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={!isReady}
      className={`group relative w-56 h-56 rounded-full transition-all duration-500 hover:scale-105 animate-scale-in ${!isReady ? 'opacity-50 grayscale cursor-not-allowed' : ''
        }`}
    >
      {/* Outer glow ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/30 to-purple-700/30 blur-xl group-hover:blur-2xl transition-all duration-500 group-hover:from-purple-400/40 group-hover:to-purple-600/40" />

      {/* Animated gradient border */}
      <div className="absolute inset-0 rounded-full gradient-border opacity-60 group-hover:opacity-100 transition-opacity" />

      {/* Glass background */}
      <div className="absolute inset-2 rounded-full glass-strong" />

      {/* Inner content */}
      <div className={`absolute inset-4 rounded-full bg-gradient-to-br from-[#1a1a2e] to-[#0f0f1a] flex items-center justify-center shadow-inner transition-colors duration-500 ${isReady ? 'from-[#2a2a4a] to-[#1a1a2e]' : ''
        }`}>
        <div className="text-center">
          <div className={`text-6xl mb-2 transition-all duration-500 ${isReady ? 'scale-110 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'opacity-40'
            }`}>
            {isReady ? '🚀' : '🔍'}
          </div>
          <div className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent tracking-tight">
            {isReady ? 'START SCAN' : 'READY'}
          </div>
        </div>
      </div>

      {/* Hover glow pulse */}
      <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 animate-pulse-glow transition-opacity duration-500" />
    </button>
  )
}
