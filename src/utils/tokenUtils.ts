// Token utilities using @dqbd/tiktoken lite encoders for client-side (Vite)
// Default model: gpt-4o-mini (o200k_base)

import { Tiktoken, init } from '@dqbd/tiktoken/lite/init'
import wasmUrl from '@dqbd/tiktoken/lite/tiktoken_bg.wasm?url'
// The JSON encoder definitions are bundled with the package
// We import both common encodings and pick based on model
import cl100k_base from '@dqbd/tiktoken/encoders/cl100k_base.json' with { type: 'json' }
import o200k_base from '@dqbd/tiktoken/encoders/o200k_base.json' with { type: 'json' }

// Shape of the encoder JSON supplied by @dqbd/tiktoken
interface EncoderJson {
  bpe_ranks: Record<string, number>
  special_tokens: Record<string, number>
  pat_str: string
}

const CL100K: EncoderJson = cl100k_base as unknown as EncoderJson
const O200K: EncoderJson = o200k_base as unknown as EncoderJson

// Initialize WASM once (Vite fetches the URL)
init((imports) => WebAssembly.instantiateStreaming(fetch(wasmUrl), imports) as any)

// WASM is initialized by the ?init side-effect import above

// Minimal model→encoding mapping for OpenAI chat models
function modelToEncoding(model: string): 'o200k_base' | 'cl100k_base' {
  const m = (model || '').toLowerCase()
  // 4o family → o200k
  if (m.includes('gpt-4o')) return 'o200k_base'
  if (m.includes('o200k')) return 'o200k_base'
  // default to cl100k
  return 'cl100k_base'
}

type EncoderName = 'o200k_base' | 'cl100k_base'

let encoders: Partial<Record<EncoderName, Tiktoken>> = {}

function getEncoder(encodingName: EncoderName): Tiktoken {
  if (encoders[encodingName]) return encoders[encodingName] as Tiktoken
  if (encodingName === 'o200k_base') {
    encoders.o200k_base = new Tiktoken(
      O200K.bpe_ranks as unknown as any,
      O200K.special_tokens as unknown as any,
      O200K.pat_str as unknown as any
    )
    return encoders.o200k_base
  }
  encoders.cl100k_base = new Tiktoken(
    CL100K.bpe_ranks as unknown as any,
    CL100K.special_tokens as unknown as any,
    CL100K.pat_str as unknown as any
  )
  return encoders.cl100k_base
}

export function countTokensForText(text: string, model = 'gpt-4o-mini'): number {
  try {
    const encodingName = modelToEncoding(model)
    const encoder = getEncoder(encodingName)
    const tokens = encoder.encode(text || '')
    return tokens.length
  } catch {
    // Fallback: approximate by splitting on whitespace + punctuation blocks
    const rough = (text || '').trim()
    if (!rough) return 0
    return Math.max(1, Math.ceil(rough.length / 4))
  }
}


