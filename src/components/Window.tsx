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
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className={`border-b border-white/10 px-4 py-3 ${headerClassName}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      </div>
      <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
    </div>
  )
}


