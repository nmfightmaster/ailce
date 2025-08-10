import type { ReactNode } from 'react'

interface InfoBannerProps {
  children: ReactNode
  className?: string
}

export function InfoBanner({ children, className = '' }: InfoBannerProps) {
  return (
    <div className={`rounded-md border border-white/10 bg-white/5 p-2 text-[12px] text-zinc-300 ${className}`}>
      {children}
    </div>
  )
}


