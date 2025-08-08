import { useEffect, useMemo, useRef, useState } from 'react'
import { useContextStore } from '../store/useContextStore'
import type { ContextUnit } from '../store/useContextStore'

function roleLabel(role: ContextUnit['type']) {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'AI'
  return 'System'
}

export function ChatPanel() {
  const units = useContextStore((s) => s.units)
  const addUnit = useContextStore((s) => s.addUnit)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [isRequestInFlight, setIsRequestInFlight] = useState(false)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [units.length])

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
      const currentUnits = useContextStore.getState().units
      const messages = assembleMessages(currentUnits)

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
      <div className="whitespace-pre-wrap leading-relaxed text-zinc-100/90">{m.content}</div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Live Context Editor</h1>
        <p className="text-xs text-zinc-400">Chat on the left. Curate context on the right.</p>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {units
          .filter((u) => u.type === 'user' || u.type === 'assistant')
          .map(messageItem)}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
