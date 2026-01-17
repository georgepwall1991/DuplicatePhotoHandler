import { motion } from 'framer-motion'
import { ProgressRing } from './ProgressRing'
import { Activity, Images, Layers, XCircle, Terminal } from 'lucide-react'

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
    <div className="h-full flex flex-col items-center justify-center p-12 relative overflow-hidden">
      {/* Background Tech Elements - subtle overlay on top of main background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-full h-full"
          style={{
            backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.05) 1px, transparent 1px)',
            backgroundSize: '100px 100px'
          }}
        />
        <motion.div
          animate={{ y: [0, 1000] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-1000px] left-0 w-full h-full bg-gradient-to-b from-transparent via-brand-primary/10 to-transparent"
        />
      </div>

      {/* Main Scanner */}
      <div className="relative mb-16">
        <ProgressRing percent={percent} size={280} strokeWidth={10} />
      </div>

      {/* Status Console */}
      <div className="w-full max-w-xl text-center mb-16">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary mb-6 rounded-full"
        >
          <Activity className="w-4 h-4 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-widest">{phase}</span>
        </motion.div>

        <h2 className="text-3xl font-black text-white tracking-tight mb-4 h-8">
          {message}
        </h2>

        <div className="flex items-center justify-center gap-2 text-text-muted font-mono text-xs">
          <Terminal className="w-3 h-3" />
          <span className="animate-pulse">System executing LSH algorithms...</span>
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 gap-6 w-full max-w-xl mb-12">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass-card p-8 border-white/5 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Images className="w-12 h-12 text-blue-400" />
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/60 mb-2">Total Scanned</div>
          <div className="text-4xl font-black text-white tracking-tighter">
            {photosFound.toLocaleString()}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass-card p-8 border-white/5 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Layers className="w-12 h-12 text-brand-primary" />
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary/60 mb-2">Identified</div>
          <div className="text-4xl font-black text-white tracking-tighter">
            {duplicatesFound.toLocaleString()}
          </div>
        </motion.div>
      </div>

      {/* Control Actions */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onCancel}
        disabled={isCancelling}
        className="flex items-center gap-3 px-8 py-4 bg-surface-800/50 border border-white/10 text-text-secondary hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20 transition-all duration-300 group rounded-xl"
      >
        <XCircle className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
        <span className="text-sm font-bold uppercase tracking-widest">
          {isCancelling ? 'Terminating Process...' : 'Abort Operation'}
        </span>
      </motion.button>
    </div>
  )
}