import { cleanup } from '@testing-library/react'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll } from 'vitest'

// The vocabulary's base layer is not opt-in for an application (`index.ts`
// imports it for its side effect), so it is not opt-in for a test either.
// Without it a component measures against the user agent's box model: in the UA
// sheet `<button>` is border-box and `<span>` is not, so a Switch's thumb would
// be two pixels wider under test than in a real app, and sit off-centre.
import '@polymorph/recipes/base.css'

/**
 * The cursor is real, and it stays where the last test left it.
 *
 * This is a browser, not jsdom. `userEvent.click` and `userEvent.hover` move a
 * real pointer, and nothing moves it back. A test that clicks a control leaves
 * the cursor there, the next test renders its fixture underneath it, and
 * Chromium re-runs hit testing and fires `pointerenter` on whatever is now
 * there, with no pointer movement.
 *
 * For most components that is harmless. For a component where hover changes
 * the state a test asserts, it causes a misleading flake. In BarChart a resting
 * cursor sets the chart's reading position (the reading machine: one position for
 * pointer and keyboard), so `{ArrowRight}` steps from the hovered band instead
 * of the first one, and the failure looks like broken keyboard navigation. It
 * appears only under file parallelism, because that changes the timing of the
 * hit test relative to the key press. With the cursor resting on the last
 * band, the readout says "Wed" before any key is pressed.
 *
 * Every menu, listbox and combobox that highlights on hover and moves the
 * highlight with arrow keys can fail the same way, so this lives here rather
 * than in the chart's file.
 *
 * `:hover` is the browser's record of where the cursor rests, and checking it
 * is free, so only tests that left the cursor over a fixture pay to move it.
 */
async function parkThePointer(): Promise<void> {
  /*
   * Best effort, with bounded retries, because moving the pointer is cleanup,
   * not the subject of a test.
   *
   * The element-to-locator bridge serializes the corner into a positional
   * selector. Under contention, such as a second Chromium running beside this
   * suite, that selector can be computed against a tree a concurrent unmount is
   * still changing. Then `div >> nth=3` can resolve to a toaster's empty live
   * region, which is never visible, so the hover waits out its whole
   * actionability budget and fails the file. A new attempt re-serializes
   * against the settled tree. If every attempt fails, the cursor stays where it
   * was, and the `:hover` guard below still correctly reports whether the next
   * move is needed. The warning keeps the failure visible.
   */
  for (let attempt = 0; attempt < 3; attempt++) {
    const corner = document.createElement('div')
    // Bottom-right: fixtures render from the top-left and grow, so this is the
    // last corner any of them reaches.
    corner.style.cssText =
      'position:fixed;inset-block-end:0;inset-inline-end:0;inline-size:8px;block-size:8px'
    document.body.append(corner)
    try {
      // Each attempt is capped well below any hook budget. The failure mode is
      // a mis-resolved locator waiting out playwright's full actionability
      // timeout, and three of those add up. Uncapped, the afterEach that runs
      // this becomes a random "30s hook timed out" flake.
      // The provider forwards `timeout` to the action; if a future provider
      // ignores it, the hook budgets below still absorb one full wait.
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

// Each file inherits the previous file's cursor, and the `:hover` guard below
// cannot detect that. A test that ends with the sheet unmounted leaves the
// cursor mid-viewport over nothing, so no fixture is hovered and no move runs.
// The next file's chart then renders under a resting cursor, and Chromium's
// synthetic mousemove on layout change sets the reading position with no
// input. One move at file start puts the cursor out of the way for every file.
beforeAll(async () => {
  await parkThePointer()
  // Three attempts can exceed the default 10s hook budget when each one waits
  // out a saturated actionability timeout. The larger budget covers
  // contention, not the work (as `member-slug.test.ts` explains).
}, 120_000)

// RTL only auto-registers cleanup when Vitest globals are on; they are not.
afterEach(async () => {
  // Read before `cleanup` empties the tree, because afterwards there is nothing
  // for the cursor to rest on and the answer is always "no".
  const restingOnAFixture = document.body.querySelector('*:hover') !== null
  cleanup()
  if (restingOnAFixture) await parkThePointer()
  // The same contention budget as the beforeAll: a failed pointer move must
  // never fail the test (see parkThePointer).
}, 120_000)
