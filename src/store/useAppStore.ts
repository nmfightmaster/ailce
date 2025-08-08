import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: string
}

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

interface AppState {
  messages: ChatMessage[]
  contextUnits: ContextUnit[]
  summaryBullets: string[]
  addUserMessage: (content: string) => void
  addAssistantMessage: (content: string) => void
  togglePinContextUnit: (id: string) => void
  toggleRemoveContextUnit: (id: string) => void
  restoreAll: () => void
}

const nowIso = () => new Date().toISOString()
const randomId = () => Math.random().toString(36).slice(2)

const initialMessages: ChatMessage[] = [
  {
    id: randomId(),
    role: 'system',
    content: 'You are a helpful AI inside the Live Context Editor.',
    timestamp: nowIso(),
  },
  {
    id: randomId(),
    role: 'user',
    content: 'Hey, can you help me think through a feature? \nI want to see and edit what you see.',
    timestamp: nowIso(),
  },
  {
    id: randomId(),
    role: 'assistant',
    content: 'Absolutely. We can curate the context you send me, and let you pin or remove items.',
    timestamp: nowIso(),
  },
]

const initialContext: ContextUnit[] = [
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
  {
    id: randomId(),
    type: 'user',
    content: 'We keep local conversation state and send curated context each call.',
    tags: ['arch'],
    pinned: false,
    removed: false,
    timestamp: nowIso(),
  },
]

const initialSummary = [
  'Maintain clean, minimalist, fun UI',
  'Left: chat, Right: context inspector',
  'Removed items excluded; pins are prioritized',
  'Stateless API; we manage local conversation state',
  'Retroactive removal with a "forget" system message',
]

export const useAppStore = create<AppState>((set) => ({
  messages: initialMessages,
  contextUnits: initialContext,
  summaryBullets: initialSummary,
  addUserMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: randomId(), role: 'user', content, timestamp: nowIso() },
      ],
    })),
  addAssistantMessage: (content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { id: randomId(), role: 'assistant', content, timestamp: nowIso() },
      ],
    })),
  togglePinContextUnit: (id) =>
    set((state) => ({
      contextUnits: state.contextUnits.map((u) =>
        u.id === id ? { ...u, pinned: !u.pinned } : u
      ),
    })),
  toggleRemoveContextUnit: (id) =>
    set((state) => ({
      contextUnits: state.contextUnits.map((u) =>
        u.id === id ? { ...u, removed: !u.removed, pinned: u.removed ? u.pinned : false } : u
      ),
    })),
  restoreAll: () =>
    set((state) => ({
      contextUnits: state.contextUnits.map((u) => ({ ...u, removed: false })),
    })),
}))
