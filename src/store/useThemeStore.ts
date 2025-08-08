import { create } from 'zustand'

export interface ThemeState {
  // Colors as CSS color strings
  userBubbleBg: string
  userBubbleText: string
  assistantBubbleBg: string
  assistantBubbleText: string
  pinnedHighlight: string
  removedDim: string
  windowBg: string
  windowText: string
  // New theme colors
  headerText: string
  secondaryText: string
  userTokenColor: string
  assistantTokenColor: string
  tokenBarBg: string
  remainingTokenColor: string

  assistantName: string

  isSettingsOpen: boolean

  openSettings: () => void
  closeSettings: () => void
  resetDefaults: () => void
  applyTheme: (partial: Partial<ThemeState>) => void
}

const DEFAULTS = {
  userBubbleBg: 'rgb(14 165 233 / 0.15)', // sky-500/15
  userBubbleText: 'rgb(125 211 252)', // sky-300
  assistantBubbleBg: 'rgb(16 185 129 / 0.15)', // emerald-500/15
  assistantBubbleText: 'rgb(167 243 208)', // emerald-300
  pinnedHighlight: 'rgb(234 179 8)', // yellow-500
  removedDim: 'rgb(244 63 94 / 0.5)', // rose-500/50
  windowBg: 'rgba(255,255,255,0.05)',
  windowText: 'rgba(244,244,245,0.9)',
  headerText: 'rgba(244,244,245,0.95)',
  secondaryText: 'rgb(161 161 170)', // zinc-400
  userTokenColor: 'rgb(125 211 252)', // sky-300
  assistantTokenColor: 'rgb(167 243 208)', // emerald-300
  tokenBarBg: 'rgba(255,255,255,0.08)',
  remainingTokenColor: 'rgba(255,255,255,0.18)',
  assistantName: 'AI',
}

const STORAGE_KEY = 'lce:theme'

function loadFromStorage(): Partial<ThemeState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function persist(partial: Partial<ThemeState>) {
  try {
    const next = { ...loadFromStorage(), ...partial }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
}

function writeCssVariables(state: Partial<ThemeState>) {
  const root = document.documentElement
  if (!root) return
  const entries: Array<[string, string | undefined]> = [
    ['--user-bubble-bg', state.userBubbleBg],
    ['--user-bubble-text', state.userBubbleText],
    ['--assistant-bubble-bg', state.assistantBubbleBg],
    ['--assistant-bubble-text', state.assistantBubbleText],
    ['--pinned-highlight', state.pinnedHighlight],
    ['--removed-dim', state.removedDim],
    ['--window-bg', state.windowBg],
    ['--window-text', state.windowText],
    ['--header-text', state.headerText],
    ['--secondary-text', state.secondaryText],
    ['--user-token-color', state.userTokenColor],
    ['--assistant-token-color', state.assistantTokenColor],
    ['--token-bar-bg', state.tokenBarBg],
    ['--remaining-token-color', state.remainingTokenColor],
  ]
  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.length) {
      root.style.setProperty(key, value)
    }
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const saved = loadFromStorage()
  const initial = { ...DEFAULTS, ...saved }
  // Apply vars on init
  queueMicrotask(() => writeCssVariables(initial))
  return {
    ...initial,
    isSettingsOpen: false,
    openSettings: () => set({ isSettingsOpen: true }),
    closeSettings: () => set({ isSettingsOpen: false }),
    resetDefaults: () => {
      persist(DEFAULTS)
      writeCssVariables(DEFAULTS)
      set({ ...DEFAULTS })
    },
    applyTheme: (partial) => {
      const next = { ...get(), ...partial }
      persist({
        userBubbleBg: next.userBubbleBg,
        userBubbleText: next.userBubbleText,
        assistantBubbleBg: next.assistantBubbleBg,
        assistantBubbleText: next.assistantBubbleText,
        pinnedHighlight: next.pinnedHighlight,
        removedDim: next.removedDim,
        windowBg: next.windowBg,
        windowText: next.windowText,
        headerText: next.headerText,
        secondaryText: next.secondaryText,
        userTokenColor: next.userTokenColor,
        assistantTokenColor: next.assistantTokenColor,
        tokenBarBg: next.tokenBarBg,
        remainingTokenColor: next.remainingTokenColor,
        assistantName: next.assistantName,
      })
      writeCssVariables(next)
      set(next)
    },
  }
})


