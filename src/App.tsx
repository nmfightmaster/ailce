import { useEffect, useRef, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { ContextInspector } from './components/ContextInspector'
import { EditSaveModal } from './components/EditSaveModal'
import { ConversationManager } from './components/ConversationManager'
import { SummaryWindow } from './components/SummaryWindow'
import { SnapshotsWindow } from './components/SnapshotsWindow'
import { ThemeSettings } from './components/ThemeSettings'
import { AttachmentLibrary } from './components/AttachmentLibrary'

function App() {
  // Left/right sizing
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem('lce:leftWidth')) : 0
    return Number.isFinite(saved) && saved > 0 ? saved : 520
  })
  const [isDraggingCol, setIsDraggingCol] = useState(false)

  useEffect(() => {
    if (!isDraggingCol) return
    const onMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = e.clientX - rect.left
      const min = 320
      const max = Math.max(min, rect.width - 360)
      const next = Math.min(max, Math.max(min, x))
      setLeftWidth(next)
    }
    const onUp = () => setIsDraggingCol(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDraggingCol])

  useEffect(() => {
    localStorage.setItem('lce:leftWidth', String(leftWidth))
  }, [leftWidth])

  // Right column top/bottom sizing
  const rightRef = useRef<HTMLDivElement>(null)
  const [topHeight, setTopHeight] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? Number(localStorage.getItem('lce:topHeight')) : 0
    return Number.isFinite(saved) && saved > 0 ? saved : 200
  })
  const [isDraggingRow, setIsDraggingRow] = useState(false)

  useEffect(() => {
    if (!isDraggingRow) return
    const onMove = (e: PointerEvent) => {
      const rect = rightRef.current?.getBoundingClientRect()
      if (!rect) return
      const y = e.clientY - rect.top
      const min = 140
      const max = Math.max(min, rect.height - 220)
      const next = Math.min(max, Math.max(min, y))
      setTopHeight(next)
    }
    const onUp = () => setIsDraggingRow(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isDraggingRow])

  useEffect(() => {
    localStorage.setItem('lce:topHeight', String(topHeight))
  }, [topHeight])

  return (
    <div ref={containerRef} className="h-full w-full grid select-none" style={{ gridTemplateColumns: `${leftWidth}px 6px 1fr` }}>
      {/* Left: Chat window */}
      <div className="min-h-0 border-r border-white/10">
        <ChatPanel />
      </div>
      {/* Vertical resizer */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setIsDraggingCol(true)
        }}
        className={`relative z-10 h-full w-[6px] cursor-col-resize bg-white/5 hover:bg-white/10 ${isDraggingCol ? 'bg-white/20' : ''}`}
        title="Resize"
      />
      {/* Right: Conversation window (top) + Context window (bottom) */}
      <div ref={rightRef} className="min-h-0 flex flex-col">
        <div style={{ height: topHeight }} className="min-h-[120px] overflow-hidden">
          <div className="grid grid-cols-3 gap-3 h-full p-3">
            <ConversationManager />
            <SnapshotsWindow />
            <AttachmentLibrary />
          </div>
        </div>
        {/* Horizontal resizer */}
        <div
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setIsDraggingRow(true)
          }}
          className={`h-[6px] w-full cursor-row-resize bg-white/5 hover:bg-white/10 ${isDraggingRow ? 'bg-white/20' : ''}`}
          title="Resize"
        />
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="shrink-0">
            <SummaryWindow />
          </div>
          <div className="flex-1 min-h-0">
            <ContextInspector />
          </div>
        </div>
      </div>
      <EditSaveModal />
      <ThemeSettings />
    </div>
  )
}

export default App
