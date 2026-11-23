import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { richTextPlainText } from '@polymorph/engine/rich-text'
import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'
import type { MountAdapter, Mounted, Override } from './run'

/**
 * The law for what RichTextInput adds to the editor it mounts
 * (`design/components/rich-text-input.md`), which every web shell's
 * `rich-text-input.test` calls with its adapter, and the React member's test
 * too. The contract grammar states the toolbar's keys, the suggestion list's
 * keys and the field's attributes; this law holds what it cannot state: the
 * document the field draws and reports, a format turned on from a control and
 * from a key with the words that announce it, the link form, the text style
 * Menu, a pick from the suggestion list, the selection bar at selected words,
 * the handle the app's slots receive, a submit and its refusals, focus
 * entering and leaving the field as a whole, a press on its label, a form's
 * reset, the caret of a read-only field, and a document of a later format left
 * as it was stored.
 *
 * Each test mounts a states fixture entry through the shell's adapter, so the
 * law reads every shell through the same entries, and sets only handlers on
 * it. Keys are pressed with the browser's own keyboard, because the editor
 * reads real input. The words are the English defaults.
 */

export interface RichTextInputLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** The shell's mount adapter. */
  readonly adapter: MountAdapter
}

/** The platform's command key, which the editor's `Mod` names. */
const MOD = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? 'Meta' : 'Control'
const mod = (keys: string) => `{${MOD}>}${keys}{/${MOD}}`

const WAIT = 3000

const ENTRY = {
  empty: 'empty — a placeholder, every format',
  content: 'with content — marks, a link, a list and a mention',
  composer: 'a comment composer — marks only, mentions, attach and the default footer',
  suggesting: 'suggesting — the people an @ lists under the token',
  oneSuggestion: 'one suggestion — the one person a query matches',
  footer: 'the app’s footer — its own controls under the field',
  invalid: 'invalid — inside a FormField with an error',
  readOnly: 'read-only — selectable, not editable',
  pending: 'pending — the app is saving the comment',
  later: 'later format — a document a later version wrote, opened read-only',
  annotated: 'annotated — two comment threads, one active',
  bar: 'the selection bar — the format controls and a comment at the selected words',
} as const

/** The document the later-format entry holds, as it was stored. */
const LATER = {
  format: 'polymorph-rich-text/2',
  blocks: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Written by a later version of the format.' }],
    },
  ],
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const surfaceOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-rich-text-input-part="surface"]') as HTMLElement

const statusOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>(
    '[data-member="rich-text-input"] > [role="status"]',
  ) as HTMLElement

/** The control a person reads by this name, in the field or in a popup it opened. */
function control(scope: ParentNode, name: string): HTMLElement {
  const found = [...scope.querySelectorAll<HTMLElement>('button')].find(
    (button) => harness.nameOf(button) === name,
  )
  if (found === undefined) throw new Error(`no control named "${name}"`)
  return found
}

/** The plain text of the document a spy last heard, from its first argument. */
const lastText = (spy: ReturnType<typeof vi.fn>) => richTextPlainText(spy.mock.lastCall?.[0])

export function richTextInputLaw({ shell, adapter }: RichTextInputLaw): void {
  describe(`RichTextInput — the ${shell} shell`, () => {
    beforeAll(installTestTheme)

    let mounted: Mounted | null = null
    afterEach(() => {
      mounted?.unmount()
      mounted = null
      document.getSelection()?.removeAllRanges()
    })

    /** Mounts an entry and waits for the editor to hold the surface. */
    async function open(
      state: string,
      overrides: Readonly<Record<string, Override>> = {},
    ): Promise<{
      root: HTMLElement
      surface: HTMLElement
      said: (words: string) => Promise<void>
    }> {
      mounted = await adapter.mount('RichTextInput', { state, overrides })
      const root = mounted.root
      const surface = await vi.waitFor(
        () => {
          const found = surfaceOf(root)
          expect(found.hasAttribute('contenteditable')).toBe(true)
          return found
        },
        { timeout: WAIT },
      )
      const said = (words: string) =>
        vi.waitFor(() => expect(statusOf(root).textContent).toBe(words), { timeout: WAIT })
      return { root, surface, said }
    }

    /** Focuses the text and waits for the editor to have written its own selection back. */
    async function focusText(surface: HTMLElement) {
      await userEvent.click(surface)
      await vi.waitFor(() => expect(surface.hasAttribute('data-focused')).toBe(true), {
        timeout: WAIT,
      })
      await sleep(40)
    }

    /** Focuses the text from the script, with the caret where the editor holds it, and waits. */
    async function focusScripted(surface: HTMLElement) {
      surface.focus()
      await vi.waitFor(() => expect(surface.hasAttribute('data-focused')).toBe(true), {
        timeout: WAIT,
      })
      await sleep(40)
    }

    it('draws the document it holds with the elements RichTextContent draws', async () => {
      const { root, surface } = await open(ENTRY.content)
      await vi.waitFor(
        () => expect(surface.textContent).toContain('The retry policy doubles the wait'),
        { timeout: WAIT },
      )
      expect(surface.querySelector('strong')?.textContent).toBe('doubles')
      expect(surface.querySelector('a[href="https://example.com/runbook"]')?.textContent).toBe(
        'the runbook',
      )
      expect(
        surface.querySelector('[data-entity-kind="user"][data-entity-id="ada"]')?.textContent,
      ).toBe('@Ada Lovelace')
      expect(surface.querySelectorAll('ul > li')).toHaveLength(2)
      expect(
        root.querySelector('[data-member="rich-text-input"]')?.hasAttribute('data-empty'),
      ).toBe(false)
    })

    it('reports what the person types, and turns a format on from a key and from its control', async () => {
      const onChange = vi.fn()
      const { root, surface, said } = await open(ENTRY.empty, { onChange })
      await focusText(surface)
      await userEvent.keyboard('Retries')
      await vi.waitFor(() => expect(lastText(onChange)).toBe('Retries'), { timeout: WAIT })
      expect(
        root.querySelector('[data-member="rich-text-input"]')?.hasAttribute('data-empty'),
      ).toBe(false)

      await userEvent.keyboard(mod('b'))
      await said('Bold on')
      expect(control(root, 'Bold').getAttribute('aria-pressed')).toBe('true')

      // A press on the control keeps the text's selection, and the text has focus after it.
      await userEvent.click(control(root, 'Bold'))
      await said('Bold off')
      expect(control(root, 'Bold').getAttribute('aria-pressed')).toBe('false')
      await vi.waitFor(() => expect(document.activeElement).toBe(surface), { timeout: WAIT })
    })

    it('links the selection from the link form, and gives the text focus back', async () => {
      const { root, surface, said } = await open(ENTRY.empty)
      await focusText(surface)
      await userEvent.keyboard('Docs')
      await userEvent.keyboard(mod('a'))
      await userEvent.keyboard(mod('k'))
      const field = await vi.waitFor(
        () => {
          const found = document.querySelector<HTMLInputElement>('[data-member="popover"] input')
          expect(found).not.toBeNull()
          expect(document.activeElement).toBe(found)
          return found as HTMLInputElement
        },
        { timeout: WAIT },
      )
      expect(field.value).toBe('')
      await userEvent.keyboard('example.com{Enter}')
      await said('Link added')
      expect(surface.querySelector('a[href="https://example.com"]')?.textContent).toBe('Docs')
      await vi.waitFor(() => expect(document.activeElement).toBe(surface), { timeout: WAIT })
      expect(control(root, 'Link').getAttribute('aria-pressed')).toBe('true')
    })

    it('sets a text style from the Menu, and gives the text focus back to a pointer', async () => {
      const { root, surface, said } = await open(ENTRY.empty)
      await focusText(surface)
      await userEvent.keyboard('Retries')
      await userEvent.click(control(root, 'Text style'))
      const heading = await vi.waitFor(
        () => {
          const found = [
            ...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'),
          ].find((item) => item.textContent?.includes('Heading 1') === true)
          expect(found).toBeDefined()
          return found as HTMLElement
        },
        { timeout: WAIT },
      )
      await userEvent.click(heading)
      await said('Heading 1')
      expect(surface.querySelector('h2')?.textContent).toBe('Retries')
      await vi.waitFor(() => expect(document.activeElement).toBe(surface), { timeout: WAIT })
    })

    it('inserts the picked suggestion as an entity, and says so', async () => {
      const { root, surface, said } = await open(ENTRY.suggesting)
      await vi.waitFor(() => expect(root.querySelector('[role="listbox"]')).not.toBeNull(), {
        timeout: WAIT,
      })
      await userEvent.keyboard('gr')
      await vi.waitFor(
        () => {
          const options = [...root.querySelectorAll('[role="option"]')]
          expect(options.map((option) => option.textContent)).toEqual(['Grace HopperCompilers'])
          expect(options[0]?.getAttribute('aria-selected')).toBe('true')
        },
        { timeout: WAIT },
      )
      await userEvent.keyboard('{Enter}')
      await said('@Grace Hopper inserted')
      expect(
        surface.querySelector('[data-entity-kind="user"][data-entity-id="grace"]')?.textContent,
      ).toBe('@Grace Hopper')
      await vi.waitFor(() => expect(root.querySelector('[role="listbox"]')).toBeNull(), {
        timeout: WAIT,
      })
    })

    it('draws the selection bar at selected words, with the app’s action first', async () => {
      const { surface, said } = await open(ENTRY.bar)
      const bar = await vi.waitFor(
        () => {
          const found = document.querySelector<HTMLElement>(
            '[role="toolbar"][aria-label="Selection"]',
          )
          expect(found).not.toBeNull()
          expect(found?.getAttribute('data-state')).toBeNull()
          return found as HTMLElement
        },
        { timeout: WAIT },
      )
      await said('Controls for the selection are available: Alt+F10')
      const names = [...bar.querySelectorAll('button')].map((button) => harness.nameOf(button))
      expect(names[0]).toBe('Comment')
      expect(names).toContain('Bold')
      expect(names).not.toContain('Undo')
      // The bar is fixed at the selection: placed over or under it, inside the window.
      const box = bar.getBoundingClientRect()
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth)

      await userEvent.keyboard('{Alt>}{F10}{/Alt}')
      await vi.waitFor(() => expect(bar.contains(document.activeElement)).toBe(true), {
        timeout: WAIT,
      })
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(document.activeElement).toBe(surface), { timeout: WAIT })
      expect(document.getSelection()?.toString()).toBe('growing wait')
      // Escape on the text hides the bar for that selection.
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(
        () => expect(document.querySelector('[role="toolbar"][aria-label="Selection"]')).toBeNull(),
        { timeout: WAIT },
      )
    })

    it('hands the app’s footer the field as it is drawn', async () => {
      const { root, surface } = await open(ENTRY.footer)
      const publish = () => control(root, 'Publish') as HTMLButtonElement
      await vi.waitFor(() => expect(publish().disabled).toBe(false), { timeout: WAIT })
      await focusText(surface)
      await userEvent.keyboard(mod('a'))
      await userEvent.keyboard('{Backspace}')
      await vi.waitFor(() => expect(publish().disabled).toBe(true), { timeout: WAIT })
    })

    it('submits with Mod+Enter, and says why it refuses an empty field', async () => {
      const onSubmit = vi.fn()
      const { root, surface, said } = await open(ENTRY.composer, { onSubmit })
      expect((control(root, 'Attach a file') as HTMLButtonElement).disabled).toBe(false)
      expect((control(root, 'Comment') as HTMLButtonElement).disabled).toBe(true)
      await focusText(surface)
      await userEvent.keyboard(mod('{Enter}'))
      await said('There is nothing to submit yet.')
      expect(onSubmit).not.toHaveBeenCalled()
      await userEvent.keyboard('Looks right')
      await userEvent.keyboard(mod('{Enter}'))
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1), { timeout: WAIT })
      expect(lastText(onSubmit)).toBe('Looks right')
      expect((control(root, 'Comment') as HTMLButtonElement).disabled).toBe(false)
    })

    it('refuses a submit while the app is saving, and edits nothing', async () => {
      const onSubmit = vi.fn()
      const { root, surface, said } = await open(ENTRY.pending, { onSubmit })
      expect(surface.getAttribute('aria-readonly')).toBe('true')
      expect((control(root, 'Bold') as HTMLButtonElement).disabled).toBe(true)
      surface.focus()
      await userEvent.keyboard(mod('{Enter}'))
      await said('Still saving.')
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('says the count of one suggestion in the singular', async () => {
      const { said } = await open(ENTRY.oneSuggestion)
      await said('1 suggestion')
    })

    it('names the active option by the option, so a filter that puts another first is heard', async () => {
      const { surface } = await open(ENTRY.suggesting)
      const active = () => surface.getAttribute('aria-activedescendant') ?? ''
      await vi.waitFor(() => expect(active()).not.toBe(''), { timeout: WAIT })
      const first = active()
      expect(document.getElementById(first)?.textContent).toContain('Ada Lovelace')
      await userEvent.keyboard('g')
      await vi.waitFor(
        () => {
          expect(active()).not.toBe(first)
          expect(document.getElementById(active())?.textContent).toContain('Grace Hopper')
        },
        { timeout: WAIT },
      )
    })

    it('hears focus enter and leave the field as a whole, not a move to its own toolbar', async () => {
      const onFocus = vi.fn()
      const onBlur = vi.fn()
      const { surface } = await open(ENTRY.content, { onFocus, onBlur })
      const outside = document.createElement('input')
      outside.setAttribute('aria-label', 'Outside the field')
      document.body.append(outside)
      try {
        await focusScripted(surface)
        await vi.waitFor(() => expect(onFocus).toHaveBeenCalledTimes(1), { timeout: WAIT })
        await userEvent.keyboard('{Alt>}{F10}{/Alt}')
        await vi.waitFor(
          () => expect(harness.nameOf(document.activeElement as Element)).toBe('Bold'),
          { timeout: WAIT },
        )
        await userEvent.keyboard('{Escape}')
        await vi.waitFor(() => expect(document.activeElement).toBe(surface), { timeout: WAIT })
        await sleep(60)
        expect(onBlur).not.toHaveBeenCalled()
        expect(onFocus).toHaveBeenCalledTimes(1)
        outside.focus()
        await vi.waitFor(() => expect(onBlur).toHaveBeenCalledTimes(1), { timeout: WAIT })
        surface.focus()
        await vi.waitFor(() => expect(onFocus).toHaveBeenCalledTimes(2), { timeout: WAIT })
      } finally {
        outside.remove()
      }
    })

    it('takes focus from a press on its FormField label', async () => {
      const { surface } = await open(ENTRY.invalid)
      const label = document.getElementById(surface.getAttribute('aria-labelledby') ?? '')
      expect(label).not.toBeNull()
      await userEvent.click(label as HTMLElement)
      await vi.waitFor(() => expect(document.activeElement).toBe(surface), { timeout: WAIT })
    })

    it('puts its first document back when its form is reset', async () => {
      const onChange = vi.fn()
      const { root, surface } = await open(ENTRY.content, { onChange })
      await vi.waitFor(
        () => expect(surface.textContent).toContain('The retry policy doubles the wait'),
        { timeout: WAIT },
      )
      const first = surface.textContent
      // The form is put around the field after it was drawn: the field hears a reset of any form
      // it is in.
      const form = document.createElement('form')
      root.before(form)
      form.append(root)
      try {
        await focusScripted(surface)
        await userEvent.keyboard('Edited ')
        await vi.waitFor(() => expect(surface.textContent).not.toBe(first), { timeout: WAIT })
        const edits = onChange.mock.calls.length
        form.reset()
        await vi.waitFor(() => expect(surface.textContent).toBe(first), { timeout: WAIT })
        expect(onChange.mock.calls.length).toBe(edits + 1)
      } finally {
        form.replaceWith(root)
      }
    })

    it('keeps a caret in a read-only field that the keys move and select with, and refuses what is typed', async () => {
      const onChange = vi.fn()
      const { surface } = await open(ENTRY.readOnly, { onChange })
      // The browser draws a caret in an editable element; the editor refuses every edit in it.
      expect(surface.getAttribute('contenteditable')).toBe('true')
      expect(surface.getAttribute('inputmode')).toBe('none')
      expect(surface.getAttribute('aria-readonly')).toBe('true')
      await vi.waitFor(() => expect(surface.textContent).toContain('The retry policy'), {
        timeout: WAIT,
      })
      const first = surface.textContent
      await focusScripted(surface)
      await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}')
      await vi.waitFor(() => expect(document.getSelection()?.toString()).toHaveLength(3), {
        timeout: WAIT,
      })
      expect(first).toContain(document.getSelection()?.toString())
      await userEvent.keyboard('typed{Enter}{Backspace}')
      await sleep(100)
      expect(onChange).not.toHaveBeenCalled()
      expect(surface.textContent).toBe(first)
    })

    it('opens a document of a later format read-only, writes nothing over it, and posts and submits it as stored', async () => {
      const onChange = vi.fn()
      const onSubmit = vi.fn()
      const { root, surface } = await open(ENTRY.later, { onChange, onSubmit })
      await vi.waitFor(
        () => expect(surface.textContent).toBe('Written by a later version of the format.'),
        { timeout: WAIT },
      )
      expect(
        root.querySelector('[data-member="rich-text-input"]')?.hasAttribute('data-readonly'),
      ).toBe(true)
      expect(surface.getAttribute('aria-readonly')).toBe('true')
      expect((control(root, 'Bold') as HTMLButtonElement).disabled).toBe(true)
      await focusScripted(surface)
      await userEvent.keyboard('typed{Enter}')
      await sleep(100)
      expect(onChange).not.toHaveBeenCalled()
      expect(surface.textContent).toBe('Written by a later version of the format.')
      const posted = root.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]')
      expect(JSON.parse(posted?.value ?? 'null')).toEqual(LATER)
      await userEvent.click(control(root, 'Save'))
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1), { timeout: WAIT })
      expect(onSubmit.mock.lastCall?.[0]).toEqual(LATER)
    })

    it('reports a press on a drawn annotation, once', async () => {
      const onAnnotationSelect = vi.fn()
      const { surface } = await open(ENTRY.annotated, { onAnnotationSelect })
      const mark = await vi.waitFor(
        () => {
          const found = surface.querySelector<HTMLElement>('[data-annotation-id="thread-2"]')
          expect(found).not.toBeNull()
          expect(found?.hasAttribute('data-active')).toBe(true)
          return found as HTMLElement
        },
        { timeout: WAIT },
      )
      expect(
        surface.querySelector('[data-annotation-id="thread-1"]')?.hasAttribute('data-active'),
      ).toBe(false)
      await userEvent.click(mark)
      await vi.waitFor(() => expect(onAnnotationSelect).toHaveBeenCalledWith('thread-2'), {
        timeout: WAIT,
      })
      await sleep(100)
      expect(onAnnotationSelect).toHaveBeenCalledTimes(1)
    })
  })
}
