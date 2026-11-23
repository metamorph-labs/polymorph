import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import * as model from '../rich-text/index'
import { RICH_TEXT_FORMAT, RICH_TEXT_FORMATS, type RichTextDocument } from '../rich-text/types'
import * as convert from './convert'
import { createRichTextEditor } from './editor'
import type { RichTextEditor, RichTextEditorOptions } from './types'

// A spy on each export counts how often the editor reads the whole document.
vi.mock('./convert', { spy: true })
vi.mock('../rich-text/index', { spy: true })

/**
 * How often the editor reads the whole document: once per change of the
 * document, and never for a caret move, because a long document makes each
 * read cost milliseconds on every keystroke.
 */

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
  annotation: 'note',
  unknown: 'unknown',
}

const paragraphs = (count: number): RichTextDocument =>
  ({
    format: RICH_TEXT_FORMAT,
    blocks: Array.from({ length: count }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Paragraph ${index + 1} of the document.` }],
    })),
  }) as RichTextDocument

/** The whole-document readers the editor calls, and the conversion from its own document. */
const READERS = [
  convert.fromEditorDoc,
  model.normalizeRichText,
  model.parseRichText,
  model.serializeRichText,
  model.richTextEquals,
  model.isRichTextEmpty,
  model.richTextLength,
  model.richTextPlainText,
  model.restrictRichText,
] as unknown as { mock: { calls: unknown[] } }[]

const reads = () => READERS.reduce((sum, reader) => sum + reader.mock.calls.length, 0)

let editor: RichTextEditor | null = null

afterEach(() => {
  editor?.destroy()
  editor = null
  document.body.replaceChildren()
})

describe('reading the document', () => {
  it('converts the document once per keystroke and reads nothing for a caret move', async () => {
    const element = document.createElement('div')
    element.style.whiteSpace = 'pre-wrap'
    document.body.append(element)
    const changes: RichTextDocument[] = []
    editor = createRichTextEditor({
      element,
      value: paragraphs(200),
      formats: RICH_TEXT_FORMATS,
      entities: [],
      classes: CLASSES,
      editable: true,
      attributes: { role: 'textbox' },
      onChange: (value) => changes.push(value),
      onState: () => {},
    })
    const live = editor
    live.focus('end')
    await vi.waitFor(() => expect(live.getState().focused).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 30))

    vi.clearAllMocks()
    await userEvent.keyboard('x')
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    // One conversion of the edited document, and one plain-text projection for its length and
    // its emptiness. The conversion normalises the JSON it builds, once.
    expect(vi.mocked(convert.fromEditorDoc).mock.calls).toHaveLength(1)
    expect(reads()).toBeLessThanOrEqual(3)

    vi.clearAllMocks()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await vi.waitFor(() => expect(live.getState().range.start).toBeLessThan(live.getState().length))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(reads()).toBe(0)

    // A value the application passes back unchanged is not read again.
    const held = live.getValue()
    vi.clearAllMocks()
    live.setValue(held)
    live.setValue(held)
    expect(reads()).toBe(0)
  })
})
