import { useMemo, useState } from 'react'
import { useContextStore } from '../store/useContextStore'
import type { ContextUnit, Conversation } from '../store/useContextStore'
import { ContextUnitItem } from './ContextUnitItem'

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
      {label}
    </span>
  )
}

function TypeBadge({ type }: { type: ContextUnit['type'] }) {
  const map: Record<ContextUnit['type'], string> = {
    user: 'text-sky-300 bg-sky-500/15',
    assistant: 'text-emerald-300 bg-emerald-500/15',
    system: 'text-zinc-300 bg-zinc-500/15',
    note: 'text-amber-300 bg-amber-500/15',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[type]}`}>{type}</span>
  )
}

export function ContextInspector() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const [showRemoved, setShowRemoved] = useState(false)

  const activeConversation: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )
  const units = activeConversation?.units || []

  const visibleUnits = useMemo(
    () => units.filter((u) => (showRemoved ? true : !u.removed)),
    [units, showRemoved]
  )

  const unitItem = (u: ContextUnit) => <ContextUnitItem key={u.id} unit={u} />

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight">Context Inspector</h2>
        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-3 w-3 cursor-pointer accent-rose-500"
              checked={showRemoved}
              onChange={(e) => setShowRemoved(e.target.checked)}
            />
            Show removed
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Summary</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-zinc-300">
            <li>Maintain clean, minimalist, fun UI</li>
            <li>Left: chat, Right: context inspector</li>
            <li>Removed items excluded; pins are prioritized</li>
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Raw units</h3>
          {visibleUnits.map(unitItem)}
          {visibleUnits.length === 0 && (
            <div className="text-xs text-zinc-500">No items.</div>
          )}
        </div>
      </div>
    </div>
  )
}
