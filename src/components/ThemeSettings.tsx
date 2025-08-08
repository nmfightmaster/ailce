import { useEffect, useMemo, useState } from 'react'
import { useThemeStore } from '../store/useThemeStore'

export function ThemeSettings() {
  const {
    isSettingsOpen,
    closeSettings,
    applyTheme,
    resetDefaults,
    userBubbleBg,
    userBubbleText,
    assistantBubbleBg,
    assistantBubbleText,
    pinnedHighlight,
    removedDim,
    windowBg,
    windowText,
    assistantName,
  } = useThemeStore()

  const [draft, setDraft] = useState({
    userBubbleBg,
    userBubbleText,
    assistantBubbleBg,
    assistantBubbleText,
    pinnedHighlight,
    removedDim,
    windowBg,
    windowText,
    assistantName,
  })

  function parseColorToRgb(input: string): { r: number; g: number; b: number; a: number } | null {
    const str = (input || '').trim()
    // #rgb, #rrggbb, #rrggbbaa
    if (/^#/.test(str)) {
      const hex = str.slice(1)
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16)
        const g = parseInt(hex[1] + hex[1], 16)
        const b = parseInt(hex[2] + hex[2], 16)
        return { r, g, b, a: 1 }
      }
      if (hex.length === 6 || hex.length === 8) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
        return { r, g, b, a }
      }
      return null
    }
    // rgb/rgba with commas: rgb(1,2,3) rgba(1,2,3,0.5)
    const mComma = str.match(/^rgba?\(([^)]+)\)$/i)
    if (mComma) {
      const parts = mComma[1].split(',').map((p) => p.trim())
      if (parts.length >= 3) {
        const r = Number(parts[0])
        const g = Number(parts[1])
        const b = Number(parts[2])
        const a = parts[3] !== undefined ? Number(parts[3]) : 1
        if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
        return { r, g, b, a }
      }
    }
    // rgb space-separated with optional slash alpha: rgb(1 2 3 / 0.5)
    const mSpace = str.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([0-9.]+))?\s*\)$/i)
    if (mSpace) {
      const r = Number(mSpace[1])
      const g = Number(mSpace[2])
      const b = Number(mSpace[3])
      const a = mSpace[4] !== undefined ? Number(mSpace[4]) : 1
      if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
      return { r, g, b, a }
    }
    return null
  }

  function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
    const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  }

  function contrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }, bgAlpha = 1): number {
    // If background has alpha, composite over black as conservative baseline
    const bgAdj = { r: Math.round(bg.r * bgAlpha), g: Math.round(bg.g * bgAlpha), b: Math.round(bg.b * bgAlpha) }
    const L1 = relativeLuminance(fg)
    const L2 = relativeLuminance(bgAdj)
    const lighter = Math.max(L1, L2)
    const darker = Math.min(L1, L2)
    return (lighter + 0.05) / (darker + 0.05)
  }

  const userContrast = useMemo(() => {
    const fg = parseColorToRgb(draft.userBubbleText)
    const bg = parseColorToRgb(draft.userBubbleBg)
    if (!fg || !bg) return null
    return contrastRatio(fg, bg, bg.a)
  }, [draft.userBubbleText, draft.userBubbleBg])

  const assistantContrast = useMemo(() => {
    const fg = parseColorToRgb(draft.assistantBubbleText)
    const bg = parseColorToRgb(draft.assistantBubbleBg)
    if (!fg || !bg) return null
    return contrastRatio(fg, bg, bg.a)
  }, [draft.assistantBubbleText, draft.assistantBubbleBg])

  const windowContrast = useMemo(() => {
    const fg = parseColorToRgb(draft.windowText)
    const bg = parseColorToRgb(draft.windowBg)
    if (!fg || !bg) return null
    return contrastRatio(fg, bg, bg.a)
  }, [draft.windowText, draft.windowBg])

  const warnUser = userContrast !== null && userContrast < 4.5
  const warnAssistant = assistantContrast !== null && assistantContrast < 4.5
  const warnWindow = windowContrast !== null && windowContrast < 4.5

  // Sync draft from current theme values when opening the modal
  useEffect(() => {
    if (!isSettingsOpen) return
    setDraft({
      userBubbleBg,
      userBubbleText,
      assistantBubbleBg,
      assistantBubbleText,
      pinnedHighlight,
      removedDim,
      windowBg,
      windowText,
      assistantName,
    })
  }, [isSettingsOpen])

  if (!isSettingsOpen) return null

  function toHexNoAlpha(str: string): string {
    const rgb = parseColorToRgb(str)
    if (!rgb) return '#000000'
    const toHex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${toHex(Math.max(0, Math.min(255, Math.round(rgb.r))))}${toHex(Math.max(0, Math.min(255, Math.round(rgb.g))))}${toHex(Math.max(0, Math.min(255, Math.round(rgb.b))))}`
  }

  function rgbaToCss(r: number, g: number, b: number, a: number): string {
    const rc = Math.max(0, Math.min(255, Math.round(r)))
    const gc = Math.max(0, Math.min(255, Math.round(g)))
    const bc = Math.max(0, Math.min(255, Math.round(b)))
    const ac = Math.max(0, Math.min(1, Number(a)))
    return `rgba(${rc}, ${gc}, ${bc}, ${ac})`
  }

  function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
    const parsed = parseColorToRgb(value) || { r: 0, g: 0, b: 0, a: 1 }
    const hex = toHexNoAlpha(value)
    return (
      <div className="col-span-2 rounded-md border border-white/10 p-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-300">{label}</span>
          <input
            aria-label={`${label} color picker`}
            type="color"
            value={hex}
            onChange={(e) => {
              const v = e.target.value || '#000000'
              const r = parseInt(v.slice(1, 3), 16)
              const g = parseInt(v.slice(3, 5), 16)
              const b = parseInt(v.slice(5, 7), 16)
              onChange(rgbaToCss(r, g, b, parsed.a))
            }}
          />
        </div>
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <label className="flex items-center gap-1">R
            <input
              type="number"
              min={0}
              max={255}
              value={Math.round(parsed.r)}
              onChange={(e) => onChange(rgbaToCss(Number(e.target.value || 0), parsed.g, parsed.b, parsed.a))}
              className="w-full rounded border border-white/10 bg-white/5 p-1 text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-1">G
            <input
              type="number"
              min={0}
              max={255}
              value={Math.round(parsed.g)}
              onChange={(e) => onChange(rgbaToCss(parsed.r, Number(e.target.value || 0), parsed.b, parsed.a))}
              className="w-full rounded border border-white/10 bg-white/5 p-1 text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-1">B
            <input
              type="number"
              min={0}
              max={255}
              value={Math.round(parsed.b)}
              onChange={(e) => onChange(rgbaToCss(parsed.r, parsed.g, Number(e.target.value || 0), parsed.a))}
              className="w-full rounded border border-white/10 bg-white/5 p-1 text-zinc-100"
            />
          </label>
          <label className="flex items-center gap-1">A
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={Number(parsed.a.toFixed(2))}
              onChange={(e) => onChange(rgbaToCss(parsed.r, parsed.g, parsed.b, Number(e.target.value || 0)))}
              className="w-full rounded border border-white/10 bg-white/5 p-1 text-zinc-100"
            />
          </label>
        </div>
      </div>
    )
  }

  const onApply = () => {
    const name = (draft.assistantName || '').trim()
    const safeName = name && name.length <= 40 ? name : 'AI'
    applyTheme({ ...draft, assistantName: safeName })
    closeSettings()
  }

  const onReset = () => {
    resetDefaults()
    closeSettings()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[720px] max-w-[92vw] rounded-xl border border-white/10 bg-zinc-900 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Theme & Chat Settings</h3>
          <button onClick={closeSettings} className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-200 hover:bg-white/20">Close</button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Colors</h4>
            <div className="grid grid-cols-2 items-start gap-2 text-xs">
              <ColorControl label="User bubble bg" value={draft.userBubbleBg} onChange={(v) => setDraft({ ...draft, userBubbleBg: v })} />
              <ColorControl label="User bubble text" value={draft.userBubbleText} onChange={(v) => setDraft({ ...draft, userBubbleText: v })} />
              {warnUser && <div className="col-span-2 text-[11px] text-amber-300">Low contrast for User bubble (ratio {userContrast?.toFixed(2)}). Aim for ≥ 4.5:1.</div>}

              <ColorControl label="Assistant bubble bg" value={draft.assistantBubbleBg} onChange={(v) => setDraft({ ...draft, assistantBubbleBg: v })} />
              <ColorControl label="Assistant bubble text" value={draft.assistantBubbleText} onChange={(v) => setDraft({ ...draft, assistantBubbleText: v })} />
              {warnAssistant && <div className="col-span-2 text-[11px] text-amber-300">Low contrast for Assistant bubble (ratio {assistantContrast?.toFixed(2)}). Aim for ≥ 4.5:1.</div>}
              <ColorControl label="Pinned highlight" value={draft.pinnedHighlight} onChange={(v) => setDraft({ ...draft, pinnedHighlight: v })} />
              <ColorControl label="Removed dim" value={draft.removedDim} onChange={(v) => setDraft({ ...draft, removedDim: v })} />

              <ColorControl label="Window bg" value={draft.windowBg} onChange={(v) => setDraft({ ...draft, windowBg: v })} />
              <ColorControl label="Window text" value={draft.windowText} onChange={(v) => setDraft({ ...draft, windowText: v })} />
              {warnWindow && <div className="col-span-2 text-[11px] text-amber-300">Low contrast for Window text (ratio {windowContrast?.toFixed(2)}). Aim for ≥ 4.5:1.</div>}
            </div>

            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Assistant name</h4>
            <input
              type="text"
              value={draft.assistantName}
              onChange={(e) => setDraft({ ...draft, assistantName: e.target.value.slice(0, 40) })}
              placeholder="AI"
              className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Preview</h4>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-center gap-3">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: draft.userBubbleBg, color: draft.userBubbleText }}
                >
                  You
                </span>
                <span className="text-zinc-300 text-xs">Hello!</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: draft.assistantBubbleBg, color: draft.assistantBubbleText }}
                >
                  {draft.assistantName || 'AI'}
                </span>
                <span className="text-zinc-300 text-xs">Hi there, how can I help?</span>
              </div>
              <div className="rounded-md p-2 text-xs" style={{ background: draft.windowBg, color: draft.windowText }}>
                Window preview text
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-md px-2 py-1 text-black" style={{ background: draft.pinnedHighlight }}>Pinned</span>
                <span className="rounded-md px-2 py-1" style={{ background: draft.removedDim, color: '#111' }}>Removed</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={onReset} className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/20">Reset to default</button>
          <div className="flex items-center gap-2">
            <button onClick={closeSettings} className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/20">Cancel</button>
            <button onClick={onApply} className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400">Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}


