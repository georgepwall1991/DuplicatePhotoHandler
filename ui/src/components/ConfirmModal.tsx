interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  isLoading?: boolean
  loadingLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  isLoading = false,
  loadingLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: '⚠️',
      iconBg: 'bg-red-500/20',
      button: 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600',
    },
    warning: {
      icon: '⚠️',
      iconBg: 'bg-amber-500/20',
      button: 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600',
    },
    info: {
      icon: 'ℹ️',
      iconBg: 'bg-blue-500/20',
      button: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600',
    },
  }

  const styles = variantStyles[variant]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl animate-scale-in">
        {/* Icon */}
        <div className={`w-16 h-16 mx-auto mb-6 rounded-full ${styles.iconBg} flex items-center justify-center animate-bounce-subtle`}>
          <span className="text-3xl">{styles.icon}</span>
        </div>

        <h3 className="text-2xl font-semibold text-white text-center mb-3">{title}</h3>
        <div className="text-gray-400 text-center mb-8">{message}</div>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-6 py-3.5 glass-card rounded-xl text-white font-medium transition-all duration-200 hover:bg-white/10 hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-6 py-3.5 ${styles.button} disabled:from-gray-600 disabled:to-gray-700 rounded-xl text-white font-semibold transition-all duration-200 hover:scale-105 active:scale-95`}
          >
            {isLoading ? (loadingLabel || 'Loading...') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
