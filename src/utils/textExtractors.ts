// Minimal client-side extractors for .txt, .md, and .pdf
// For PDF, use pdfjs-dist dynamic import to keep bundle lean.

export async function extractTextFromFile(file: File): Promise<string> {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return await file.text()
  }
  if (name.endsWith('.pdf')) {
    return await extractTextFromPdf(file)
  }
  // Fallback: try to read as text
  try {
    return await file.text()
  } catch {
    throw new Error('Unsupported file type')
  }
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Vite: import worker as URL string
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default as string
  ;(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl

  const buf = await file.arrayBuffer()
  const loadingTask = (pdfjs as any).getDocument({ data: buf })
  const pdf = await loadingTask.promise
  const numPages: number = pdf.numPages
  const contents: string[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const items = (textContent as any).items || []
    const pageText = items.map((it: any) => it.str || '').join(' ')
    contents.push(pageText)
  }
  return contents.join('\n\n')
}


