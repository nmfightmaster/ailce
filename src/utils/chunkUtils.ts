import { countTokensForText } from './tokenUtils'

// Chunk plain text into batches with a max token target and optional overlap.
// Strategy: split by paragraphs, pack greedily up to maxTokens, then carry tail overlap by tokens.
export function chunkTextIntoTokenBatches(
  text: string,
  maxTokens: number = 500,
  overlapTokens: number = 80
): string[] {
  const cleaned = (text || '').replace(/\r\n?/g, '\n').trim()
  if (!cleaned) return []
  const paragraphs = cleaned.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []

  let current: string[] = []
  let currentTokens = 0

  const pushChunk = () => {
    if (!current.length) return
    const joined = current.join('\n\n')
    chunks.push(joined)
  }

  for (const para of paragraphs) {
    const t = countTokensForText(para)
    if (t > maxTokens) {
      // Paragraph itself is too large; hard-split by sentences
      const sentences = para.split(/(?<=[.!?])\s+/)
      for (const sent of sentences) {
        const ts = countTokensForText(sent)
        if (currentTokens + ts > maxTokens && current.length) {
          pushChunk()
          // Start new with overlap from previous chunk tail
          if (overlapTokens > 0 && chunks.length) {
            const back = takeTailOverlapTokens(chunks[chunks.length - 1], overlapTokens)
            current = back ? [back] : []
            currentTokens = back ? countTokensForText(back) : 0
          } else {
            current = []
            currentTokens = 0
          }
        }
        current.push(sent)
        currentTokens += ts
      }
      continue
    }
    if (currentTokens + t > maxTokens && current.length) {
      pushChunk()
      if (overlapTokens > 0 && chunks.length) {
        const back = takeTailOverlapTokens(chunks[chunks.length - 1], overlapTokens)
        current = back ? [back] : []
        currentTokens = back ? countTokensForText(back) : 0
      } else {
        current = []
        currentTokens = 0
      }
    }
    current.push(para)
    currentTokens += t
  }
  pushChunk()
  return chunks
}

function takeTailOverlapTokens(text: string, overlapTokens: number): string {
  if (overlapTokens <= 0) return ''
  const parts = text.split(/\s+/)
  let acc = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts.slice(i).join(' ')
    if (countTokensForText(candidate) >= overlapTokens) {
      acc = candidate
      break
    }
  }
  return acc
}


