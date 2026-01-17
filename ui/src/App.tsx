import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Sidebar } from './components/Sidebar'
import { ScanView } from './components/ScanView'
import { ResultsView } from './components/ResultsView'
import { ToastProvider, useToast } from './components/Toast'
import './App.css'

// Re-export types from centralized location (avoids circular dependencies)
export type { AppState, ScanResult, DuplicateGroup, ScanProgress } from './lib/types'
import type { AppState, ScanResult, WatcherEvent } from './lib/types'

function AppContent() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [results, setResults] = useState<ScanResult | null>(null)
  const [progress, setProgress] = useState({ phase: '', percent: 0, message: '' })
  const [isWatching, setIsWatching] = useState(false)
  const [watchedPaths, setWatchedPaths] = useState<string[]>([])
  const [scannedPaths, setScannedPaths] = useState<string[]>([])
  const { showToast } = useToast()
  const watcherUnlistenRef = useRef<(() => void) | null>(null)

  // Listen for watcher events
  useEffect(() => {
    const setupListener = async () => {
      watcherUnlistenRef.current = await listen<WatcherEvent>('watcher-event', (event) => {
        const payload = event.payload
        if (payload.Watcher?.PhotoAdded) {
          const filename = payload.Watcher.PhotoAdded.path.split('/').pop()
          showToast(`New photo detected: ${filename}`, 'info')
        } else if (payload.Watcher?.PhotoModified) {
          const filename = payload.Watcher.PhotoModified.path.split('/').pop()
          showToast(`Photo modified: ${filename}`, 'info')
        } else if (payload.Watcher?.PhotoRemoved) {
          const filename = payload.Watcher.PhotoRemoved.path.split('/').pop()
          showToast(`Photo removed: ${filename}`, 'warning')
        } else if (payload.Watcher?.Error) {
          showToast(`Watcher error: ${payload.Watcher.Error.message}`, 'error')
        }
      })
    }
    setupListener()

    return () => {
      if (watcherUnlistenRef.current) {
        watcherUnlistenRef.current()
      }
    }
  }, [showToast])

  // Toggle watcher on/off
  const handleToggleWatch = async () => {
    try {
      if (isWatching) {
        await invoke('stop_watching')
        setIsWatching(false)
        setWatchedPaths([])
        showToast('Folder watching stopped', 'info')
      } else {
        // Use the last scanned paths or show a message
        if (scannedPaths.length === 0) {
          showToast('Run a scan first to set watched folders', 'warning')
          return
        }
        await invoke('start_watching', { paths: scannedPaths })
        setIsWatching(true)
        setWatchedPaths(scannedPaths)
        showToast(`Watching ${scannedPaths.length} folder(s) for changes`, 'success')
      }
    } catch (error) {
      console.error('Watch toggle failed:', error)
      showToast('Failed to toggle folder watching', 'error')
    }
  }

  const handleScanComplete = (result: ScanResult) => {
    setResults(result)
    setAppState('results')
  }

  const handleNewScan = () => {
    setResults(null)
    setAppState('idle')
  }

  return (
    <div className="flex h-screen p-4 gap-4 overflow-hidden relative">
      {/* Ambient background noise */}
      <div className="noise absolute inset-0 z-0 opacity-30" />

      <Sidebar
        activeModule="duplicates"
        onNewScan={handleNewScan}
        potentialSavings={results?.potential_savings_bytes}
        isWatching={isWatching}
        watchedPaths={watchedPaths}
        onToggleWatch={handleToggleWatch}
      />

      <main className="flex-1 rounded-3xl glass-strong relative z-10 flex flex-col overflow-hidden shadow-2xl">
        {appState === 'idle' && (
          <ScanView
            onScanStart={() => setAppState('scanning')}
            onScanComplete={handleScanComplete}
            onScanCancel={handleNewScan}
            onProgress={setProgress}
            onPathsSelected={setScannedPaths}
          />
        )}

        {appState === 'scanning' && (
          <ScanView
            isScanning
            progress={progress}
            onScanStart={() => { }}
            onScanComplete={handleScanComplete}
            onScanCancel={handleNewScan}
            onProgress={setProgress}
            onPathsSelected={setScannedPaths}
          />
        )}

        {appState === 'results' && results && (
          <ResultsView
            results={results}
            onNewScan={handleNewScan}
          />
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App
