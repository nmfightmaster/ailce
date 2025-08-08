import { ChatPanel } from './components/ChatPanel'
import { ContextInspector } from './components/ContextInspector'
import { EditSaveModal } from './components/EditSaveModal'
import { ConversationManager } from './components/ConversationManager'

function App() {
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-2">
      {/* Left: ChatPanel */}
      <div className="min-h-0 border-r border-white/10">
        <ChatPanel />
      </div>
      {/* Right: Conversation Manager (top) + Context Inspector (bottom) */}
      <div className="min-h-0 flex flex-col">
        <div className="h-[200px] min-h-[160px] max-h-[260px] overflow-hidden border-b border-white/10">
          <ConversationManager />
        </div>
        <div className="flex-1 min-h-0">
          <ContextInspector />
        </div>
      </div>
      <EditSaveModal />
    </div>
  )
}

export default App
