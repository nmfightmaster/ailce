import type { ContextUnit } from '../store/useContextStore'
import { useContextStore } from '../store/useContextStore'

function Tag({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
      {label}
    </span>
  )
}

function TypeBadge({ type }: { type: ContextUnit['type'] }) {
  const map: Record<ContextUnit['type'], string> = {
    user: 'text-sky-300 bg-sky-500/15',
    assistant: 'text-emerald-300 bg-emerald-500/15',
    system: 'text-zinc-300 bg-zinc-500/15',
    note: 'text-amber-300 bg-amber-500/15',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[type]}`}>{type}</span>
}

export function ContextUnitItem({ unit }: { unit: ContextUnit }) {
  const togglePin = useContextStore((s) => s.togglePin)
  const toggleRemoved = useContextStore((s) => s.toggleRemoved)

  return (
    <div
      className={`rounded-lg border p-3 ${unit.removed ? 'border-rose-500/20 bg-rose-500/5 opacity-70' : 'border-white/10 bg-white/5'} shadow-soft`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TypeBadge type={unit.type} />
          <span className="text-xs text-zinc-400" title={unit.timestamp}>
            {new Date(unit.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => togglePin(unit.id)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${unit.pinned ? 'bg-yellow-500 text-black' : 'bg-white/10 text-zinc-300 hover:bg-white/20'}`}
            title={unit.pinned ? 'Unpin' : 'Pin'}
          >
            {unit.pinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            onClick={() => toggleRemoved(unit.id)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${unit.removed ? 'bg-emerald-500 text-black' : 'bg-rose-500/80 text-white hover:bg-rose-500'}`}
            title={unit.removed ? 'Restore' : 'Remove from context'}
          >
            {unit.removed ? 'Restore' : 'Remove'}
          </button>
        </div>
      </div>
      <div className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100/90">{unit.content}</div>
      <div className="flex flex-wrap gap-1">
        {unit.tags.map((t) => (
          <Tag key={t} label={t} />
        ))}
      </div>
    </div>
  )
}


