export interface ModelInfo {
  displayName: string
  contextWindow: number
  inputPricePerM: number
  outputPricePerM: number
}

export const modelInfo: Record<string, ModelInfo> = {
  'gpt-4o': {
    displayName: 'GPT-4o',
    contextWindow: 128000,
    inputPricePerM: 2.5,
    outputPricePerM: 10.0,
  },
  'gpt-4o-mini': {
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    inputPricePerM: 0.15,
    outputPricePerM: 0.6,
  },
  'o1-preview': {
    displayName: 'O1 Preview',
    contextWindow: 200000,
    inputPricePerM: 15.0,
    outputPricePerM: 60.0,
  },
  'gpt-3.5-turbo-16k': {
    displayName: 'GPT-3.5 Turbo 16k',
    contextWindow: 16000,
    inputPricePerM: 3.0,
    outputPricePerM: 4.0,
  },
  'gpt-4-turbo': {
    displayName: 'GPT-4 Turbo',
    contextWindow: 128000,
    inputPricePerM: 10.0,
    outputPricePerM: 30.0,
  },
}


