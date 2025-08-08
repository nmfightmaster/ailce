import { create } from 'zustand'

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
  trimAfter: (conversationId: string, unitId: string) => void
  branchFrom: (conversationId: string, unitId: string, title?: string) => string

  // Edit modal flow
  editModal: EditModalState | null
  openEditModal: (conversationId: string, unitId: string, newContent: string) => void
  closeEditModal: () => void
  applyEditDoNothing: () => void
  applyEditTrim: () => void
  applyEditBranch: (title?: string) => void

  // Regeneration request consumed by ChatPanel
  regenerationRequest: RegenerationRequestState | null
  clearRegenerationRequest: () => void
}

const nowIso = () => new Date().toISOString()
const randomId = () => Math.random().toString(36).slice(2)

const createInitialUnits = (): ContextUnit[] => [
  {
    id: randomId(),
    type: 'system',
    content: 'AI persona: concise, helpful, and safe. Avoid using removed info.',
    tags: ['policy', 'persona'],
    pinned: true,
    removed: false,
    timestamp: nowIso(),
  },
  {
    id: randomId(),
    type: 'note',
    content: 'User prefers minimalist, fun UI. Keep whitespace generous.',
    tags: ['ux', 'style'],
    pinned: false,
    removed: false,
    timestamp: nowIso(),
  },
]

const createInitialConversation = (): Conversation => ({
  id: randomId(),
  title: 'Conversation 1',
  createdAt: nowIso(),
  units: createInitialUnits(),
})

const findConversationIndex = (state: ContextStoreState, conversationId: string) =>
  state.conversations.findIndex((c) => c.id === conversationId)

const initialConversation = createInitialConversation()

export const useContextStore = create<ContextStoreState>((set, get) => ({
  conversations: [initialConversation],
  activeConversationId: initialConversation.id,

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
    }
    set((state) => ({
      conversations: [...state.conversations, newConv],
      activeConversationId: newConv.id,
    }))
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
  setActiveConversation: (conversationId) => set(() => ({ activeConversationId: conversationId })),

  addUnit: (unit) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units: [...conversations[idx].units, unit] }
      return { conversations }
    }),
  togglePin: (id) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const units = state.conversations[idx].units.map((u) => (u.id === id ? { ...u, pinned: !u.pinned } : u))
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units }
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
      return { conversations }
    }),
  updateUnit: (id, newContent) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const units = state.conversations[idx].units.map((u) => (u.id === id ? { ...u, content: newContent } : u))
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units }
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
      return { conversations }
    })
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
    return newId
  },

  // Edit modal & regeneration flow
  editModal: null,
  openEditModal: (conversationId, unitId, newContent) =>
    set(() => ({ editModal: { isOpen: true, conversationId, unitId, newContent } })),
  closeEditModal: () => set(() => ({ editModal: null })),
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
  },
}))



