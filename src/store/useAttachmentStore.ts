import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { countTokensForText } from '../utils/tokenUtils'
import { chunkTextIntoTokenBatches } from '../utils/chunkUtils'
import { extractTextFromFile } from '../utils/textExtractors'

export interface AttachmentMeta {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface AttachmentChunk {
  id: string
  attachmentId: string
  index: number
  text: string
  tokenCount: number
  // Optional embeddings metadata
  embedding?: number[]
  embeddingModel?: string
}

interface AttachmentState {
  attachments: AttachmentMeta[]
  chunksByAttachmentId: Record<string, AttachmentChunk[]>

  // Derived helpers
  getAllChunks: () => AttachmentChunk[]
  getChunksForAttachmentIds: (ids: string[]) => AttachmentChunk[]

  // CRUD
  uploadFiles: (files: File[]) => Promise<void>
  renameAttachment: (attachmentId: string, nextName: string) => void
  deleteAttachment: (attachmentId: string) => void
}

const nowIso = () => new Date().toISOString()
const rid = () => Math.random().toString(36).slice(2)

export const useAttachmentStore = create<AttachmentState>()(
  persist(
    (set, get) => ({
      attachments: [],
      chunksByAttachmentId: {},

      getAllChunks: () => Object.values(get().chunksByAttachmentId).flat(),
      getChunksForAttachmentIds: (ids) => {
        const byId = get().chunksByAttachmentId
        return ids.flatMap((id) => byId[id] || [])
      },

      uploadFiles: async (files) => {
        const metas: AttachmentMeta[] = []
        const chunksMap: Record<string, AttachmentChunk[]> = {}

        for (const f of files) {
          try {
            const text = await extractTextFromFile(f)
            const attachmentId = rid()
            const batches = chunkTextIntoTokenBatches(text, 500, 80)
            const chunks: AttachmentChunk[] = batches.map((t, i) => ({
              id: rid(),
              attachmentId,
              index: i,
              text: t,
              tokenCount: countTokensForText(t),
            }))
            chunksMap[attachmentId] = chunks
            metas.push({
              id: attachmentId,
              name: f.name,
              mimeType: f.type || 'application/octet-stream',
              sizeBytes: f.size,
              createdAt: nowIso(),
            })
          } catch (e) {
            // skip invalid/failed file
            console.warn('Failed to extract text for', f.name, e)
          }
        }

        if (!metas.length) return
        set((s) => {
          const nextAttachments = [...s.attachments, ...metas]
          const nextChunks = { ...s.chunksByAttachmentId }
          for (const [k, v] of Object.entries(chunksMap)) nextChunks[k] = v
          return { attachments: nextAttachments, chunksByAttachmentId: nextChunks }
        })
        // Fire-and-forget generate embeddings for newly uploaded attachments
        for (const a of metas) {
          void generateEmbeddingsForAttachment(a.id)
        }
      },

      renameAttachment: (attachmentId, nextName) =>
        set((s) => ({
          attachments: s.attachments.map((a) => (a.id === attachmentId ? { ...a, name: (nextName || a.name).trim() } : a)),
        })),

      deleteAttachment: (attachmentId) =>
        set((s) => ({
          attachments: s.attachments.filter((a) => a.id !== attachmentId),
          chunksByAttachmentId: Object.fromEntries(
            Object.entries(s.chunksByAttachmentId).filter(([k]) => k !== attachmentId)
          ),
        })),
    }),
    {
      name: 'live-context-attachments',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ attachments: s.attachments, chunksByAttachmentId: s.chunksByAttachmentId }),
      migrate: (persisted) => {
        const base = (persisted as any) || {}
        const attachments: AttachmentMeta[] = Array.isArray(base.attachments) ? base.attachments : []
        const chunksByAttachmentId: Record<string, AttachmentChunk[]> =
          base.chunksByAttachmentId && typeof base.chunksByAttachmentId === 'object'
            ? base.chunksByAttachmentId
            : {}
        return { attachments, chunksByAttachmentId } as Partial<AttachmentState>
      },
    }
  )
)

async function generateEmbeddingsForAttachment(attachmentId: string): Promise<void> {
  try {
    const apiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY as string | undefined
    if (!apiKey) return
    const { chunksByAttachmentId } = useAttachmentStore.getState()
    const chunks = chunksByAttachmentId[attachmentId] || []
    if (!chunks.length) return
    const embeddingModel = (await import('./useSettingsStore')).useSettingsStore.getState().embeddingModel
    // Batch request: OpenAI Embeddings API accepts input as array of strings
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: embeddingModel, input: chunks.map((c) => c.text) }),
    })
    if (!response.ok) throw new Error(`Embeddings error: ${response.status}`)
    const data: any = await response.json()
    const vectors: Array<{ embedding: number[] }> = data?.data || []
    if (!Array.isArray(vectors) || vectors.length !== chunks.length) throw new Error('Embeddings length mismatch')
    // Write back embeddings with model name
    useAttachmentStore.setState((s) => {
      const current = s.chunksByAttachmentId[attachmentId] || []
      const next = current.map((c, i) => ({ ...c, embedding: vectors[i].embedding, embeddingModel }))
      return { chunksByAttachmentId: { ...s.chunksByAttachmentId, [attachmentId]: next } }
    })
  } catch (e) {
    console.warn('Failed to generate embeddings for', attachmentId, e)
  }
}


