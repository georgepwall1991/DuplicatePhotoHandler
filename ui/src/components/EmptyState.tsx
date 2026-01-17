import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  message: string
}

export function EmptyState({ icon: Icon, title, message }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="w-24 h-24 mx-auto mb-6 glass-card flex items-center justify-center border-white/5">
        <Icon className="w-10 h-10 text-brand-primary" />
      </div>
      <h3 className="text-2xl font-semibold bg-gradient-to-r from-white to-text-muted bg-clip-text text-transparent mb-2">
        {title}
      </h3>
      <p className="text-text-muted">{message}</p>
    </div>
  )
}
