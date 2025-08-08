import { useEffect, useState } from 'react'
import { useContextStore } from '../store/useContextStore'

export function EditSaveModal() {
  const editModal = useContextStore((s) => s.editModal)
  const closeEditModal = useContextStore((s) => s.closeEditModal)
  const applyEditDoNothing = useContextStore((s) => s.applyEditDoNothing)
  const applyEditTrim = useContextStore((s) => s.applyEditTrim)
  const applyEditBranch = useContextStore((s) => s.applyEditBranch)
  const removeModal = useContextStore((s) => s.removeModal)
  const closeRemoveModal = useContextStore((s) => s.closeRemoveModal)
  const applyRemoveDoNothing = useContextStore((s) => s.applyRemoveDoNothing)
  const applyRemoveTrim = useContextStore((s) => s.applyRemoveTrim)
  const applyRemoveBranch = useContextStore((s) => s.applyRemoveBranch)

  const [branchTitle, setBranchTitle] = useState('')

  useEffect(() => {
    if (editModal?.isOpen) setBranchTitle('')
  }, [editModal?.isOpen])

  const isEditOpen = !!editModal?.isOpen
  const isRemoveOpen = !!removeModal?.isOpen
  if (!isEditOpen && !isRemoveOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-4 text-zinc-100 shadow-2xl">
        <div className="mb-3">
          <h3 className="text-base font-semibold">{isEditOpen ? 'Save Edit' : 'Remove Input Message'}</h3>
          <p className="mt-1 text-xs text-zinc-400">
            {isEditOpen
              ? 'Choose what to do after saving your change to this user message.'
              : 'Choose what to do after removing this user message.'}
          </p>
        </div>
        {isEditOpen && (
          <div className="mb-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">Edited content</div>
            <div className="max-h-40 overflow-auto whitespace-pre-wrap text-zinc-100/90">
              {editModal?.newContent || '(empty)'}
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm">
          <button
            onClick={isEditOpen ? applyEditDoNothing : applyRemoveDoNothing}
            className="w-full rounded-md bg-white/10 px-3 py-2 text-left hover:bg-white/20"
          >
            <div className="font-medium">Do Nothing</div>
            <div className="text-xs text-zinc-400">
              {isEditOpen
                ? 'Save the edit and keep all subsequent messages unchanged.'
                : 'Remove the message only; keep all subsequent messages unchanged.'}
            </div>
          </button>

          <button
            onClick={isEditOpen ? applyEditTrim : applyRemoveTrim}
            className="w-full rounded-md bg-rose-500/20 px-3 py-2 text-left hover:bg-rose-500/30"
          >
            <div className="font-medium">Trim Conversation</div>
            <div className="text-xs text-zinc-200">
              {isEditOpen
                ? 'Save the edit, delete messages after it, and regenerate the assistant reply.'
                : 'Remove the message and delete messages after it.'}
            </div>
          </button>

          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="mb-2">
              <div className="font-medium">Branch Conversation</div>
              <div className="text-xs text-zinc-400">
              {isEditOpen
                ? 'Save the edit, create a new conversation fork up to this point, and regenerate the assistant reply there.'
                : 'Remove the message and create a new conversation fork up to this point.'}
              </div>
            </div>
            <input
              value={branchTitle}
              onChange={(e) => setBranchTitle(e.target.value)}
              placeholder="Optional branch title"
              className="mb-2 w-full rounded-md border border-white/10 bg-zinc-900/80 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            <div className="flex gap-2">
              <button
                onClick={() => (isEditOpen ? applyEditBranch(branchTitle.trim() || undefined) : applyRemoveBranch(branchTitle.trim() || undefined))}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-sky-400"
              >
                Create Branch
              </button>
              <button
                onClick={isEditOpen ? closeEditModal : closeRemoveModal}
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          {isEditOpen ? (
            <button onClick={closeEditModal} className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              Close
            </button>
          ) : (
            <button onClick={closeRemoveModal} className="rounded-md px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


