import { useState, useCallback, useEffect } from 'react'
import { invoke } from '../lib/tauri'

export interface UndoAction {
    id: string
    type: 'delete' | 'move' | 'rename'
    description: string
    files: string[] // filenames for restore
    paths: string[] // original paths
    timestamp: number
}

interface UseUndoOptions {
    maxHistory?: number
    onUndo?: (action: UndoAction) => void
    onRedo?: (action: UndoAction) => void
}

export function useUndo(options: UseUndoOptions = {}) {
    const { maxHistory = 50, onUndo, onRedo } = options

    const [undoStack, setUndoStack] = useState<UndoAction[]>([])
    const [redoStack, setRedoStack] = useState<UndoAction[]>([])
    const [isProcessing, setIsProcessing] = useState(false)

    // Add an action to the undo stack
    const pushAction = useCallback((action: Omit<UndoAction, 'id' | 'timestamp'>) => {
        const fullAction: UndoAction = {
            ...action,
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
        }

        setUndoStack(prev => {
            const newStack = [fullAction, ...prev]
            return newStack.slice(0, maxHistory)
        })

        // Clear redo stack when new action is performed
        setRedoStack([])

        return fullAction
    }, [maxHistory])

    // Perform undo
    const undo = useCallback(async () => {
        if (undoStack.length === 0 || isProcessing) return null

        const [action, ...remainingUndo] = undoStack
        setIsProcessing(true)

        try {
            if (action.type === 'delete') {
                // Restore files from trash
                const result = await invoke<{ restored: number; errors: string[] }>(
                    'restore_from_trash',
                    { filenames: action.files }
                )

                if (result.restored > 0) {
                    setUndoStack(remainingUndo)
                    setRedoStack(prev => [action, ...prev])
                    onUndo?.(action)
                    return { success: true, restored: result.restored, errors: result.errors }
                } else {
                    return { success: false, restored: 0, errors: result.errors }
                }
            }

            return { success: false, restored: 0, errors: ['Unknown action type'] }
        } catch (error) {
            console.error('Undo failed:', error)
            return { success: false, restored: 0, errors: [String(error)] }
        } finally {
            setIsProcessing(false)
        }
    }, [undoStack, isProcessing, onUndo])

    // Perform redo (re-delete the files)
    const redo = useCallback(async () => {
        if (redoStack.length === 0 || isProcessing) return null

        const [action, ...remainingRedo] = redoStack
        setIsProcessing(true)

        try {
            if (action.type === 'delete') {
                // Re-trash the files
                const result = await invoke<{ trashed: number; errors: string[] }>(
                    'trash_files',
                    { paths: action.paths }
                )

                if (result.trashed > 0) {
                    setRedoStack(remainingRedo)
                    setUndoStack(prev => [action, ...prev])
                    onRedo?.(action)
                    return { success: true, count: result.trashed, errors: result.errors }
                } else {
                    return { success: false, count: 0, errors: result.errors }
                }
            }

            return { success: false, count: 0, errors: ['Unknown action type'] }
        } catch (error) {
            console.error('Redo failed:', error)
            return { success: false, count: 0, errors: [String(error)] }
        } finally {
            setIsProcessing(false)
        }
    }, [redoStack, isProcessing, onRedo])

    // Keyboard shortcut handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
            const modKey = isMac ? e.metaKey : e.ctrlKey

            if (modKey && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault()
                    redo()
                } else {
                    e.preventDefault()
                    undo()
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [undo, redo])

    return {
        pushAction,
        undo,
        redo,
        canUndo: undoStack.length > 0 && !isProcessing,
        canRedo: redoStack.length > 0 && !isProcessing,
        isProcessing,
        undoStack,
        redoStack,
        lastAction: undoStack[0] ?? null,
    }
}
