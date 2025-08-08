import { useEffect, useMemo, useRef, useState } from 'react'
import { useContextStore } from '../store/useContextStore'
import type { ContextUnit, Conversation } from '../store/useContextStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function roleLabel(role: ContextUnit['type']) {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'AI'
  return 'System'
}

export function ChatPanel() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const setActiveConversation = useContextStore((s) => s.setActiveConversation)
  const renameConversation = useContextStore((s) => s.renameConversation)
  const createConversation = useContextStore((s) => s.createConversation)
  const deleteConversation = useContextStore((s) => s.deleteConversation)
  const addUnit = useContextStore((s) => s.addUnit)
  const assembleMessagesFromStore = useContextStore((s) => s.assembleMessages)
  const regenerationRequest = useContextStore((s) => s.regenerationRequest)
  const clearRegenerationRequest = useContextStore((s) => s.clearRegenerationRequest)
  const insertAssistantAfter = useContextStore((s) => s.insertAssistantAfter)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [isRequestInFlight, setIsRequestInFlight] = useState(false)

  const activeConversation: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )

  const units = activeConversation?.units || []

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [units.length, activeConversation?.id])

  const assembleMessages = (allUnits: ContextUnit[]) => {
    if (!allUnits || allUnits.length === 0) return [] as { role: 'system' | 'user' | 'assistant'; content: string }[]

    const sorted = [...allUnits].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const lastUser = [...sorted]
      .filter((u) => u.type === 'user')
      .reduce<ContextUnit | null>((acc, cur) => {
        if (!acc) return cur
        return new Date(cur.timestamp).getTime() >= new Date(acc.timestamp).getTime() ? cur : acc
      }, null)

    const lastUserTime = lastUser ? new Date(lastUser.timestamp).getTime() : null

    const removedBeforeLastUser = lastUser
      ? sorted.filter(
          (u) => u.removed && new Date(u.timestamp).getTime() < (lastUserTime as number)
        )
      : []

    const forgetMessages = removedBeforeLastUser.map((u) => ({
      role: 'system' as const,
      content: `Note: Forget any earlier mention of '${u.content}'. It is incorrect or irrelevant.`,
    }))

    const nonRemoved = sorted.filter((u) => !u.removed)
    const mainMessages = nonRemoved.map((u) => ({
      role: (u.type === 'note' ? 'system' : (u.type as 'system' | 'user' | 'assistant')),
      content: u.content,
    }))

    return [...forgetMessages, ...mainMessages]
  }

  const messagesPreview = useMemo(() => assembleMessages(units), [units])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    const userUnit: ContextUnit = {
      id: Math.random().toString(36).slice(2),
      type: 'user',
      content: trimmed,
      tags: [],
      pinned: false,
      removed: false,
      timestamp: new Date().toISOString(),
    }
    addUnit(userUnit)
    setInput('')
    setIsRequestInFlight(true)

    try {
      const currentConversationId = useContextStore.getState().activeConversationId || (useContextStore.getState().conversations[0]?.id ?? '')
      const messages = assembleMessagesFromStore(currentConversationId)

      const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
      if (!apiKey) {
        throw new Error('Missing VITE_OPENAI_API_KEY')
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.status}`)
      }
      const data: any = await response.json()
      const aiText: string = data?.choices?.[0]?.message?.content ?? ''

      addUnit({
        id: Math.random().toString(36).slice(2),
        type: 'assistant',
        content: aiText || '[Error: failed to get response]',
        tags: [],
        pinned: false,
        removed: false,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      addUnit({
        id: Math.random().toString(36).slice(2),
        type: 'assistant',
        content: '[Error: failed to get response]',
        tags: [],
        pinned: false,
        removed: false,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setIsRequestInFlight(false)
    }
  }

  // Handle regeneration flow for Trim and Branch
  useEffect(() => {
    const req = regenerationRequest
    if (!req) return
    const run = async () => {
      try {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
        if (!apiKey) throw new Error('Missing VITE_OPENAI_API_KEY')
        const messages = assembleMessagesFromStore(req.targetConversationId, req.editedUnitId)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages }),
        })
        if (!response.ok) throw new Error(`OpenAI error: ${response.status}`)
        const data: any = await response.json()
        const aiText: string = data?.choices?.[0]?.message?.content ?? ''
        insertAssistantAfter(req.targetConversationId, req.editedUnitId, aiText || '[Error: failed to get response]')
      } catch (e) {
        insertAssistantAfter(req.targetConversationId, req.editedUnitId, '[Error: failed to get response]')
      } finally {
        clearRegenerationRequest()
      }
    }
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerationRequest])

  const messageItem = (m: ContextUnit) => (
    <div key={m.id} className="flex gap-3">
      <div
        className={
          'shrink-0 select-none rounded-full px-2.5 py-1 text-xs font-medium ' +
          (m.type === 'user'
            ? 'bg-sky-500/15 text-sky-300'
            : m.type === 'assistant'
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-zinc-500/15 text-zinc-300')
        }
        title={new Date(m.timestamp).toLocaleTimeString()}
      >
        {roleLabel(m.type)}
      </div>
      <div className="prose prose-invert max-w-none prose-pre:mt-2 prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-code:text-[0.9em] prose-code:before:hidden prose-code:after:hidden">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {m.content}
        </ReactMarkdown>
      </div>
    </div>
  )

  const [conversationTitleDraft, setConversationTitleDraft] = useState('')

  const handleCreateConversation = () => {
    const title = conversationTitleDraft.trim() || undefined
    createConversation(title)
    setConversationTitleDraft('')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Live Context Editor</h1>
            <p className="text-xs text-zinc-400">Chat on the left. Curate context on the right.</p>
          </div>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {units
          .filter((u) => !u.removed)
          .filter((u) => u.type === 'user' || u.type === 'assistant')
          .map(messageItem)}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!isRequestInFlight) {
                  void handleSend()
                }
              }
            }}
            placeholder="Type a message..."
            rows={2}
            className="min-h-10 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          <button
            onClick={handleSend}
            disabled={isRequestInFlight}
            className="h-10 shrink-0 rounded-lg bg-sky-500 px-4 text-sm font-medium text-white shadow-soft hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            {isRequestInFlight ? 'Sending…' : 'Send'}
          </button>
        </div>
        {import.meta.env.DEV && (
          <details className="mt-3 rounded-lg border border-white/10 bg-zinc-900/70 p-3 text-xs text-zinc-300">
            <summary className="cursor-pointer select-none text-zinc-200">View assembled API context</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-snug text-zinc-200">
              {JSON.stringify(messagesPreview, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
