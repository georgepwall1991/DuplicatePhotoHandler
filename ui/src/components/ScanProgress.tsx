import { ProgressRing } from './ProgressRing'

interface ScanProgressProps {
  phase: string
  percent: number
  message: string
  photosFound: number
  duplicatesFound: number
  isCancelling: boolean
  onCancel: () => void
}

export function ScanProgress({
  phase,
  percent,
  message,
  photosFound,
  duplicatesFound,
  isCancelling,
  onCancel,
}: ScanProgressProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Animated background rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute w-[600px] h-[600px] rounded-full border border-purple-500/10 animate-ring-pulse" />
        <div className="absolute w-[500px] h-[500px] rounded-full border border-purple-500/15 animate-ring-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-purple-500/20 animate-ring-pulse" style={{ animationDelay: '1s' }} />
        <div className="w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-purple-400/40 rounded-full animate-float" style={{ animationDelay: '0s' }} />
        <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-purple-300/30 rounded-full animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-purple-500/30 rounded-full animate-float" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-1/4 right-1/3 w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-float" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative animate-scale-in">
        <ProgressRing percent={percent} size={220} />
      </div>

      <div className="mt-8 text-center relative animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <h2 className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
          {phase}...
        </h2>
        <p className="text-gray-400">{message}</p>
      </div>

      <div className="mt-8 flex gap-6 relative stagger-children">
        <div className="glass-card rounded-2xl px-8 py-4 text-center transition-transform hover:scale-105">
          <div className="text-3xl font-bold text-white">{photosFound.toLocaleString()}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400 mt-1">Photos Found</div>
        </div>
        <div className="glass-card rounded-2xl px-8 py-4 text-center glow-green transition-transform hover:scale-105">
          <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
            {duplicatesFound}
          </div>
          <div className="text-xs uppercase tracking-wider text-gray-400 mt-1">Duplicates</div>
        </div>
      </div>

      {/* Cancel Button */}
      <button
        onClick={onCancel}
        disabled={isCancelling}
        className="mt-8 px-6 py-3 rounded-xl glass-card text-gray-300 hover:text-white hover:bg-red-500/20 transition-all duration-200 disabled:opacity-50"
      >
        {isCancelling ? 'Cancelling...' : 'Cancel Scan'}
      </button>
    </div>
  )
}
