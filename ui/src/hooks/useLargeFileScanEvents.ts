import { useEffect, useState } from 'react'
import { listen } from '../lib/tauri'

interface LargeFileScanStats {
  filesScanned: number
  largeFilesFound: number
}

interface ScanProgress {
  phase: string
  percent: number
  message: string
}

interface LargeFileScanEvent {
  files_scanned: number
  large_files_found: number
  current_file: string
  phase: string
}

interface UseLargeFileScanEventsProps {
  onProgress: (progress: ScanProgress) => void
}

export function useLargeFileScanEvents({ onProgress }: UseLargeFileScanEventsProps) {
  const [stats, setStats] = useState<LargeFileScanStats>({ filesScanned: 0, largeFilesFound: 0 })

  useEffect(() => {
    const unlisten = listen('large-file-scan-event', (event) => {
      const data = event.payload as LargeFileScanEvent

      setStats({
        filesScanned: data.files_scanned,
        largeFilesFound: data.large_files_found,
      })

      if (data.phase === 'Complete') {
        onProgress({
          phase: 'Complete',
          percent: 100,
          message: `Found ${data.large_files_found} large files`,
        })
      } else {
        // For scanning phase, show a realistic progress
        // Since we don't know total file count, use a pulsing progress
        const message = data.files_scanned > 0
          ? `Scanned ${data.files_scanned.toLocaleString()} files, found ${data.large_files_found} large`
          : 'Starting scan...'

        onProgress({
          phase: 'Scanning',
          percent: Math.min(90, Math.floor(data.files_scanned / 100) % 90 + 10),
          message,
        })
      }
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [onProgress])

  const resetStats = () => {
    setStats({ filesScanned: 0, largeFilesFound: 0 })
  }

  return { stats, resetStats }
}
