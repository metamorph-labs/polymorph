# Testing the bridge

The bridge reads the rendered page: each control's accessible name, whether its element is in the
document and drawn, and the state the member reads from it. A test of it renders the screen in a
real browser. polymorph tests its members this way, in Chromium through Playwright, with Vitest's
browser mode.

## Set it up

Install Vitest, its Playwright provider and Playwright, and a browser for Playwright. The provider
package takes the same version as `vitest`. A React app adds Testing Library and React's Vite
plugin, as below; another framework adds its own.

```sh
npm install --save-dev vitest @vitest/browser-playwright playwright @testing-library/react @vitejs/plugin-react
npx playwright install chromium
```

Declare the browser in the Vitest config. If the app has a `vite.config.ts`, put `test` there,
so the tests build the members as the app does.

```ts
// vitest.config.ts
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      // Vitest's default viewport is a phone's. This is the wide layout.
      viewport: { width: 1280, height: 800 },
    },
  },
})
```

A project that also has tests for Node lists each kind as an entry of `test.projects`, with its
own `name` and `include`, as polymorph's own config does.

## A test

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
- A test of the policy creates the bridge with it and reads the snapshot: a hidden member is
  absent, and a denied action is missing from `actions` and answers `not-allowed`.
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

## What a test cannot show: where the bridge is bundled

Vitest's browser mode serves each module as Vite's dev server does, without the chunks of a build.
No test can show that the bridge stays out of what the page loads at start. Check the build:

1. Build the app as it ships.
2. Find the built file that holds `polymorph:agentchange`. Only the bridge holds that text, and a
   minifier keeps it. Vite writes the files to `dist/assets/`:

   ```sh
   grep -l 'polymorph:agentchange' dist/assets/*.js
   ```

3. Check that the page does not load that file at start. With Vite, `build.manifest: true` writes
   `dist/.vite/manifest.json`. Follow `imports` from the entry's record: no record it reaches
   has that file as its `file`, and the bridge's record is reached through `dynamicImports`.
   With another bundler, load the built page and check that its network list holds no such file
   until the first use.

A file that holds the text and loads at start has a static value import from `@polymorph/engine/agent` in its
module graph. Make it an `import()` or an `import type`.
