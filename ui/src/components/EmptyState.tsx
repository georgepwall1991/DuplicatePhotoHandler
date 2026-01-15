interface EmptyStateProps {
  icon: string
  title: string
  message: string
}

export function EmptyState({ icon, title, message }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="w-24 h-24 mx-auto mb-6 rounded-full glass-card flex items-center justify-center">
        <span className="text-5xl">{icon}</span>
      </div>
      <h3 className="text-2xl font-semibold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
        {title}
      </h3>
      <p className="text-gray-400">{message}</p>
    </div>
  )
}
