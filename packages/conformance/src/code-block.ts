import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import type { MountAdapter, MountProps } from './run'

/**
 * The law for what a CodeBlock's copy says (`design/components/code-block.md`,
 * A11y), which every web shell's CodeBlock test calls with its mount adapter.
 * The confirmation is said after a press, a state a fixture entry cannot
 * render, so no contract statement reads it (`docs/conformance.md`). This law
 * presses the copy control and reads the polite region's words, by default and
 * in a host's words from `copiedLabel`.
 *
 * The clipboard is a stub the law installs, because a test cannot rely on a
 * browser granting the permission to write it.
 */

const STATE = 'copyable — the corner control, named "Copy"'

/** The code the fixture entry shows, which a copy writes. */
const CODE = 'pnpm add @polymorph/react-ui'

export interface CodeBlockLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

export function codeBlockLaw({ shell, adapter }: CodeBlockLaw): void {
  describe(`${shell} CodeBlock — what its copy says`, () => {
    beforeAll(installTestTheme)

    const written: string[] = []
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    beforeEach(() => {
      written.length = 0
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            written.push(text)
            return Promise.resolve()
          },
        },
      })
    })

    const unmounts: (() => void)[] = []
    afterEach(() => {
      for (const unmount of unmounts.splice(0)) unmount()
      if (original === undefined) Reflect.deleteProperty(navigator, 'clipboard')
      else Object.defineProperty(navigator, 'clipboard', original)
    })

    /** Mounts the copyable entry and returns its polite region and its copy control. */
    async function mount(overrides: MountProps['overrides'] = {}) {
      const { root, unmount } = await adapter.mount('CodeBlock', { state: STATE, overrides })
      unmounts.push(unmount)
      const region = root.querySelector<HTMLElement>('[aria-live="polite"]')
      const control = root.querySelector<HTMLElement>('button')
      if (region === null) throw new Error('the CodeBlock drew no polite region')
      if (control === null) throw new Error('the CodeBlock drew no copy control')
      return { region, control }
    }

    /** Presses the control and waits for the region to say `expected`. */
    async function copy(
      { region, control }: Awaited<ReturnType<typeof mount>>,
      expected: string,
    ): Promise<void> {
      // The region is on the page, silent, before its first message, so the message is announced.
      expect(region.textContent?.trim()).toBe('')
      await userEvent.click(control)
      await vi.waitFor(() => expect(region.textContent?.trim()).toBe(expected), {
        timeout: 1500,
        interval: 25,
      })
      expect(written).toEqual([CODE])
    }

    it('says "Copied" after a copy by default', async () => {
      await copy(await mount(), 'Copied')
    })

    it('says the host’s words from copiedLabel after a copy', async () => {
      const block = await mount({ copiedLabel: 'Copié' })
      await copy(block, 'Copié')
      expect(block.region.textContent).not.toMatch(/Copied/)
    })
  })
}
