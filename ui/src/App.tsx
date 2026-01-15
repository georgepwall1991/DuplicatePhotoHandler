import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ScanView } from './components/ScanView'
import { ResultsView } from './components/ResultsView'
import { ToastProvider } from './components/Toast'
import './App.css'

export type AppState = 'idle' | 'scanning' | 'results'

export interface ScanResult {
  total_photos: number
  duplicate_groups: number
  duplicate_count: number
  potential_savings_bytes: number
  duration_ms: number
  groups: DuplicateGroup[]
  errors: string[]
}

export interface DuplicateGroup {
  id: string
  photos: string[]
  representative: string
  match_type: string
  duplicate_count: number
  duplicate_size_bytes: number
}

function App() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [results, setResults] = useState<ScanResult | null>(null)
  const [progress, setProgress] = useState({ phase: '', percent: 0, message: '' })

  const handleScanComplete = (result: ScanResult) => {
    setResults(result)
    setAppState('results')
  }

  const handleNewScan = () => {
    setResults(null)
    setAppState('idle')
  }

  return (
    <ToastProvider>
      <div className="flex h-screen p-4 gap-4 overflow-hidden relative">
        {/* Ambient background noise */}
        <div className="noise absolute inset-0 z-0 opacity-30" />

        <Sidebar
          activeModule="duplicates"
          onNewScan={handleNewScan}
          potentialSavings={results?.potential_savings_bytes}
        />

        <main className="flex-1 rounded-3xl glass-strong relative z-10 flex flex-col overflow-hidden shadow-2xl">
          {appState === 'idle' && (
            <ScanView
              onScanStart={() => setAppState('scanning')}
              onScanComplete={handleScanComplete}
              onScanCancel={handleNewScan}
              onProgress={setProgress}
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
    </ToastProvider>
  )
}

export default App
