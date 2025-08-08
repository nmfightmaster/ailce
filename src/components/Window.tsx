import type { ReactNode } from 'react'

interface WindowProps {
  title: string
  subtitle?: string
  right?: ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  children: ReactNode
}

export function Window({ title, subtitle, right, className = '', headerClassName = '', bodyClassName = '', children }: WindowProps) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`} style={{ color: 'var(--window-text)' }}>
      <div className={`border-b border-white/10 px-4 py-3 ${headerClassName}`} style={{ background: 'var(--window-bg)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--header-text, var(--window-text))' }}>{title}</h2>
            {subtitle && <p className="text-xs" style={{ color: 'var(--secondary-text, #a1a1aa)' }}>{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      </div>
      <div className={`flex-1 min-h-0 ${bodyClassName}`} style={{ background: 'transparent' }}>{children}</div>
    </div>
  )
}


