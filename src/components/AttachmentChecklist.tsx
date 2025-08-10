import { useMemo } from 'react'
import { useAttachmentStore } from '../store/useAttachmentStore'
import { useContextStore } from '../store/useContextStore'

export function AttachmentChecklist() {
  const attachments = useAttachmentStore((s) => s.attachments)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const conversations = useContextStore((s) => s.conversations)
  const setConversationAttachmentSelection = useContextStore((s) => (s as any).setConversationAttachmentSelection)

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )

  // Selection is stored on conversation as attachmentIds?: string[]
  const selected = (activeConv as any)?.attachmentIds || []
  const selectedAttachments = useMemo(
    () => attachments.filter((a) => selected.includes(a.id)),
    [attachments, selected]
  )

  const onToggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x: string) => x !== id) : [...selected, id]
    setConversationAttachmentSelection(activeConv?.id, next)
  }

  if (!activeConv) return null

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2 space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">Included attachments</div>
      {selectedAttachments.map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-xs text-zinc-200">
          <input type="checkbox" checked={selected.includes(a.id)} onChange={() => onToggle(a.id)} />
          <span className="truncate" title={a.name}>{a.name}</span>
        </label>
      ))}
      {selectedAttachments.length === 0 && (
        <div className="text-xs text-zinc-500">No attachments selected.</div>
      )}
    </div>
  )
}


