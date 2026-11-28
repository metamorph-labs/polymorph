import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { PASTE_IS_UNREADABLE } from '@polymorph/conformance/engines'
import { installTestTheme } from '@polymorph/engine/testing'

import { render } from '../mount'
import FieldInDialogHarness from '../testing/FieldInDialogHarness.svelte'
import TagInputElsewhereHarness from '../testing/TagInputElsewhereHarness.svelte'
import TagInputFormHarness from '../testing/TagInputFormHarness.svelte'
import TagInput from './TagInput.svelte'

/**
 * TagInput in the Svelte shell (`design/components/tag-input.md`): its commit
 * rules, where focus goes when a chip is removed, the removal's announcement,
 * the chip's exit, the maximum and the hidden form input, as the React
 * member's tests hold them (`packages/react-ui/src/controls/tag-input.test.tsx`).
 */

beforeAll(installTestTheme)

const field = () =>
  document.querySelector<HTMLInputElement>('[data-member="tag-input"] input:not([type="hidden"])')
const chipTexts = () =>
  [...document.querySelectorAll('[data-member="tag-input"] li:not([data-removing])')].map(
    (chip) => chip.firstElementChild?.textContent,
  )
const removeButton = (tag: string) =>
  document.querySelector<HTMLElement>(`button[aria-label="Remove ${tag}"]`)

/** A real `paste` event carrying clipboard data, as the React test dispatches it. */
function paste(target: HTMLElement, text: string): ClipboardEvent {
  const data = new DataTransfer()
  data.setData('text', text)
  const event = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  })
  target.dispatchEvent(event)
  return event
}

/**
 * Reads `read` in the step that takes a chip out of `list`, which is the step in
 * which the chips beside it start their slide. A read after an awaited click can
 * come too late when the whole suite runs: the slide may be over.
 */
function whenAChipLeaves<T>(list: Element, read: () => T): Promise<T> {
  return new Promise((done) => {
    const observer = new MutationObserver((records) => {
      const left = records.some((record) =>
        [...record.removedNodes].some((node) => node instanceof HTMLLIElement),
      )
      if (!left) return
      observer.disconnect()
      done(read())
    })
    observer.observe(list, { childList: true })
  })
}

/**
 * Reads the chip list in the task that marks a chip removing. A read after an
 * awaited click can come too late when the whole suite runs: the exit may be over.
 */
function whenMarked<T>(host: Element, read: (chip: Element) => T): Promise<T> {
  return new Promise((done) => {
    const observer = new MutationObserver(() => {
      const chip = host.querySelector('li[data-removing]')
      if (chip === null) return
      observer.disconnect()
      done(read(chip))
    })
    observer.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-removing'],
    })
  })
}

describe('committing', () => {
  it('takes a tag on Enter and on a comma, and empties the field', async () => {
    const onChange = vi.fn()
    await render(TagInput, { onChange, 'aria-label': 'Invite' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('ada@relay.dev{Enter}billing,')
    expect(onChange).toHaveBeenLastCalledWith(['ada@relay.dev', 'billing'])
    expect(chipTexts()).toEqual(['ada@relay.dev', 'billing'])
    expect(field()?.value).toBe('')
  })

  it('flashes the existing chip for a duplicate instead of adding it', async () => {
    const onChange = vi.fn()
    const { host } = await render(TagInput, {
      defaultValue: ['billing'],
      onChange,
      'aria-label': 'Labels',
    })
    const flashed: string[] = []
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement
        if (target.dataset['flash'] === '')
          flashed.push(target.firstElementChild?.textContent ?? '')
      }
    }).observe(host, { attributes: true, attributeFilter: ['data-flash'], subtree: true })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('billing{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    expect(chipTexts()).toEqual(['billing'])
    await vi.waitFor(() => expect(flashed).toEqual(['billing']))
  })

  it('marks a refused entry on the container, without `data-invalid`', async () => {
    const { host } = await render(TagInput, {
      validate: (raw: string) => (raw.includes('@') ? raw : null),
      'aria-label': 'Invite',
    })
    const refused: boolean[] = []
    new MutationObserver(() => {
      refused.push((host.firstElementChild as HTMLElement).hasAttribute('data-refused'))
    }).observe(host, { attributes: true, attributeFilter: ['data-refused'], subtree: true })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('nonsense{Enter}')
    await vi.waitFor(() => expect(refused[0]).toBe(true))
    expect(host.firstElementChild?.hasAttribute('data-invalid')).toBe(false)
    expect(chipTexts()).toEqual([])
  })

  it.skipIf(PASTE_IS_UNREADABLE)(
    'splits a pasted list on commas and newlines, and leaves one value to the field',
    async () => {
      const onChange = vi.fn()
      await render(TagInput, { onChange, 'aria-label': 'Invite' })
      expect(paste(field() as HTMLElement, 'ada@relay.dev').defaultPrevented).toBe(false)
      const event = paste(field() as HTMLElement, 'ada@relay.dev, grace@relay.dev\nalan@relay.dev')
      expect(event.defaultPrevented).toBe(true)
      expect(onChange).toHaveBeenCalledWith(['ada@relay.dev', 'grace@relay.dev', 'alan@relay.dev'])
    },
  )

  it('abandons uncommitted text on Escape, and only that', async () => {
    await render(TagInput, { defaultValue: ['billing'], 'aria-label': 'Labels' })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('regressio{Escape}')
    expect(field()?.value).toBe('')
    expect(chipTexts()).toEqual(['billing'])
  })
})

describe('removing', () => {
  it('walks the chips with the arrows and removes one with Delete, from the keyboard', async () => {
    const onChange = vi.fn()
    const onBlur = vi.fn()
    await render(TagInput, {
      defaultValue: ['billing', 'regression'],
      onChange,
      onBlur,
      'aria-label': 'Labels',
    })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(removeButton('regression'))
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(removeButton('billing'))
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(document.activeElement).toBe(field())
    // Moving between the parts of one control is not a blur.
    expect(onBlur).not.toHaveBeenCalled()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Delete}')
    expect(onChange).toHaveBeenCalledWith(['regression'])
  })

  it('moves focus to the chip that takes the removed one’s place, then to the field', async () => {
    await render(TagInput, { defaultValue: ['billing', 'regression'], 'aria-label': 'Labels' })
    await userEvent.click(removeButton('billing') as HTMLElement)
    expect(document.activeElement).toBe(removeButton('regression'))
    await userEvent.keyboard('{Backspace}')
    expect(document.activeElement).toBe(field())
  })

  it('removes the last chip on Backspace in an empty field, and not before', async () => {
    const onChange = vi.fn()
    await render(TagInput, {
      defaultValue: ['billing', 'regression'],
      onChange,
      'aria-label': 'Labels',
    })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('x{Backspace}')
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenCalledWith(['billing'])
  })

  it('announces the removal politely, with the count that remains', async () => {
    const { host } = await render(TagInput, {
      defaultValue: ['billing', 'regression'],
      'aria-label': 'Labels',
    })
    await userEvent.click(removeButton('billing') as HTMLElement)
    const live = host.querySelector('[aria-live="polite"]') as HTMLElement
    await vi.waitFor(() => expect(live.textContent?.trim()).toBe('billing removed, 1 remains'))
    const described = (field()?.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent?.trim())
    expect(described).toContain('1 added')
  })

  it('keeps a removed chip, marked, while it plays its exit, then drops it', async () => {
    const { host } = await render(TagInput, {
      defaultValue: ['billing', 'regression'],
      'aria-label': 'Labels',
    })
    const marked = whenMarked(host, (chip) => chip.textContent?.trim())
    await userEvent.click(removeButton('billing') as HTMLElement)
    expect(await marked).toBe('billing')
    await vi.waitFor(() => expect(host.querySelectorAll('li')).toHaveLength(1), {
      timeout: 3_000,
    })
  })

  it('plays the enter for a chip added after it mounts, and not for the chips it mounted with', async () => {
    const { host } = await render(TagInput, { defaultValue: ['billing'], 'aria-label': 'Labels' })
    await vi.waitFor(() => expect(host.querySelector('li')?.style.scale).not.toBe(''))
    expect(host.querySelector('li')?.getAnimations()).toHaveLength(0)
    // The presence marks the chip's motion pattern in the same step that starts
    // its enter, so the animation is read when that mark lands; a later read
    // could find the enter already over when the whole suite runs.
    const atEnter = new Promise<number>((resolve) => {
      const observer = new MutationObserver(() => {
        const added = [...host.querySelectorAll('li')].find(
          (chip) => chip.firstElementChild?.textContent === 'regression',
        )
        if (!added?.hasAttribute('data-motion-pattern')) return
        observer.disconnect()
        resolve(added.getAnimations().length)
      })
      observer.observe(host, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-motion-pattern'],
      })
    })
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('regression{Enter}')
    expect(await atEnter).toBeGreaterThan(0)
  })

  it('slides the chips after a removed one into its gap', async () => {
    const { host } = await render(TagInput, {
      defaultValue: ['billing', 'regression', 'security'],
      'aria-label': 'Labels',
    })
    const last = [...host.querySelectorAll('li')].find(
      (element) => element.firstElementChild?.textContent === 'security',
    ) as HTMLElement
    const slides = () =>
      last
        .getAnimations()
        .filter((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes().some((frame) => 'transform' in frame),
        ).length
    // The slide waits for the removed chip's exit, so none has begun when the chip is marked.
    const atRemoval = whenMarked(host, () => slides())
    const atGap = whenAChipLeaves(last.parentElement as HTMLElement, () => slides())
    await userEvent.click(removeButton('billing') as HTMLElement)
    expect(await atRemoval).toBe(0)
    expect(await atGap).toBeGreaterThan(0)
    expect(host.querySelectorAll('li')).toHaveLength(2)
  })

  it('offers no removes when disabled', async () => {
    await render(TagInput, { disabled: true, defaultValue: ['billing'], 'aria-label': 'Labels' })
    expect(removeButton('billing')).toBeNull()
  })
})

describe('the maximum and the form', () => {
  it('is read-only and still focusable at the maximum, and says why', async () => {
    const onChange = vi.fn()
    const { host } = await render(TagInput, {
      defaultValue: ['a', 'b', 'c'],
      max: 3,
      onChange,
      'aria-label': 'Labels',
    })
    const input = field() as HTMLInputElement
    expect(host.firstElementChild?.getAttribute('data-state')).toBe('at-max')
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)
    host.firstElementChild?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(input)
    await userEvent.keyboard('regression{Enter}')
    expect(onChange).not.toHaveBeenCalled()
    const described = (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent?.trim())
    expect(described).toContain('Maximum of 3 added')
    // Backspace still makes room from a full field.
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenLastCalledWith(['a', 'b'])
  })

  it.skipIf(PASTE_IS_UNREADABLE)('stops a paste at the maximum', async () => {
    const onChange = vi.fn()
    await render(TagInput, { max: 2, onChange, 'aria-label': 'Labels' })
    paste(field() as HTMLElement, 'a,b,c,d')
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
  })

  it('serialises comma-joined into a hidden input that is disabled with the member', async () => {
    const { host } = await render(TagInputFormHarness, {
      fields: [
        { name: 'invitees', defaultValue: ['a', 'b'], 'aria-label': 'Invite' },
        { name: 'locked', disabled: true, defaultValue: ['c'], 'aria-label': 'Locked' },
      ],
    })
    const form = host.querySelector('form') as HTMLFormElement
    expect([...new FormData(form).entries()]).toEqual([['invitees', 'a,b']])
  })

  it('fires `blur` once when focus leaves the whole field', async () => {
    const onBlur = vi.fn()
    await render(TagInputElsewhereHarness, {
      defaultValue: ['ada'],
      onBlur,
      'aria-label': 'Invite',
    })
    field()?.focus()
    document.querySelector<HTMLElement>('button:not([aria-label])')?.focus()
    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A key an input method is handling, dispatched on `target`: marked `isComposing`, or reported
 * with key code 229 after the composition has ended, as Safari sends the Enter that confirms it.
 */
function inputMethodKey(
  target: HTMLElement,
  key: string,
  how: 'composing' | 'processed',
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: how === 'composing',
  })
  if (how === 'processed') Object.defineProperty(event, 'keyCode', { value: 229 })
  target.dispatchEvent(event)
  return event
}

describe('keys', () => {
  it('keeps every key an input method is handling, so no half-typed text becomes a tag', async () => {
    const onChange = vi.fn()
    await render(TagInput, { defaultValue: ['billing'], onChange, 'aria-label': 'Labels' })
    const input = field() as HTMLInputElement
    await userEvent.click(input)
    await userEvent.keyboard('にほ')
    for (const how of ['composing', 'processed'] as const) {
      for (const key of ['Enter', ',', 'Escape']) {
        expect(inputMethodKey(input, key, how).defaultPrevented, `${how} ${key}`).toBe(false)
      }
    }
    await sleep(30)
    expect(input.value).toBe('にほ')
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['billing', 'にほ'])
  })

  it('clears uncommitted text on Escape inside a Dialog, which stays open until the next Escape', async () => {
    const onOpenChange = vi.fn()
    await render(FieldInDialogHarness, { field: 'tag-input', onOpenChange })
    await vi.waitFor(() => expect(field()).not.toBeNull())
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('regressio{Escape}')
    await vi.waitFor(() => expect(field()?.value).toBe(''))
    await sleep(60)
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('follows a right-to-left line: → moves back into the chips and ← forward to the field', async () => {
    const { host } = await render(TagInput, {
      defaultValue: ['billing', 'regression'],
      'aria-label': 'Labels',
    })
    host.dir = 'rtl'
    await userEvent.click(field() as HTMLElement)
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(field())
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(removeButton('regression'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(removeButton('billing'))
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(document.activeElement).toBe(field())
  })
})
