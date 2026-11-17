import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll } from 'vitest'

// The base layer and the host rule, as a page links them.
import '@polymorph/recipes/base.css'
import '@polymorph/elements/host.css'

import { unmountAll } from './mount'

/**
 * The pointer is real, and it stays where the last test left it, so a fixture
 * that highlights on hover would open or move under a resting cursor. As in
 * `packages/solid-ui/src/test-setup.ts`, every file starts with the pointer in
 * a corner no fixture reaches, and a test that leaves it over a fixture moves
 * it back.
 */
async function parkThePointer(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const corner = document.createElement('div')
    corner.style.cssText =
      'position:fixed;inset-block-end:0;inset-inline-end:0;inline-size:8px;block-size:8px'
    document.body.append(corner)
    try {
      await userEvent.hover(corner, { timeout: 2_000 } as Parameters<typeof userEvent.hover>[1])
      return
    } catch {
      await new Promise((settle) => setTimeout(settle, 100))
    } finally {
      corner.remove()
    }
  }
  console.warn('test-setup: could not park the pointer — continuing unparked')
}

beforeAll(async () => {
  await parkThePointer()
}, 120_000)

afterEach(async () => {
  const restingOnAFixture = document.body.querySelector('*:hover') !== null
  unmountAll()
  if (restingOnAFixture) await parkThePointer()
}, 120_000)
