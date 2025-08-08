import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ContextUnitType = 'user' | 'assistant' | 'system' | 'note'

export interface ContextUnit {
  id: string
  type: ContextUnitType
  content: string
  tags: string[]
  pinned: boolean
  removed: boolean
  timestamp: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  parentConversationId?: string
  forkedFromUnitId?: string
  units: ContextUnit[]
  // Live summary state
  summary?: string
  summaryUpdatedAt?: string
  summaryLoading?: boolean
  summaryError?: string
  summaryCacheKey?: string
}

export type ChatMessageForApi = { role: 'system' | 'user' | 'assistant'; content: string }

interface EditModalState {
  isOpen: boolean
  conversationId: string
  unitId: string
  newContent: string
}

interface RegenerationRequestState {
  mode: 'trim' | 'branch'
  targetConversationId: string
  editedUnitId: string
}

interface ContextStoreState {
  conversations: Conversation[]
  activeConversationId: string

  // Conversation management
  createConversation: (title?: string, baseUnits?: ContextUnit[], meta?: { parentConversationId?: string; forkedFromUnitId?: string }) => string
  deleteConversation: (conversationId: string) => void
  renameConversation: (conversationId: string, nextTitle: string) => void
  setActiveConversation: (conversationId: string) => void

  // Unit operations (scoped to active conversation)
  addUnit: (unit: ContextUnit) => void
  togglePin: (id: string) => void
  toggleRemoved: (id: string) => void
  updateUnit: (id: string, newContent: string) => void

  // Advanced helpers
  assembleMessages: (conversationId: string, upToUnitId?: string) => ChatMessageForApi[]
  insertAssistantAfter: (conversationId: string, afterUnitId: string, content: string) => void
  // Variant that returns the new assistant id for streaming updates
  insertAssistantAfterGetId: (conversationId: string, afterUnitId: string, content: string) => string
  // Update a unit's content within a specific conversation (used for streaming)
  updateUnitInConversation: (conversationId: string, unitId: string, newContent: string, options?: { suppressSummaryRefresh?: boolean }) => void
  trimAfter: (conversationId: string, unitId: string) => void
  branchFrom: (conversationId: string, unitId: string, title?: string) => string

  // Edit modal flow
  editModal: EditModalState | null
  openEditModal: (conversationId: string, unitId: string, newContent: string) => void
  closeEditModal: () => void
  applyEditDoNothing: () => void
  applyEditTrim: () => void
  applyEditBranch: (title?: string) => void

  // Remove modal flow
  removeModal: { isOpen: boolean; conversationId: string; unitId: string } | null
  openRemoveModal: (conversationId: string, unitId: string) => void
  closeRemoveModal: () => void
  applyRemoveDoNothing: () => void
  applyRemoveTrim: () => void
  applyRemoveBranch: (title?: string) => void

  // Regeneration request consumed by ChatPanel
  regenerationRequest: RegenerationRequestState | null
  clearRegenerationRequest: () => void

  // Summary
  requestSummaryRefresh: (conversationId: string, immediate?: boolean, force?: boolean) => void
}

const nowIso = () => new Date().toISOString()
const randomId = () => Math.random().toString(36).slice(2)

const createInitialUnits = (): ContextUnit[] => []

const createInitialConversation = (): Conversation => ({
  id: randomId(),
  title: 'Welcome',
  createdAt: nowIso(),
  units: createInitialUnits(),
  summary: '',
  summaryUpdatedAt: '',
  summaryLoading: false,
  summaryError: '',
  summaryCacheKey: '',
})

const findConversationIndex = (state: ContextStoreState, conversationId: string) =>
  state.conversations.findIndex((c) => c.id === conversationId)

const initialConversation = createInitialConversation()

// Attempt to read legacy data written by earlier, custom persistence
function readLegacyPersisted(): { activeConversationId: string; conversations: Conversation[] } | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem('lce:conversations_v1')
    if (!raw) return null
    const data = JSON.parse(raw) as {
      version?: number
      activeConversationId?: string
      conversations?: Conversation[]
    } | null
    if (!data || !Array.isArray(data.conversations)) return null
    const conversations: Conversation[] = data.conversations.map((c) => ({
      id: c.id || Math.random().toString(36).slice(2),
      title: c.title || 'Conversation',
      createdAt: c.createdAt || new Date().toISOString(),
      parentConversationId: c.parentConversationId,
      forkedFromUnitId: c.forkedFromUnitId,
      units: Array.isArray(c.units)
        ? c.units.map((u) => ({
            id: u.id || Math.random().toString(36).slice(2),
            type: u.type,
            content: u.content ?? '',
            tags: Array.isArray(u.tags) ? u.tags : [],
            pinned: !!u.pinned,
            removed: !!u.removed,
            timestamp: u.timestamp || new Date().toISOString(),
          }))
        : [],
      summary: c.summary || '',
      summaryUpdatedAt: c.summaryUpdatedAt || '',
      summaryLoading: false,
      summaryError: '',
      summaryCacheKey: c.summaryCacheKey || '',
    }))
    const activeConversationId =
      data.activeConversationId && conversations.find((c) => c.id === data.activeConversationId)
        ? data.activeConversationId
        : conversations[0]?.id || ''
    return { activeConversationId, conversations }
  } catch {
    return null
  }
}

export const useContextStore = create<ContextStoreState>()(
  persist(
    (set, get) => ({
      conversations: (() => {
        // Default to legacy data if available, otherwise seed a welcome conversation
        const legacy = readLegacyPersisted()
        return legacy?.conversations?.length ? legacy.conversations : [initialConversation]
      })(),
      activeConversationId: (() => {
        const legacy = readLegacyPersisted()
        return legacy?.activeConversationId || initialConversation.id
      })(),

  createConversation: (title, baseUnits, meta) => {
    const newConv: Conversation = {
      id: randomId(),
      title: title?.trim() || `Conversation ${get().conversations.length + 1}`,
      createdAt: nowIso(),
      parentConversationId: meta?.parentConversationId,
      forkedFromUnitId: meta?.forkedFromUnitId,
      units: (baseUnits && baseUnits.length
        ? baseUnits.map((u) => ({ ...u })) // preserve ids when branching
        : createInitialUnits()),
      summary: '',
      summaryUpdatedAt: '',
      summaryLoading: false,
      summaryError: '',
      summaryCacheKey: '',
    }
    set((state) => ({
      conversations: [...state.conversations, newConv],
      activeConversationId: newConv.id,
    }))
    // Kick off initial summary generation for the new conversation
    queueMicrotask(() => get().requestSummaryRefresh(newConv.id, true))
    return newConv.id
  },
  deleteConversation: (conversationId) => {
    set((state) => {
      const remaining = state.conversations.filter((c) => c.id !== conversationId)
      const nextActive =
        state.activeConversationId === conversationId
          ? remaining[0]?.id || ''
          : state.activeConversationId
      return { conversations: remaining.length ? remaining : state.conversations, activeConversationId: nextActive }
    })
  },
  renameConversation: (conversationId, nextTitle) => {
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === conversationId ? { ...c, title: nextTitle.trim() || c.title } : c)),
    }))
  },
  setActiveConversation: (conversationId) => {
    set(() => ({ activeConversationId: conversationId }))
    // Ensure summary exists for the newly active conversation
    queueMicrotask(() => get().requestSummaryRefresh(conversationId))
  },

  addUnit: (unit) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units: [...conversations[idx].units, unit] }
      // Trigger summary regeneration (debounced)
      queueMicrotask(() => get().requestSummaryRefresh(conversations[idx].id))
      return { conversations }
    }),
  togglePin: (id) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const units = state.conversations[idx].units.map((u) => (u.id === id ? { ...u, pinned: !u.pinned } : u))
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units }
      queueMicrotask(() => get().requestSummaryRefresh(conversations[idx].id))
      return { conversations }
    }),
  toggleRemoved: (id) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const units = state.conversations[idx].units.map((u) =>
        u.id === id ? { ...u, removed: !u.removed, pinned: u.removed ? u.pinned : false } : u
      )
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units }
      queueMicrotask(() => get().requestSummaryRefresh(conversations[idx].id))
      return { conversations }
    }),
  updateUnit: (id, newContent) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const units = state.conversations[idx].units.map((u) => (u.id === id ? { ...u, content: newContent } : u))
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units }
      queueMicrotask(() => get().requestSummaryRefresh(conversations[idx].id))
      return { conversations }
    }),

  assembleMessages: (conversationId, upToUnitId) => {
    const state = get()
    const conv = state.conversations.find((c) => c.id === conversationId)
    if (!conv) return []
    const sorted = [...conv.units].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const slice = (() => {
      if (!upToUnitId) return sorted
      const idx = sorted.findIndex((u) => u.id === upToUnitId)
      return idx === -1 ? sorted : sorted.slice(0, idx + 1)
    })()

    if (slice.length === 0) return []

    const lastUser = [...slice]
      .filter((u) => u.type === 'user')
      .reduce<ContextUnit | null>((acc, cur) => {
        if (!acc) return cur
        return new Date(cur.timestamp).getTime() >= new Date(acc.timestamp).getTime() ? cur : acc
      }, null)

    const lastUserTime = lastUser ? new Date(lastUser.timestamp).getTime() : null

    const removedBeforeLastUser = lastUser
      ? slice.filter((u) => u.removed && new Date(u.timestamp).getTime() < (lastUserTime as number))
      : []

    const forgetMessages = removedBeforeLastUser.map((u) => ({
      role: 'system' as const,
      content: `Note: Forget any earlier mention of '${u.content}'. It is incorrect or irrelevant.`,
    }))

    const nonRemoved = slice.filter((u) => !u.removed)
    const mainMessages: ChatMessageForApi[] = nonRemoved.map((u) => ({
      role: u.type === 'note' ? 'system' : (u.type as 'system' | 'user' | 'assistant'),
      content: u.content,
    }))

    return [...forgetMessages, ...mainMessages]
  },
  insertAssistantAfter: (conversationId, afterUnitId, content) => {
    set((state) => {
      const idx = findConversationIndex(state as any, conversationId)
      if (idx === -1) return state
      const conv = state.conversations[idx]
      const insertIndex = conv.units.findIndex((u) => u.id === afterUnitId)
      if (insertIndex === -1) return state
      const nextUnits = [...conv.units]
      nextUnits.splice(insertIndex + 1, 0, {
        id: randomId(),
        type: 'assistant',
        content,
        tags: [],
        pinned: false,
        removed: false,
        timestamp: nowIso(),
      })
      const conversations = [...state.conversations]
      conversations[idx] = { ...conv, units: nextUnits }
      queueMicrotask(() => get().requestSummaryRefresh(conversationId))
      return { conversations }
    })
  },
  insertAssistantAfterGetId: (conversationId, afterUnitId, content) => {
    let newAssistantId = ''
    set((state) => {
      const idx = findConversationIndex(state as any, conversationId)
      if (idx === -1) return state
      const conv = state.conversations[idx]
      const insertIndex = conv.units.findIndex((u) => u.id === afterUnitId)
      if (insertIndex === -1) return state
      const nextUnits = [...conv.units]
      newAssistantId = randomId()
      nextUnits.splice(insertIndex + 1, 0, {
        id: newAssistantId,
        type: 'assistant',
        content,
        tags: [],
        pinned: false,
        removed: false,
        timestamp: nowIso(),
      })
      const conversations = [...state.conversations]
      conversations[idx] = { ...conv, units: nextUnits }
      return { conversations }
    })
    // Debounced summary refresh
    queueMicrotask(() => get().requestSummaryRefresh(conversationId))
    return newAssistantId
  },
  updateUnitInConversation: (conversationId, unitId, newContent, options) => {
    set((state) => {
      const idx = findConversationIndex(state as any, conversationId)
      if (idx === -1) return state
      const conv = state.conversations[idx]
      const units = conv.units.map((u) => (u.id === unitId ? { ...u, content: newContent } : u))
      const conversations = [...state.conversations]
      conversations[idx] = { ...conv, units }
      return { conversations }
    })
    if (!options?.suppressSummaryRefresh) {
      queueMicrotask(() => get().requestSummaryRefresh(conversationId))
    }
  },
  trimAfter: (conversationId, unitId) => {
    set((state) => {
      const idx = findConversationIndex(state as any, conversationId)
      if (idx === -1) return state
      const conv = state.conversations[idx]
      const cutIndex = conv.units.findIndex((u) => u.id === unitId)
      if (cutIndex === -1) return state
      const conversations = [...state.conversations]
      conversations[idx] = { ...conv, units: conv.units.slice(0, cutIndex + 1) }
      queueMicrotask(() => get().requestSummaryRefresh(conversationId))
      return { conversations }
    })
  },
  branchFrom: (conversationId, unitId, title) => {
    const state = get()
    const conv = state.conversations.find((c) => c.id === conversationId)
    if (!conv) return ''
    const idx = conv.units.findIndex((u) => u.id === unitId)
    const baseUnits = idx === -1 ? conv.units : conv.units.slice(0, idx + 1)
    const newId = get().createConversation(title, baseUnits, {
      parentConversationId: conversationId,
      forkedFromUnitId: unitId,
    })
    // Trigger summary for the new branch (debounced)
    queueMicrotask(() => get().requestSummaryRefresh(newId))
    return newId
  },

  // Edit modal & regeneration flow
  editModal: null,
  openEditModal: (conversationId, unitId, newContent) =>
    set(() => ({ editModal: { isOpen: true, conversationId, unitId, newContent } })),
  closeEditModal: () => set(() => ({ editModal: null })),
  removeModal: null,
  openRemoveModal: (conversationId, unitId) => set(() => ({ removeModal: { isOpen: true, conversationId, unitId } })),
  closeRemoveModal: () => set(() => ({ removeModal: null })),
  regenerationRequest: null,
  clearRegenerationRequest: () => set(() => ({ regenerationRequest: null })),
  applyEditDoNothing: () => {
    const state = get()
    const modal = state.editModal
    if (!modal) return
    // Save edit only
    set((s) => {
      const idx = findConversationIndex(s as any, modal.conversationId)
      if (idx === -1) return { editModal: null }
      const conv = s.conversations[idx]
      const units = conv.units.map((u) => (u.id === modal.unitId ? { ...u, content: modal.newContent } : u))
      const conversations = [...s.conversations]
      conversations[idx] = { ...conv, units }
      queueMicrotask(() => get().requestSummaryRefresh(modal.conversationId))
      return { conversations, editModal: null }
    })
  },
  applyEditTrim: () => {
    const state = get()
    const modal = state.editModal
    if (!modal) return
    // Save edit, trim after, request regeneration in same conversation
    set((s) => {
      const idx = findConversationIndex(s as any, modal.conversationId)
      if (idx === -1) return { editModal: null }
      const conv = s.conversations[idx]
      const editedUnits = conv.units.map((u) => (u.id === modal.unitId ? { ...u, content: modal.newContent } : u))
      const cutIndex = editedUnits.findIndex((u) => u.id === modal.unitId)
      const trimmed = cutIndex === -1 ? editedUnits : editedUnits.slice(0, cutIndex + 1)
      const conversations = [...s.conversations]
      conversations[idx] = { ...conv, units: trimmed }
      return {
        conversations,
        editModal: null,
        regenerationRequest: {
          mode: 'trim',
          targetConversationId: modal.conversationId,
          editedUnitId: modal.unitId,
        },
      }
    })
    queueMicrotask(() => get().requestSummaryRefresh(modal.conversationId))
  },
  applyEditBranch: (title) => {
    const state = get()
    const modal = state.editModal
    if (!modal) return
    // Save edit in source, create branch, request regeneration in new conversation, switch active
    // First update content in source conv
    set((s) => {
      const idx = findConversationIndex(s as any, modal.conversationId)
      if (idx === -1) return { editModal: null }
      const conv = s.conversations[idx]
      const units = conv.units.map((u) => (u.id === modal.unitId ? { ...u, content: modal.newContent } : u))
      const conversations = [...s.conversations]
      conversations[idx] = { ...conv, units }
      return { conversations }
    })
    const newConversationId = get().branchFrom(modal.conversationId, modal.unitId, title)
    set(() => ({
      editModal: null,
      activeConversationId: newConversationId,
      regenerationRequest: {
        mode: 'branch',
        targetConversationId: newConversationId,
        editedUnitId: modal.unitId,
      },
    }))
    queueMicrotask(() => get().requestSummaryRefresh(newConversationId))
  },
  applyRemoveDoNothing: () => {
    const state = get()
    const modal = state.removeModal
    if (!modal) return
    // Mark as removed only
    set((s) => {
      const idx = findConversationIndex(s as any, modal.conversationId)
      if (idx === -1) return { removeModal: null }
      const conv = s.conversations[idx]
      const units = conv.units.map((u) => (u.id === modal.unitId ? { ...u, removed: true, pinned: false } : u))
      const conversations = [...s.conversations]
      conversations[idx] = { ...conv, units }
      queueMicrotask(() => get().requestSummaryRefresh(modal.conversationId))
      return { conversations, removeModal: null }
    })
  },
  applyRemoveTrim: () => {
    const state = get()
    const modal = state.removeModal
    if (!modal) return
    // Remove, trim after — no regeneration on delete
    set((s) => {
      const idx = findConversationIndex(s as any, modal.conversationId)
      if (idx === -1) return { removeModal: null }
      const conv = s.conversations[idx]
      const updatedUnits = conv.units.map((u) => (u.id === modal.unitId ? { ...u, removed: true, pinned: false } : u))
      const cutIndex = updatedUnits.findIndex((u) => u.id === modal.unitId)
      const trimmed = cutIndex === -1 ? updatedUnits : updatedUnits.slice(0, cutIndex + 1)
      const conversations = [...s.conversations]
      conversations[idx] = { ...conv, units: trimmed }
      return {
        conversations,
        removeModal: null,
      }
    })
    queueMicrotask(() => get().requestSummaryRefresh(modal.conversationId))
  },
  applyRemoveBranch: (title) => {
    const state = get()
    const modal = state.removeModal
    if (!modal) return
    // Mark removed in source, branch from it — no regeneration on delete
    set((s) => {
      const idx = findConversationIndex(s as any, modal.conversationId)
      if (idx === -1) return { removeModal: null }
      const conv = s.conversations[idx]
      const units = conv.units.map((u) => (u.id === modal.unitId ? { ...u, removed: true, pinned: false } : u))
      const conversations = [...s.conversations]
      conversations[idx] = { ...conv, units }
      return { conversations }
    })
    const newConversationId = get().branchFrom(modal.conversationId, modal.unitId, title)
    set(() => ({
      removeModal: null,
      activeConversationId: newConversationId,
    }))
    queueMicrotask(() => get().requestSummaryRefresh(newConversationId))
  },
  
  // Summary generation API
  requestSummaryRefresh: (conversationId, immediate = false, force = false) => {
    const DEBOUNCE_MS = 500
    if (!conversationId) return
    clearTimeout(summaryDebounceTimers.get(conversationId))
    if (immediate) {
      void generateSummary(conversationId, force)
      return
    }
    const tid = window.setTimeout(() => {
      void generateSummary(conversationId, force)
    }, DEBOUNCE_MS)
    summaryDebounceTimers.set(conversationId, tid)
  },
    }),
    {
      name: 'live-context-conversations',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        conversations: state.conversations.map((c) => ({
          ...c,
          summaryLoading: false,
          summaryError: '',
        })),
      }),
      migrate: (persisted, _version) => {
        const base = (persisted as any) || {}
        const rawConversations = Array.isArray(base.conversations) ? base.conversations : []
        const conversations: Conversation[] = rawConversations.map((c: any) => ({
          id: c?.id || Math.random().toString(36).slice(2),
          title: c?.title || 'Conversation',
          createdAt: c?.createdAt || new Date().toISOString(),
          parentConversationId: c?.parentConversationId,
          forkedFromUnitId: c?.forkedFromUnitId,
          units: Array.isArray(c?.units)
            ? c.units.map((u: any) => ({
                id: u?.id || Math.random().toString(36).slice(2),
                type: u?.type,
                content: u?.content ?? '',
                tags: Array.isArray(u?.tags) ? u.tags : [],
                pinned: !!u?.pinned,
                removed: !!u?.removed,
                timestamp: u?.timestamp || new Date().toISOString(),
              }))
            : [],
          summary: c?.summary || '',
          summaryUpdatedAt: c?.summaryUpdatedAt || '',
          summaryLoading: false,
          summaryError: '',
          summaryCacheKey: c?.summaryCacheKey || '',
        }))
        const activeConversationId =
          typeof base.activeConversationId === 'string' && conversations.find((x) => x.id === base.activeConversationId)
            ? base.activeConversationId
            : conversations[0]?.id || ''
        return { activeConversationId, conversations } as Partial<ContextStoreState>
      },
    }
  )
)


// Summary helpers (module scope)
const summaryDebounceTimers = new Map<string, number>()

function buildSummarySource(units: ContextUnit[]): { text: string; cacheKey: string; hasContent: boolean } {
  const sorted = [...units].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const visible = sorted.filter((u) => !u.removed)
  // Exclude system messages entirely; focus on user and assistant. Notes are treated as assistant context-light.
  const filtered = visible.filter((u) => u.type === 'user' || u.type === 'assistant')
  const hasContent = filtered.length > 0
  const MAX_USER_CHARS_PER_MSG = 600
  const MAX_ASSISTANT_CHARS_PER_MSG = 240
  const lines = filtered.map((u) => {
    const role = u.type === 'user' ? 'USER' : 'ASSISTANT'
    const limit = u.type === 'user' ? MAX_USER_CHARS_PER_MSG : MAX_ASSISTANT_CHARS_PER_MSG
    const content = u.content.length > limit ? `${u.content.slice(0, limit)}…` : u.content
    return `${role}: ${content}`
  })
  const joined = lines.join('\n')
  // Length limit for request payload
  const MAX_CHARS = 4000
  const text = joined.length > MAX_CHARS ? joined.slice(-MAX_CHARS) : joined
  // Simple cache key from filtered content
  const cacheKey = `${filtered.length}|${text}`
  return { text, cacheKey, hasContent }
}

async function generateSummary(conversationId: string, force = false): Promise<void> {
  const state = useContextStore.getState()
  const conv = state.conversations.find((c) => c.id === conversationId)
  if (!conv) return
  const { text, cacheKey, hasContent } = buildSummarySource(conv.units)
  if (!hasContent) {
    // No user/assistant content to summarize; keep the summary empty
    useContextStore.setState((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conversationId)
      if (idx === -1) return {}
      const conversations = [...s.conversations]
      conversations[idx] = {
        ...conversations[idx],
        summary: '',
        summaryUpdatedAt: nowIso(),
        summaryLoading: false,
        summaryError: '',
        summaryCacheKey: cacheKey,
      }
      return { conversations }
    })
    return
  }
  if (!force && conv.summaryCacheKey === cacheKey && (conv.summary || '') !== '') {
    // Nothing changed; skip
    return
  }
  // Set loading
  useContextStore.setState((s) => {
    const idx = s.conversations.findIndex((c) => c.id === conversationId)
    if (idx === -1) return {}
    const conversations = [...s.conversations]
    conversations[idx] = { ...conversations[idx], summaryLoading: true, summaryError: '' }
    return { conversations }
  })

  try {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined
    if (!apiKey) throw new Error('Missing VITE_OPENAI_API_KEY')
    const systemInstruction = 'Write a single short paragraph summarizing the conversation. Prioritize user inputs and intentions; compress assistant responses heavily; ignore any system prompts. Output only a neutral, third-person, declarative summary. Do not ask questions, give instructions, greet, or include meta commentary. If content is insufficient to summarize, return an empty string.'
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: text || 'No content.' },
        ],
      }),
    })
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`)
    const data: any = await response.json()
    const summaryText: string = (data?.choices?.[0]?.message?.content ?? '').trim()

    useContextStore.setState((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conversationId)
      if (idx === -1) return {}
      const conversations = [...s.conversations]
      conversations[idx] = {
        ...conversations[idx],
        summary: summaryText || 'Summary unavailable.',
        summaryUpdatedAt: nowIso(),
        summaryLoading: false,
        summaryError: '',
        summaryCacheKey: cacheKey,
      }
      return { conversations }
    })
  } catch (e: any) {
    useContextStore.setState((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conversationId)
      if (idx === -1) return {}
      const conversations = [...s.conversations]
      conversations[idx] = {
        ...conversations[idx],
        summaryLoading: false,
        summaryError: e?.message || 'Failed to generate summary',
      }
      return { conversations }
    })
  }
}



