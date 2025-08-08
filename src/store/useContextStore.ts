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

interface ContextStoreState {
  units: ContextUnit[]
  addUnit: (unit: ContextUnit) => void
  togglePin: (id: string) => void
  toggleRemoved: (id: string) => void
  updateUnit: (id: string, newContent: string) => void
}

const nowIso = () => new Date().toISOString()
const randomId = () => Math.random().toString(36).slice(2)

const initialUnits: ContextUnit[] = [
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

export const useContextStore = create<ContextStoreState>((set) => ({
  units: initialUnits,
  addUnit: (unit) =>
    set((state) => ({
      units: [...state.units, unit],
    })),
  togglePin: (id) =>
    set((state) => ({
      units: state.units.map((u) => (u.id === id ? { ...u, pinned: !u.pinned } : u)),
    })),
  toggleRemoved: (id) =>
    set((state) => ({
      units: state.units.map((u) =>
        u.id === id ? { ...u, removed: !u.removed, pinned: u.removed ? u.pinned : false } : u
      ),
    })),
  updateUnit: (id, newContent) =>
    set((state) => ({
      units: state.units.map((u) => (u.id === id ? { ...u, content: newContent } : u)),
    })),
}))


