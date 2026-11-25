import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MountAdapter, Mounted } from './run'

/**
 * The law for where focus goes when a member that holds it leaves the page
 * (`packages/engine/src/conventions/focus-after-removal.ts`): an Alert, a
 * Banner or an ArtifactPane the application removes after its own close
 * control was pressed. Focus moves to the focusable element nearest where the
 * member was, the first one after it, and not to the body. Focus that is
 * elsewhere on the page stays where it is.
 *
 * A contract statement cannot state it, because the application, not the
 * member, removes the member. So the law mounts each member's fixture entry
 * through the shell's own adapter, puts focus on the member's close control,
 * and unmounts the entry through the adapter, as an application's state change
 * unmounts it. `conformanceLaw` calls it for every generated shell, and the
 * React shell's law calls it beside its contract statements.
 */

interface Leaving {
  readonly member: string
  /** The fixture entry that draws the member's own close control. */
  readonly state: string
  /** The close control's accessible name. */
  readonly control: string
}

const LEAVING: readonly Leaving[] = [
  {
    member: 'Alert',
    state: 'dismissible — the ✕ plays the departure, the app owns the unmount',
    control: 'Dismiss',
  },
  { member: 'Banner', state: 'dismissible — a reminder the reader may hide', control: 'Dismiss' },
  {
    member: 'ArtifactPane',
    state: 'code — one reading, the app’s controls, close',
    control: 'Close',
  },
]

const describeActive = () => {
  const active = document.activeElement
  if (active === null) return 'nothing'
  if (active === document.body) return 'the body'
  return `<${active.tagName.toLowerCase()}> "${(active.textContent ?? '').trim().slice(0, 40)}"`
}

export function focusAfterRemovalLaw(shell: string, adapter: MountAdapter): void {
  describe(`focus as a member that holds it leaves the page, in the ${shell} shell`, () => {
    const made: HTMLElement[] = []
    let mounted: Mounted | null = null

    /** A plain Button the law puts in the page beside the entry. */
    const button = (label: string): HTMLButtonElement => {
      const element = document.createElement('button')
      element.textContent = label
      made.push(element)
      return element
    }

    afterEach(() => {
      mounted?.unmount()
      mounted = null
      for (const element of made.splice(0)) element.remove()
    })

    for (const { member, state, control } of LEAVING) {
      it(`moves focus from ${member}'s close control to the element after it`, async () => {
        mounted = await adapter.mount(member, { state })
        const { root } = mounted
        const after = button('After')
        root.after(after)
        const close = await vi.waitFor(() => {
          const found = [...root.querySelectorAll<HTMLElement>('button')].find(
            (each) => each.getAttribute('aria-label') === control,
          )
          expect(found, `${member} draws its "${control}" control`).toBeDefined()
          return found as HTMLElement
        })
        close.focus()
        expect(document.activeElement).toBe(close)
        const leaving = mounted
        mounted = null
        leaving.unmount()
        await vi.waitFor(() => expect(document.activeElement, describeActive()).toBe(after))
      })

      it(`leaves focus where it is when it is not in ${member}`, async () => {
        mounted = await adapter.mount(member, { state })
        const { root } = mounted
        const before = button('Before')
        root.before(before)
        root.after(button('After'))
        before.focus()
        const leaving = mounted
        mounted = null
        leaving.unmount()
        await new Promise((settle) => setTimeout(settle, 50))
        expect(document.activeElement, describeActive()).toBe(before)
      })
    }
  })
}
