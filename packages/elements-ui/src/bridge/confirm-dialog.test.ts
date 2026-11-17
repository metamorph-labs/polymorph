import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { PolymorphEvent } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import '../controls/Button'
import type { PolyConfirmDialogElement } from '../overlays/ConfirmDialog'
import '../overlays/ConfirmDialog'
import { mount } from '../mount'

/**
 * ConfirmDialog waits on the page's work, as React's waits on the promise its
 * `onConfirm` returns: a listener hands the `poly-confirm` event the page's
 * promise with `waitUntil`, and the dialog stays open and busy, with no way
 * out, until that promise settles. With no promise it closes at once.
 */

beforeAll(installTestTheme)

const DIALOG =
  '<poly-confirm-dialog open title="Delete 3 tickets?" confirm-label="Delete 3 tickets"><poly-button slot="trigger" label="Discard"></poly-button></poly-confirm-dialog>'

const panel = () => document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]')

const confirmButton = () =>
  [...(panel()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((button) =>
    button.textContent?.includes('Delete 3 tickets'),
  ) as HTMLButtonElement

describe('ConfirmDialog waits on the promise a listener hands its confirm', () => {
  it('stays open and busy until the page’s work settles, then closes', async () => {
    const { host } = await mount({ name: 'waits', html: DIALOG })
    const dialog = host.querySelector('poly-confirm-dialog') as PolyConfirmDialogElement
    let finish: () => void = () => {}
    dialog.addEventListener('poly-confirm', (event) => {
      ;(event as PolymorphEvent).waitUntil(new Promise<void>((settle) => (finish = settle)))
    })
    await vi.waitFor(() => expect(confirmButton()).toBeDefined())
    await userEvent.click(confirmButton())
    await vi.waitFor(() => expect(confirmButton().getAttribute('aria-busy')).toBe('true'))
    await userEvent.keyboard('{Escape}')
    await new Promise((settle) => setTimeout(settle, 50))
    expect(panel()).not.toBeNull()
    expect(dialog.open).toBe(true)
    finish()
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(dialog.open).toBe(false)
  })

  it('closes at once when no listener hands it a promise', async () => {
    const { host } = await mount({ name: 'at once', html: DIALOG })
    const dialog = host.querySelector('poly-confirm-dialog') as PolyConfirmDialogElement
    const heard: Event[] = []
    dialog.addEventListener('poly-confirm', (event) => heard.push(event))
    await vi.waitFor(() => expect(confirmButton()).toBeDefined())
    await userEvent.click(confirmButton())
    await vi.waitFor(() => expect(panel()).toBeNull())
    expect(heard).toHaveLength(1)
    expect(dialog.open).toBe(false)
  })
})
