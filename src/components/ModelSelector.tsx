import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '../store/useSettingsStore'
import type { ModelInfo } from '../store/useSettingsStore'

function formatNumberWithCommas(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function ModelSelector() {
  const model = useSettingsStore((s) => s.model)
  const setModel = useSettingsStore((s) => s.setModel)
  const addCustomModel = useSettingsStore((s) => s.addCustomModel)
  const removeCustomModel = useSettingsStore((s) => s.removeCustomModel)
  const getAllModels = useSettingsStore((s) => s.getAllModels)

  const [isOpen, setIsOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [hoveredInfo, setHoveredInfo] = useState<ModelInfo | null>(null)
  const [hoverAnchorRect, setHoverAnchorRect] = useState<DOMRect | null>(null)

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const models = useMemo(() => getAllModels(), [getAllModels])
  const currentInfo = models[model]

  // Close on outside click / escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node
      if (!dropdownRef.current || !isOpen) return
      if (dropdownRef.current.contains(t) || buttonRef.current?.contains(t))
        return
      setIsOpen(false)
      setShowForm(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false)
        setShowForm(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen])

  // Add Model form state
  const [form, setForm] = useState({
    id: '',
    displayName: '',
    contextWindow: '' as unknown as number | '',
    inputPricePerM: '' as unknown as number | '',
    outputPricePerM: '' as unknown as number | '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const validateForm = (): { id: string; info: ModelInfo } | null => {
    const id = form.id.trim()
    const displayName = form.displayName.trim()
    const contextWindowNum = Number(form.contextWindow)
    const inputNum = Number(form.inputPricePerM)
    const outputNum = Number(form.outputPricePerM)
    if (!id || !displayName) {
      setFormError('Model ID and Display Name are required')
      return null
    }
    if (!Number.isFinite(contextWindowNum) || contextWindowNum <= 0) {
      setFormError('Context Window must be a positive number')
      return null
    }
    if (!Number.isFinite(inputNum) || inputNum < 0) {
      setFormError('Input price must be a non-negative number')
      return null
    }
    if (!Number.isFinite(outputNum) || outputNum < 0) {
      setFormError('Output price must be a non-negative number')
      return null
    }
    setFormError(null)
    return {
      id,
      info: {
        displayName,
        contextWindow: contextWindowNum,
        inputPricePerM: inputNum,
        outputPricePerM: outputNum,
      },
    }
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const res = validateForm()
    if (!res) return
    addCustomModel(res.id, res.info)
    setModel(res.id)
    setShowForm(false)
    setForm({ id: '', displayName: '', contextWindow: '' as any, inputPricePerM: '' as any, outputPricePerM: '' as any })
  }

  const onSelect = (id: string) => {
    setModel(id)
    setIsOpen(false)
    setShowForm(false)
  }

  const tooltip = hoveredInfo && hoverAnchorRect
    ? createPortal(
        <div
          role="tooltip"
          className="fixed z-[1000] rounded-md border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-xl backdrop-blur"
          style={{
            width: 260,
            left: Math.min(
              Math.max(8, hoverAnchorRect.left + hoverAnchorRect.width / 2 - 260 / 2),
              window.innerWidth - 260 - 8
            ),
            top: Math.max(8, hoverAnchorRect.top - 8),
            transform: 'translateY(-100%)',
          }}
        >
          <div className="font-medium text-zinc-100">Switch AI model (Ctrl+/)</div>
          <div className="mt-1 text-[11px] text-zinc-400">{hoveredInfo.displayName}</div>
          <div className="mt-1 space-y-0.5 text-zinc-300">
            <div>Context: {formatNumberWithCommas(hoveredInfo.contextWindow)} tokens</div>
            <div>Input: ${hoveredInfo.inputPricePerM.toFixed(2)} / 1M</div>
            <div>Output: ${hoveredInfo.outputPricePerM.toFixed(2)} / 1M</div>
          </div>
        </div>,
        document.body
      )
    : null

  const dropdown = isOpen && buttonRef.current
    ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[1000] w-80 rounded-lg border border-white/10 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-md"
          role="listbox"
          tabIndex={-1}
          style={{
            width: 320,
            left: (() => {
              const rect = buttonRef.current!.getBoundingClientRect()
              return Math.min(Math.max(8, rect.left), window.innerWidth - 320 - 8)
            })(),
            top: (() => {
              const rect = buttonRef.current!.getBoundingClientRect()
              return Math.max(8, rect.top - 8)
            })(),
            transform: 'translateY(-100%)',
          }}
        >
          <div className="max-h-[70vh] overflow-y-auto">
            {Object.entries(models).map(([id, info]) => (
              <button
                key={id}
                role="option"
                aria-selected={model === id}
                onClick={() => onSelect(id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10 focus:bg-white/10 ${model === id ? 'bg-white/10' : ''}`}
              >
                <span className="truncate">{info.displayName}</span>
                <span className="ml-2 shrink-0 text-[10px] text-zinc-400">{id}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-white/10 pt-2">
            {!showForm ? (
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setShowForm(true)}
                  className="rounded-md bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500/90 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  Add Model
                </button>
                {!(model in models) && (
                  <button
                    onClick={() => removeCustomModel(model)}
                    className="rounded-md bg-rose-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500/90 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    Remove Selected
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleAdd} className="space-y-2">
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-400">Model ID</label>
                  <input
                    value={form.id}
                    onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                    className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    placeholder="e.g., my-org/model-1"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-zinc-400">Display Name</label>
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    placeholder="Pretty label"
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">Context Window</label>
                    <input
                      inputMode="numeric"
                      value={form.contextWindow as any}
                      onChange={(e) => setForm((f) => ({ ...f, contextWindow: e.target.value as any }))}
                      className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      placeholder="128000"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">Input $/1M</label>
                    <input
                      inputMode="decimal"
                      value={form.inputPricePerM as any}
                      onChange={(e) => setForm((f) => ({ ...f, inputPricePerM: e.target.value as any }))}
                      className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      placeholder="0.15"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-400">Output $/1M</label>
                    <input
                      inputMode="decimal"
                      value={form.outputPricePerM as any}
                      onChange={(e) => setForm((f) => ({ ...f, outputPricePerM: e.target.value as any }))}
                      className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      placeholder="0.60"
                      required
                    />
                  </div>
                </div>
                {formError && <div className="text-[11px] text-rose-400">{formError}</div>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setForm({ id: '', displayName: '', contextWindow: '' as any, inputPricePerM: '' as any, outputPricePerM: '' as any })
                      setFormError(null)
                    }}
                    className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-md bg-sky-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500/90 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        onMouseEnter={(e) => {
          setHoveredInfo(currentInfo || null)
          setHoverAnchorRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect())
        }}
        onMouseLeave={() => setHoveredInfo(null)}
        className="px-1 text-[11px] text-zinc-400 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        title={currentInfo?.displayName || model}
      >
        {currentInfo?.displayName || model} <span className="opacity-60">▾</span>
      </button>
      {tooltip}
      {dropdown}
    </div>
  )
}


