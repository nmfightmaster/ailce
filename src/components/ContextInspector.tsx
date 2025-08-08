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

  const visibleUnits = useMemo(() => units.filter((u) => !u.removed), [units])

  const unitItem = (u: ContextUnit) => <ContextUnitItem key={u.id} unit={u} />

  // Kick off summary generation on mount/when switching conversations if missing
  useEffect(() => {
    if (!activeConversation) return
    if (!activeConversation.summary && !activeConversation.summaryLoading) {
      requestSummaryRefresh(activeConversation.id)
    }
  }, [activeConversation?.id])

  return (
    <Window title="Context Inspector" bodyClassName="flex flex-col">
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
