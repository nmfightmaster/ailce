import { useMemo, useState } from 'react'
import { Window } from './Window'
import { useAttachmentStore } from '../store/useAttachmentStore'
import { useContextStore } from '../store/useContextStore'
import { useSettingsStore } from '../store/useSettingsStore'

export function AttachmentLibrary() {
  const attachments = useAttachmentStore((s) => s.attachments)
  const chunksByAttachmentId = useAttachmentStore((s) => s.chunksByAttachmentId)
  const uploadFiles = useAttachmentStore((s) => s.uploadFiles)
  const renameAttachment = useAttachmentStore((s) => s.renameAttachment)
  const deleteAttachment = useAttachmentStore((s) => s.deleteAttachment)

  const [query, setQuery] = useState('')

  // Conversation selection state to allow toggling inclusion from the library
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const setConversationAttachmentSelection = useContextStore((s) => (s as any).setConversationAttachmentSelection)
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )
  const selectedIds: string[] = (activeConv as any)?.attachmentIds || []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return attachments
    return attachments.filter((a) => a.name.toLowerCase().includes(q))
  }, [attachments, query])

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files
    if (!f || f.length === 0) return
    const files = Array.from(f)
    await uploadFiles(files)
    e.currentTarget.value = ''
  }

  const fmtKb = (n: number) => `${Math.round(n / 1024)} KB`

  const itemRow = (id: string) => {
    const a = attachments.find((x) => x.id === id)
    if (!a) return null
    const ch = chunksByAttachmentId[id] || []
    const tokens = ch.reduce((sum, c) => sum + (c.tokenCount || 0), 0)
    const isSelected = selectedIds.includes(id)
    const toggle = () => {
      const next = isSelected ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
      setConversationAttachmentSelection(activeConv?.id, next)
    }
    return (
      <div key={id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-200">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isSelected} onChange={toggle} title="Include in active conversation" />
        </label>
        <div className="flex-1 min-w-0">
          <div className="truncate" title={a.name}>{a.name}</div>
          <div className="text-[10px] text-zinc-400">{fmtKb(a.sizeBytes)} · {ch.length} chunks · {tokens} tokens</div>
        </div>
        <button
          className="text-[10px] text-zinc-400 hover:text-zinc-200"
          title="Rename"
          onClick={() => {
            const next = prompt('Rename attachment', a.name)
            if (next && next.trim()) renameAttachment(id, next)
          }}
        >
          ✎
        </button>
        <button
          className="text-[10px] text-rose-400 hover:text-rose-300"
          title="Delete attachment"
          onClick={() => {
            if (confirm(`Delete attachment “${a.name}”?`)) deleteAttachment(id)
          }}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <Window
      title="Attachment Library"
      subtitle="Upload, search, rename, and delete documents."
      right={
        <div className="flex items-center gap-2">
          <EmbeddingModelSelector />
          <label className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-black hover:bg-emerald-400 cursor-pointer">
            Upload
            <input
              type="file"
              accept=".txt,.md,.pdf"
              multiple
              className="hidden"
              onChange={onUpload}
            />
          </label>
        </div>
      }
    >
      <div className="p-3 space-y-2">
        <CurrentEmbeddingModelBadge />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search attachments…"
          className="w-full rounded-md border border-white/10 bg-white/5 p-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
        <div className="grid gap-2">
          {filtered.map((a) => itemRow(a.id))}
          {filtered.length === 0 && (
            <div className="text-xs text-zinc-500">No attachments yet.</div>
          )}
        </div>
      </div>
    </Window>
  )
}

function CurrentEmbeddingModelBadge() {
  const model = useSettingsStore((s) => s.embeddingModel)
  return (
    <div className="text-[11px] text-zinc-400">Embedding model: <span className="text-zinc-200">{model}</span></div>
  )
}

function EmbeddingModelSelector() {
  const model = useSettingsStore((s) => s.embeddingModel)
  const setModel = useSettingsStore((s) => s.setEmbeddingModel)
  const list = useSettingsStore((s) => s.getAllEmbeddingModels())
  return (
    <select
      value={model}
      onChange={(e) => setModel(e.target.value)}
      className="rounded-md border border-white/10 bg-zinc-900/80 p-1 text-xs text-zinc-100 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      style={{ colorScheme: 'dark' }}
      title="Embedding model"
    >
      {list.map((m) => (
        <option key={m} value={m} className="bg-zinc-900 text-zinc-100">{m}</option>
      ))}
    </select>
  )
}


