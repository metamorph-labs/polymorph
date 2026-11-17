import { flushSync, tick } from 'svelte'
import { userEvent } from 'vitest/browser'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import AvatarGroupHarness from '../testing/AvatarGroupHarness.svelte'
import ChatThreadPlainHarness from '../testing/ChatThreadPlainHarness.svelte'
import ChatThreadSetupHarness from '../testing/ChatThreadSetupHarness.svelte'
import DialogPlainHarness from '../testing/DialogPlainHarness.svelte'
import FormFieldPlainHarness from '../testing/FormFieldPlainHarness.svelte'
import { live } from '../testing/live.svelte'
import { made } from '../testing/setups'

/**
 * The Svelte foundation's slot convention (`slotted.svelte.ts`): what a member
 * reads from its slot and hands it, in the document the slot renders. A
 * member that reads its slot as it is made reads it on its first render, and
 * what the slot holds is made once; the slot is read in document order; and
 * an element no member rendered counts, and takes what the member passes, as
 * a member does.
 */

beforeAll(installTestTheme)
beforeEach(() => made.clear())

describe('a slot read as the member is made', () => {
  it('takes ChatThread’s non-empty branch on the first render, and makes each turn once', async () => {
    const { host } = await render(ChatThreadSetupHarness, { count: 3 })
    expect(host.querySelector('[data-chat-thread-part="viewport"] > div')?.textContent).toContain(
      'turn 2',
    )
    expect(made.get('empty')).toBeUndefined()
    expect([...made.values()]).toEqual([1, 1, 1])
  })

  it('makes each turn once when a thread that started empty receives its first ones', async () => {
    const held = live({ count: 0 })
    const { host } = await render(ChatThreadSetupHarness, held)
    expect(made.get('empty')).toBe(1)
    held.count = 2
    await vi.waitFor(() => expect(host.textContent).toContain('turn 1'))
    expect(host.textContent).not.toContain('empty')
    expect(made.get('turn 0')).toBe(1)
    expect(made.get('turn 1')).toBe(1)
  })
})

describe('a slot read in document order', () => {
  const shown = (host: HTMLElement) =>
    [...host.querySelectorAll('[data-member="avatar"]')].map((avatar) =>
      avatar.getAttribute('aria-label'),
    )
  const surplus = (host: HTMLElement) => host.querySelector('[class*="surplus"]')?.textContent

  it('keeps the first max of an Avatar group after a prepend and a reorder', async () => {
    const held = live({ names: ['Ada', 'Grace', 'Alan', 'Katherine', 'Barbara'] })
    const { host } = await render(AvatarGroupHarness, held)
    expect(shown(host)).toEqual(['Ada', 'Grace', 'Alan'])
    expect(surplus(host)).toBe('+2')

    held.names = ['Edsger', ...held.names]
    await vi.waitFor(() => expect(shown(host)).toEqual(['Edsger', 'Ada', 'Grace']))
    expect(surplus(host)).toBe('+3')

    held.names = [...held.names].reverse()
    await vi.waitFor(() => expect(shown(host)).toEqual(['Barbara', 'Katherine', 'Alan']))
  })
})

describe('an element no member rendered', () => {
  it('is FormField’s control: it takes the field’s id, the description and the required mark', async () => {
    const held = live<{ description?: string; required: boolean; disabled: boolean; id: string }>({
      description: 'One line.',
      required: true,
      disabled: false,
      id: 'subject',
    })
    const { host } = await render(FormFieldPlainHarness, held)
    const field = host.querySelector('[data-member="form-field"]') as HTMLElement
    const input = host.querySelector('input') as HTMLInputElement
    const label = host.querySelector('label') as HTMLLabelElement
    await vi.waitFor(() => expect(input.getAttribute('aria-describedby')).toBeTruthy())
    expect(field.dataset.kind).toBe('field')
    expect(input.id).toBe('subject')
    expect(label.htmlFor).toBe('subject')
    expect(
      document.getElementById(input.getAttribute('aria-describedby') as string)?.textContent,
    ).toBe('One line.')
    expect(input.getAttribute('aria-required')).toBe('true')

    held.disabled = true
    await vi.waitFor(() => expect(field.hasAttribute('data-disabled')).toBe(true))
    held.description = undefined
    held.required = false
    await vi.waitFor(() => expect(input.hasAttribute('aria-describedby')).toBe(false))
    expect(input.hasAttribute('aria-required')).toBe(false)
  })

  it('takes a generated id when FormField has none, and has its own back once it leaves', async () => {
    const { host, unmount } = await render(FormFieldPlainHarness, {})
    const input = host.querySelector('input') as HTMLInputElement
    await vi.waitFor(() => expect(input.id).not.toBe('own'))
    expect(host.querySelector('label')?.htmlFor).toBe(input.id)
    unmount()
    expect(input.id).toBe('own')
  })

  it('opens a Dialog as its trigger', async () => {
    const { host } = await render(DialogPlainHarness, {})
    const panel = () => document.querySelector('[role="dialog"]')
    await userEvent.click(host.querySelector('button') as HTMLButtonElement)
    await vi.waitFor(() => expect(panel()).not.toBeNull())
    expect(panel()?.textContent).toContain('Details')
  })

  it('counts as a turn, so ChatThread with plain children shows them and not its empty state', async () => {
    const { host } = await render(ChatThreadPlainHarness, {})
    await tick()
    flushSync()
    expect(host.textContent).toContain('First turn')
    expect(host.textContent).toContain('Second turn')
    expect(host.textContent).not.toContain('Ask anything')
  })
})
