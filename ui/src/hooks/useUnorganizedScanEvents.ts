import { useEffect, useState } from 'react'
import { listen } from '../lib/tauri'

interface UnorganizedScanStats {
  filesScanned: number
  unorganizedFound: number
}

interface ScanProgress {
  phase: string
  percent: number
  message: string
}

interface UnorganizedScanEventPayload {
  phase: string
  files_scanned: number
  message: string
}

interface UseUnorganizedScanEventsProps {
  onProgress: (progress: ScanProgress) => void
}

export function useUnorganizedScanEvents({ onProgress }: UseUnorganizedScanEventsProps) {
  const [stats, setStats] = useState<UnorganizedScanStats>({ filesScanned: 0, unorganizedFound: 0 })

  useEffect(() => {
    const unlisten = listen<UnorganizedScanEventPayload>('unorganized-scan-event', (event) => {
      const data = event.payload

      if (data.phase === 'Scanning') {
        const percent = Math.min(90, data.files_scanned > 0 ? 10 + (data.files_scanned % 90) : 10)
        onProgress({
          phase: 'Scanning',
          percent,
          message: data.message,
        })
        setStats(prev => ({ ...prev, filesScanned: data.files_scanned }))
      }

      if (data.phase === 'Complete') {
        onProgress({
          phase: 'Complete',
          percent: 100,
          message: data.message,
        })
        setStats(prev => ({ ...prev, unorganizedFound: data.files_scanned }))
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [onProgress])

  const resetStats = () => {
    setStats({ filesScanned: 0, unorganizedFound: 0 })
  }

  return { stats, resetStats }
}
