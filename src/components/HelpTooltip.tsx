import type { ReactNode } from 'react'

interface HelpTooltipProps {
  title: string
  className?: string
  children?: ReactNode
}

export function HelpTooltip({ title, className = '', children }: HelpTooltipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] text-zinc-300 ${className}`}
      title={title}
      aria-label={title}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] text-zinc-200">
        i
      </span>
      {children}
    </span>
  )
}


