import { useEffect, useState, useRef } from 'react'
import { listen } from '../lib/tauri'

interface ScanStats {
  photosFound: number
  duplicatesFound: number
}

interface ScanProgress {
  phase: string
  percent: number
  message: string
}

interface UseScanEventsProps {
  onProgress: (progress: ScanProgress) => void
}

export function useScanEvents({ onProgress }: UseScanEventsProps) {
  const [stats, setStats] = useState<ScanStats>({ photosFound: 0, duplicatesFound: 0 })
  // Track max completed to prevent backward jumps from parallel processing
  const maxCompletedRef = useRef(0)

  useEffect(() => {
    const unlisten = listen('scan-event', (event) => {
      const data = event.payload

      if (data.Scan?.Progress) {
        const scanProgress = data.Scan.Progress
        onProgress({
          phase: 'Scanning',
          percent: 10,
          message: `Found ${scanProgress.photos_found} photos...`,
        })
        setStats(prev => ({ ...prev, photosFound: scanProgress.photos_found }))
      }

      if (data.Hash?.Progress) {
        const hashProgress = data.Hash.Progress
        // Only update if progress moved forward (handles out-of-order parallel events)
        if (hashProgress.completed > maxCompletedRef.current) {
          maxCompletedRef.current = hashProgress.completed
          const percent = Math.round((hashProgress.completed / hashProgress.total) * 70) + 10
          onProgress({
            phase: 'Hashing',
            percent,
            message: `Hashing photo ${hashProgress.completed} of ${hashProgress.total}`,
          })
        }
      }

      if (data.Compare?.Progress) {
        onProgress({
          phase: 'Comparing',
          percent: 85,
          message: `Comparing photos...`,
        })
      }

      if (data.Compare?.DuplicateFound) {
        setStats(prev => ({ ...prev, duplicatesFound: prev.duplicatesFound + 1 }))
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [onProgress])

  const resetStats = () => {
    setStats({ photosFound: 0, duplicatesFound: 0 })
    maxCompletedRef.current = 0  // Reset max when starting new scan
  }

  return { stats, resetStats }
}
