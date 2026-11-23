import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import {
  RICH_TEXT_FORMAT,
  RICH_TEXT_FORMATS,
  type RichTextDocument,
  type RichTextFormat,
} from '../rich-text/types'
import { createRichTextEditor } from './editor'
import type {
  RichTextEditor,
  RichTextEditorEvent,
  RichTextEditorOptions,
  RichTextEditorState,
  RichTextSuggestionKey,
} from './types'

/**
 * The editor over a real element in a real browser: keys are pressed with the
 * browser's own keyboard, so the key handling, the selection and the typed
 * shortcuts are what a reader gets. Paste is a synthetic `paste` event that
 * carries a `DataTransfer`, because a test cannot write the system clipboard.
 */

/** The platform's command key, which ProseMirror's `Mod` names. */
const MOD = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? 'Meta' : 'Control'
const mod = (keys: string) => `{${MOD}>}${keys}{/${MOD}}`
const modShift = (key: string) => `{${MOD}>}{Shift>}${key}{/Shift}{/${MOD}}`
const modAlt = (key: string) => `{${MOD}>}{Alt>}${key}{/Alt}{/${MOD}}`

const CLASSES: RichTextEditorOptions['classes'] = {
  paragraph: 'p',
  heading: ['h-1', 'h-2', 'h-3'],
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li',
  blockquote: 'quote',
  codeBlock: 'pre',
  codeBlockText: 'pre-code',
  bold: 'b',
  italic: 'i',
  strike: 's',
  code: 'code',
  link: 'a',
  entity: 'entity',
  unknown: 'unknown',
}

const doc = (...blocks: unknown[]): RichTextDocument =>
  ({ format: RICH_TEXT_FORMAT, blocks }) as unknown as RichTextDocument
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const h = (level: 1 | 2 | 3, ...content: unknown[]) => ({ type: 'heading', level, content })
const t = (text: string, ...marks: string[]) =>
  marks.length
    ? { type: 'text', text, marks: marks.map((type) => ({ type })) }
    : { type: 'text', text }
const link = (text: string, href: string) => ({
  type: 'text',
  text,
  marks: [{ type: 'link', href }],
})
const br = { type: 'break' }
const ul = (...items: unknown[][]) => ({
  type: 'list',
  ordered: false,
  items: items.map((content) => ({ type: 'listItem', content })),
})
const ol = (...items: unknown[][]) => ({
  type: 'list',
  ordered: true,
  items: items.map((content) => ({ type: 'listItem', content })),
})
const quote = (...content: unknown[]) => ({ type: 'blockquote', content })
const code = (text: string, language?: string) =>
  language ? { type: 'codeBlock', language, text } : { type: 'codeBlock', text }
const ada = { type: 'entity', kind: 'user', id: 'u1', label: '@Ada Lovelace' }

interface Mounted {
  editor: RichTextEditor
  element: HTMLElement
  changes: RichTextDocument[]
  states: RichTextEditorState[]
  events: RichTextEditorEvent[]
}

const live: RichTextEditor[] = []

function mount(overrides: Partial<RichTextEditorOptions> = {}): Mounted {
  const element = overrides.element ?? document.createElement('div')
  // What the member's recipe gives the element: without it a browser types a
  // space at the end of a line as a no-break space.
  element.style.whiteSpace = 'pre-wrap'
  element.style.overflowWrap = 'break-word'
  if (!element.isConnected) document.body.append(element)
  const changes: RichTextDocument[] = []
  const states: RichTextEditorState[] = []
  const events: RichTextEditorEvent[] = []
  const editor = createRichTextEditor({
    element,
    value: doc(),
    formats: RICH_TEXT_FORMATS,
    entities: [{ kind: 'user', trigger: '@' }],
    classes: CLASSES,
    editable: true,
    attributes: { role: 'textbox', 'aria-multiline': 'true' },
    onChange: (value) => changes.push(value),
    onState: (state) => states.push(state),
    onEvent: (event) => events.push(event),
    ...overrides,
  })
  live.push(editor)
  return { editor, element, changes, states, events }
}

afterEach(() => {
  for (const editor of live.splice(0)) editor.destroy()
  document.body.replaceChildren()
})

/**
 * Focus with the caret at an end, and wait until the editor knows it has
 * focus. ProseMirror writes its selection back to the DOM 20 ms after the
 * element takes focus, and a key pressed before then can be undone by it, so
 * the helper also waits past that timer: timers run in the order they end.
 *
 * A caret the browser moves itself (an arrow key ProseMirror leaves to it) is
 * read on `selectionchange`, after the key. A test that presses a key whose
 * effect depends on where such a move left the caret waits for the state to
 * show the move first.
 */
async function focusAt(m: Mounted, at: 'start' | 'end') {
  m.editor.focus(at)
  await vi.waitFor(() => expect(m.editor.getState().focused).toBe(true))
  await new Promise((resolve) => setTimeout(resolve, 30))
}

const focusEnd = (m: Mounted) => focusAt(m, 'end')

/** The element's text nodes, each with the offset its text starts at in all of them. */
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

/** The text node and offset at `at` in the element's text. */
function pointAt(element: HTMLElement, at: number): [Text, number] {
  const nodes = textNodes(element)
  const hit = [...nodes].reverse().find((n) => n.start <= at) ?? nodes[0]
  if (!hit) throw new Error('no text')
  return [hit.node, at - hit.start]
}

/** Selects `text` where it first appears in the element, and waits until the editor has read the selection. */
async function select(m: Mounted, text: string) {
  const all = textNodes(m.element)
    .map((n) => n.node.data)
    .join('')
  const at = all.indexOf(text)
  if (at < 0) throw new Error(`no text ${text}`)
  const [startNode, startOffset] = pointAt(m.element, at)
  const [endNode, endOffset] = pointAt(m.element, at + text.length)
  document.getSelection()?.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
  await vi.waitFor(() => expect(m.editor.getState().selectedText).toBe(text))
}

/** Places the caret right after `text`. */
async function caretAfter(m: Mounted, text: string) {
  const all = textNodes(m.element)
    .map((n) => n.node.data)
    .join('')
  const at = all.indexOf(text)
  if (at < 0) throw new Error(`no text ${text}`)
  const before = m.editor.getState()
  const [node, offset] = pointAt(m.element, at + text.length)
  document.getSelection()?.collapse(node, offset)
  await vi.waitFor(() => expect(m.editor.getState()).not.toBe(before))
}

/**
 * A paste carrying `data`. The transfer is set on a plain event: Firefox gives
 * a constructed `ClipboardEvent` an empty transfer of its own in place of the
 * one passed to it, and every engine reads a property set this way.
 */
function paste(m: Mounted, data: { html?: string; text?: string; files?: File[] }) {
  const transfer = new DataTransfer()
  if (data.html !== undefined) transfer.setData('text/html', data.html)
  if (data.text !== undefined) transfer.setData('text/plain', data.text)
  for (const file of data.files ?? []) transfer.items.add(file)
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: transfer })
  m.element.dispatchEvent(event)
  return event
}

const valueOf = (m: Mounted) => () => m.editor.getValue()

describe('mounting and destroying', () => {
  it('writes the document inside the element with the recipe classes and keeps the member attributes', () => {
    const element = document.createElement('div')
    element.className = 'surface'
    element.setAttribute('data-part', 'surface')
    mount({
      element,
      value: doc(p(t('Hello ')), h(1, t('Title')), ul([p(t('one'))]), code('x = 1', 'ts')),
      attributes: { id: 'field', role: 'textbox', 'aria-label': 'Comment', tabindex: '0' },
    })
    expect(element.getAttribute('contenteditable')).toBe('true')
    expect(element.id).toBe('field')
    expect(element.getAttribute('role')).toBe('textbox')
    expect(element.getAttribute('aria-label')).toBe('Comment')
    expect(element.getAttribute('tabindex')).toBe('0')
    expect(element.classList.contains('surface')).toBe(true)
    expect(element.querySelector(':scope > p')?.className).toBe('p')
    // The document's level 1 is drawn one level under the page's title.
    expect(element.querySelector(':scope > h2')?.className).toBe('h-1')
    expect(element.querySelector(':scope > ul.ul > li.li > p.p')?.textContent).toBe('one')
    const pre = element.querySelector('pre')
    expect(pre?.className).toBe('pre')
    expect(pre?.getAttribute('data-language')).toBe('ts')
    expect(pre?.querySelector('code')?.className).toBe('pre-code')
  })

  it('draws headings from the level the member asks for, never deeper than 4', () => {
    const m = mount({ value: doc(h(1, t('a')), h(2, t('b')), h(3, t('c'))), headingLevel: 3 })
    expect(Array.from(m.element.children, (c) => c.tagName)).toEqual(['H3', 'H4', 'H4'])
  })

  it('leaves the element as it was given when destroyed', () => {
    const element = document.createElement('div')
    element.className = 'surface'
    element.setAttribute('data-part', 'surface')
    const m = mount({
      element,
      value: doc(p(t('Hello'))),
      attributes: { id: 'field', role: 'textbox' },
    })
    m.editor.destroy()
    expect(element.getAttributeNames().sort()).toEqual(['class', 'data-part', 'style'])
    expect(element.className).toBe('surface')
    expect(element.childNodes).toHaveLength(0)
    // A destroyed editor takes no call.
    m.editor.setValue(doc(p(t('Later'))))
    m.editor.insertText('x')
    expect(element.childNodes).toHaveLength(0)
  })

  it('makes the element not editable when the field is read-only', () => {
    const m = mount({ editable: false, value: doc(p(t('Read me'))) })
    expect(m.element.getAttribute('contenteditable')).toBe('false')
  })
})

describe('typing', () => {
  it('types text into the document and reports each change', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('Hello')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('Hello'))))
    expect(m.changes.at(-1)).toEqual(doc(p(t('Hello'))))
    expect(m.editor.getState()).toMatchObject({
      empty: false,
      length: 5,
      collapsed: true,
      focused: true,
    })
  })

  it('sets data-focused while focused and calls onFocus and onBlur', async () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    const m = mount({ onFocus, onBlur })
    await focusEnd(m)
    expect(m.element.hasAttribute('data-focused')).toBe(true)
    expect(onFocus).toHaveBeenCalledTimes(1)
    m.element.blur()
    await vi.waitFor(() => expect(m.editor.getState().focused).toBe(false))
    expect(m.element.hasAttribute('data-focused')).toBe(false)
    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})

describe('mark keys', () => {
  it.each([
    ['bold', mod('b')],
    ['italic', mod('i')],
    ['strike', modShift('x')],
    ['code', mod('e')],
  ] as const)('%s: the key turns the mark on at a caret and off again', async (format, key) => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard(key)
    await vi.waitFor(() => expect(m.editor.getState().active[format]).toBe(true))
    await userEvent.keyboard('word')
    await userEvent.keyboard(key)
    await userEvent.keyboard(' plain')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('word', format), t(' plain'))))
    expect(m.events).toContainEqual({ type: 'format', format, active: true })
    expect(m.events).toContainEqual({ type: 'format', format, active: false })
  })

  it('formats a selection, and removes the format only when all of the selection has it', async () => {
    const m = mount({ value: doc(p(t('one '), t('two', 'bold'), t(' three'))) })
    await focusEnd(m)
    await select(m, 'one two')
    expect(m.editor.getState().active.bold).toBe(false)
    await userEvent.keyboard(mod('b'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('one two', 'bold'), t(' three'))))
    await vi.waitFor(() => expect(m.editor.getState().active.bold).toBe(true))
    await userEvent.keyboard(mod('b'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('one two three'))))
  })

  it('takes no mark inside a code block', async () => {
    const m = mount({ value: doc(code('let x')) })
    await focusEnd(m)
    expect(m.editor.getState().can.bold).toBe(false)
    expect(m.editor.toggle('bold')).toBe(false)
    await userEvent.keyboard(mod('b'))
    await userEvent.keyboard('y')
    await expect.poll(valueOf(m)).toEqual(doc(code('let xy')))
  })

  it('keeps inline code to itself: no bold on code, and code removes bold', async () => {
    const m = mount({ value: doc(p(t('mixed'))) })
    await focusEnd(m)
    await select(m, 'mixed')
    await userEvent.keyboard(mod('b'))
    await userEvent.keyboard(mod('e'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('mixed', 'code'))))
  })
})

describe('block keys', () => {
  it.each([
    ['bulletList', modShift('8'), doc(ul([p(t('item'))]))],
    ['orderedList', modShift('7'), doc(ol([p(t('item'))]))],
    ['blockquote', modShift('9'), doc(quote(p(t('item'))))],
    ['codeBlock', modAlt('c'), doc(code('item'))],
  ] as const)('%s: the key turns the block on and off again', async (format, key, on) => {
    const m = mount({ value: doc(p(t('item'))) })
    await focusEnd(m)
    await userEvent.keyboard(key)
    await expect.poll(valueOf(m)).toEqual(on)
    await vi.waitFor(() => expect(m.editor.getState().active[format]).toBe(true))
    await userEvent.keyboard(key)
    await expect.poll(valueOf(m)).toEqual(doc(p(t('item'))))
    expect(m.events).toEqual([
      { type: 'format', format, active: true },
      { type: 'format', format, active: false },
    ])
  })

  it('sets heading levels and the paragraph with Mod-Alt and a digit', async () => {
    const m = mount({ value: doc(p(t('Title'))) })
    await focusEnd(m)
    for (const level of [1, 2, 3] as const) {
      await userEvent.keyboard(modAlt(String(level)))
      await expect.poll(valueOf(m)).toEqual(doc(h(level, t('Title'))))
      await vi.waitFor(() => expect(m.editor.getState().active.heading).toBe(level))
    }
    await userEvent.keyboard(modAlt('0'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('Title'))))
    expect(m.events).toEqual([
      { type: 'heading', level: 1 },
      { type: 'heading', level: 2 },
      { type: 'heading', level: 3 },
      { type: 'heading', level: 0 },
    ])
  })

  it('switches a list to the other kind and keeps its items', async () => {
    const m = mount({ value: doc(ul([p(t('a'))], [p(t('b'))])) })
    await focusEnd(m)
    await userEvent.keyboard(modShift('7'))
    await expect.poll(valueOf(m)).toEqual(doc(ol([p(t('a'))], [p(t('b'))])))
  })

  it('keeps a heading free of bold, italic and strike, and keeps its words in a code block', async () => {
    const m = mount({ value: doc(h(1, t('Plain'))) })
    await focusEnd(m)
    expect(m.editor.getState().can).toMatchObject({
      bold: false,
      italic: false,
      strike: false,
      code: true,
      link: true,
    })
    const withEntity = mount({ value: doc(p(t('hi '), ada)) })
    await focusEnd(withEntity)
    expect(withEntity.editor.toggle('codeBlock')).toBe(true)
    expect(withEntity.editor.getValue()).toEqual(doc(code('hi @Ada Lovelace')))
  })
})

describe('typed shortcuts', () => {
  it.each([
    ['# ', doc(h(1, t('x')))],
    ['## ', doc(h(2, t('x')))],
    ['### ', doc(h(3, t('x')))],
    ['- ', doc(ul([p(t('x'))]))],
    ['* ', doc(ul([p(t('x'))]))],
    ['1. ', doc(ol([p(t('x'))]))],
    ['> ', doc(quote(p(t('x'))))],
    ['```', doc(code('x'))],
  ] as const)('%j at the start of a block', async (typed, result) => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard(typed)
    await userEvent.keyboard('x')
    await expect.poll(valueOf(m)).toEqual(result)
  })

  it('starts a numbered list at the number typed', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('3. x')
    await expect.poll(valueOf(m)).toEqual(doc({ ...ol([p(t('x'))]), start: 3 }))
  })

  it.each([
    ['**bold**', 'bold', 'bold'],
    ['*italic*', 'italic', 'italic'],
    ['_italic_', 'italic', 'italic'],
    ['~~strike~~', 'strike', 'strike'],
    ['`code`', 'code', 'code'],
  ] as const)(
    '%s formats its text when the closing characters are typed',
    async (typed, text, mark) => {
      const m = mount()
      await focusEnd(m)
      await userEvent.keyboard(`a ${typed} b`)
      await expect.poll(valueOf(m)).toEqual(doc(p(t('a '), t(text, mark), t(' b'))))
      expect(m.events).toContainEqual({ type: 'format', format: mark, active: true })
    },
  )

  it('leaves a word with underscores alone', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('snake_case_name')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('snake_case_name'))))
  })

  it.each([
    ['# ', mod('z'), doc(h(1))],
    ['- ', mod('z'), doc(ul([p()]))],
    ['**b**', mod('z'), doc(p(t('b', 'bold')))],
    ['# ', '{Backspace}', doc(h(1))],
  ])(
    '%s: undo directly after the shortcut gives back the typed characters (%s)',
    async (typed, undo, applied) => {
      const m = mount()
      await focusEnd(m)
      await userEvent.keyboard(typed)
      await expect.poll(valueOf(m)).toEqual(applied)
      await userEvent.keyboard(undo)
      await expect.poll(valueOf(m)).toEqual(doc(p(t(typed))))
    },
  )

  it('applies no shortcut for a format the field does not allow', async () => {
    const m = mount({ formats: ['bold'] })
    await focusEnd(m)
    await userEvent.keyboard('# - *a* **b**')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('# - *a* '), t('b', 'bold'))))
  })
})

describe('lists', () => {
  it('splits an item with Enter and lifts an empty item out of the list', async () => {
    const m = mount({ value: doc(ul([p(t('one'))])) })
    await focusEnd(m)
    await userEvent.keyboard('{Enter}two')
    await expect.poll(valueOf(m)).toEqual(doc(ul([p(t('one'))], [p(t('two'))])))
    await userEvent.keyboard('{Enter}{Enter}after')
    await expect.poll(valueOf(m)).toEqual(doc(ul([p(t('one'))], [p(t('two'))]), p(t('after'))))
  })

  it('sinks an item with Tab and lifts it with Shift-Tab', async () => {
    const m = mount({ value: doc(ul([p(t('one'))], [p(t('two'))])) })
    await focusEnd(m)
    await userEvent.keyboard('{Tab}')
    await expect.poll(valueOf(m)).toEqual(doc(ul([p(t('one')), ul([p(t('two'))])])))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.poll(valueOf(m)).toEqual(doc(ul([p(t('one'))], [p(t('two'))])))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.poll(valueOf(m)).toEqual(doc(ul([p(t('one'))]), p(t('two'))))
  })

  it('leaves Tab to the browser outside a list and where an item cannot sink', async () => {
    const m = mount({ value: doc(p(t('text'))) })
    const prevented: boolean[] = []
    const record = (event: KeyboardEvent) => {
      if (event.key === 'Tab') prevented.push(event.defaultPrevented)
    }
    window.addEventListener('keydown', record)
    try {
      await focusEnd(m)
      await userEvent.keyboard('{Tab}')
      const first = mount({ value: doc(ul([p(t('first'))])) })
      await focusEnd(first)
      await userEvent.keyboard('{Tab}')
      await vi.waitFor(() => expect(prevented).toEqual([false, false]))
      expect(first.editor.getValue()).toEqual(doc(ul([p(t('first'))])))
    } finally {
      window.removeEventListener('keydown', record)
    }
  })

  it('lifts an item with Backspace at its start', async () => {
    const m = mount({ value: doc(ul([p(t('one'))], [p(t('two'))])) })
    await focusEnd(m)
    await select(m, 'two')
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(m.editor.getState().collapsed).toBe(true))
    await userEvent.keyboard('{Backspace}')
    await expect.poll(valueOf(m)).toEqual(doc(ul([p(t('one'))]), p(t('two'))))
  })
})

describe('quotes and code blocks', () => {
  it('lifts the block out of a quote with Backspace at the quote start', async () => {
    const m = mount({ value: doc(quote(p(t('said')))) })
    await focusAt(m, 'start')
    await userEvent.keyboard('{Backspace}')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('said'))))
  })

  it('takes a new line with Enter in a code block and leaves it with Enter on an empty last line', async () => {
    const m = mount({ value: doc(code('a')) })
    await focusEnd(m)
    await userEvent.keyboard('{Enter}b')
    await expect.poll(valueOf(m)).toEqual(doc(code('a\nb')))
    await userEvent.keyboard('{Enter}{Enter}after')
    await expect.poll(valueOf(m)).toEqual(doc(code('a\nb'), p(t('after'))))
  })

  it('takes a new line with Shift-Enter in a code block and a hard break in a paragraph', async () => {
    const m = mount({ value: doc(code('a'), p(t('x'))) })
    await focusEnd(m)
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}y')
    await expect.poll(valueOf(m)).toEqual(doc(code('a'), p(t('x'), br, t('y'))))
    const inCode = mount({ value: doc(code('a')) })
    await focusEnd(inCode)
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}b')
    await expect.poll(valueOf(inCode)).toEqual(doc(code('a\nb')))
  })

  it('turns a heading at the start of the document into a paragraph with Backspace', async () => {
    const m = mount({ value: doc(h(2, t('T'))) })
    await focusAt(m, 'start')
    await userEvent.keyboard('{Backspace}')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('T'))))
  })
})

describe('history', () => {
  it('undoes and redoes with the keys and the commands, and says when each applies', async () => {
    const m = mount()
    await focusEnd(m)
    expect(m.editor.getState().can).toMatchObject({ undo: false, redo: false })
    await userEvent.keyboard('one')
    await vi.waitFor(() => expect(m.editor.getState().can.undo).toBe(true))
    await userEvent.keyboard(mod('z'))
    await expect.poll(valueOf(m)).toEqual(doc())
    await vi.waitFor(() =>
      expect(m.editor.getState().can).toMatchObject({ undo: false, redo: true }),
    )
    await userEvent.keyboard(modShift('z'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('one'))))
    expect(m.editor.undo()).toBe(true)
    expect(m.editor.getValue()).toEqual(doc())
    await userEvent.keyboard(mod('y'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('one'))))
    expect(m.editor.redo()).toBe(false)
    expect(m.events.filter((e) => e.type === 'undo' || e.type === 'redo')).toEqual([
      { type: 'undo' },
      { type: 'redo' },
      { type: 'undo' },
      { type: 'redo' },
    ])
  })

  it("restores a cleared document with undo, as a reader's own act", async () => {
    const m = mount({ value: doc(p(t('keep'))) })
    m.editor.clear()
    expect(m.editor.getValue()).toEqual(doc())
    expect(m.changes).toEqual([doc()])
    expect(m.editor.undo()).toBe(true)
    expect(m.editor.getValue()).toEqual(doc(p(t('keep'))))
  })
})

describe('links', () => {
  it('links a selection to a safe target and refuses an unsafe one', async () => {
    const m = mount({ value: doc(p(t('see the docs'))) })
    await focusEnd(m)
    await select(m, 'docs')
    expect(m.editor.setLink('javascript:alert(1)')).toBe(false)
    expect(m.editor.setLink('//evil.example')).toBe(false)
    expect(m.editor.getValue()).toEqual(doc(p(t('see the docs'))))
    expect(m.editor.setLink('example.com/docs')).toBe(true)
    expect(m.editor.getValue()).toEqual(
      doc(p(t('see the '), link('docs', 'https://example.com/docs'))),
    )
    await vi.waitFor(() => expect(m.editor.getState().active.link).toBe('https://example.com/docs'))
    expect(m.element.querySelector('a')?.getAttribute('href')).toBe('https://example.com/docs')
    expect(m.element.querySelector('a')?.className).toBe('a')
    expect(m.events).toEqual([{ type: 'link', active: true }])
  })

  it('removes the link the caret is in with null', async () => {
    const m = mount({ value: doc(p(t('a '), link('site', 'https://a.example'), t(' b'))) })
    await focusEnd(m)
    await caretAfter(m, 'si')
    await vi.waitFor(() => expect(m.editor.getState().active.link).toBe('https://a.example'))
    expect(m.editor.setLink(null)).toBe(true)
    expect(m.editor.getValue()).toEqual(doc(p(t('a site b'))))
    expect(m.events).toEqual([{ type: 'link', active: false }])
  })

  it('inserts the typed target as linked text at a caret outside a link, and text typed after it is plain', async () => {
    const m = mount({ value: doc(p(t('go '))) })
    await focusEnd(m)
    expect(m.editor.setLink('example.com')).toBe(true)
    await userEvent.keyboard(' now')
    await expect
      .poll(valueOf(m))
      .toEqual(doc(p(t('go '), link('example.com', 'https://example.com'), t(' now'))))
  })

  it('links a selection when a single URL is pasted over it', async () => {
    const m = mount({ value: doc(p(t('read this'))) })
    await focusEnd(m)
    await select(m, 'this')
    const event = paste(m, { text: 'https://example.com/page' })
    expect(event.defaultPrevented).toBe(true)
    expect(m.editor.getValue()).toEqual(
      doc(p(t('read '), link('this', 'https://example.com/page'))),
    )
  })

  it('asks the member for its link form with Mod-K', async () => {
    const onLinkRequest = vi.fn()
    const m = mount({ onLinkRequest })
    await focusEnd(m)
    await userEvent.keyboard(mod('k'))
    await vi.waitFor(() => expect(onLinkRequest).toHaveBeenCalledTimes(1))
  })

  it('does not follow a link clicked inside the field', async () => {
    const m = mount({ value: doc(p(link('site', 'https://a.example'))) })
    const anchor = m.element.querySelector('a') as HTMLAnchorElement
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })
})

describe('paste', () => {
  it('reads rich HTML through the schema only', async () => {
    const m = mount()
    await focusEnd(m)
    paste(m, {
      html: [
        '<style>p { color: red }</style>',
        '<script>window.pwned = true</script>',
        '<h1 class="big" id="top" onclick="alert(1)">Title</h1>',
        '<p>A <b>bold</b>, <i>italic</i>, <del>gone</del>, <code>x</code> and ',
        '<a href="javascript:alert(1)">bad</a> and <a href="https://ok.example" onclick="x()">good</a>',
        '<img src="x.png" onerror="alert(1)"></p>',
        '<h5>Deep</h5>',
        '<custom-thing><span><blink>nested</blink></span></custom-thing>',
        '<ul><li>one</li><li>two</li></ul>',
        '<blockquote><p>q</p></blockquote>',
        '<pre data-language="js">a\n  b</pre>',
        '<div>block</div>',
      ].join(''),
      text: 'ignored',
    })
    await expect
      .poll(valueOf(m))
      .toEqual(
        doc(
          h(1, t('Title')),
          p(
            t('A '),
            t('bold', 'bold'),
            t(', '),
            t('italic', 'italic'),
            t(', '),
            t('gone', 'strike'),
            t(', '),
            t('x', 'code'),
            t(' and bad and '),
            link('good', 'https://ok.example'),
          ),
          h(3, t('Deep')),
          p(t('nested')),
          ul([p(t('one'))], [p(t('two'))]),
          quote(p(t('q'))),
          code('a\n  b', 'js'),
          p(t('block')),
        ),
      )
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined()
    expect(
      m.element.querySelector('style, script, img, [onclick], [id="top"], .big, custom-thing'),
    ).toBeNull()
  })

  it('reads plain text as paragraphs and hard breaks', async () => {
    const m = mount()
    await focusEnd(m)
    paste(m, { text: 'first\nline\n\nsecond' })
    await expect.poll(valueOf(m)).toEqual(doc(p(t('first'), br, t('line')), p(t('second'))))
  })

  it("pastes text as the code block's text inside a code block", async () => {
    const m = mount({ value: doc(code('x')) })
    await focusEnd(m)
    paste(m, { html: '<p><b>a</b></p><p>b</p>', text: 'a\n\nb' })
    await expect.poll(valueOf(m)).toEqual(doc(code('xa\n\nb')))
  })

  it('hands pasted files to the member and inserts nothing', async () => {
    const onFiles = vi.fn()
    const m = mount({ onFiles })
    await focusEnd(m)
    const file = new File(['png'], 'shot.png', { type: 'image/png' })
    const event = paste(m, { files: [file] })
    expect(event.defaultPrevented).toBe(true)
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect((onFiles.mock.calls[0]?.[0] as File[])[0]?.name).toBe('shot.png')
    expect(m.editor.getValue()).toEqual(doc())
  })

  it('hands dropped files to the member and inserts nothing', async () => {
    const onFiles = vi.fn()
    const m = mount({ onFiles, value: doc(p(t('x'))) })
    const transfer = new DataTransfer()
    transfer.items.add(new File(['png'], 'drop.png', { type: 'image/png' }))
    const rect = m.element.getBoundingClientRect()
    const drop = new DragEvent('drop', {
      dataTransfer: transfer,
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 2,
      clientY: rect.top + 2,
    })
    m.element.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(m.editor.getValue()).toEqual(doc(p(t('x'))))
  })

  it('reads a format the field does not allow as its text', async () => {
    const m = mount({ formats: ['bold', 'link'] })
    await focusEnd(m)
    paste(m, {
      html: '<h2>Head</h2><ul><li>one</li></ul><blockquote>q</blockquote><pre>a\nb</pre><p><i>it</i> <b>b</b></p>',
    })
    await expect
      .poll(valueOf(m))
      .toEqual(
        doc(
          p(t('Head')),
          p(t('one')),
          p(t('q')),
          p(t('a'), br, t('b')),
          p(t('it '), t('b', 'bold')),
        ),
      )
  })

  it('keeps a pasted entity of a kind the field suggests, and reads another as its label', async () => {
    const m = mount()
    await focusEnd(m)
    paste(m, {
      html: '<p><span data-entity-kind="user" data-entity-id="u1">@Ada Lovelace</span> <span data-entity-kind="team" data-entity-id="t1">#core</span></p>',
    })
    await expect.poll(valueOf(m)).toEqual(doc(p(ada, t(' #core'))))
  })
})

describe('entities', () => {
  it('opens a suggestion for a trigger at the start of a word, and not inside one', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('mail ada@example.com ')
    expect(m.editor.getState().suggestion).toBeNull()
    expect(m.states.some((s) => s.suggestion !== null)).toBe(false)
    await userEvent.keyboard('@ad')
    await vi.waitFor(() =>
      expect(m.editor.getState().suggestion).toMatchObject({
        kind: 'user',
        trigger: '@',
        query: 'ad',
      }),
    )
    const first = m.editor.getState().suggestion!
    expect(first.rect.bottom).toBeGreaterThan(first.rect.top)
    await userEvent.keyboard('a')
    await vi.waitFor(() => expect(m.editor.getState().suggestion?.query).toBe('ada'))
    expect(m.editor.getState().suggestion?.key).toBe(first.key)
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(m.editor.getState().suggestion).toBeNull())
    await userEvent.keyboard('@b')
    await vi.waitFor(() => expect(m.editor.getState().suggestion?.query).toBe('b'))
    expect(m.editor.getState().suggestion?.key).not.toBe(first.key)
  })

  it('opens at the start of a block and after a hard break', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('@')
    await vi.waitFor(() => expect(m.editor.getState().suggestion?.query).toBe(''))
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}@x')
    await vi.waitFor(() => expect(m.editor.getState().suggestion?.query).toBe('x'))
  })

  it('keeps a dismissed suggestion closed while the caret stays in that token', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('@ad')
    await vi.waitFor(() => expect(m.editor.getState().suggestion).not.toBeNull())
    m.editor.dismissSuggestion()
    await vi.waitFor(() => expect(m.editor.getState().suggestion).toBeNull())
    await userEvent.keyboard('a')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('@ada'))))
    expect(m.editor.getState().suggestion).toBeNull()
  })

  it('offers the five keys to the member only while the suggestion is open', async () => {
    const offered: RichTextSuggestionKey[] = []
    const m = mount({
      onSuggestionKey: (key) => {
        offered.push(key)
        return key !== 'Escape'
      },
    })
    await focusEnd(m)
    await userEvent.keyboard('{ArrowDown}x{Enter}')
    expect(offered).toEqual([])
    await userEvent.keyboard('@a')
    await vi.waitFor(() => expect(m.editor.getState().suggestion).not.toBeNull())
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}{Tab}{Escape}')
    await vi.waitFor(() =>
      expect(offered).toEqual(['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape']),
    )
    // The member took Enter and Tab, so neither split the block nor moved focus.
    expect(m.editor.getValue()).toEqual(doc(p(t('x')), p(t('@a'))))
  })

  it('replaces the open token with the entity and a space, and announces it', async () => {
    const m = mount()
    await focusEnd(m)
    await userEvent.keyboard('hi @ad')
    await vi.waitFor(() => expect(m.editor.getState().suggestion).not.toBeNull())
    m.editor.insertEntity({ kind: 'user', id: 'u1', label: '@Ada Lovelace' })
    expect(m.editor.getValue()).toEqual(doc(p(t('hi '), ada, t(' '))))
    expect(m.events).toContainEqual({ type: 'entity', entity: ada })
    await vi.waitFor(() => expect(m.editor.getState().suggestion).toBeNull())
    await userEvent.keyboard('there')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('hi '), ada, t(' there'))))
    const span = m.element.querySelector('span.entity')
    expect(span?.getAttribute('data-entity-kind')).toBe('user')
    expect(span?.getAttribute('data-entity-id')).toBe('u1')
    expect(span?.getAttribute('contenteditable')).toBe('false')
  })

  it('inserts an entity at the selection when no token is open', () => {
    const m = mount({ value: doc(p(t('to '))) })
    m.editor.focus('end')
    m.editor.insertEntity({ kind: 'user', id: 'u1', label: '@Ada Lovelace' })
    expect(m.editor.getValue()).toEqual(doc(p(t('to '), ada, t(' '))))
  })

  it('steps over an entity with an arrow key and removes it whole with Backspace', async () => {
    const m = mount({ value: doc(p(t('a'), ada, t('b'))) })
    await focusEnd(m)
    await select(m, 'b')
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(m.editor.getState().collapsed).toBe(true))
    await userEvent.keyboard('{ArrowLeft}x')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('ax'), ada, t('b'))))
    await userEvent.keyboard('{ArrowRight}{Backspace}')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('axb'))))
  })

  it('marks a selected entity with data-selected', async () => {
    const m = mount({ value: doc(p(t('a'), ada, t('b'))) })
    await focusEnd(m)
    const span = m.element.querySelector('span.entity') as HTMLElement
    await userEvent.click(span)
    await vi.waitFor(() =>
      expect(m.element.querySelector('span.entity')?.hasAttribute('data-selected')).toBe(true),
    )
    await userEvent.keyboard('{Backspace}')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('ab'))))
  })
})

describe('formats', () => {
  it('restricts a value to the formats the field allows', () => {
    const m = mount({
      formats: ['italic'],
      value: doc(h(1, t('T', 'bold')), ul([p(t('i', 'italic'))]), quote(p(t('q'))), code('a\nb')),
    })
    expect(m.editor.getValue()).toEqual(
      doc(p(t('T')), p(t('i', 'italic')), p(t('q')), p(t('a'), br, t('b'))),
    )
  })

  it('does nothing for a key whose format is not allowed', async () => {
    const m = mount({ formats: ['italic'], value: doc(p(t('word'))) })
    await focusEnd(m)
    await select(m, 'word')
    await userEvent.keyboard(mod('b'))
    await userEvent.keyboard(modShift('8'))
    await userEvent.keyboard(modAlt('1'))
    await userEvent.keyboard(mod('i'))
    await expect.poll(valueOf(m)).toEqual(doc(p(t('word', 'italic'))))
    expect(m.element.querySelector('b, strong, ul, h2')).toBeNull()
    expect(m.editor.toggle('bold')).toBe(false)
    expect(m.editor.setHeading(1)).toBe(false)
    expect(m.editor.setLink('https://a.example')).toBe(false)
    expect(m.editor.getState().can).toMatchObject({
      bold: false,
      heading: false,
      link: false,
      italic: true,
    })
  })

  it('rebuilds from the current document when the formats change', async () => {
    const m = mount({ value: doc(h(1, t('T')), p(t('b', 'bold'))) })
    m.editor.update({ formats: ['bold'] })
    expect(m.editor.getValue()).toEqual(doc(p(t('T')), p(t('b', 'bold'))))
    expect(m.element.querySelector('h2')).toBeNull()
    expect(m.changes).toEqual([])
    expect(m.editor.toggle('bulletList')).toBe(false)
  })
})

describe('nesting', () => {
  /** Eight lists, one inside another: as deep as the model keeps. The innermost has two items. */
  const deepest = () => {
    let list = ul([p(t('a'))], [p(t('b'))])
    for (let depth = 1; depth < 8; depth++) list = ul([p(t('x')), list])
    return doc(list)
  }

  it('nests no deeper than the model keeps', async () => {
    const value = deepest()
    const m = mount({ value })
    expect(m.editor.getValue()).toEqual(value)
    await focusEnd(m)
    await userEvent.keyboard('{Tab}')
    expect(m.editor.getValue()).toEqual(value)
    expect(m.editor.toggle('blockquote')).toBe(false)
    expect(m.editor.toggle('orderedList')).toBe(true)
    expect(m.editor.getValue()).not.toEqual(value)
    expect(m.editor.undo()).toBe(true)
    expect(m.editor.getValue()).toEqual(value)
  })
})

describe('controlled use', () => {
  it('replaces the document with no change event and no undo step', async () => {
    const m = mount({ value: doc(p(t('one'))) })
    await focusEnd(m)
    await userEvent.keyboard(' two')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('one two'))))
    const changes = m.changes.length
    m.editor.setValue(doc(p(t('one two')), p(t('three'))))
    expect(m.editor.getValue()).toEqual(doc(p(t('one two')), p(t('three'))))
    expect(m.changes).toHaveLength(changes)
    expect(m.events).toEqual([])
    // The caret stays where it was, after "two".
    await userEvent.keyboard('!')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('one two!')), p(t('three'))))
    // Undoing everything the reader did keeps what setValue wrote.
    while (m.editor.undo()) {
      // Each call undoes one step.
    }
    expect(m.editor.getValue()).toEqual(doc(p(t('one')), p(t('three'))))
  })

  it('does nothing for a document equal to the current one', () => {
    const m = mount({ value: doc(p(t('same'))) })
    const states = m.states.length
    m.editor.setValue({
      format: RICH_TEXT_FORMAT,
      blocks: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'sa' },
            { type: 'text', text: 'me' },
          ],
        },
      ],
    } as RichTextDocument)
    expect(m.states).toHaveLength(states)
    expect(m.changes).toEqual([])
  })

  it('compares a value as the editor would give it back, so a value the schema reads differently is set once', () => {
    // A heading holds no bold here, so the editor gives this value back without it.
    const value = doc(h(1, t('Bold title', 'bold')))
    const m = mount({ value })
    expect(m.editor.getValue()).toEqual(doc(h(1, t('Bold title'))))
    const states = m.states.length
    m.editor.setValue(value)
    m.editor.setValue(value)
    expect(m.states).toHaveLength(states)
    expect(m.changes).toEqual([])
    expect(m.editor.getValue()).toEqual(doc(h(1, t('Bold title'))))
  })

  it('restricts a value set later to the allowed formats', () => {
    const m = mount({ formats: ['bold'] })
    m.editor.setValue(doc(h(2, t('x', 'italic'))))
    expect(m.editor.getValue()).toEqual(doc(p(t('x'))))
  })
})

describe('update', () => {
  it('changes editable, attributes and the placeholder without remounting', async () => {
    const m = mount({
      placeholder: 'Write a comment',
      attributes: { role: 'textbox', 'aria-label': 'Comment' },
    })
    const first = m.element.firstElementChild
    expect(first?.getAttribute('data-placeholder')).toBe('Write a comment')
    m.editor.update({
      editable: false,
      attributes: { role: 'textbox', 'aria-label': undefined, 'aria-readonly': 'true' },
      placeholder: 'Read only',
    })
    expect(m.element.getAttribute('contenteditable')).toBe('false')
    expect(m.element.hasAttribute('aria-label')).toBe(false)
    expect(m.element.getAttribute('aria-readonly')).toBe('true')
    expect(m.element.firstElementChild?.getAttribute('data-placeholder')).toBe('Read only')
    m.editor.update({ editable: true, placeholder: undefined })
    expect(m.element.getAttribute('contenteditable')).toBe('true')
    expect(m.element.firstElementChild?.hasAttribute('data-placeholder')).toBe(false)
    // The attributes stay on the element across edits.
    await focusEnd(m)
    await userEvent.keyboard('x')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('x'))))
    expect(m.element.getAttribute('aria-readonly')).toBe('true')
  })

  it('draws the placeholder only while the document is empty', async () => {
    const m = mount({ placeholder: 'Write' })
    await focusEnd(m)
    await userEvent.keyboard('a')
    await vi.waitFor(() => expect(m.element.querySelector('[data-placeholder]')).toBeNull())
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(m.element.querySelector('[data-placeholder]')).not.toBeNull())
  })

  it('swaps a callback in place', async () => {
    const onChange = vi.fn()
    const m = mount()
    m.editor.update({ onChange })
    m.editor.insertText('x')
    expect(onChange).toHaveBeenCalledWith(doc(p(t('x'))))
    expect(m.changes).toEqual([])
  })

  it('calls onSubmit for Mod-Enter only when the member gave one', async () => {
    const onSubmit = vi.fn()
    const m = mount({ value: doc(p(t('x'))) })
    await focusEnd(m)
    await userEvent.keyboard(mod('{Enter}'))
    m.editor.update({ onSubmit })
    await userEvent.keyboard(mod('{Enter}'))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it("refuses the browser's own formatting commands", () => {
    const m = mount({ value: doc(p(t('x'))) })
    const event = new InputEvent('beforeinput', {
      inputType: 'formatUnderline',
      bubbles: true,
      cancelable: true,
    })
    m.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('state', () => {
  it('reports emptiness, length, the selection and what is active', async () => {
    const m = mount({ value: doc(p(t('  '))) })
    expect(m.editor.getState()).toMatchObject({ empty: true, length: 2 })
    m.editor.setValue(doc(p(t('héllo 😀')), ul([p(t('bold', 'bold'))])))
    expect(m.editor.getState()).toMatchObject({ empty: false, length: 11 })
    await focusEnd(m)
    await select(m, 'bold')
    expect(m.editor.getState()).toMatchObject({
      collapsed: false,
      selectedText: 'bold',
      active: {
        bold: true,
        bulletList: true,
        orderedList: false,
        heading: 0,
        link: null,
        codeBlock: false,
      },
    })
  })

  it('counts an entity as content', () => {
    const m = mount({ value: doc(p(ada)) })
    expect(m.editor.getState()).toMatchObject({ empty: false, length: '@Ada Lovelace'.length })
  })

  it('calls onState only when something it holds changed', async () => {
    const m = mount({ value: doc(p(t('x'))) })
    await focusEnd(m)
    const count = m.states.length
    m.editor.dismissSuggestion()
    m.editor.update({})
    expect(m.states).toHaveLength(count)
  })
})

describe('what this version does not know', () => {
  it('carries unknown nodes, marks and fields through an unrelated edit', async () => {
    const value = {
      format: RICH_TEXT_FORMAT,
      blocks: [
        { type: 'callout', tone: 'warning', content: [{ type: 'text', text: 'Careful' }] },
        {
          type: 'paragraph',
          align: 'center',
          content: [
            { type: 'text', text: 'Hi ', marks: [{ type: 'highlight', colour: 'yellow' }] },
            { type: 'emoji', name: 'wave', text: '👋' },
            { type: 'text', text: ' there', lang: 'en' },
          ],
        },
      ],
    } as unknown as RichTextDocument
    const m = mount({ value })
    expect(m.element.querySelector('div.unknown')?.textContent).toBe('Careful')
    expect(m.element.querySelector('div.unknown')?.getAttribute('contenteditable')).toBe('false')
    expect(m.element.querySelector('span.unknown')?.textContent).toBe('👋')
    await focusEnd(m)
    await userEvent.keyboard('!')
    await expect.poll(valueOf(m)).toEqual({
      format: RICH_TEXT_FORMAT,
      blocks: [
        { type: 'callout', content: [{ type: 'text', text: 'Careful' }], tone: 'warning' },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi ', marks: [{ type: 'highlight', colour: 'yellow' }] },
            { type: 'emoji', name: 'wave', text: '👋' },
            { type: 'text', text: ' there!', lang: 'en' },
          ],
          align: 'center',
        },
      ],
    })
    expect(m.editor.getValue()).toEqual(m.changes.at(-1))
  })

  it('gives back the document it was given, unchanged, for every known node and mark', () => {
    const value = doc(
      h(2, t('Title '), t('code', 'code'), t(' '), link('l', 'https://l.example')),
      p(t('a', 'bold', 'italic', 'strike'), br, ada, t(' '), {
        type: 'text',
        text: 'both',
        marks: [{ type: 'link', href: '/x' }, { type: 'code' }],
      }),
      { ...ol([p(t('one')), ul([p(t('nested'))])], [p(t('two')), quote(p(t('q')))]), start: 4 },
      quote(code('x', 'py'), p(t('after'))),
    )
    const m = mount({ value })
    expect(m.editor.getValue()).toEqual(value)
  })
})

/**
 * An input method writes its text into the DOM between `compositionstart`
 * and `compositionend`, with keys marked `isComposing`. The browser's own
 * keyboard here has no input method, so the test writes the text as one does.
 */
function composeText(m: Mounted, text: string) {
  const walker = document.createTreeWalker(m.element, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node as Text
  if (!last) throw new Error('no text to compose after')
  last.data += text
  document.getSelection()?.collapse(last, last.data.length)
  m.element.dispatchEvent(
    new InputEvent('input', {
      inputType: 'insertCompositionText',
      data: text,
      isComposing: true,
      bubbles: true,
    }),
  )
}

function composingKey(m: Mounted, key: string) {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: MOD === 'Meta',
    ctrlKey: MOD === 'Control',
    isComposing: true,
    bubbles: true,
    cancelable: true,
  })
  m.element.dispatchEvent(event)
  return event
}

describe('composition', () => {
  it('takes no key, fires no shortcut and opens no suggestion while an input method composes', async () => {
    const m = mount({ value: doc(p(t('hi'))) })
    await focusEnd(m)
    m.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    const key = composingKey(m, 'b')
    expect(key.defaultPrevented).toBe(false)
    expect(m.editor.getState().active.bold).toBe(false)
    composeText(m, ' @a')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('hi @a'))))
    expect(m.states.some((s) => s.suggestion !== null)).toBe(false)
    m.element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' @a' }))
    await vi.waitFor(() => expect(m.editor.getState().suggestion?.query).toBe('a'))
  })

  it('applies no typed shortcut while an input method composes', async () => {
    const m = mount({ value: doc(p(t('a'))) })
    await focusEnd(m)
    m.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    composeText(m, ' **b**')
    await expect.poll(valueOf(m)).toEqual(doc(p(t('a **b**'))))
    m.element.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: ' **b**' }),
    )
  })

  it('holds a value set while an input method composes until it ends', async () => {
    const m = mount({ value: doc(p(t('a'))) })
    await focusEnd(m)
    m.element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    m.editor.setValue(doc(p(t('replaced'))))
    expect(m.editor.getValue()).toEqual(doc(p(t('a'))))
    m.element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))
    await vi.waitFor(() => expect(m.editor.getValue()).toEqual(doc(p(t('replaced')))))
  })
})

describe('commands', () => {
  it('inserts text with its line breaks as hard breaks, and as new lines in a code block', () => {
    const m = mount({ value: doc(p(t('a'))) })
    m.editor.focus('end')
    m.editor.insertText('b\nc')
    expect(m.editor.getValue()).toEqual(doc(p(t('ab'), br, t('c'))))
    const inCode = mount({ value: doc(code('a')) })
    inCode.editor.focus('end')
    inCode.editor.insertText('\nb')
    expect(inCode.editor.getValue()).toEqual(doc(code('a\nb')))
  })

  it.each(
    RICH_TEXT_FORMATS.filter(
      (f): f is Exclude<RichTextFormat, 'link' | 'heading'> => f !== 'link' && f !== 'heading',
    ),
  )('toggle(%s) turns the format on and announces it', (format) => {
    const m = mount({ value: doc(p(t('x'))) })
    m.editor.focus('end')
    const isMark =
      format === 'bold' || format === 'italic' || format === 'strike' || format === 'code'
    if (isMark) m.editor.focus('start')
    expect(m.editor.toggle(format)).toBe(true)
    expect(m.editor.getState().active[format]).toBe(true)
    expect(m.events).toEqual([{ type: 'format', format, active: true }])
  })
})
