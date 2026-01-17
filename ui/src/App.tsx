import { useState, useEffect, useRef } from 'react'
import { invoke, listen } from './lib/tauri'
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
    <div className="flex h-screen w-full overflow-hidden bg-surface-950 text-text-primary selection:bg-brand-primary/30">
      {/* Dynamic Background */}
      <div className="mesh-gradient" />
      <div className="noise-overlay" />

      {/* Animated Accents - Subtle Motion */}
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-brand-primary/20 blur-[120px] pointer-events-none"
      />
      <motion.div
        animate={{
          x: [0, -40, 0],
          y: [0, 40, 0],
          opacity: [0.2, 0.4, 0.2]
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="fixed bottom-[-10%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-brand-secondary/20 blur-[100px] pointer-events-none"
      />

      {/* Main Layout Container */}
      <div className="flex w-full h-full relative z-10 p-4 gap-4">

        {/* Sidebar */}
        <div className="w-[300px] flex-shrink-0 h-full">
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
        </div>

        {/* Content Area */}
        <main className="flex-1 h-full min-w-0 glass-panel rounded-2xl overflow-hidden relative flex flex-col">
          <AnimatePresence mode="wait">
            {/* Duplicates Module */}
            {activeModule === 'duplicates' && (
              <>
                {appState === 'idle' && (
                  <motion.div
                    key="duplicates-idle"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 h-full flex flex-col"
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
                    key="duplicates-scanning"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex-1 h-full flex flex-col"
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
                    key="duplicates-results"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex-1 h-full flex flex-col"
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
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex-1 h-full flex flex-col"
                  >
                    <LargeFileScanView
                      isScanning
                      progress={largeFileProgress}
                      onScanStart={() => { }}
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
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex-1 h-full flex flex-col"
                  >
                    <UnorganizedScanView
                      isScanning
                      progress={unorganizedProgress}
                      onScanStart={() => { }}
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
                    className="flex-1 h-full flex flex-col"
                  >
                    <UnorganizedView
                      results={unorganizedResults}
                      onNewScan={handleNewScan}
                      onOrganize={(paths) => {
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
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex-1 h-full flex flex-col"
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
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    className="flex-1 h-full flex flex-col"
                  >
                    <SimilarScanView
                      isScanning
                      progress={similarProgress}
                      onScanStart={() => { }}
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
                    className="flex-1 h-full flex flex-col"
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 h-full flex flex-col"
              >
                <OrganizeView initialPaths={organizePaths} />
              </motion.div>
            )}

            {/* History Module */}
            {activeModule === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 h-full flex flex-col"
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
