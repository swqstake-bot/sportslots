import type { ReactNode } from 'react'

interface SectionCardProps {
  title?: string
  children: ReactNode
  className?: string
}

export function SectionCard({ title, children, className = '' }: SectionCardProps) {
  return (
    <div className={`casino-card ${className}`.trim()}>
      {title && (
        <h2 className="casino-card-header">
          <span className="casino-card-header-accent"></span>
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}
