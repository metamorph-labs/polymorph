# Testing the bridge

polymorph tests what its members declare in a real browser, with Vitest's browser mode and
Playwright, because the members need real focus, pointer and layout. Test a screen's bridge the
same way: render the screen, create a bridge, act, and read what changed.

```tsx
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'

import { TicketForm } from './TicketForm'

it('lets an agent fill the ticket form', async () => {
  installTestTheme()
  render(<TicketForm onSubmit={() => {}} />)
  const bridge = createAgentBridge()
  try {
    const { results } = await bridge.act([
      { target: { member: 'Input', name: 'Subject' }, action: 'fill', value: 'Refund' },
      { target: { name: 'Priority' }, action: 'choose', value: 'urgent' },
    ])
    expect(results.every((result) => result.ok)).toBe(true)
    const subject = bridge.snapshot().members.find((member) => member.name === 'Subject')
    expect(subject?.state['value']).toBe('Refund')
  } finally {
    bridge.dispose()
  }
})
```

- Never wrap `bridge.act` in Testing Library's `act()`. React holds the render until that scope
  ends, so the bridge sees no change and reports an empty `changed`.
- Dispose of each bridge in the test that made it.
- A step on a member that does not change waits the whole `settleMs`. A test may pass a smaller
  one, such as `createAgentBridge({ settleMs: 60 })`.
- `agentRegistrations` lists every registered member, withheld ones included,
  so a test can tell a member the bridge withholds from one that never registered.
- `installTestTheme` installs a theme, so the members render as on the page.

## The WebMCP registration

Stand in for the browser's API with an object on `document.modelContext` that keeps each tool
until its signal aborts, then call a tool's `execute`:

```ts
const tools = new Map<string, (input: unknown) => Promise<unknown>>()
Object.defineProperty(document, 'modelContext', {
  configurable: true,
  value: {
    registerTool: (
      tool: { name: string; execute: (input: unknown) => Promise<unknown> },
      options?: { signal?: AbortSignal },
    ) => {
      tools.set(tool.name, tool.execute)
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name))
      return Promise.resolve()
    },
  },
})

// After the test:
delete (document as { modelContext?: unknown }).modelContext
```

Mount the component that registers, check that `tools` holds the three names, call
`tools.get('polymorph_snapshot')?.({})`, and check that unmounting empties `tools`.
