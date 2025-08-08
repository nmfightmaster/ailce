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
}

const DEFAULT_MODEL = 'gpt-4o'

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
    }),
    {
      name: 'live-context-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ model: state.model, customModels: state.customModels }),
      migrate: (persisted, _v) => {
        const base = (persisted as any) || {}
        const model = typeof base.model === 'string' ? base.model : DEFAULT_MODEL
        const customModels = base.customModels && typeof base.customModels === 'object' ? base.customModels : {}
        return { model, customModels } as Partial<SettingsState>
      },
    }
  )
)

export type { ModelInfo } from '../data/modelInfo'


