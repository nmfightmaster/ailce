import { useEffect, useMemo, useState } from 'react'
import { Window } from './Window'
import { useContextStore } from '../store/useContextStore'
import type { Conversation } from '../store/useContextStore'

export function SummaryWindow() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const requestSummaryRefresh = useContextStore((s) => s.requestSummaryRefresh)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('lce:summaryCollapsed')
      if (raw == null) return true
      return JSON.parse(raw)
    } catch {
      return true
    }
  })

  const activeConversation: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )

  useEffect(() => {
    if (!activeConversation) return
    if (!activeConversation.summary && !activeConversation.summaryLoading) {
      requestSummaryRefresh(activeConversation.id)
    }
  }, [activeConversation?.id])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('lce:summaryCollapsed', JSON.stringify(next)) } catch {}
  }

  return (
    <Window
      title="Summary"
      className={collapsed ? 'min-h-[44px]' : 'min-h-[140px]'}
      bodyClassName="min-h-0"
      right={
        <div className="flex items-center gap-2">
          {activeConversation?.summaryLoading && (
            <span className="text-[11px] text-zinc-400">Generating…</span>
          )}
          <button
            onClick={toggleCollapsed}
            className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/20"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button
            onClick={() => activeConversation && requestSummaryRefresh(activeConversation.id, true, true)}
            className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/20"
            title="Regenerate summary"
          >
            Refresh
          </button>
        </div>
      }
    >
      {!collapsed && (
        <div className="h-full min-h-0 overflow-y-auto p-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-sm leading-relaxed text-zinc-200">
              {activeConversation?.summaryError ? (
                <span className="text-rose-300/90">Summary unavailable.</span>
              ) : (
                (() => {
                  const text = (activeConversation?.summary || '').trimEnd()
                  return <span className="whitespace-pre-wrap">{text || ' '}</span>
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </Window>
  )
}


