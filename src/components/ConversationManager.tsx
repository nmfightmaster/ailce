import { useMemo, useState } from 'react'
import { useContextStore } from '../store/useContextStore'
import { Window } from './Window'
import { HelpTooltip } from './HelpTooltip'

export function ConversationManager() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const setActiveConversation = useContextStore((s) => s.setActiveConversation)
  const renameConversation = useContextStore((s) => s.renameConversation)
  const createConversation = useContextStore((s) => s.createConversation)
  const deleteConversation = useContextStore((s) => s.deleteConversation)

  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
  const [systemPromptDraft, setSystemPromptDraft] = useState('')

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )

  const handleCreateConversation = () => {
    const title = conversationTitleDraft.trim() || undefined
    const systemText = systemPromptDraft.trim()
    if (systemText) {
      createConversation(title, [
        {
          id: Math.random().toString(36).slice(2),
          type: 'system',
          content: systemText,
          tags: [],
          pinned: true,
          removed: false,
          timestamp: new Date().toISOString(),
        },
      ])
    } else {
      createConversation(title)
    }
    setConversationTitleDraft('')
    setSystemPromptDraft('')
  }

  return (
    <Window
      title="Conversation Manager"
      subtitle="Branches are full, independent conversations"
      right={<HelpTooltip title={'Branches = independent conversation forks. Use a branch to explore alternatives without affecting the original conversation.'} />}
    >
      <div className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <input
            value={conversationTitleDraft}
            onChange={(e) => setConversationTitleDraft(e.target.value)}
            placeholder="New conversation title"
            aria-label="New conversation title"
            className="w-52 rounded-md border border-white/10 bg-white/5 p-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          <button
            onClick={handleCreateConversation}
            className="rounded-md bg-sky-500 px-2.5 py-1.5 text-xs font-medium text-black hover:bg-sky-400"
          >
            New Conversation
          </button>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-400">
            system message
          </label>
          <textarea
            value={systemPromptDraft}
            onChange={(e) => setSystemPromptDraft(e.target.value)}
            placeholder="e.g., You are a concise assistant..."
            rows={2}
            className="w-full max-w-[520px] resize-y rounded-md border border-white/10 bg-white/5 p-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {conversations.map((c) => {
            const isActive = c.id === activeConversation?.id
            const parent = c.parentConversationId
              ? conversations.find((x) => x.id === c.parentConversationId)
              : undefined
            return (
              <div key={c.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${isActive ? 'border-sky-500/40 bg-sky-500/10 text-sky-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}>
                <button
                  className="truncate max-w-[12rem] flex items-center gap-1"
                  title={parent ? `${c.title} — Branch of: ${parent.title}` : `${c.title} — Conversation`}
                  onClick={() => setActiveConversation(c.id)}
                >
                  {parent ? (
                    <>
                      <span className="rounded-sm bg-sky-500/20 px-1 py-[1px] text-[10px] text-sky-200">Branch</span>
                      <span className="truncate">{c.title}</span>
                      <span title={`Branch of ${parent.title}`} className="text-[10px]">↗</span>
                    </>
                  ) : (
                    <>
                      <span className="rounded-sm bg-white/10 px-1 py-[1px] text-[10px] text-zinc-200">Conversation</span>
                      <span className="truncate">{c.title}</span>
                    </>
                  )}
                </button>
                <button
                  className="text-[10px] text-zinc-400 hover:text-zinc-200"
                  title="Rename"
                  onClick={() => {
                    const next = prompt('Rename conversation', c.title)
                    if (next && next.trim()) renameConversation(c.id, next)
                  }}
                >
                  ✎
                </button>
                <button
                  className="text-[10px] text-rose-400 hover:text-rose-300"
                  title="Delete"
                  onClick={() => {
                    if (confirm('Delete this conversation?')) deleteConversation(c.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Window>
  )
}


