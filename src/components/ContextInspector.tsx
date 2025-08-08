import { useEffect, useMemo } from 'react'
import { useContextStore } from '../store/useContextStore'
import type { ContextUnit, Conversation } from '../store/useContextStore'
import { ContextUnitItem } from './ContextUnitItem'
import { Window } from './Window'

export function ContextInspector() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const requestSummaryRefresh = useContextStore((s) => s.requestSummaryRefresh)

  const activeConversation: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )
  const units = activeConversation?.units || []
  const totals = {
    total: activeConversation?.totalTokens || 0,
    user: activeConversation?.totalUserTokens || 0,
    assistant: activeConversation?.totalAssistantTokens || 0,
  }

  const visibleUnits = useMemo(() => units.filter((u) => !u.removed), [units])

  const unitItem = (u: ContextUnit) => <ContextUnitItem key={u.id} unit={u} />

  // Kick off summary generation on mount/when switching conversations if missing
  useEffect(() => {
    if (!activeConversation) return
    if (!activeConversation.summary && !activeConversation.summaryLoading) {
      requestSummaryRefresh(activeConversation.id)
    }
  }, [activeConversation?.id])

  const cap = 128_000
  const used = totals.total
  const userPct = used > 0 ? Math.min(100, (totals.user / cap) * 100) : 0
  const assistantPct = used > 0 ? Math.min(100 - userPct, (totals.assistant / cap) * 100) : 0
  const remainingPct = Math.max(0, 100 - userPct - assistantPct)

  return (
    <Window
      title="Context Inspector"
      bodyClassName="flex flex-col"
      headerClassName=""
      right={
        <div className="w-56" title={`User: ${totals.user} tokens, Assistant: ${totals.assistant} tokens`}>
          <div className="text-xs mb-1" style={{ color: 'var(--header-text)' }}>
            {`Context Tokens: ${totals.total} / 128k`}
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full flex"
            style={{ background: 'var(--token-bar-bg)' }}
            aria-label="Token breakdown"
          >
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: `${userPct}%`, background: 'var(--user-token-color)' }}
            />
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: `${assistantPct}%`, background: 'var(--assistant-token-color)' }}
            />
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: `${remainingPct}%`, background: 'var(--remaining-token-color)' }}
            />
          </div>
        </div>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Raw units</h3>
          {visibleUnits.map(unitItem)}
          {visibleUnits.length === 0 && (
            <div className="text-xs text-zinc-500">No items.</div>
          )}
        </div>
      </div>
    </Window>
  )
}
