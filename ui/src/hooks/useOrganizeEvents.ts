import { useEffect, useState } from 'react'
import { listen } from '../lib/tauri'
import type { OrganizeProgress } from '../lib/types'

interface UseOrganizeEventsProps {
  onProgress: (progress: OrganizeProgress) => void
}

export function useOrganizeEvents({ onProgress }: UseOrganizeEventsProps) {
  const [stats, setStats] = useState({ scanned: 0, currentFile: '' })

  useEffect(() => {
    const unlisten = listen('organize-progress-event', (event) => {
      const data = event.payload as OrganizeProgress

      setStats({
        scanned: data.current,
        currentFile: data.current_file,
      })

      onProgress(data)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [onProgress])

  const resetStats = () => {
    setStats({ scanned: 0, currentFile: '' })
  }

  return { stats, resetStats }
}
