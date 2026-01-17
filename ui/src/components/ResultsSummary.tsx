import { motion } from 'framer-motion'
import { Layers, Zap, Image as ImageIcon } from 'lucide-react'

interface ResultsSummaryProps {
  totalPhotos: number
  duplicateGroups: number
  potentialSavingsBytes: number
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function ResultsSummary({ totalPhotos, duplicateGroups, potentialSavingsBytes }: ResultsSummaryProps) {
  return (
    <div className="flex gap-4 mt-6">
      {[
        { 
          label: 'Library Scale', 
          value: totalPhotos.toLocaleString(), 
          icon: ImageIcon, 
          color: 'text-blue-400',
          bg: 'bg-blue-400/5'
        },
        { 
          label: 'Identified Clusters', 
          value: duplicateGroups, 
          icon: Layers, 
          color: 'text-purple-400',
          bg: 'bg-purple-400/5'
        },
        { 
          label: 'Space Recovery', 
          value: formatBytes(potentialSavingsBytes), 
          icon: Zap, 
          color: 'text-green-400',
          bg: 'bg-green-400/5'
        }
      ].map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          whileHover={{ y: -4 }}
          className={`flex-1 glass-card  p-6 border-white/5 relative overflow-hidden group`}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2  ${stat.bg} ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{stat.label}</span>
            </div>
            <div className={`text-3xl font-black tracking-tighter ${stat.color}`}>
              {stat.value}
            </div>
          </div>
          
          <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity">
            <stat.icon className="w-20 h-20 rotate-12" />
          </div>
        </motion.div>
      ))}
    </div>
  )
}