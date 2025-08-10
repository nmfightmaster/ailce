import { useMemo, useState } from 'react'
import { useContextStore } from '../store/useContextStore'
import { Window } from './Window'
import { HelpTooltip } from './HelpTooltip'
import { InfoBanner } from './InfoBanner'

export function SnapshotsWindow() {
  const conversations = useContextStore((s) => s.conversations)
  const activeConversationId = useContextStore((s) => s.activeConversationId)
  const createSnapshot = useContextStore((s) => s.createSnapshot)
  const restoreSnapshot = useContextStore((s) => s.restoreSnapshot)
  const branchFromSnapshot = useContextStore((s) => s.branchFromSnapshot)

  const [titleDraft, setTitleDraft] = useState('')

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  )

  const snapshots = (activeConversation?.snapshots || []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const onCreate = () => {
    if (!activeConversation) return
    createSnapshot(activeConversation.id, titleDraft.trim() || undefined)
    setTitleDraft('')
  }

  return (
    <Window
      title="Snapshots"
      subtitle="Lightweight checkpoints in this conversation"
      right={<HelpTooltip title={
        'Snapshots = lightweight save points inside a conversation. Restore returns to that point without creating a new conversation. You can also branch from a snapshot to explore alternatives as a separate conversation.'
      } />}
      bodyClassName="p-3"
    >
      <div className="space-y-3">
        <InfoBanner>
          <div className="flex items-start gap-2">
            <div className="mt-[2px]">💾</div>
            <div>
              <div className="font-medium text-zinc-200">Snapshots are restore points</div>
              <div className="text-zinc-400">Create a snapshot before risky edits. Restoring does not create a new conversation. Use Branch to fork a new conversation.</div>
            </div>
          </div>
        </InfoBanner>

        <div className="flex items-center gap-2">
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="Snapshot title (optional)"
            className="w-56 rounded-md border border-white/10 bg-white/5 p-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
          <button
            onClick={onCreate}
            className="rounded-md bg-sky-500 px-2.5 py-1.5 text-xs font-medium text-black hover:bg-sky-400"
          >
            New Snapshot
          </button>
        </div>

        {snapshots.length === 0 ? (
          <div className="text-[12px] text-zinc-400">No snapshots yet.</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-auto pr-1">
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs">
                <div className="min-w-0">
                  <div className="truncate text-zinc-200">{s.title || 'Snapshot'}</div>
                  <div className="text-[11px] text-zinc-400">{new Date(s.createdAt).toLocaleString()}</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    title="Restore snapshot (rollback within this conversation)"
                    className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/20"
                    onClick={() => activeConversation && restoreSnapshot(activeConversation.id, s.id)}
                  >
                    Restore
                  </button>
                  <button
                    title="Branch from snapshot (create a new conversation)"
                    className="rounded-md bg-emerald-500/90 px-2 py-1 text-[11px] font-medium text-black hover:bg-emerald-400"
                    onClick={() => activeConversation && branchFromSnapshot(activeConversation.id, s.id, undefined)}
                  >
                    Branch
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Window>
  )
}


