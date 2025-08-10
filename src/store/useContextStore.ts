import { create } from 'zustand'
import { countTokensForText } from '../utils/tokenUtils'
import { useAttachmentStore } from './useAttachmentStore'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useSettingsStore } from './useSettingsStore'

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
  // Summary schema versioning to detect outdated formats
  lastSummarySchemaVersion?: number
  // Token totals for assembled context
  totalTokens?: number
  totalUserTokens?: number
  totalAssistantTokens?: number
  // Attachments selection and token impact
  attachmentIds?: string[]
  totalAttachmentTokens?: number
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
  // Token totals
  recomputeTokenTotals: (conversationId: string, upToUnitId?: string) => void
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
  // Attachments per conversation
  setConversationAttachmentSelection: (conversationId: string | undefined, attachmentIds: string[]) => void
}

const nowIso = () => new Date().toISOString()
const randomId = () => Math.random().toString(36).slice(2)

const createInitialUnits = (): ContextUnit[] => []

const createInitialConversation = (): Conversation => ({
  id: randomId(),
  title: 'New Conversation',
  createdAt: nowIso(),
  units: createInitialUnits(),
  summary: '',
  summaryUpdatedAt: '',
  summaryLoading: false,
  summaryError: '',
    summaryCacheKey: '',
    lastSummarySchemaVersion: 0,
  attachmentIds: [],
  totalAttachmentTokens: 0,
})

const findConversationIndex = (state: ContextStoreState, conversationId: string) =>
  state.conversations.findIndex((c) => c.id === conversationId)

const initialConversation = createInitialConversation()

// Build assembled messages and compute token totals using OpenAI-compatible tokenization
function internalAssembleWithTotals(
  units: ContextUnit[],
  upToUnitId?: string
): {
  messages: ChatMessageForApi[]
  totals: { totalTokens: number; totalUserTokens: number; totalAssistantTokens: number }
} {
  const sorted = [...units].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const slice = (() => {
    if (!upToUnitId) return sorted
    const idx = sorted.findIndex((u) => u.id === upToUnitId)
    return idx === -1 ? sorted : sorted.slice(0, idx + 1)
  })()

  if (slice.length === 0) {
    return {
      messages: [],
      totals: { totalTokens: 0, totalUserTokens: 0, totalAssistantTokens: 0 },
    }
  }

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

  const forgetMessages: ChatMessageForApi[] = removedBeforeLastUser.map((u) => ({
    role: 'system',
    content: `Note: Forget any earlier mention of '${u.content}'. It is incorrect or irrelevant.`,
  }))

  const nonRemoved = slice.filter((u) => !u.removed)
  const mainMessages: ChatMessageForApi[] = nonRemoved.map((u) => ({
    role: u.type === 'note' ? 'system' : (u.type as 'system' | 'user' | 'assistant'),
    content: u.content,
  }))

  const messages = [...forgetMessages, ...mainMessages]

  // Totals by role
  let totalUserTokens = 0
  let totalAssistantTokens = 0
  let totalTokens = 0
  for (const m of messages) {
    const n = countTokensForText(m.content)
    if (m.role === 'user') {
      totalUserTokens += n
      totalTokens += n
    } else if (m.role === 'assistant') {
      totalAssistantTokens += n
      totalTokens += n
    }
  }

  return { messages, totals: { totalTokens, totalUserTokens, totalAssistantTokens } }
}

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
      title: c.title || 'New Conversation',
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
          lastSummarySchemaVersion: c.lastSummarySchemaVersion || 0,
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
      title: title?.trim() || 'New Conversation',
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
      lastSummarySchemaVersion: 0,
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
      if (remaining.length === 0) {
        const newConv = createInitialConversation()
        // schedule summary and tokens recompute after state commit
        queueMicrotask(() => {
          useContextStore.getState().requestSummaryRefresh(newConv.id, true)
          useContextStore.getState().recomputeTokenTotals(newConv.id)
        })
        return { conversations: [newConv], activeConversationId: newConv.id }
      }
      const nextActive =
        state.activeConversationId === conversationId
          ? remaining[0]?.id || ''
          : state.activeConversationId
      return { conversations: remaining, activeConversationId: nextActive }
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
    queueMicrotask(() => get().recomputeTokenTotals(conversationId))
  },

  addUnit: (unit) =>
    set((state) => {
      const idx = findConversationIndex(state as any, state.activeConversationId || state.conversations[0].id)
      if (idx === -1) return state
      const conversations = [...state.conversations]
      conversations[idx] = { ...conversations[idx], units: [...conversations[idx].units, unit] }
      // Trigger summary regeneration (debounced)
      queueMicrotask(() => get().requestSummaryRefresh(conversations[idx].id))
      queueMicrotask(() => get().recomputeTokenTotals(conversations[idx].id))
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
      queueMicrotask(() => get().recomputeTokenTotals(conversations[idx].id))
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
      queueMicrotask(() => get().recomputeTokenTotals(conversations[idx].id))
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
      queueMicrotask(() => get().recomputeTokenTotals(conversations[idx].id))
      return { conversations }
    }),

  assembleMessages: (conversationId, upToUnitId) => {
    const state = get()
    const conv = state.conversations.find((c) => c.id === conversationId)
    if (!conv) return []
    const { messages, totals } = internalAssembleWithTotals(conv.units, upToUnitId)
    // Prepend selected attachment chunks as system messages
    const selectedIds = conv.attachmentIds || []
    const attachmentChunks = useAttachmentStore.getState().getChunksForAttachmentIds(selectedIds)
    const attachmentMessages: ChatMessageForApi[] = attachmentChunks.map((ch) => ({ role: 'system', content: ch.text }))
    const finalMessages = [...attachmentMessages, ...messages]
    const attachmentTokens = attachmentChunks.reduce((sum, ch) => sum + (ch.tokenCount || 0), 0)
    // persist totals for UI
    set((s) => {
      const idx = findConversationIndex(s as any, conversationId)
      if (idx === -1) return {}
      const conversations = [...s.conversations]
      conversations[idx] = {
        ...conversations[idx],
        totalTokens: totals.totalTokens,
        totalUserTokens: totals.totalUserTokens,
        totalAssistantTokens: totals.totalAssistantTokens,
        totalAttachmentTokens: attachmentTokens,
      }
      return { conversations }
    })
    return finalMessages
  },
  recomputeTokenTotals: (conversationId, upToUnitId) => {
    const state = get()
    const conv = state.conversations.find((c) => c.id === conversationId)
    if (!conv) return
    const { totals } = internalAssembleWithTotals(conv.units, upToUnitId)
    const selectedIds = conv.attachmentIds || []
    const attachmentChunks = useAttachmentStore.getState().getChunksForAttachmentIds(selectedIds)
    const attachmentTokens = attachmentChunks.reduce((sum, ch) => sum + (ch.tokenCount || 0), 0)
    set((s) => {
      const idx = findConversationIndex(s as any, conversationId)
      if (idx === -1) return {}
      const conversations = [...s.conversations]
      conversations[idx] = {
        ...conversations[idx],
        totalTokens: totals.totalTokens,
        totalUserTokens: totals.totalUserTokens,
        totalAssistantTokens: totals.totalAssistantTokens,
        totalAttachmentTokens: attachmentTokens,
      }
      return { conversations }
    })
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
      queueMicrotask(() => get().recomputeTokenTotals(conversationId))
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
    queueMicrotask(() => get().recomputeTokenTotals(conversationId))
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
      queueMicrotask(() => get().recomputeTokenTotals(conversationId))
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
      queueMicrotask(() => get().recomputeTokenTotals(modal.conversationId))
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
    queueMicrotask(() => get().recomputeTokenTotals(modal.conversationId))
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
    queueMicrotask(() => get().recomputeTokenTotals(modal.conversationId))
    queueMicrotask(() => get().recomputeTokenTotals(newConversationId))
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
      queueMicrotask(() => get().recomputeTokenTotals(modal.conversationId))
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
    queueMicrotask(() => get().recomputeTokenTotals(modal.conversationId))
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
    queueMicrotask(() => get().recomputeTokenTotals(modal.conversationId))
    queueMicrotask(() => get().recomputeTokenTotals(newConversationId))
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
  // Attachments selection per conversation
  setConversationAttachmentSelection: (conversationId, attachmentIds) => {
    if (!conversationId) return
    set((s) => {
      const idx = findConversationIndex(s as any, conversationId)
      if (idx === -1) return {}
      const conversations = [...s.conversations]
      conversations[idx] = { ...conversations[idx], attachmentIds: [...attachmentIds] }
      return { conversations }
    })
    // Recompute tokens to reflect attachment changes
    queueMicrotask(() => get().recomputeTokenTotals(conversationId))
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
          attachmentIds: Array.isArray(c.attachmentIds) ? c.attachmentIds : [],
          totalAttachmentTokens: Number.isFinite(c.totalAttachmentTokens) ? c.totalAttachmentTokens : 0,
        })),
      }),
      migrate: (persisted, _version) => {
        const base = (persisted as any) || {}
        const rawConversations = Array.isArray(base.conversations) ? base.conversations : []
        const conversations: Conversation[] = rawConversations.map((c: any) => ({
          id: c?.id || Math.random().toString(36).slice(2),
          title: c?.title || 'New Conversation',
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
          lastSummarySchemaVersion: c?.lastSummarySchemaVersion || 0,
          attachmentIds: Array.isArray(c?.attachmentIds) ? c.attachmentIds : [],
          totalAttachmentTokens: Number.isFinite(c?.totalAttachmentTokens) ? c.totalAttachmentTokens : 0,
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

const SUMMARY_SCHEMA_VERSION = 1

function buildSummarySource(conv: Conversation): { text: string; cacheKey: string; hasContent: boolean } {
  const { units } = conv
  const sorted = [...units].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const visible = sorted.filter((u) => !u.removed)

  // Collect system-like messages (system and note)
  const systemUnits = visible.filter((u) => u.type === 'system' || u.type === 'note')

  // Collect pinned messages (any type) in chronological order
  const pinnedUnits = visible.filter((u) => u.pinned)

  // Collect recent user/assistant messages under a token budget
  const conversationalUnits = visible.filter((u) => u.type === 'user' || u.type === 'assistant')
  const hasContent = conversationalUnits.length > 0 || systemUnits.length > 0 || pinnedUnits.length > 0

  // Build recent context with a token budget
  const MAX_SOURCE_TOKENS = 1600
  const MAX_PER_MSG_CHARS = 1200
  let budget = MAX_SOURCE_TOKENS

  const recent: ContextUnit[] = []
  for (let i = conversationalUnits.length - 1; i >= 0; i--) {
    const u = conversationalUnits[i]
    // Skip if already included via pinned to avoid duplication later
    if (u.pinned) continue
    const preview = u.content.length > MAX_PER_MSG_CHARS ? `${u.content.slice(0, MAX_PER_MSG_CHARS)}…` : u.content
    const line = `${u.type.toUpperCase()}: ${preview}`
    const cost = countTokensForText(line)
    if (budget - cost < 0) break
    budget -= cost
    recent.push(u)
  }
  recent.reverse()

  // Prepare text sections
  const metaLines: string[] = [
    `Title: ${conv.title}`,
    `CreatedAt: ${conv.createdAt}`,
    conv.parentConversationId ? `ParentConversationId: ${conv.parentConversationId}` : '',
    conv.forkedFromUnitId ? `ForkedFromUnitId: ${conv.forkedFromUnitId}` : '',
    `SelectedModel: ${useSettingsStore.getState().model}`,
  ].filter(Boolean)

  const fmt = (u: ContextUnit) => {
    const limit = MAX_PER_MSG_CHARS
    const content = u.content.length > limit ? `${u.content.slice(0, limit)}…` : u.content
    const role = u.type === 'note' ? 'SYSTEM' : u.type.toUpperCase()
    return `${role}: ${content}`
  }

  const sections: string[] = []
  if (metaLines.length) {
    sections.push('=== Metadata ===')
    sections.push(...metaLines)
  }
  if (systemUnits.length) {
    sections.push('=== System Messages ===')
    sections.push(...systemUnits.map(fmt))
  }
  if (pinnedUnits.length) {
    sections.push('=== Pinned ===')
    sections.push(...pinnedUnits.map(fmt))
  }
  if (recent.length) {
    sections.push('=== Recent Context ===')
    sections.push(...recent.map(fmt))
  }

  const joined = sections.join('\n')
  const MAX_CHARS = 8000
  const text = joined.length > MAX_CHARS ? joined.slice(-MAX_CHARS) : joined

  // Cache key includes schema version and a digest of important markers
  const lastUnitStamp = visible[visible.length - 1]?.timestamp || ''
  const cacheKey = [
    `v${SUMMARY_SCHEMA_VERSION}`,
    String(visible.length),
    lastUnitStamp,
    String(systemUnits.length),
    String(pinnedUnits.length),
    String(recent.length),
    conv.title,
  ].join('|')

  return { text, cacheKey, hasContent }
}

async function generateSummary(conversationId: string, force = false): Promise<void> {
  const state = useContextStore.getState()
  const conv = state.conversations.find((c) => c.id === conversationId)
  if (!conv) return
  const { text, cacheKey, hasContent } = buildSummarySource(conv)
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
        lastSummarySchemaVersion: SUMMARY_SCHEMA_VERSION,
      }
      return { conversations }
    })
    return
  }
  if (
    !force &&
    conv.summaryCacheKey === cacheKey &&
    (conv.summary || '') !== '' &&
    (conv.lastSummarySchemaVersion || 0) === SUMMARY_SCHEMA_VERSION
  ) {
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
    const systemInstruction = [
      'You are an AI summarizer. Your task is to distill a conversation into a self-contained working summary that can serve as the only context for continuing the work.',
      'Follow this schema exactly:',
      '',
      '[Purpose / Goal]',
      '<one sentence>',
      '',
      '[Key Decisions Made]',
      '',
      '<decision 1>',
      '',
      '<decision 2>',
      '',
      '[Important Facts & Constraints]',
      '',
      '<fact 1>',
      '',
      '<fact 2>',
      '',
      '[Pending or Open Questions]',
      '',
      '<question 1>',
      '',
      '<question 2>',
      '',
      '[References & Resources]',
      '',
      '<reference 1>',
      '',
      '<reference 2>',
      '',
      'Rules:',
      '',
      'Do NOT write "The user said..." or "The assistant responded..."',
      '',
      'Keep plain, direct language.',
      '',
      'Only include relevant and essential information.',
      '',
      'Maximum length: 500 tokens.'
    ].join('\n')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: useSettingsStore.getState().model || 'gpt-4o-mini',
        temperature: 0,
        // modest cap to prevent overruns; schema target is <=500 tokens
        max_tokens: 800,
        messages: [
          { role: 'system', content: systemInstruction },
          // Few-shot example to make output deterministic
          { role: 'user', content: '=== Metadata ===\nTitle: Sample\nSelectedModel: gpt-4o\n=== System Messages ===\nSYSTEM: You are an expert coding assistant.\n=== Pinned ===\nUSER: Use TypeScript and React.\n=== Recent Context ===\nUSER: Build a settings panel to switch models.\nASSISTANT: Proposed a dropdown with persistence.' },
          { role: 'assistant', content: [
            '[Purpose / Goal]',
            'Add a React settings panel to switch AI models with TypeScript and persist selection.',
            '',
            '[Key Decisions Made]',
            '- Dropdown selector for model switching.',
            '- Persist selection in local storage.',
            '',
            '[Important Facts & Constraints]',
            '- Stack: React + TypeScript.',
            '- Must integrate with existing model registry.',
            '',
            '[Pending or Open Questions]',
            '- Confirm default model.',
            '',
            '[References & Resources]',
            '- src/store/useSettingsStore.ts',
          ].join('\n') },
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
        lastSummarySchemaVersion: SUMMARY_SCHEMA_VERSION,
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



