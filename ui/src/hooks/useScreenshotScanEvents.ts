import { useEffect, useState, useRef } from 'react'
import { listen } from '../lib/tauri'

interface ScreenshotScanStats {
  screenshotsFound: number
  duplicatesFound: number
}

interface ScanProgress {
  phase: string
  percent: number
  message: string
}

interface UseScreenshotScanEventsProps {
  onProgress: (progress: ScanProgress) => void
}

export function useScreenshotScanEvents({ onProgress }: UseScreenshotScanEventsProps) {
  const [stats, setStats] = useState<ScreenshotScanStats>({ screenshotsFound: 0, duplicatesFound: 0 })
  const maxCompletedRef = useRef(0)

  useEffect(() => {
    const unlisten = listen('screenshot-scan-event', (event) => {
      const data = event.payload

      // Handle scan progress (discovering photos)
      if (data.Scan?.Progress) {
        const scanProgress = data.Scan.Progress
        onProgress({
          phase: 'Scanning',
          percent: 10,
          message: `Scanning for screenshots...`,
        })
        setStats(prev => ({ ...prev, screenshotsFound: scanProgress.photos_found }))
      }

      // Handle hash progress (analyzing images)
      if (data.Hash?.Progress) {
        const hashProgress = data.Hash.Progress
        if (hashProgress.completed > maxCompletedRef.current) {
          maxCompletedRef.current = hashProgress.completed
          const percent = Math.round((hashProgress.completed / hashProgress.total) * 70) + 10
          onProgress({
            phase: 'Analyzing',
            percent,
            message: `Analyzing screenshot ${hashProgress.completed} of ${hashProgress.total}`,
          })
        }
      }

      // Handle comparison progress
      if (data.Compare?.Progress) {
        onProgress({
          phase: 'Comparing',
          percent: 85,
          message: `Comparing screenshots...`,
        })
      }

      // Track duplicates found
      if (data.Compare?.DuplicateFound) {
        setStats(prev => ({ ...prev, duplicatesFound: prev.duplicatesFound + 1 }))
      }

      // Handle completion
      if (data.Pipeline?.Completed) {
        onProgress({
          phase: 'Complete',
          percent: 100,
          message: `Screenshot scan complete`,
        })
      }

      // Handle cancellation
      if (data.Pipeline?.Cancelled) {
        onProgress({
          phase: 'Cancelled',
          percent: 0,
          message: `Screenshot scan cancelled`,
        })
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [onProgress])

  const resetStats = () => {
    setStats({ screenshotsFound: 0, duplicatesFound: 0 })
    maxCompletedRef.current = 0
  }

  return { stats, resetStats }
}
