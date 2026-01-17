import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './components/Sidebar'
import { ScanView } from './components/ScanView'
import { ResultsView } from './components/ResultsView'
import { ScreenshotsView } from './components/ScreenshotsView'
import { ScreenshotScanView } from './components/ScreenshotScanView'
import { LargeFilesView } from './components/LargeFilesView'
import { LargeFileScanView } from './components/LargeFileScanView'
import { OrganizeView } from './components/OrganizeView'
import { UnorganizedScanView } from './components/UnorganizedScanView'
import { UnorganizedView } from './components/UnorganizedView'
import { SimilarScanView } from './components/SimilarScanView'
import { SimilarView } from './components/SimilarView'
import { HistoryView } from './components/HistoryView'
import { SettingsModal } from './components/SettingsModal'
import { ToastProvider, useToast } from './components/Toast'
import './App.css'

export type { AppState, ScanResult, DuplicateGroup, ScanProgress } from './lib/types'
import type { AppState, ScanResult, WatcherEvent, ActiveModule, ScreenshotScanResult, LargeFileScanResult, UnorganizedResult, SimilarResult } from './lib/types'

function AppContent() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [results, setResults] = useState<ScanResult | null>(null)
  const [screenshotResults, setScreenshotResults] = useState<ScreenshotScanResult | null>(null)
  const [screenshotAppState, setScreenshotAppState] = useState<AppState>('idle')
  const [progress, setProgress] = useState({ phase: '', percent: 0, message: '' })
  const [screenshotProgress, setScreenshotProgress] = useState({ phase: '', percent: 0, message: '' })
  const [largeFileResults, setLargeFileResults] = useState<LargeFileScanResult | null>(null)
  const [largeFileAppState, setLargeFileAppState] = useState<AppState>('idle')
  const [largeFileProgress, setLargeFileProgress] = useState({ phase: '', percent: 0, message: '' })
  const [unorganizedResults, setUnorganizedResults] = useState<UnorganizedResult | null>(null)
  const [unorganizedAppState, setUnorganizedAppState] = useState<AppState>('idle')
  const [unorganizedProgress, setUnorganizedProgress] = useState({ phase: '', percent: 0, message: '' })
  const [similarResults, setSimilarResults] = useState<SimilarResult | null>(null)
  const [similarAppState, setSimilarAppState] = useState<AppState>('idle')
  const [similarProgress, setSimilarProgress] = useState({ phase: '', percent: 0, message: '' })
  const [isWatching, setIsWatching] = useState(false)
  const [watchedPaths, setWatchedPaths] = useState<string[]>([])
  const [scannedPaths, setScannedPaths] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [activeModule, setActiveModule] = useState<ActiveModule>('duplicates')
  const [organizePaths, setOrganizePaths] = useState<string[]>([])
  const { showToast } = useToast()
  const watcherUnlistenRef = useRef<(() => void) | null>(null)

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

  const handleToggleWatch = async () => {
    try {
      if (isWatching) {
        await invoke('stop_watching')
        setIsWatching(false)
        setWatchedPaths([])
        showToast('Folder watching stopped', 'info')
      } else {
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
    if (activeModule === 'screenshots') {
      setScreenshotResults(null)
      setScreenshotAppState('idle')
    } else if (activeModule === 'large') {
      setLargeFileResults(null)
      setLargeFileAppState('idle')
    } else if (activeModule === 'unorganized') {
      setUnorganizedResults(null)
      setUnorganizedAppState('idle')
    } else if (activeModule === 'similar') {
      setSimilarResults(null)
      setSimilarAppState('idle')
    } else {
      setResults(null)
      setAppState('idle')
    }
  }

  const handleSimilarScanComplete = (result: SimilarResult) => {
    setSimilarResults(result)
    setSimilarAppState('results')
  }

  const handleScreenshotScanComplete = (result: ScreenshotScanResult) => {
    setScreenshotResults(result)
    setScreenshotAppState('results')
  }

  const handleLargeFileScanComplete = (result: LargeFileScanResult) => {
    setLargeFileResults(result)
    setLargeFileAppState('results')
  }

  const handleUnorganizedScanComplete = (result: UnorganizedResult) => {
    setUnorganizedResults(result)
    setUnorganizedAppState('results')
  }

  return (
    <div className="flex h-screen p-14 gap-10 overflow-hidden relative selection:bg-purple-500/30">
      {/* Dynamic Background */}
      <div className="mesh-bg" />
      <div className="noise" />
      <motion.div 
        animate={{ 
          x: [0, 100, 0], 
          y: [0, -50, 0],
          rotate: [0, 90, 0]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="mesh-circle w-[600px] h-[600px] bg-purple-600/20 -top-48 -left-48" 
      />
      <motion.div 
        animate={{ 
          x: [0, -80, 0], 
          y: [0, 120, 0],
          rotate: [0, -120, 0]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="mesh-circle w-[500px] h-[500px] bg-blue-600/15 bottom-0 right-0" 
      />

      <Sidebar
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        onNewScan={handleNewScan}
        potentialSavings={results?.potential_savings_bytes}
        isWatching={isWatching}
        watchedPaths={watchedPaths}
        onToggleWatch={handleToggleWatch}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="flex-1 relative z-10 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Duplicates Module */}
          {activeModule === 'duplicates' && (
            <>
              {appState === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="flex-1 glass-strong  overflow-hidden shadow-2xl"
                >
                  <ScanView
                    onScanStart={() => setAppState('scanning')}
                    onScanComplete={handleScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setProgress}
                    onPathsSelected={setScannedPaths}
                  />
                </motion.div>
              )}

              {appState === 'scanning' && (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 glass-strong  overflow-hidden shadow-2xl"
                >
                  <ScanView
                    isScanning
                    progress={progress}
                    onScanStart={() => { }}
                    onScanComplete={handleScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setProgress}
                    onPathsSelected={setScannedPaths}
                  />
                </motion.div>
              )}

              {appState === 'results' && results && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5, ease: "circOut" }}
                  className="flex-1 glass-strong  overflow-hidden shadow-2xl"
                >
                  <ResultsView
                    results={results}
                    onNewScan={handleNewScan}
                  />
                </motion.div>
              )}
            </>
          )}

          {/* Screenshots Module */}
          {activeModule === 'screenshots' && (
            <>
              {screenshotAppState === 'idle' && (
                <motion.div
                  key="screenshot-idle"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <ScreenshotScanView
                    onScanStart={() => setScreenshotAppState('scanning')}
                    onScanComplete={handleScreenshotScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setScreenshotProgress}
                  />
                </motion.div>
              )}

              {screenshotAppState === 'scanning' && (
                <motion.div
                  key="screenshot-scanning"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <ScreenshotScanView
                    isScanning
                    progress={screenshotProgress}
                    onScanStart={() => { }}
                    onScanComplete={handleScreenshotScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setScreenshotProgress}
                  />
                </motion.div>
              )}

              {screenshotAppState === 'results' && screenshotResults && (
                <motion.div
                  key="screenshot-results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5, ease: "circOut" }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <ScreenshotsView
                    results={screenshotResults}
                    onNewScan={handleNewScan}
                  />
                </motion.div>
              )}
            </>
          )}

          {/* Large Files Module */}
          {activeModule === 'large' && (
            <>
              {largeFileAppState === 'idle' && (
                <motion.div
                  key="large-idle"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <LargeFileScanView
                    onScanStart={() => setLargeFileAppState('scanning')}
                    onScanComplete={handleLargeFileScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setLargeFileProgress}
                  />
                </motion.div>
              )}

              {largeFileAppState === 'scanning' && (
                <motion.div
                  key="large-scanning"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <LargeFileScanView
                    isScanning
                    progress={largeFileProgress}
                    onScanStart={() => {}}
                    onScanComplete={handleLargeFileScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setLargeFileProgress}
                  />
                </motion.div>
              )}

              {largeFileAppState === 'results' && largeFileResults && (
                <motion.div
                  key="large-results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5, ease: "circOut" }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <LargeFilesView
                    results={largeFileResults}
                    onNewScan={handleNewScan}
                  />
                </motion.div>
              )}
            </>
          )}

          {/* Unorganized Module */}
          {activeModule === 'unorganized' && (
            <>
              {unorganizedAppState === 'idle' && (
                <motion.div
                  key="unorganized-idle"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <UnorganizedScanView
                    onScanStart={() => setUnorganizedAppState('scanning')}
                    onScanComplete={handleUnorganizedScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setUnorganizedProgress}
                  />
                </motion.div>
              )}

              {unorganizedAppState === 'scanning' && (
                <motion.div
                  key="unorganized-scanning"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <UnorganizedScanView
                    isScanning
                    progress={unorganizedProgress}
                    onScanStart={() => {}}
                    onScanComplete={handleUnorganizedScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setUnorganizedProgress}
                  />
                </motion.div>
              )}

              {unorganizedAppState === 'results' && unorganizedResults && (
                <motion.div
                  key="unorganized-results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5, ease: "circOut" }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <UnorganizedView
                    results={unorganizedResults}
                    onNewScan={handleNewScan}
                    onOrganize={(paths) => {
                      // Store paths and navigate to organize module
                      setOrganizePaths(paths)
                      setActiveModule('organize')
                      showToast(`${paths.length} folder(s) pre-selected for organization`, 'success')
                    }}
                  />
                </motion.div>
              )}
            </>
          )}

          {/* Similar Photos Module */}
          {activeModule === 'similar' && (
            <>
              {similarAppState === 'idle' && (
                <motion.div
                  key="similar-idle"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <SimilarScanView
                    onScanStart={() => setSimilarAppState('scanning')}
                    onScanComplete={handleSimilarScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setSimilarProgress}
                  />
                </motion.div>
              )}

              {similarAppState === 'scanning' && (
                <motion.div
                  key="similar-scanning"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <SimilarScanView
                    isScanning
                    progress={similarProgress}
                    onScanStart={() => {}}
                    onScanComplete={handleSimilarScanComplete}
                    onScanCancel={handleNewScan}
                    onProgress={setSimilarProgress}
                  />
                </motion.div>
              )}

              {similarAppState === 'results' && similarResults && (
                <motion.div
                  key="similar-results"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5, ease: "circOut" }}
                  className="flex-1 glass-strong overflow-hidden shadow-2xl"
                >
                  <SimilarView
                    results={similarResults}
                    onNewScan={handleNewScan}
                  />
                </motion.div>
              )}
            </>
          )}

          {/* Organize Module */}
          {activeModule === 'organize' && (
            <motion.div
              key="organize"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="flex-1 glass-strong overflow-hidden shadow-2xl"
            >
              <OrganizeView initialPaths={organizePaths} />
            </motion.div>
          )}

          {/* History Module */}
          {activeModule === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              className="flex-1 glass-strong overflow-hidden shadow-2xl"
            >
              <HistoryView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onCacheCleared={() => showToast('Cache cleared successfully', 'success')}
      />
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
