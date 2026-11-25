import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  assertGoverned,
  parseRichText,
  RICH_TEXT_FORMAT,
  type RichTextDocument,
  richTextEquals,
  richTextPlainText,
} from '@polymorph/react'
import { richTextInputLaw } from '@polymorph/conformance/rich-text-input'
import { createAgentBridge } from '@polymorph/engine/agent'
import { agentRegistrations, installTestTheme } from '@polymorph/engine/testing'
import { reactAdapter } from '../conformance/react'
import { Dialog } from '../overlays/Dialog'
import { RichTextContent } from '../structure/RichTextContent'
import { Button } from './Button'
import { FormField } from './FormField'
import { tokenColor } from './token-probe'
import {
  RichTextInput,
  type RichTextEntitySource,
  type RichTextInputEditor,
  type RichTextInputProps,
} from './RichTextInput'
import { CONTENT, PEOPLE } from './rich-text-input.states'

/**
 * RichTextInput, in a real browser.
 *
 * The editor's own behaviour (its schema, keys, typed shortcuts, paste and
 * history) is the engine's and is tested there
 * (`packages/engine/src/rich-text-editor/editor.test.ts`). These tests hold what
 * the member adds and what reaches a person through it: the toolbar and its
 * keys, the link form, the suggestion list, the limit, the footers, the
 * selection bar, annotations, the FormField wiring, the agent handle, a server
 * render, and that the text is drawn as RichTextContent draws it.
 *
 * Keys are pressed with the browser's own keyboard. The words of the
 * announcements are the English defaults, which name no locale's format.
 */

beforeAll(installTestTheme)

/** The platform's command key, which the editor's `Mod` names. */
const MOD = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? 'Meta' : 'Control'
const mod = (keys: string) => `{${MOD}>}${keys}{/${MOD}}`

const doc = (...blocks: unknown[]): RichTextDocument =>
  ({ format: RICH_TEXT_FORMAT, blocks }) as RichTextDocument
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }
const ul = (...items: unknown[][]) => ({
  type: 'list',
  ordered: false,
  items: items.map((content) => ({ type: 'listItem', content })),
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const HINT = 'Controls for the selection are available: Alt+F10'

const surface = (name = 'Comment') => screen.getByRole('textbox', { name }) as HTMLDivElement
const status = () => screen.getAllByRole('status').at(-1) as HTMLElement
const said = (words: string) => vi.waitFor(() => expect(status().textContent).toBe(words))

/** Every text the field's status region says from now on, in order, each time it is said. */
function listen(): string[] {
  const texts: string[] = []
  const region = status()
  const observer = new MutationObserver(() => {
    const text = region.textContent ?? ''
    if (text !== '') texts.push(text)
  })
  observer.observe(region, { childList: true, subtree: true, characterData: true })
  return texts
}

/** The handle, as the app's toolbar slot is handed it on each render. */
function capture() {
  const seen: { editor: RichTextInputEditor | null } = { editor: null }
  const toolbar = (editor: RichTextInputEditor) => {
    seen.editor = editor
    return null
  }
  return { seen, toolbar }
}

/** Waits until the editor holds focus and has written its own selection back. */
async function focused(element: HTMLElement) {
  await vi.waitFor(() => expect(element.hasAttribute('data-focused')).toBe(true))
  await sleep(40)
}

/** The element's text nodes, each with the offset its text starts at. */
function textNodes(element: HTMLElement): { node: Text; start: number }[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const out: { node: Text; start: number }[] = []
  let start = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    out.push({ node: node as Text, start })
    start += (node as Text).data.length
  }
  return out
}

function pointAt(element: HTMLElement, at: number): [Text, number] {
  const hit = [...textNodes(element)].reverse().find((entry) => entry.start <= at)
  if (hit === undefined) throw new Error('no text')
  return [hit.node, at - hit.start]
}

/** Selects `words` where they first appear in the field, focused, and waits for the editor to read it. */
async function select(
  element: HTMLElement,
  words: string,
  seen: { editor: RichTextInputEditor | null },
) {
  element.focus()
  await focused(element)
  const all = textNodes(element)
    .map((entry) => entry.node.data)
    .join('')
  const at = all.indexOf(words)
  if (at < 0) throw new Error(`no text ${words}`)
  const [startNode, startOffset] = pointAt(element, at)
  const [endNode, endOffset] = pointAt(element, at + words.length)
  document.getSelection()?.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
  await vi.waitFor(() => expect(seen.editor?.selection.text).toBe(words))
}

/** Places the caret right after `words`, focused. */
async function caretAfter(
  element: HTMLElement,
  words: string,
  seen: { editor: RichTextInputEditor | null },
) {
  element.focus()
  await focused(element)
  const all = textNodes(element)
    .map((entry) => entry.node.data)
    .join('')
  const at = all.indexOf(words)
  if (at < 0) throw new Error(`no text ${words}`)
  const [node, offset] = pointAt(element, at + words.length)
  document.getSelection()?.collapse(node, offset)
  await vi.waitFor(() => expect(seen.editor?.selection.empty).toBe(true))
  await sleep(30)
}

/** A paste carrying `data`, set on a plain event as the editor's own tests do. */
function paste(element: HTMLElement, data: { html?: string; text?: string; files?: File[] }) {
  const transfer = new DataTransfer()
  if (data.html !== undefined) transfer.setData('text/html', data.html)
  if (data.text !== undefined) transfer.setData('text/plain', data.text)
  for (const file of data.files ?? []) transfer.items.add(file)
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: transfer })
  element.dispatchEvent(event)
}

const text = (value: RichTextDocument | undefined) => richTextPlainText(value)

afterEach(() => {
  document.getSelection()?.removeAllRanges()
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<RichTextInputProps>(true)
  })
})

describe('editing', () => {
  it('types into an uncontrolled field and reports each change', async () => {
    const onChange = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus onChange={onChange} />)
    await focused(surface())
    await userEvent.keyboard('Hello')
    await vi.waitFor(() => expect(text(onChange.mock.lastCall?.[0])).toBe('Hello'))
  })

  it('holds a controlled value, and takes a value the app sets without reporting it', async () => {
    const onChange = vi.fn()
    let set: (next: RichTextDocument) => void = () => {}
    function Held() {
      const [value, setValue] = useState(doc(p(t('Start'))))
      set = setValue
      return (
        <>
          <RichTextInput
            aria-label="Comment"
            autoFocus
            value={value}
            onChange={(next) => {
              onChange(next)
              setValue(next)
            }}
          />
          <output data-testid="out">{richTextPlainText(value)}</output>
        </>
      )
    }
    render(<Held />)
    await focused(surface())
    await userEvent.keyboard(' here')
    await vi.waitFor(() => expect(screen.getByTestId('out').textContent).toBe('Start here'))
    const reported = onChange.mock.calls.length
    set(doc(p(t('Replaced'))))
    await vi.waitFor(() => expect(surface().textContent).toBe('Replaced'))
    expect(onChange.mock.calls.length).toBe(reported)
  })

  it('draws a placeholder while the document is empty, and only then', async () => {
    render(<RichTextInput aria-label="Comment" placeholder="Write a comment…" autoFocus />)
    const placeholder = () => surface().querySelector('[data-placeholder]')
    await vi.waitFor(() =>
      expect(placeholder()?.getAttribute('data-placeholder')).toBe('Write a comment…'),
    )
    await focused(surface())
    await userEvent.keyboard('x')
    await vi.waitFor(() => expect(placeholder()).toBeNull())
  })
})

describe('formatting', () => {
  it('turns bold on with the key and says so, and the control shows it pressed', async () => {
    render(<RichTextInput aria-label="Comment" autoFocus />)
    await focused(surface())
    const bold = screen.getByRole('button', { name: 'Bold' })
    expect(bold.getAttribute('aria-pressed')).toBe('false')
    await userEvent.keyboard(mod('b'))
    await vi.waitFor(() => expect(bold.getAttribute('aria-pressed')).toBe('true'))
    await said('Bold on')
  })

  it('formats the selection from a control pressed with the pointer, and the text keeps focus', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('A careful word')))}
        onChange={onChange}
        toolbar={toolbar}
      />,
    )
    await select(surface(), 'careful', seen)
    await userEvent.click(screen.getByRole('button', { name: 'Italic' }))
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(p(t('A '), t('careful', { type: 'italic' }), t(' word'))),
      ),
    )
    expect(document.activeElement).toBe(surface())
    expect(seen.editor?.selection.text).toBe('careful')
    expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps focus on a control a key pressed', async () => {
    const { seen, toolbar } = capture()
    render(
      <RichTextInput aria-label="Comment" defaultValue={doc(p(t('Plain')))} toolbar={toolbar} />,
    )
    await select(surface(), 'Plain', seen)
    const strike = screen.getByRole('button', { name: 'Strikethrough' })
    strike.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(strike.getAttribute('aria-pressed')).toBe('true'))
    expect(document.activeElement).toBe(strike)
  })

  it('makes lists, quotes and code blocks from the toolbar', async () => {
    const onChange = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('One')))}
        autoFocus
        onChange={onChange}
      />,
    )
    await focused(surface())
    await userEvent.click(screen.getByRole('button', { name: 'Bulleted list' }))
    await vi.waitFor(() => expect(surface().querySelector('ul > li')?.textContent).toBe('One'))
    await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }))
    await vi.waitFor(() => expect(surface().querySelector('ol > li')).not.toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Numbered list' }))
    await vi.waitFor(() => expect(surface().querySelector('ol')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Quote' }))
    await vi.waitFor(() => expect(surface().querySelector('blockquote')).not.toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Quote' }))
    await userEvent.click(screen.getByRole('button', { name: 'Code block' }))
    await vi.waitFor(() => expect(surface().querySelector('pre > code')?.textContent).toBe('One'))
    expect(onChange.mock.lastCall?.[0]).toEqual(doc({ type: 'codeBlock', text: 'One' }))
    // A mark does not apply inside a code block, so its control is disabled there.
    expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('sets a heading from the text style menu, and the text has focus again', async () => {
    const onChange = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('Title')))}
        autoFocus
        onChange={onChange}
      />,
    )
    await focused(surface())
    await userEvent.click(screen.getByRole('button', { name: 'Text style' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Heading 2' }))
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc({ type: 'heading', level: 2, content: [t('Title')] }),
      ),
    )
    await said('Heading 2')
    // The menu hides the page from assistive technology while it is open, and then the text has
    // focus again. The document's level 2 is drawn two levels under the page's title.
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
    expect(surface().querySelector('h3')?.textContent).toBe('Title')
  })

  it('draws no block control for a field of marks only', () => {
    render(<RichTextInput aria-label="Comment" formats={['bold', 'italic', 'link']} />)
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['Bold', 'Italic', 'Link', 'Undo', 'Redo'])
  })

  it('applies a typed shortcut through the member', async () => {
    const onChange = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus onChange={onChange} />)
    await focused(surface())
    await userEvent.keyboard('- item')
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc({
          type: 'list',
          ordered: false,
          items: [{ type: 'listItem', content: [p(t('item'))] }],
        }),
      ),
    )
  })

  it('undoes and redoes, says so, and hands focus on when Undo runs out', async () => {
    render(<RichTextInput aria-label="Comment" autoFocus />)
    await focused(surface())
    await userEvent.keyboard('x')
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    await vi.waitFor(() => expect(undo.disabled).toBe(false))
    undo.focus()
    await userEvent.keyboard('{Enter}')
    await said('Undone')
    // Undo has nothing left, so focus moves to the next control, Redo.
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Redo' })),
    )
    await userEvent.keyboard('{Enter}')
    await said('Redone')
    expect(surface().textContent).toBe('x')
  })
})

describe('leaving the text from a list', () => {
  it('leaves on Shift+Tab from a top-level item, and on Escape then Tab from an item Tab would sink, and changes nothing', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <>
        <RichTextInput
          aria-label="Comment"
          defaultValue={doc(ul([p(t('one'))], [p(t('two'))]))}
          onChange={onChange}
          toolbar={toolbar}
        />
        <input aria-label="After" />
      </>,
    )
    // Shift+Tab from the text reaches the toolbar's stop before it.
    await caretAfter(surface(), 'two', seen)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold'))
    // Tab would sink "two" under "one"; after Escape it moves on.
    await caretAfter(surface(), 'two', seen)
    await userEvent.keyboard('{Escape}{Tab}')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'After' })),
    )
    await sleep(30)
    expect(onChange).not.toHaveBeenCalled()
    expect(surface().querySelectorAll('li')).toHaveLength(2)
  })
})

describe('the toolbar’s keys', () => {
  it('is one tab stop before the text, moves with the arrows, Home and End, and Escape returns', async () => {
    render(
      <>
        <input aria-label="Before" />
        <RichTextInput aria-label="Comment" autoFocus defaultValue={doc(p(t('Text')))} />
      </>,
    )
    await focused(surface())
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    const stops = () =>
      [...toolbar.querySelectorAll('button')].filter((button) => button.tabIndex === 0)
    expect(stops()).toHaveLength(1)
    // Shift+Tab from the text reaches the toolbar once, on its stop, and once more leaves it.
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Before' }))
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(surface())
    stops()[0]?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Italic')
    expect(stops().map((button) => button.getAttribute('aria-label'))).toEqual(['Italic'])
    await userEvent.keyboard('{End}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Code block')
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Code block')
    await userEvent.keyboard('{Home}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
  })

  it('moves focus to the toolbar with Alt+F10', async () => {
    render(<RichTextInput aria-label="Comment" autoFocus />)
    await focused(surface())
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
  })

  it('keeps every control reachable in a container 320 pixels wide, on more rows', async () => {
    render(
      <div style={{ inlineSize: '320px' }}>
        <RichTextInput aria-label="Comment" autoFocus />
      </div>,
    )
    await focused(surface())
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    const frame = toolbar.parentElement as HTMLElement
    const buttons = [...toolbar.querySelectorAll('button')]
    const rows = new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))
    expect(rows.size).toBeGreaterThan(1)
    const box = frame.getBoundingClientRect()
    for (const button of buttons) {
      const rect = button.getBoundingClientRect()
      expect(rect.left).toBeGreaterThanOrEqual(box.left)
      expect(rect.right).toBeLessThanOrEqual(box.right)
    }
    const enabled = buttons.filter((button) => !button.disabled)
    enabled[0]?.focus()
    const reached = new Set<Element | null>([document.activeElement])
    for (let step = 1; step < enabled.length; step++) {
      await userEvent.keyboard('{ArrowRight}')
      reached.add(document.activeElement)
    }
    expect(reached.size).toBe(enabled.length)
  })
})

describe('the link form', () => {
  it('links the selection to a safe address, refuses an unsafe one, and returns to the text', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('Read the guide first')))}
        onChange={onChange}
        toolbar={toolbar}
      />,
    )
    await select(surface(), 'guide', seen)
    await userEvent.keyboard(mod('k'))
    const address = await screen.findByRole('textbox', { name: 'Address' })
    await vi.waitFor(() => expect(document.activeElement).toBe(address))
    await userEvent.keyboard('javascript:alert(1){Enter}')
    await vi.waitFor(() =>
      expect(
        screen.getByText('Enter a web address, an email address or a phone number.'),
      ).toBeTruthy(),
    )
    expect(onChange).not.toHaveBeenCalled()
    await userEvent.clear(address)
    await userEvent.type(address, 'example.com/guide')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(
          p(
            t('Read the '),
            t('guide', { type: 'link', href: 'https://example.com/guide' }),
            t(' first'),
          ),
        ),
      ),
    )
    await said('Link added')
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
    expect(seen.editor?.selection.text).toBe('guide')
    await vi.waitFor(() => expect(screen.queryByRole('textbox', { name: 'Address' })).toBeNull())
  })

  it('removes the link the selection is in', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('See '), t('docs', { type: 'link', href: 'https://example.com' })))}
        onChange={onChange}
        toolbar={toolbar}
      />,
    )
    await select(surface(), 'docs', seen)
    const link = screen.getByRole('button', { name: 'Link' })
    expect(link.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(link)
    const address = (await screen.findByRole('textbox', { name: 'Address' })) as HTMLInputElement
    expect(address.value).toBe('https://example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Remove link' }))
    await vi.waitFor(() => expect(onChange.mock.lastCall?.[0]).toEqual(doc(p(t('See docs')))))
    await said('Link removed')
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
  })
})

describe('entities', () => {
  const lookup = (overrides: Partial<RichTextEntitySource>): RichTextEntitySource => ({
    kind: 'user',
    trigger: '@',
    label: 'People',
    options: [],
    filter: false,
    ...overrides,
  })

  it('lists, filters and picks with the keys, and says what it inserted', async () => {
    const onChange = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus entities={[PEOPLE]} onChange={onChange} />)
    await focused(surface())
    await userEvent.keyboard('Ask @')
    const list = await screen.findByRole('listbox', { name: 'People' })
    await said('3 suggestions')
    expect(surface().getAttribute('aria-controls')).toBe(list.id)
    await userEvent.keyboard('gr')
    await said('1 suggestion')
    const option = screen.getByRole('option', { name: 'Grace Hopper Compilers' })
    expect(surface().getAttribute('aria-activedescendant')).toBe(option.id)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(
          p(
            t('Ask '),
            { type: 'entity', kind: 'user', id: 'grace', label: '@Grace Hopper' },
            t(' '),
          ),
        ),
      ),
    )
    await said('@Grace Hopper inserted')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('tells the app the query, shows loading rows, then the app’s options', async () => {
    const onQueryChange = vi.fn()
    function Held() {
      const [source, setSource] = useState(lookup({ loading: true, onQueryChange }))
      return (
        <>
          <RichTextInput aria-label="Comment" autoFocus entities={[source]} />
          <button
            type="button"
            onClick={() =>
              setSource(lookup({ onQueryChange, options: [{ id: 'ada', label: 'Ada Lovelace' }] }))
            }
          >
            Answer
          </button>
        </>
      )
    }
    render(<Held />)
    await focused(surface())
    await userEvent.keyboard('@a')
    await vi.waitFor(() => expect(onQueryChange.mock.calls).toEqual([[''], ['a']]))
    await said('Loading suggestions…')
    const panel = document.querySelector('[data-rich-text-input-part="suggestions"]')
    expect(panel?.querySelector('[aria-hidden="true"]')).not.toBeNull()
    // While the options load, Enter neither picks nor breaks the line.
    await userEvent.keyboard('{Enter}')
    expect(surface().querySelectorAll('p')).toHaveLength(1)
    screen.getByRole('button', { name: 'Answer' }).click()
    await screen.findByRole('option', { name: 'Ada Lovelace' })
    await said('1 suggestion')
  })

  it('closes on Escape and when the caret leaves the token, and inserts nothing', async () => {
    const onChange = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus entities={[PEOPLE]} onChange={onChange} />)
    await focused(surface())
    await userEvent.keyboard('@gr')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await userEvent.keyboard('a')
    await sleep(60)
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.keyboard(' @a')
    await screen.findByRole('listbox')
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(text(onChange.mock.lastCall?.[0])).toBe('@gra @a ')
  })

  it('says the app’s error, and Enter is the editor’s own', async () => {
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        entities={[lookup({ error: 'People could not be loaded.' })]}
      />,
    )
    await focused(surface())
    await userEvent.keyboard('@x')
    await said('People could not be loaded.')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(surface().querySelectorAll('p')).toHaveLength(2))
  })

  it('closes the list on the first Escape inside a Dialog, and the dialog stays open', async () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog title="Comment" defaultOpen onOpenChange={onOpenChange}>
        <RichTextInput aria-label="Comment" entities={[PEOPLE]} autoFocus />
      </Dialog>,
    )
    await focused(surface())
    await userEvent.keyboard('@')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await sleep(60)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('places the list under the token, inside the root', async () => {
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        entities={[PEOPLE]}
        defaultValue={doc(p(t('A longer line of words before @')))}
      />,
    )
    await focused(surface())
    const panel = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-rich-text-input-part="suggestions"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    const root = surface().closest('[data-member="rich-text-input"]') as HTMLElement
    const box = panel.getBoundingClientRect()
    const field = root.getBoundingClientRect()
    expect(panel.dataset['placement']).toBe('below')
    expect(box.left).toBeGreaterThanOrEqual(field.left - 1)
    expect(box.right).toBeLessThanOrEqual(field.right + 1)
    expect(box.top).toBeGreaterThan(surface().getBoundingClientRect().top)
  })
})

describe('paste', () => {
  it('keeps only what the field allows, and a safe link', async () => {
    const onChange = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        formats={['bold', 'link']}
        onChange={onChange}
      />,
    )
    await focused(surface())
    paste(surface(), {
      html:
        '<h1 class="x">Title</h1><script>alert(1)</script><p style="color:red">A <b>bold</b> ' +
        '<a href="javascript:alert(1)">trap</a> and <a href="https://example.com">a link</a></p>',
    })
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(
          p(t('Title')),
          p(
            t('A '),
            t('bold', { type: 'bold' }),
            t(' trap and '),
            t('a link', { type: 'link', href: 'https://example.com' }),
          ),
        ),
      ),
    )
    expect(surface().querySelector('script, [style], [class="x"]')).toBeNull()
  })

  it('hands pasted files to the app and inserts nothing', async () => {
    const onFiles = vi.fn()
    const onChange = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus onFiles={onFiles} onChange={onChange} />)
    await focused(surface())
    const file = new File(['png'], 'shot.png', { type: 'image/png' })
    paste(surface(), { files: [file] })
    await vi.waitFor(() => expect(onFiles).toHaveBeenCalledWith([file]))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the limit', () => {
  it('counts, marks the field past the limit, says each crossing once and refuses a submit', async () => {
    const onSubmit = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus maxLength={5} onSubmit={onSubmit} />)
    await focused(surface())
    await userEvent.keyboard('Hello')
    const count = () =>
      document.getElementById(surface().getAttribute('aria-describedby') ?? '') as HTMLElement
    await vi.waitFor(() => expect(count().textContent).toBe('5 / 5'))
    await userEvent.keyboard('!')
    await vi.waitFor(() => expect(count().textContent).toBe('1 character over the limit'))
    await said('1 character over the limit')
    const root = surface().closest('[data-member="rich-text-input"]') as HTMLElement
    expect(root.hasAttribute('data-invalid')).toBe(true)
    expect(surface().getAttribute('aria-invalid')).toBe('true')
    expect(count().getAttribute('data-state')).toBe('over')
    await userEvent.keyboard(mod('{Enter}'))
    await said('Remove 1 character to submit.')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.keyboard('{Backspace}')
    await said('Within the limit')
    expect(root.hasAttribute('data-invalid')).toBe(false)
  })
})

describe('in a FormField', () => {
  it('is named by the label and described by the error, the count and the field', () => {
    render(
      <FormField label="Description" error="Describe what changed." required>
        <RichTextInput maxLength={200} />
      </FormField>,
    )
    const field = screen.getByRole('textbox', { name: 'Description' })
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-required')).toBe('true')
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ')
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Describe what changed.',
      '0 / 200',
    ])
    expect(screen.getByRole('toolbar').getAttribute('aria-controls')).toBe(field.id)
  })
})

describe('disabled, read-only and pending', () => {
  it('disabled: no edit, no focus, every control disabled', async () => {
    const onChange = vi.fn()
    render(
      <RichTextInput aria-label="Comment" disabled defaultValue={CONTENT} onChange={onChange} />,
    )
    const field = surface()
    await vi.waitFor(() => expect(field.getAttribute('contenteditable')).toBe('false'))
    expect(field.getAttribute('aria-disabled')).toBe('true')
    expect(field.hasAttribute('tabindex')).toBe(false)
    field.focus()
    expect(document.activeElement).not.toBe(field)
    await userEvent.click(field, { force: true })
    await userEvent.keyboard('typed{Enter}')
    await sleep(60)
    expect(onChange).not.toHaveBeenCalled()
    expect(field.textContent).toBe(richTextPlainText(CONTENT, { blockSeparator: '' }))
    for (const button of screen.getAllByRole('button', { hidden: true })) {
      expect((button as HTMLButtonElement).disabled, button.getAttribute('aria-label') ?? '').toBe(
        true,
      )
    }
  })

  it('read-only: focusable, a caret that selects with the keys, not editable, the toolbar disabled', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        readOnly
        defaultValue={doc(p(t('Review these words')))}
        onChange={onChange}
        toolbar={toolbar}
      />,
    )
    const field = surface()
    // The browser draws a caret in an editable element; the editor refuses every edit in it.
    await vi.waitFor(() => expect(field.getAttribute('contenteditable')).toBe('true'))
    expect(field.getAttribute('aria-readonly')).toBe('true')
    expect(field.getAttribute('inputmode')).toBe('none')
    expect(field.tabIndex).toBe(0)
    seen.editor?.focus()
    await focused(field)
    // The caret is at the start, where focus put it.
    await userEvent.keyboard(
      '{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}',
    )
    await vi.waitFor(() => expect(seen.editor?.selection.text).toBe('Review'))
    await userEvent.keyboard(mod('a'))
    await vi.waitFor(() => expect(seen.editor?.selection.text).toBe('Review these words'))
    await userEvent.keyboard('typed{Enter}{Backspace}')
    await userEvent.keyboard(mod('b'))
    await sleep(60)
    expect(onChange).not.toHaveBeenCalled()
    expect(field.textContent).toBe('Review these words')
    expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('pending: the submit is loading, and Mod+Enter is refused and said', async () => {
    const onSubmit = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        pending
        defaultValue={CONTENT}
        submitLabel="Comment"
        onSubmit={onSubmit}
      />,
    )
    const submit = screen.getByRole('button', { name: 'Comment' })
    expect(submit.getAttribute('aria-busy')).toBe('true')
    surface().focus()
    await focused(surface())
    await userEvent.keyboard(mod('{Enter}'))
    await said('Still saving.')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('submitting', () => {
  it('submits with Mod+Enter, handing the document and the field', async () => {
    const onSubmit = vi.fn()
    render(<RichTextInput aria-label="Comment" autoFocus onSubmit={onSubmit} />)
    await focused(surface())
    await userEvent.keyboard(mod('{Enter}'))
    await said('There is nothing to submit yet.')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.keyboard('Ship it')
    await userEvent.keyboard(mod('{Enter}'))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [value, editor] = onSubmit.mock.lastCall as [RichTextDocument, RichTextInputEditor]
    expect(value).toEqual(doc(p(t('Ship it'))))
    expect(editor.length).toBe(7)
    // Nothing is cleared after a submit: the app clears when its save succeeded.
    expect(surface().textContent).toBe('Ship it')
  })

  it('draws the default footer: submit waits for words, cancel cancels', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        submitLabel="Comment"
        onSubmit={onSubmit}
        cancelLabel="Cancel"
        onCancel={onCancel}
      />,
    )
    await focused(surface())
    const submit = screen.getByRole('button', { name: 'Comment' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.keyboard('Looks good')
    await vi.waitFor(() => expect(submit.disabled).toBe(false))
    await userEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledWith(doc(p(t('Looks good'))), expect.anything())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('hands the app’s footer the field, whose clear empties it as the person’s act', async () => {
    const onChange = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('Draft')))}
        onChange={onChange}
        footer={(editor) => (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            label={`Discard ${editor.length}`}
            disabled={editor.empty}
            onClick={() => editor.clear()}
          />
        )}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Discard 5' }))
    await vi.waitFor(() => expect(onChange.mock.lastCall?.[0]).toEqual(doc()))
    expect((screen.getByRole('button', { name: 'Discard 0' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('focus', () => {
  it('takes no focus at mount without autoFocus', async () => {
    render(<RichTextInput aria-label="Comment" defaultValue={CONTENT} />)
    await sleep(60)
    expect(document.activeElement).toBe(document.body)
  })

  it('takes focus at mount with autoFocus, with the caret at the end', async () => {
    const onChange = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        defaultValue={doc(p(t('Start')))}
        onChange={onChange}
      />,
    )
    await focused(surface())
    await userEvent.keyboard('!')
    await vi.waitFor(() => expect(text(onChange.mock.lastCall?.[0])).toBe('Start!'))
  })
})

describe('the form value', () => {
  it('holds the document in a hidden input that reads back as the same document', async () => {
    render(
      <form data-testid="form">
        <RichTextInput aria-label="Comment" name="body" defaultValue={CONTENT} />
      </form>,
    )
    const data = new FormData(screen.getByTestId('form') as HTMLFormElement)
    const read = parseRichText(String(data.get('body'))).value
    expect(richTextEquals(read, CONTENT)).toBe(true)
  })
})

describe('the handle', () => {
  it('inserts text and entities, focuses, and reports the emptiness, the length and the limit', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput aria-label="Comment" maxLength={6} onChange={onChange} toolbar={toolbar} />,
    )
    await vi.waitFor(() => expect(seen.editor).not.toBeNull())
    expect(seen.editor?.empty).toBe(true)
    seen.editor?.focus()
    await focused(surface())
    seen.editor?.insertText('Hi ')
    seen.editor?.insertEntity({ kind: 'user', id: 'ada', label: '@Ada' })
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(p(t('Hi '), { type: 'entity', kind: 'user', id: 'ada', label: '@Ada' }, t(' '))),
      ),
    )
    await vi.waitFor(() => expect(seen.editor?.length).toBe(8))
    expect(seen.editor?.empty).toBe(false)
    expect(seen.editor?.overLimit).toBe(true)
    expect(seen.editor?.disabled).toBe(false)
  })
})

describe('a server render', () => {
  // That no member reads a browser global while it renders is the server-render law's, which
  // renders every state in Node (`packages/react-ui/server-render.test.ts`).
  it('draws the frame, the toolbar, an empty surface and the form value in a server render', () => {
    const html = renderToString(
      <RichTextInput
        aria-label="Comment"
        defaultValue={CONTENT}
        entities={[PEOPLE]}
        maxLength={280}
        name="body"
        submitLabel="Comment"
        onSubmit={() => {}}
      />,
    )
    expect(html).toContain('data-member="rich-text-input"')
    expect(html).toContain('role="toolbar"')
    expect(html).toMatch(/<div[^>]*role="textbox"[^>]*><\/div>/)
    expect(html).toContain('type="hidden"')
  })
})

describe('the drawing', () => {
  /** Every node RichTextContent draws through a member, in one document. */
  const DRAWN = doc(
    { type: 'heading', level: 1, content: [t('Level one')] },
    { type: 'heading', level: 2, content: [t('Level two')] },
    { type: 'heading', level: 3, content: [t('Level three')] },
    p(
      t('Plain, '),
      t('bold', { type: 'bold' }),
      t(', '),
      t('code', { type: 'code' }),
      t(', '),
      t('linked', { type: 'link', href: '/docs' }),
      t(' and '),
      { type: 'entity', kind: 'user', id: 'ada', label: '@Ada Lovelace' },
    ),
    {
      type: 'list',
      ordered: false,
      items: [{ type: 'listItem', content: [p(t('An item'))] }],
    },
    { type: 'blockquote', content: [p(t('A quote'))] },
    { type: 'codeBlock', text: 'let x = 1' },
  )

  const PROPERTIES = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'color',
    'backgroundColor',
    'marginTop',
    'paddingInlineStart',
    'borderInlineStartWidth',
    'textDecorationLine',
  ] as const

  it('draws the document as RichTextContent draws it', async () => {
    render(
      <>
        <div data-testid="reader">
          <RichTextContent value={DRAWN} />
        </div>
        <RichTextInput aria-label="Comment" defaultValue={DRAWN} />
      </>,
    )
    const reader = screen.getByTestId('reader')
    const field = surface()
    await vi.waitFor(() => expect(field.querySelector('pre')).not.toBeNull())
    const pairs: [string, string][] = [
      ['h2', 'h2'],
      ['h3', 'h3'],
      ['h4', 'h4'],
      [':scope > div > p', ':scope > p'],
      ['strong', 'strong'],
      ['p code', 'p code'],
      ['a', 'a'],
      ['[data-entity-kind]', '[data-entity-kind]'],
      ['ul', 'ul'],
      ['li', 'li'],
      ['blockquote', 'blockquote'],
      ['pre', 'pre'],
    ]
    for (const [theirs, ours] of pairs) {
      const a = reader.querySelector(theirs)
      const b = field.querySelector(ours)
      expect(a, theirs).not.toBeNull()
      expect(b, ours).not.toBeNull()
      const left = getComputedStyle(a as Element)
      const right = getComputedStyle(b as Element)
      for (const property of PROPERTIES) {
        if (theirs === 'pre' && property === 'paddingInlineStart') continue
        expect(right[property], `${ours} ${property}`).toBe(left[property])
      }
    }
  })
})

/**
 * An agent and the field (`design/components/rich-text-input.md`, Agent): it fills and clears
 * the text as the person's act, submits as Mod+Enter does, and finds none of the field's own
 * controls. The app's control in the toolbar slot stays an agent's.
 */
describe('an agent', () => {
  it('fills, clears and submits, and is refused what the field refuses', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    render(<RichTextInput aria-label="Comment" onChange={onChange} onSubmit={onSubmit} />)
    await vi.waitFor(() => expect(surface().getAttribute('contenteditable')).toBe('true'))
    const bridge = createAgentBridge()
    try {
      const [field] = bridge.snapshot().members
      expect(field).toMatchObject({
        member: 'RichTextInput',
        name: 'Comment',
        state: { value: '', empty: true, disabled: false, invalid: false, readonly: false },
      })
      const refused = await bridge.act([{ id: field?.id, action: 'submit' }])
      expect(refused.results[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
      const filled = await bridge.act([
        { id: field?.id, action: 'fill', value: 'First line\n\nSecond' },
      ])
      expect(filled.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '', to: 'First line\nSecond' } },
      })
      expect(onChange.mock.lastCall?.[0]).toEqual(doc(p(t('First line')), p(t('Second'))))
      const sent = await bridge.act([{ id: field?.id, action: 'submit' }])
      expect(sent.results[0]).toMatchObject({ ok: true })
      expect(onSubmit).toHaveBeenCalledWith(
        doc(p(t('First line')), p(t('Second'))),
        expect.anything(),
      )
      const cleared = await bridge.act([{ id: field?.id, action: 'clear' }])
      expect(cleared.results[0]).toMatchObject({ ok: true, changed: { value: { to: '' } } })
    } finally {
      bridge.dispose()
    }
  })

  it('withholds the field’s own controls and lists the app’s control in its slot', async () => {
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={CONTENT}
        submitLabel="Comment"
        onSubmit={() => {}}
        toolbar={() => (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            iconOnly
            icon="attach"
            label="Attach a file"
            onClick={() => {}}
          />
        )}
      />,
    )
    await vi.waitFor(() => expect(surface().getAttribute('contenteditable')).toBe('true'))
    const bridge = createAgentBridge()
    try {
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name]).sort()).toEqual([
        ['Button', 'Attach a file'],
        ['RichTextInput', 'Comment'],
      ])
      const own = agentRegistrations().filter(
        ({ member, element }) =>
          (member === 'Button' || member === 'Menu') &&
          element?.getAttribute('aria-label') !== 'Attach a file',
      )
      expect(own.length).toBeGreaterThan(10)
      for (const { id } of own) {
        const { results } = await bridge.act([{ id, action: 'press' }])
        expect(results[0]).toMatchObject({ ok: false, error: { code: 'unknown-member' } })
      }
    } finally {
      bridge.dispose()
    }
  })
})

describe('the selection bar', () => {
  it('draws the format controls at a selection made with the keys, says so once, and takes Alt+F10', async () => {
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        toolbarPlacement="selection"
        defaultValue={doc(p(t('Select these words')))}
      />,
    )
    await focused(surface())
    const heard = listen()
    expect(screen.queryByRole('toolbar')).toBeNull()
    await userEvent.keyboard(
      '{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}',
    )
    const bar = await screen.findByRole('toolbar', { name: 'Selection' })
    await said(HINT)
    expect(bar.querySelector('[aria-label="Undo"]')).toBeNull()
    // The bar is above the selection, inside the window.
    const box = bar.getBoundingClientRect()
    expect(box.bottom).toBeLessThanOrEqual(surface().getBoundingClientRect().bottom)
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth)
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
    await userEvent.keyboard('{Enter}')
    await said('Bold on')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
    expect(screen.getByRole('toolbar', { name: 'Selection' })).toBe(bar)
    // Focus that comes back to the text from the bar has not entered the field again.
    await sleep(60)
    expect(heard.filter((text) => text === HINT)).toHaveLength(1)
    // Escape in the text hides it for this selection.
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull())
  })

  it('holds the app’s selection actions alone in a read-only field', async () => {
    const onComment = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        readOnly
        defaultValue={doc(p(t('Review these words')))}
        toolbar={toolbar}
        selectionActions={(editor) => (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            icon="comment"
            label="Comment"
            onClick={() => onComment(editor.selection.text)}
          />
        )}
      />,
    )
    await select(surface(), 'these', seen)
    const bar = await screen.findByRole('toolbar', { name: 'Selection' })
    expect([...bar.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Comment',
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(onComment).toHaveBeenCalledWith('these')
  })
})

describe('annotations', () => {
  const ANNOTATED = doc(
    p(
      t('The policy '),
      t('doubles the wait', { type: 'annotation', id: 'thread-1' }),
      t(' after each '),
      t('failure', { type: 'annotation', id: 'thread-2' }),
      t('.'),
    ),
  )

  it('draws the annotations it is given, the active one marked', async () => {
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={ANNOTATED}
        annotations={['thread-2']}
        activeAnnotation="thread-2"
      />,
    )
    await vi.waitFor(() =>
      expect(surface().querySelector('[data-annotation-id="thread-2"]')).not.toBeNull(),
    )
    expect(surface().querySelector('[data-annotation-id="thread-1"]')).toBeNull()
    // The highlight is the recipe's wash on the text's own colour, not the browser's mark colours.
    const mark = surface().querySelector('[data-annotation-id="thread-2"]') as HTMLElement
    expect(mark.tagName).toBe('MARK')
    expect(getComputedStyle(mark).color).toBe(getComputedStyle(mark.parentElement as Element).color)
    expect(getComputedStyle(mark).backgroundColor).toBe(tokenColor('--pm-warning-subtle-active'))
    expect(
      surface().querySelector('[data-annotation-id="thread-2"]')?.hasAttribute('data-active'),
    ).toBe(true)
  })

  it('reports a press on an annotation and the caret entering one, once each', async () => {
    const onAnnotationSelect = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={ANNOTATED}
        onAnnotationSelect={onAnnotationSelect}
        toolbar={toolbar}
      />,
    )
    const fragment = await vi.waitFor(() => {
      const found = surface().querySelector<HTMLElement>('[data-annotation-id="thread-1"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    await userEvent.click(fragment)
    await vi.waitFor(() => expect(onAnnotationSelect.mock.calls).toEqual([['thread-1']]))
    // The caret the press placed inside the annotation is the same entry, heard once.
    await sleep(100)
    expect(onAnnotationSelect.mock.calls).toEqual([['thread-1']])
    await caretAfter(surface(), 'after each f', seen)
    await vi.waitFor(() =>
      expect(onAnnotationSelect.mock.calls).toEqual([['thread-1'], ['thread-2']]),
    )
    // A caret moving inside the annotation it entered is not another entry.
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await sleep(100)
    expect(onAnnotationSelect.mock.calls).toEqual([['thread-1'], ['thread-2']])
  })

  it('anchors and removes an annotation through the handle, as edits', async () => {
    const onChange = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('Anchor these words')))}
        onChange={onChange}
        toolbar={toolbar}
      />,
    )
    await select(surface(), 'these', seen)
    expect(seen.editor?.selection.range).toEqual({ start: 7, end: 12 })
    expect(seen.editor?.annotate('thread-9')).toBe(true)
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(p(t('Anchor '), t('these', { type: 'annotation', id: 'thread-9' }), t(' words'))),
      ),
    )
    expect(seen.editor?.removeAnnotation('thread-9')).toBe(true)
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(doc(p(t('Anchor these words')))),
    )
  })
})

describe('the selection bar, at the edges', () => {
  const react = (onReact?: () => void) => (editor: RichTextInputEditor) => (
    <Button
      variant="ghost"
      tone="neutral"
      size="sm"
      label="React"
      onClick={() => {
        onReact?.()
        editor.insertText('👍')
      }}
    />
  )

  it('gives focus back to the text when an action in the bar replaces the selection', async () => {
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        defaultValue={doc(p(t('Nice work')))}
        selectionActions={react()}
      />,
    )
    await focused(surface())
    await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}')
    await screen.findByRole('toolbar', { name: 'Selection' })
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    expect(document.activeElement?.textContent).toBe('React')
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(surface().textContent).toBe('Nice 👍'))
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
    await sleep(60)
    expect(document.activeElement).toBe(surface())
  })

  it('reaches a read-only field’s actions from the keys, for a reviewer who may not edit', async () => {
    const reacted = vi.fn()
    render(
      <RichTextInput
        aria-label="Comment"
        readOnly
        autoFocus
        defaultValue={doc(p(t('Review this')))}
        selectionActions={(editor) => (
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            label="Comment"
            onClick={() => reacted(editor.selection.text)}
          />
        )}
      />,
    )
    await focused(surface())
    await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}')
    await screen.findByRole('toolbar', { name: 'Selection' })
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    expect(document.activeElement?.textContent).toBe('Comment')
    await userEvent.keyboard('{Enter}')
    expect(reacted).toHaveBeenCalledWith('this')
  })

  it('keeps the bar inside the window for a selection taller than the window', async () => {
    const long = doc(...Array.from({ length: 50 }, (_, index) => p(t(`Paragraph ${index + 1}`))))
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        maxRows="none"
        toolbarPlacement="selection"
        defaultValue={long}
      />,
    )
    await focused(surface())
    expect(surface().getBoundingClientRect().height).toBeGreaterThan(window.innerHeight)
    await userEvent.keyboard(mod('a'))
    const bar = await screen.findByRole('toolbar', { name: 'Selection' })
    await vi.waitFor(() => {
      const box = bar.getBoundingClientRect()
      expect(box.top).toBeGreaterThanOrEqual(0)
      expect(box.bottom).toBeLessThanOrEqual(document.documentElement.clientHeight)
      expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth)
    })
    expect(bar.hasAttribute('data-outside')).toBe(false)
  })

  it('hides the bar while the selection is scrolled out of the field’s own box, and brings it back', async () => {
    const { seen, toolbar } = capture()
    const long = doc(...Array.from({ length: 30 }, (_, index) => p(t(`Line ${index + 1}.`))))
    render(
      <RichTextInput
        aria-label="Comment"
        maxRows={6}
        toolbarPlacement="selection"
        defaultValue={long}
        toolbar={toolbar}
      />,
    )
    await select(surface(), 'Line 1', seen)
    const bar = await screen.findByRole('toolbar', { name: 'Selection' })
    const box = surface().parentElement as HTMLElement
    box.scrollTop = box.scrollHeight
    await vi.waitFor(() => expect(bar.hasAttribute('data-outside')).toBe(true))
    expect(getComputedStyle(bar).visibility).toBe('hidden')
    box.scrollTop = 0
    await vi.waitFor(() => expect(bar.hasAttribute('data-outside')).toBe(false))
    expect(getComputedStyle(bar).visibility).toBe('visible')
  })

  it('brings the bar back for a selection hidden with Escape when it is selected again', async () => {
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        toolbarPlacement="selection"
        defaultValue={doc(p(t('One two three')))}
        toolbar={toolbar}
      />,
    )
    const bar = () => screen.queryByRole('toolbar', { name: 'Selection' })
    await select(surface(), 'two', seen)
    await vi.waitFor(() => expect(bar()).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(bar()).toBeNull())
    await select(surface(), 'three', seen)
    await vi.waitFor(() => expect(bar()).not.toBeNull())
    await select(surface(), 'two', seen)
    await sleep(60)
    expect(bar()).not.toBeNull()
  })

  it('asks for the app’s selection actions only while the bar is drawn', async () => {
    const actions = vi.fn(() => (
      <Button variant="ghost" tone="neutral" size="sm" label="Comment" onClick={() => {}} />
    ))
    const { seen, toolbar } = capture()
    render(
      <RichTextInput
        aria-label="Comment"
        defaultValue={doc(p(t('Some words')))}
        selectionActions={actions}
        toolbar={toolbar}
      />,
    )
    surface().focus()
    await focused(surface())
    await userEvent.keyboard('{End}x')
    await sleep(60)
    expect(actions).not.toHaveBeenCalled()
    await select(surface(), 'words', seen)
    await screen.findByRole('toolbar', { name: 'Selection' })
    expect(actions).toHaveBeenCalled()
  })

  it('says the bar is there once each time focus enters the field, and not over the link form’s words', async () => {
    const { seen, toolbar } = capture()
    render(
      <>
        <RichTextInput
          aria-label="Comment"
          toolbarPlacement="selection"
          defaultValue={doc(p(t('Read the guide first')))}
          toolbar={toolbar}
        />
        <input aria-label="Elsewhere" />
      </>,
    )
    await vi.waitFor(() => expect(seen.editor).not.toBeNull())
    const heard = listen()
    await select(surface(), 'guide', seen)
    await said(HINT)
    await userEvent.keyboard(mod('k'))
    const address = await screen.findByRole('textbox', { name: 'Address' })
    await vi.waitFor(() => expect(document.activeElement).toBe(address))
    await userEvent.keyboard('example.com{Enter}')
    await said('Link added')
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
    await screen.findByRole('toolbar', { name: 'Selection' })
    await sleep(100)
    expect(status().textContent).toBe('Link added')
    expect(heard.filter((text) => text === HINT)).toHaveLength(1)
    // Leaving the field and coming back is entering it again.
    screen.getByRole('textbox', { name: 'Elsewhere' }).focus()
    await select(surface(), 'first', seen)
    await vi.waitFor(() => expect(heard.filter((text) => text === HINT)).toHaveLength(2))
  })
})

describe('the suggestion list, at the edges', () => {
  it('names the active option by the option, so a filter that puts another first is heard', async () => {
    render(<RichTextInput aria-label="Comment" autoFocus entities={[PEOPLE]} />)
    await focused(surface())
    await userEvent.keyboard('@')
    await screen.findByRole('listbox')
    const first = surface().getAttribute('aria-activedescendant') ?? ''
    expect(document.getElementById(first)?.textContent).toContain('Ada Lovelace')
    await userEvent.keyboard('g')
    await vi.waitFor(() => expect(surface().getAttribute('aria-activedescendant')).not.toBe(first))
    const now = surface().getAttribute('aria-activedescendant') ?? ''
    expect(document.getElementById(now)?.textContent).toContain('Grace Hopper')
    expect(document.getElementById(now)?.getAttribute('aria-selected')).toBe('true')
  })

  it('draws the list outside a scrolling box around the field, inside the window', async () => {
    render(
      <div style={{ overflow: 'auto', blockSize: '120px' }} data-testid="box">
        <RichTextInput
          aria-label="Comment"
          autoFocus
          minRows={1}
          entities={[PEOPLE]}
          defaultValue={doc(p(t('Thanks @')))}
        />
      </div>,
    )
    await focused(surface())
    const panel = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-rich-text-input-part="suggestions"]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    await vi.waitFor(() => expect(panel.dataset['placement']).toBe('below'))
    const list = panel.getBoundingClientRect()
    const box = screen.getByTestId('box').getBoundingClientRect()
    // It runs past the scrolling box's edge and is drawn there all the same.
    expect(list.bottom).toBeGreaterThan(box.bottom)
    const below = document.elementFromPoint((list.left + list.right) / 2, list.bottom - 8)
    expect(panel.contains(below)).toBe(true)
    expect(list.bottom).toBeLessThanOrEqual(document.documentElement.clientHeight)
    // Its start is the token's start.
    const words = textNodes(surface())[0]?.node as Text
    const token = document.createRange()
    token.setStart(words, words.data.indexOf('@'))
    token.setEnd(words, words.data.indexOf('@') + 1)
    expect(Math.abs(list.left - token.getBoundingClientRect().left)).toBeLessThan(1)
  })
})

describe('focus', () => {
  it('takes focus from a press on its FormField label, and not from a click that ends a selection of the label', async () => {
    render(
      <FormField label="Description">
        <RichTextInput defaultValue={doc(p(t('Text')))} />
      </FormField>,
    )
    const field = screen.getByRole('textbox', { name: 'Description' })
    await vi.waitFor(() => expect(field.getAttribute('contenteditable')).toBe('true'))
    const label = document.getElementById(field.getAttribute('aria-labelledby') ?? '')
    expect(label?.tagName).toBe('LABEL')
    await userEvent.click(label as HTMLElement)
    await vi.waitFor(() => expect(document.activeElement).toBe(field))
    field.blur()
    // The press that ends a drag over the label's words leaves them selected and focus where it was.
    const words = label?.firstChild as Text
    document.getSelection()?.setBaseAndExtent(words, 0, words, 4)
    label?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await sleep(60)
    expect(document.activeElement).not.toBe(field)
    expect(document.getSelection()?.toString()).toBe('Desc')
  })

  it('hears focus enter and leave the field as a whole, not moves between its own parts', async () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(
      <>
        <RichTextInput
          aria-label="Comment"
          defaultValue={doc(p(t('Text')))}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <input aria-label="After" />
      </>,
    )
    await vi.waitFor(() => expect(surface().getAttribute('contenteditable')).toBe('true'))
    surface().focus()
    await focused(surface())
    expect(onFocus).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Alt>}{F10}{/Alt}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Bold')
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(surface()))
    // The text style menu is drawn elsewhere in the document, and is the field's own.
    screen.getByRole('button', { name: 'Text style' }).focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(document.activeElement?.getAttribute('role')).toBe('menuitemcheckbox'),
    )
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Text style' })),
    )
    await sleep(60)
    expect(onBlur).not.toHaveBeenCalled()
    expect(onFocus).toHaveBeenCalledTimes(1)
    screen.getByRole('textbox', { name: 'After' }).focus()
    await vi.waitFor(() => expect(onBlur).toHaveBeenCalledTimes(1))
    surface().focus()
    await vi.waitFor(() => expect(onFocus).toHaveBeenCalledTimes(2))
  })

  it('keeps a later version’s blocks at either end when it takes focus at mount and the person types', async () => {
    const onChange = vi.fn()
    const callout = (words: string) => ({ type: 'callout', content: [t(words)] })
    render(
      <RichTextInput
        aria-label="Comment"
        autoFocus
        onChange={onChange}
        defaultValue={doc(callout('First'), p(t('x')), callout('Last'))}
      />,
    )
    await focused(surface())
    await userEvent.keyboard('!')
    await vi.waitFor(() =>
      expect(onChange.mock.lastCall?.[0]).toEqual(
        doc(callout('First'), p(t('x!')), callout('Last')),
      ),
    )
  })
})

describe('the form value, through changes', () => {
  it('keeps what the text shows when the app stops controlling the value', async () => {
    function Held() {
      const [value, setValue] = useState<RichTextDocument | undefined>(doc(p(t('Controlled'))))
      return (
        <>
          <RichTextInput aria-label="Comment" name="body" maxLength={50} value={value} />
          <button type="button" onClick={() => setValue(undefined)}>
            Release
          </button>
        </>
      )
    }
    render(
      <form data-testid="form">
        <Held />
      </form>,
    )
    await vi.waitFor(() => expect(surface().textContent).toBe('Controlled'))
    screen.getByRole('button', { name: 'Release' }).click()
    const root = surface().closest('[data-member="rich-text-input"]') as HTMLElement
    await vi.waitFor(() => expect(root.hasAttribute('data-empty')).toBe(false))
    expect(surface().textContent).toBe('Controlled')
    expect(
      document.getElementById(surface().getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('10 / 50')
    const data = new FormData(screen.getByTestId('form') as HTMLFormElement)
    expect(text(parseRichText(String(data.get('body'))).value)).toBe('Controlled')
  })

  it('puts the first document back when its form is reset', async () => {
    const onChange = vi.fn()
    render(
      <form data-testid="form">
        <RichTextInput
          aria-label="Comment"
          name="body"
          autoFocus
          defaultValue={doc(p(t('First')))}
          onChange={onChange}
        />
      </form>,
    )
    await focused(surface())
    await userEvent.keyboard(' edit')
    await vi.waitFor(() => expect(surface().textContent).toBe('First edit'))
    ;(screen.getByTestId('form') as HTMLFormElement).reset()
    await vi.waitFor(() => expect(surface().textContent).toBe('First'))
    expect(onChange.mock.lastCall?.[0]).toEqual(doc(p(t('First'))))
    const data = new FormData(screen.getByTestId('form') as HTMLFormElement)
    expect(text(parseRichText(String(data.get('body'))).value)).toBe('First')
  })
})

describe('the toolbar, as its content changes', () => {
  it('gives the app’s controls the toolbar’s tab index when they appear on their own', async () => {
    function Later() {
      const [shown, setShown] = useState(false)
      useEffect(() => {
        const timer = setTimeout(() => setShown(true), 30)
        return () => clearTimeout(timer)
      }, [])
      return shown ? (
        <Button variant="ghost" tone="neutral" size="sm" label="Attach" onClick={() => {}} />
      ) : null
    }
    render(<RichTextInput aria-label="Comment" toolbar={() => <Later />} />)
    const attach = await screen.findByRole('button', { name: 'Attach' })
    await vi.waitFor(() => expect(attach.tabIndex).toBe(-1))
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    expect([...toolbar.querySelectorAll('button')].filter((b) => b.tabIndex === 0)).toHaveLength(1)
  })
})

describe('a document of a later format', () => {
  const LATER = {
    format: 'polymorph-rich-text/2',
    blocks: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Written by a later version' }] },
    ],
  } as unknown as RichTextDocument

  it('is read-only, writes nothing, posts the stored JSON and submits it as it was given', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const { seen, toolbar } = capture()
    render(
      <form data-testid="form">
        <RichTextInput
          aria-label="Comment"
          name="body"
          defaultValue={LATER}
          onChange={onChange}
          onSubmit={onSubmit}
          submitLabel="Save"
          toolbar={toolbar}
        />
      </form>,
    )
    const field = surface()
    await vi.waitFor(() => expect(field.textContent).toBe('Written by a later version'))
    const root = field.closest('[data-member="rich-text-input"]') as HTMLElement
    expect(root.hasAttribute('data-readonly')).toBe(true)
    expect(field.getAttribute('aria-readonly')).toBe('true')
    expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(true)
    expect(seen.editor?.disabled).toBe(true)
    await select(field, 'later', seen)
    await userEvent.keyboard('typed{Enter}')
    expect(seen.editor?.annotate('thread-1')).toBe(false)
    seen.editor?.insertText('x')
    seen.editor?.clear()
    await sleep(60)
    expect(onChange).not.toHaveBeenCalled()
    expect(field.textContent).toBe('Written by a later version')
    const data = new FormData(screen.getByTestId('form') as HTMLFormElement)
    expect(JSON.parse(String(data.get('body')))).toEqual(LATER)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]?.[0]).toBe(LATER)
  })
})

/*
 * What the member adds to its editor, as `@polymorph/conformance/rich-text-input` states it for
 * every web shell, read through the states fixture.
 */
richTextInputLaw({ shell: 'React', adapter: reactAdapter })
