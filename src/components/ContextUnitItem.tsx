import { useState, useMemo, useEffect } from 'react'
import type { ContextUnit } from '../store/useContextStore'
import { useContextStore } from '../store/useContextStore'

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
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[type]}`}>{type}</span>
}

export function ContextUnitItem({ unit }: { unit: ContextUnit }) {
  const togglePin = useContextStore((s) => s.togglePin)
  const toggleRemoved = useContextStore((s) => s.toggleRemoved)
  const updateUnit = useContextStore((s) => s.updateUnit)
  const openEditModal = useContextStore((s) => s.openEditModal)
  const openRemoveModal = useContextStore((s) => s.openRemoveModal)
  const activeConversationId = useContextStore((s) => s.activeConversationId)

  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(unit.content)
  const [isExpanded, setIsExpanded] = useState(false)

  // Keep local draft in sync if the backing unit changes externally
  useEffect(() => {
    if (!isEditing) setDraft(unit.content)
  }, [unit.content, isEditing])

  const MAX_PREVIEW_CHARS = 100
  const { displayText, isTruncated } = useMemo(() => {
    const text = unit.content
    if (isEditing) return { displayText: text, isTruncated: false }
    if (isExpanded) return { displayText: text, isTruncated: false }
    if (text.length <= MAX_PREVIEW_CHARS) return { displayText: text, isTruncated: false }
    // take first line or ~MAX_PREVIEW_CHARS
    const firstLineBreak = text.indexOf('\n')
    const limit = Math.min(
      MAX_PREVIEW_CHARS,
      firstLineBreak === -1 ? MAX_PREVIEW_CHARS : Math.min(firstLineBreak, MAX_PREVIEW_CHARS)
    )
    return { displayText: text.slice(0, limit) + '…', isTruncated: true }
  }, [unit.content, isExpanded, isEditing])

  const onSave = () => {
    const trimmed = draft.trim()
    // Enforce editing only for user messages; disable for assistant/system/note
    if (unit.type !== 'user') {
      setIsEditing(false)
      setDraft(unit.content)
      return
    }
    // Open edit modal to choose how to apply the change
    openEditModal(activeConversationId, unit.id, trimmed)
    setIsEditing(false)
  }

  const onCancel = () => {
    setDraft(unit.content)
    setIsEditing(false)
  }

  return (
    <div
      className={`rounded-lg border p-3 ${unit.removed ? 'border-rose-500/20 bg-rose-500/5 opacity-70' : 'border-white/10 bg-white/5'} shadow-soft`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TypeBadge type={unit.type} />
          <span className="text-xs text-zinc-400" title={unit.timestamp}>
            {new Date(unit.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setIsEditing(true)
              setIsExpanded(true)
            }}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${unit.type === 'user' ? 'bg-white/10 text-zinc-300 hover:bg-white/20' : 'bg-white/5 text-zinc-500 cursor-not-allowed'}`}
            title={unit.type === 'user' ? 'Edit' : 'Editing disabled for this message type'}
            disabled={unit.type !== 'user'}
          >
            Edit
          </button>
          <button
            onClick={() => unit.type === 'user' && togglePin(unit.id)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${unit.type !== 'user' ? 'bg-white/5 text-zinc-500 cursor-not-allowed' : unit.pinned ? 'bg-yellow-500 text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}
            title={unit.type !== 'user' ? 'Pinning disabled for this message type' : (unit.pinned ? 'Unpin' : 'Pin')}
            disabled={unit.type !== 'user'}
          >
            {unit.pinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            onClick={() => {
              if (unit.type !== 'user') return
              if (unit.removed) {
                toggleRemoved(unit.id)
              } else {
                openRemoveModal(activeConversationId, unit.id)
              }
            }}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${unit.type !== 'user' ? 'bg-white/5 text-zinc-500 cursor-not-allowed' : unit.removed ? 'bg-emerald-500 text-black' : 'bg-rose-500/80 text-white hover:bg-rose-500'}`}
            title={unit.type !== 'user' ? 'Removal disabled for this message type' : (unit.removed ? 'Restore' : 'Remove from context')}
            disabled={unit.type !== 'user'}
          >
            {unit.removed ? 'Restore' : 'Remove'}
          </button>
        </div>
      </div>
      <div className="mb-2">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(12, Math.max(3, draft.split('\n').length))}
              className="w-full resize-y rounded-md border border-white/10 bg-white/5 p-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={onSave}
                className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400"
              >
                Save
              </button>
              <button
                onClick={onCancel}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100/90">{displayText}</div>
            {isTruncated && (
              <button
                className="mt-1 text-[11px] font-medium text-sky-300 hover:text-sky-200"
                onClick={() => setIsExpanded((v) => !v)}
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {unit.tags.map((t) => (
          <Tag key={t} label={t} />
        ))}
      </div>
    </div>
  )
}


