import { useEffect, useState } from 'react'
import { listen } from '../lib/tauri'

interface SimilarScanStats {
  photosScanned: number
  groupsFound: number
}

interface ScanProgress {
  phase: string
  percent: number
  message: string
}

interface SimilarScanEventPayload {
  phase: string
  current: number
  total: number
}

interface UseSimilarScanEventsProps {
  onProgress: (progress: ScanProgress) => void
}

export function useSimilarScanEvents({ onProgress }: UseSimilarScanEventsProps) {
  const [stats, setStats] = useState<SimilarScanStats>({ photosScanned: 0, groupsFound: 0 })

  useEffect(() => {
    const unlisten = listen<SimilarScanEventPayload>('similar-scan-event', (event) => {
      const data = event.payload

      if (data.phase === 'Scanning') {
        onProgress({
          phase: 'Scanning folders...',
          percent: 10,
          message: `Found ${data.total} photos`,
        })
        setStats(prev => ({ ...prev, photosScanned: data.total }))
      }

      if (data.phase === 'Hashing') {
        const percent = data.total > 0 ? 10 + Math.floor((data.current / data.total) * 40) : 10
        onProgress({
          phase: 'Computing hashes...',
          percent,
          message: `${data.current} of ${data.total} photos`,
        })
        setStats(prev => ({ ...prev, photosScanned: data.total }))
      }

      if (data.phase === 'Comparing') {
        const percent = data.total > 0 ? 50 + Math.floor((data.current / data.total) * 40) : 50
        onProgress({
          phase: 'Finding similar photos...',
          percent,
          message: `Comparing ${data.current} of ${data.total}`,
        })
      }

      if (data.phase === 'Grouping') {
        onProgress({
          phase: 'Grouping results...',
          percent: 95,
          message: `Found ${data.current} groups`,
        })
        setStats(prev => ({ ...prev, groupsFound: data.current }))
      }

      if (data.phase === 'Complete') {
        onProgress({
          phase: 'Complete',
          percent: 100,
          message: `Found ${data.current} similar groups`,
        })
        setStats(prev => ({ ...prev, groupsFound: data.current, photosScanned: data.total }))
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [onProgress])

  const resetStats = () => {
    setStats({ photosScanned: 0, groupsFound: 0 })
  }

  return { stats, resetStats }
}
