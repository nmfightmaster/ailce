### Live Context Editor (React + Vite)

Live Context Editor is a collaborative AI conversation manager that gives teams complete control over what an LLM sees — pin key messages, trim irrelevant parts, branch scenarios, and see token counts in real time. Designed for accuracy, cost control, and repeatable results.

---

## Features
- **Chat + Context curation**: Send messages and curate the exact context the model sees (pin, trim, branch, remove).
- **Model selector**: Choose from preset models or add custom ones with pricing and context window info.
- **Streaming responses**: Live token streaming from the OpenAI Chat Completions API.
- **Schema-enforced summaries**: Deterministic, schema-structured summaries that can serve as the sole context to continue work.
- **Token counting**: Client-side token estimates using `@dqbd/tiktoken` (WASM) for OpenAI-compatible models.
- **Local-first state**: Conversations and settings persist in `localStorage`.
- **Theme & layout**: Adjustable panes, theme settings, and responsive UI built with Tailwind CSS.

## Branches vs Snapshots

- **Branches (Conversations)**: Independent conversation forks. Use a branch to explore alternatives without affecting the original. Branching creates a new conversation entry in the Conversation Manager.
- **Snapshots (Checkpoints)**: Lightweight restore points inside the current conversation. Create a snapshot before risky edits, then restore to roll back. Restoring does not create a new conversation. You can also branch from a snapshot to fork at a known-good state.

Where to find them:
- Branches are managed in `Conversation Manager` (top-right). Forks are labeled with a "Branch" badge.
- Snapshots are managed in the `Snapshots` panel (next to Conversation Manager). Create, restore, or branch from snapshots there.

## Tech stack
- React 19, TypeScript, Vite 7
- Tailwind CSS 4
- Zustand for state management and persistence
- React Markdown + GFM for message rendering
- `@dqbd/tiktoken` (WASM) for token counting

## Quick start

### Prerequisites
- Node.js 18+ and npm 9+ (recommended)
- An OpenAI API key

### Install
```bash
npm install
```

### Configure environment
Create a `.env.local` file in the project root:

```bash
# Required for calling OpenAI directly from the browser (development only)
VITE_OPENAI_API_KEY=sk-...
```

Notes:
- Vite exposes only variables prefixed with `VITE_` to client code.
- This app reads `VITE_OPENAI_API_KEY` at runtime. In dev, it will error if missing.

### Run the app
```bash
npm run dev
```
Open the printed local URL (usually `http://localhost:5173`).

### Build and preview
```bash
npm run build
npm run preview
```

### Lint
```bash
npm run lint
```

## Usage
1. **Set a system message**: Before sending your first message, add a system instruction (e.g., “You are a concise assistant…”). The UI requires a system message to start.
2. **Chat**: Type a message and press Enter (or click Send). Responses stream in.
3. **Curate context**:
   - Trim or branch a conversation from any point.
   - Mark units as removed to exclude them while preserving history.
   - View live token counts per message and totals.
4. **Switch models**: Use the model selector to change models or add your own with context window and pricing metadata.
5. **Summaries**: A schema-structured, human-readable summary is generated and refreshed as the conversation evolves. You can use this summary alone to continue the work without the original messages.
6. Dev-only: Toggle “View assembled API context” to see exactly what the API receives.

### Summary schema
Summaries are concise, self-contained, and follow this exact structure:

```
[Purpose / Goal]
One concise sentence describing the core objective.

[Key Decisions Made]
- Bullet list of main decisions.

[Important Facts & Constraints]
- Bullet list of critical technical or factual constraints.

[Pending or Open Questions]
- Bullet list of unresolved items or next steps.

[References & Resources]
- Bullet list of essential filenames, code references, or URLs (only if relevant).
```

Notes:
- No narration like “The user said…” or “The assistant responded…”.
- Plain, direct language. Only the most contextual information.
- Target length ≤ 500 tokens.

Example:

```
[Purpose / Goal]
Add a React settings panel to switch AI models and persist selection.

[Key Decisions Made]
- Dropdown selector tied to Zustand store.
- Persist selection in localStorage and default to `gpt-4o`.

[Important Facts & Constraints]
- Tech: React + TypeScript + Vite; store: `src/store/useSettingsStore.ts`.
- Keep UI minimal; no server required.

[Pending or Open Questions]
- Confirm which custom models to prefill.

[References & Resources]
- src/store/useSettingsStore.ts
- src/components/ModelSelector.tsx
```

### How summaries are built
- **Source selection**: Includes system messages, all pinned items, and the most recent user/assistant messages under a token budget, plus basic conversation metadata (title, timestamps, model).
- **Deterministic**: Temperature is 0 and a few-shot example is provided to the summarizer for consistent formatting.
- **Caching & refresh**: Summaries are debounced and cached; they refresh automatically when content, pins, or system messages change.

### Versioning
- Each conversation stores `lastSummarySchemaVersion`. When the schema updates, older summaries are automatically refreshed on the next change or when you trigger a refresh (e.g., toggling a pin or editing a message).

## Environment variables
- **`VITE_OPENAI_API_KEY` (required in dev)**: Your OpenAI key used for direct browser calls to the Chat Completions API.

Security note:
- This project calls OpenAI directly from the browser for convenience. Do not ship a production build that exposes your API key to end users. For production, proxy requests through your own backend and store secrets on the server. See: [OpenAI API keys](https://platform.openai.com/api-keys).

## Scripts
- `npm run dev`: Start Vite dev server
- `npm run build`: Type-check and build for production
- `npm run preview`: Preview the production build locally
- `npm run lint`: Run ESLint

## Data persistence
- Conversations and settings persist in `localStorage` under keys like `live-context-conversations` and `live-context-settings`.
- Layout preferences persist under `lce:leftWidth` and `lce:topHeight`.
- To reset the app: clear your browser’s site data for this origin.
 - Summaries cache a key that includes the schema version; conversations also store `lastSummarySchemaVersion` to detect and refresh older formats.

## Deployment
This is a static Vite app and can be hosted on any static host (e.g., Vercel, Netlify, GitHub Pages). For production:
- Do not include `VITE_OPENAI_API_KEY` in client builds.
- Provide a server-side proxy endpoint that accepts messages and calls OpenAI using server-held credentials.
- Point the frontend to your proxy URL instead of `https://api.openai.com/v1/chat/completions`.

## Project structure (high level)
```
src/
  components/        UI components (chat panel, selectors, windows)
  store/             Zustand stores for conversations and settings
  data/              Static model info
  utils/             Token utilities (tiktoken)
  App.tsx            Layout and split panes
```

## Troubleshooting
- Error “Missing VITE_OPENAI_API_KEY”: Add your key to `.env.local` and restart `npm run dev`.
- 401/403 from OpenAI: Check your API key and account permissions.
- 429 rate limit: Reduce request frequency or upgrade your OpenAI plan.
- Streaming stalls: Network or CORS issues can interrupt streams; try again or use a server proxy.

## License
Add your preferred license here.

