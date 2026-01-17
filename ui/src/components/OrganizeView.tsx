import { useState, useCallback } from 'react'
import { invoke } from '../lib/tauri'

import { OrganizeConfigView } from './OrganizeConfigView'
import { OrganizePreviewView } from './OrganizePreviewView'
import { OrganizeResultView } from './OrganizeResultView'
import { ScanProgress } from './ScanProgress'
import { useOrganizeEvents } from '../hooks/useOrganizeEvents'
import type {
  OrganizeConfig,
  OrganizePlan,
  OrganizeResult,
  OperationMode,
  FolderStructure,
  OrganizeProgress,
} from '../lib/types'

type ViewState = 'config' | 'scanning' | 'preview' | 'executing' | 'result'

export function OrganizeView() {
  const [viewState, setViewState] = useState<ViewState>('config')
  const [plan, setPlan] = useState<OrganizePlan | null>(null)
  const [result, setResult] = useState<OrganizeResult | null>(null)
  const [config, setConfig] = useState<OrganizeConfig | null>(null)
  const [progress, setProgress] = useState<OrganizeProgress>({
    phase: '',
    current: 0,
    total: 0,
    current_file: '',
  })

  const handleProgress = useCallback((p: OrganizeProgress) => {
    setProgress(p)
  }, [])

  useOrganizeEvents({ onProgress: handleProgress })

  const handleStartPreview = async (configInput: {
    sourcePaths: string[]
    destination: string
    structure: FolderStructure
    operation: OperationMode
  }) => {
    const organizeConfig: OrganizeConfig = {
      source_paths: configInput.sourcePaths,
      destination: configInput.destination,
      structure: configInput.structure,
      operation: configInput.operation,
    }

    setConfig(organizeConfig)
    setViewState('scanning')
    setProgress({ phase: 'Scanning', current: 0, total: 0, current_file: '' })

    try {
      const planResult = await invoke<OrganizePlan>('create_organize_plan', {
        config: organizeConfig,
      })
      setPlan(planResult)
      setViewState('preview')
    } catch (error) {
      console.error('Failed to create plan:', error)
      setViewState('config')
    }
  }

  const handleExecute = async () => {
    if (!plan || !config) return

    setViewState('executing')
    setProgress({ phase: 'Organizing', current: 0, total: plan.total_files, current_file: '' })

    try {
      const execResult = await invoke<OrganizeResult>('execute_organize_plan', {
        operation: config.operation,
      })
      setResult(execResult)
      setViewState('result')
    } catch (error) {
      console.error('Failed to execute plan:', error)
      setViewState('preview')
    }
  }

  const handleNewOrganize = () => {
    setPlan(null)
    setResult(null)
    setConfig(null)
    setProgress({ phase: '', current: 0, total: 0, current_file: '' })
    setViewState('config')
  }

  const handleBackToConfig = () => {
    setPlan(null)
    setViewState('config')
  }

  // Render based on state
  if (viewState === 'config') {
    return <OrganizeConfigView onStartPreview={handleStartPreview} />
  }

  if (viewState === 'scanning') {
    return (
      <ScanProgress
        phase={progress.phase}
        percent={Math.min(90, Math.floor(progress.current / 10) % 90 + 10)}
        message={`Scanned ${progress.current.toLocaleString()} files...`}
        photosFound={progress.current}
        duplicatesFound={0}
        isCancelling={false}
        onCancel={handleBackToConfig}
      />
    )
  }

  if (viewState === 'preview' && plan && config) {
    return (
      <OrganizePreviewView
        plan={plan}
        operation={config.operation}
        onExecute={handleExecute}
        onBack={handleBackToConfig}
      />
    )
  }

  if (viewState === 'executing' && plan) {
    const percent = plan.total_files > 0
      ? Math.round((progress.current / plan.total_files) * 100)
      : 0

    return (
      <ScanProgress
        phase="Organizing"
        percent={percent}
        message={`Organizing ${progress.current.toLocaleString()} of ${plan.total_files.toLocaleString()} files...`}
        photosFound={progress.current}
        duplicatesFound={0}
        isCancelling={false}
        onCancel={() => {}} // Can't cancel mid-organize
      />
    )
  }

  if (viewState === 'result' && result && config) {
    return (
      <OrganizeResultView
        result={result}
        destination={config.destination}
        onNewOrganize={handleNewOrganize}
      />
    )
  }

  // Fallback
  return <OrganizeConfigView onStartPreview={handleStartPreview} />
}
