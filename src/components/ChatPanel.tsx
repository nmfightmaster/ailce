import { useEffect, useMemo, useRef, useState } from 'react'
import { useContextStore } from '../store/useContextStore'
import type { ContextUnit, Conversation } from '../store/useContextStore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Window } from './Window'

function roleLabel(role: ContextUnit['type']) {
  if (role === 'user') return 'You'
  if (role === 'assistant') return 'AI'
  return 'System'
}

export function ChatPanel() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  // Pull only what ChatPanel uses from the store
  const addUnit = useContextStore((s) => s.addUnit)
  const assembleMessagesFromStore = useContextStore((s) => s.assembleMessages)
  const regenerationRequest = useContextStore((s) => s.regenerationRequest)
  const clearRegenerationRequest = useContextStore((s) => s.clearRegenerationRequest)
  const insertAssistantAfter = useContextStore((s) => s.insertAssistantAfter)

  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [isRequestInFlight, setIsRequestInFlight] = useState(false)
  // Streaming UI state
  const [isThinking, setIsThinking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const streamedTextRef = useRef('')
  const streamAbortRef = useRef<AbortController | null>(null)
  const streamBufferRef = useRef('')
  const flushTimerRef = useRef<number | null>(null)
  const hasReceivedFirstChunkRef = useRef(false)
  const STREAM_FLUSH_MS = 40 // debounce to avoid excessive re-renders
  // Seed system message for blank conversations
  const [systemDraft, setSystemDraft] = useState('')

  const activeConversation: Conversation | undefined = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )

  const units = activeConversation?.units || []
  const hasSystemMessage = useMemo(() => units.some((u) => u.type === 'system' && !u.removed), [units])

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

  const handleSetSystem = () => {
    const trimmed = systemDraft.trim()
    if (!trimmed) return
    const systemUnit: ContextUnit = {
      id: Math.random().toString(36).slice(2),
      type: 'system',
      content: trimmed,
      tags: [],
      pinned: true,
      removed: false,
      timestamp: new Date().toISOString(),
    }
    addUnit(systemUnit)
    setSystemDraft('')
  }

  const cancelStreaming = (opts?: { clearText?: boolean }) => {
    // Abort fetch
    try {
      streamAbortRef.current?.abort()
    } catch {}
    streamAbortRef.current = null
    // Clear timers
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    streamBufferRef.current = ''
    hasReceivedFirstChunkRef.current = false
    setIsStreaming(false)
    setIsThinking(false)
    if (opts?.clearText) {
      setStreamedText('')
      streamedTextRef.current = ''
    }
    setIsRequestInFlight(false)
  }

  const flushStreamBuffer = () => {
    if (!streamBufferRef.current) return
    const addition = streamBufferRef.current
    setStreamedText((prev) => prev + addition)
    streamedTextRef.current = streamedTextRef.current + addition
    streamBufferRef.current = ''
  }

  const scheduleFlush = () => {
    if (flushTimerRef.current) return
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null
      flushStreamBuffer()
      // keep auto-flushing while streaming
      if (isStreaming && streamBufferRef.current) scheduleFlush()
    }, STREAM_FLUSH_MS)
  }

  const startStreaming = async (
    params: {
      targetConversationId: string
      afterUnitId: string
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
    }
  ) => {
    // Cleanup any prior stream
    cancelStreaming({ clearText: false })
    setIsRequestInFlight(true)
    setIsThinking(true)
    setStreamedText('')
    streamedTextRef.current = ''
    hasReceivedFirstChunkRef.current = false
    streamBufferRef.current = ''

    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
      if (!apiKey) throw new Error('Missing VITE_OPENAI_API_KEY')
      const ac = new AbortController()
      streamAbortRef.current = ac
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, messages: params.messages }),
        signal: ac.signal,
      })
      if (!response.ok || !response.body) throw new Error(`OpenAI error: ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (dataStr === '[DONE]') {
            // Finish stream
            flushStreamBuffer()
            setIsStreaming(false)
            setIsThinking(false)
            setIsRequestInFlight(false)
            // Commit final content
            const finalText = streamedTextRef.current || ''
            if (finalText.trim()) {
              insertAssistantAfter(params.targetConversationId, params.afterUnitId, finalText)
            } else {
              insertAssistantAfter(params.targetConversationId, params.afterUnitId, '[Error: failed to get response]')
            }
            // Clear ephemeral state
            streamBufferRef.current = ''
            setStreamedText('')
            streamedTextRef.current = ''
            return
          }
          try {
            const json = JSON.parse(dataStr)
            const delta: string = json?.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              if (!hasReceivedFirstChunkRef.current) {
                hasReceivedFirstChunkRef.current = true
                setIsThinking(false)
                setIsStreaming(true)
              }
              streamBufferRef.current += delta
              scheduleFlush()
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
      // If we exit loop without [DONE], treat as end and finalize
      flushStreamBuffer()
      setIsStreaming(false)
      setIsThinking(false)
      setIsRequestInFlight(false)
      const finalText = streamedTextRef.current || ''
      if (finalText.trim()) {
        insertAssistantAfter(params.targetConversationId, params.afterUnitId, finalText)
      } else {
        insertAssistantAfter(params.targetConversationId, params.afterUnitId, '[Error: failed to get response]')
      }
      streamBufferRef.current = ''
      setStreamedText('')
      streamedTextRef.current = ''
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        // Canceled intentionally; leave without committing
        return
      }
      setIsThinking(false)
      setIsStreaming(false)
      setIsRequestInFlight(false)
      insertAssistantAfter(
        params.targetConversationId,
        params.afterUnitId,
        '[Error: failed to get response]'
      )
      streamBufferRef.current = ''
      setStreamedText('')
      streamedTextRef.current = ''
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    if (!hasSystemMessage) return // require system message first
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
    // Cancel any in-flight stream before starting a new one
    cancelStreaming({ clearText: true })

    const targetConversationId = useContextStore.getState().activeConversationId || (useContextStore.getState().conversations[0]?.id ?? '')
    const messages = assembleMessagesFromStore(targetConversationId)
    void startStreaming({ targetConversationId, afterUnitId: userUnit.id, messages })
  }

  // Handle regeneration flow for Trim and Branch using the same streaming UI
  useEffect(() => {
    const req = regenerationRequest
    if (!req) return
    const run = async () => {
      try {
        const messages = assembleMessagesFromStore(req.targetConversationId, req.editedUnitId)
        await startStreaming({ targetConversationId: req.targetConversationId, afterUnitId: req.editedUnitId, messages })
      } finally {
        clearRegenerationRequest()
      }
    }
    // Cancel any existing stream and show thinking bubble immediately
    cancelStreaming({ clearText: true })
    setIsThinking(true)
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerationRequest])

  // Smooth typing animation helper (kept in case of future non-streamed fallbacks)
  // Currently unused because we stream tokens directly.

  // remove old typing helpers (no longer used)

  // Cancel streaming when switching conversations
  useEffect(() => {
    cancelStreaming({ clearText: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation?.id])

  // Cancel stream if a regeneration flow starts (handled in effect above too)
  useEffect(() => {
    if (regenerationRequest) cancelStreaming({ clearText: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerationRequest])

  // Auto-scroll while streaming
  useEffect(() => {
    if (isStreaming) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [streamedText, isStreaming])

  // Auto-scroll when thinking starts so the typing bubble is visible immediately
  useEffect(() => {
    if (isThinking) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [isThinking])

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

  // no-op

  return (
    <Window title="Live Context Editor" subtitle="Chat on the left. Curate context on the right.">
      <div className="flex h-full flex-col">
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {units
            .filter((u) => !u.removed)
            .filter((u) => u.type === 'user' || u.type === 'assistant')
            .map(messageItem)}
          {/* Thinking placeholder */}
          {isThinking && !isStreaming && (
            <div className="flex gap-3">
              <div className="shrink-0 select-none rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/15 text-emerald-300">
                AI
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 shadow-soft">
                <div aria-label="AI is typing…" className="flex items-center gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.2s]"></span>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300 [animation-delay:-0.1s]"></span>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-300"></span>
                </div>
              </div>
            </div>
          )}
          {/* Streaming bubble */}
          {isStreaming && (
            <div className="flex gap-3">
              <div className="shrink-0 select-none rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-500/15 text-emerald-300">
                AI
              </div>
              <div className="prose prose-invert max-w-none prose-pre:mt-2 prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-code:text-[0.9em] prose-code:before:hidden prose-code:after:hidden">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamedText || ' '}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-3">
          {hasSystemMessage ? (
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
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-zinc-400">Set a system message to start this conversation.</div>
              <div className="flex items-end gap-2">
                <textarea
                  value={systemDraft}
                  onChange={(e) => setSystemDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSetSystem()
                    }
                  }}
                  placeholder="e.g., You are a concise assistant..."
                  rows={2}
                  className="min-h-10 w-full resize-y rounded-lg border border-white/10 bg-white/5 p-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
                <button
                  onClick={handleSetSystem}
                  className="h-10 shrink-0 rounded-lg bg-emerald-500 px-4 text-sm font-medium text-black shadow-soft hover:bg-emerald-400"
                >
                  Set System
                </button>
              </div>
            </div>
          )}
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
    </Window>
  )
}
