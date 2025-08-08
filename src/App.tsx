import { ChatPanel } from './components/ChatPanel'
import { ContextInspector } from './components/ContextInspector'

function App() {
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-3">
      <div className="lg:col-span-2 border-r border-white/10 min-h-0">
        <ChatPanel />
      </div>
      <div className="lg:col-span-1 min-h-0">
        <ContextInspector />
      </div>
    </div>
  )
}

export default App
