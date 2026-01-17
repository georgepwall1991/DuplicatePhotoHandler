import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, RotateCcw, Zap, Info } from 'lucide-react'

interface ActionBarProps {
  selectedCount: number
  selectedSize: number
  isDeleting: boolean
  onTrash: () => void
  canUndo?: boolean
  undoCount?: number
  isRestoring?: boolean
  onUndo?: () => void
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ActionBar({
  selectedCount,
  selectedSize,
  isDeleting,
  onTrash,
  canUndo = false,
  undoCount = 0,
  isRestoring = false,
  onUndo,
}: ActionBarProps) {
  if (selectedCount === 0 && !canUndo) return null

  return (
    <motion.div 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      exit={{ y: 100 }}
      className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6 z-50"
    >
      <div className="glass-strong rounded-[2.5rem] p-4 border border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] flex items-center justify-between">
        <div className="flex items-center gap-6 pl-4">
          <AnimatePresence mode="wait">
            {selectedCount > 0 ? (
              <motion.div 
                key="selection"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-6"
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-black text-xl tracking-tighter">{selectedCount}</span>
                    <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Assets Marked</span>
                  </div>
                </div>
                
                <div className="w-px h-8 bg-white/10" />
                
                <div className="flex items-center gap-3 text-green-400">
                  <Zap className="w-4 h-4 fill-current" />
                  <span className="font-black tracking-tighter text-xl">{formatBytes(selectedSize)}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest mt-1">Reclaimable</span>
                </div>
              </motion.div>
            ) : canUndo ? (
              <motion.div 
                key="undo"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-4 text-amber-400"
              >
                <Info className="w-5 h-5" />
                <div>
                  <div className="font-black text-sm uppercase tracking-widest">Operation Complete</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    {undoCount} files moved • Cmd+Z to undo
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          {canUndo && onUndo && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onUndo}
              disabled={isRestoring}
              className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/5 text-amber-400 border border-amber-500/20 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/10 transition-all"
            >
              <RotateCcw className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
              {isRestoring ? 'Restoring...' : 'Undo Action'}
            </motion.button>
          )}

          {selectedCount > 0 && (
            <motion.button
              whileHover={{ scale: 1.02, x: 5 }}
              whileTap={{ scale: 0.98 }}
              onClick={onTrash}
              disabled={isDeleting}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-red-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-600/20 hover:bg-red-500 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Processing...' : 'Purge Selected'}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}