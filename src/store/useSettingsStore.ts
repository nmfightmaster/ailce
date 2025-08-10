import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { modelInfo as staticModelInfo, type ModelInfo } from '../data/modelInfo'

export interface SettingsState {
  model: string
  setModel: (modelId: string) => void

  customModels: Record<string, ModelInfo>
  addCustomModel: (modelId: string, info: ModelInfo) => void
  removeCustomModel: (modelId: string) => void

  /** Returns merged dictionary of static + custom models */
  getAllModels: () => Record<string, ModelInfo>

  // Embeddings
  embeddingModel: string
  setEmbeddingModel: (modelId: string) => void
  /** List known embedding model ids */
  getAllEmbeddingModels: () => string[]
}

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const KNOWN_EMBEDDING_MODELS = [
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
  'text-search-ada-query-001',
]

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      model: DEFAULT_MODEL,
      setModel: (modelId) => set({ model: modelId }),

      customModels: {},
      addCustomModel: (modelId, info) =>
        set((state) => {
          const next = { ...state.customModels, [modelId]: info }
          return { customModels: next, model: modelId }
        }),
      removeCustomModel: (modelId) =>
        set((state) => {
          const next = { ...state.customModels }
          delete next[modelId]
          // If current selection was removed, fall back to default
          const nextModel = state.model === modelId ? DEFAULT_MODEL : state.model
          return { customModels: next, model: nextModel }
        }),

      getAllModels: () => ({ ...staticModelInfo, ...get().customModels }),

      // Embeddings
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      setEmbeddingModel: (modelId) => set({ embeddingModel: modelId }),
      getAllEmbeddingModels: () => KNOWN_EMBEDDING_MODELS,
    }),
    {
      name: 'live-context-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ model: state.model, customModels: state.customModels, embeddingModel: state.embeddingModel }),
      migrate: (persisted, _v) => {
        const base = (persisted as any) || {}
        const model = typeof base.model === 'string' ? base.model : DEFAULT_MODEL
        const customModels = base.customModels && typeof base.customModels === 'object' ? base.customModels : {}
        const embeddingModel = typeof base.embeddingModel === 'string' ? base.embeddingModel : DEFAULT_EMBEDDING_MODEL
        return { model, customModels, embeddingModel } as Partial<SettingsState>
      },
    }
  )
)

export type { ModelInfo } from '../data/modelInfo'


