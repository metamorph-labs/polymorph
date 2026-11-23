import { describe, expect, it } from 'vitest'

import {
  emptyRichText,
  isRichTextBlockKnown,
  isRichTextInlineKnown,
  isRichTextMarkKnown,
  migrateRichText,
  normalizeRichText,
  parseRichText,
  RICH_TEXT_FORMAT,
  RICH_TEXT_MAX_DEPTH,
  richTextEquals,
  type RichTextDocument,
  type RichTextFaultCode,
  serializeRichText,
} from './src/rich-text/index'
import { migrateRichTextWith, RICH_TEXT_VERSION, richTextFormatName } from './src/rich-text/migrate'
import { OPAQUE_MAX_DEPTH } from './src/rich-text/read'

/**
 * The rich-text reader: what `parseRichText` makes of any JSON, the normal
 * form it returns, and its faults. It lives at the package root, not in
 * `src/`, because `src/**` is the engine's browser project and the document
 * model reads no document object: these run in node, where a server reads
 * documents.
 */

const doc = (...blocks: unknown[]) => ({ format: RICH_TEXT_FORMAT, blocks })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }
const bold = { type: 'bold' }
const italic = { type: 'italic' }
const strike = { type: 'strike' }
const code = { type: 'code' }
const link = (href: string) => ({ type: 'link', href })
const quote = (...content: unknown[]) => ({ type: 'blockquote', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })

const codes = (input: unknown): RichTextFaultCode[] =>
  parseRichText(input).faults.map((fault) => fault.code)

/** Every node, mark and optional field this version writes, in normal form. */
const WRITTEN: RichTextDocument = {
  format: RICH_TEXT_FORMAT,
  blocks: [
    { type: 'heading', level: 1, content: [{ type: 'text', text: 'Release notes' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Thanks ' },
        { type: 'entity', kind: 'user', id: 'u_1', label: '@Ada Lovelace' },
        { type: 'text', text: ' for ' },
        {
          type: 'text',
          text: 'the fix',
          marks: [{ type: 'link', href: 'https://a.example/1' }, { type: 'bold' }],
        },
        { type: 'break' },
        { type: 'text', text: 'see ', marks: [{ type: 'italic' }, { type: 'strike' }] },
        { type: 'text', text: 'retry()', marks: [{ type: 'code' }] },
      ],
    },
    { type: 'heading', level: 2, content: [] },
    {
      type: 'list',
      ordered: true,
      start: 3,
      items: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
            {
              type: 'list',
              ordered: false,
              items: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
                },
              ],
            },
          ],
        },
        { type: 'listItem', content: [{ type: 'paragraph', content: [] }] },
      ],
    },
    {
      type: 'blockquote',
      content: [
        { type: 'heading', level: 3, content: [{ type: 'text', text: 'Quoted' }] },
        { type: 'codeBlock', language: 'ts', text: 'const a = 1\n\nconst b = 2' },
      ],
    },
    { type: 'codeBlock', text: '' },
    { type: 'paragraph', content: [] },
  ],
}

describe('a document this version wrote', () => {
  it('reads with no faults and comes back unchanged', () => {
    const { value, faults } = parseRichText(WRITTEN)
    expect(faults).toEqual([])
    expect(value).toEqual(WRITTEN)
    // The keys are already in the order the reader writes them.
    expect(serializeRichText(WRITTEN)).toBe(JSON.stringify(WRITTEN))
  })

  it('round-trips through its string', () => {
    const stored = serializeRichText(WRITTEN)
    const read = parseRichText(stored)
    expect(read.faults).toEqual([])
    expect(read.value).toEqual(WRITTEN)
    expect(serializeRichText(read.value)).toBe(stored)
  })

  it('is a new object, not the input', () => {
    const read = normalizeRichText(WRITTEN)
    expect(read).not.toBe(WRITTEN)
    expect(read.blocks[0]).not.toBe(WRITTEN.blocks[0])
  })

  it('is the empty document when it has no blocks', () => {
    expect(emptyRichText()).toEqual({ format: 'polymorph-rich-text/1', blocks: [] })
    expect(emptyRichText()).not.toBe(emptyRichText())
    expect(parseRichText(emptyRichText())).toEqual({ value: emptyRichText(), faults: [] })
  })
})

describe('the normal form', () => {
  it('merges neighbouring text with the same marks and drops empty text', () => {
    expect(
      normalizeRichText(doc(p(t('a'), t(''), t('b'), t('c', bold), t('d', bold), t('e')))).blocks,
    ).toEqual([p(t('ab'), t('cd', bold), t('e'))])
  })

  it('writes marks in one order, each once, and omits an empty list of marks', () => {
    const read = normalizeRichText(
      doc(p(t('a', code, bold, link('/x'), italic, bold, strike), t('b'))),
    )
    expect(read.blocks).toEqual([p(t('a', link('/x'), bold, italic, strike, code), t('b'))])
    expect(normalizeRichText(doc(p({ type: 'text', text: 'x', marks: [] }))).blocks).toEqual([
      p(t('x')),
    ])
  })

  it('merges runs whose marks differed only in order', () => {
    expect(normalizeRichText(doc(p(t('a', bold, italic), t('b', italic, bold)))).blocks).toEqual([
      p(t('ab', bold, italic)),
    ])
  })

  it('omits a start of 1, and a start on a bulleted list', () => {
    const list = (ordered: boolean, start?: number) => ({
      type: 'list',
      ordered,
      ...(start === undefined ? {} : { start }),
      items: [item(p(t('x')))],
    })
    expect(normalizeRichText(doc(list(true, 1))).blocks[0]).toEqual(list(true))
    expect(normalizeRichText(doc(list(true, 0))).blocks[0]).toEqual(list(true, 0))
    expect(normalizeRichText(doc(list(true, 12))).blocks[0]).toEqual(list(true, 12))
    expect(normalizeRichText(doc(list(false, 4))).blocks[0]).toEqual(list(false))
  })

  it('omits an empty language', () => {
    expect(normalizeRichText(doc({ type: 'codeBlock', language: '', text: 'x' })).blocks).toEqual([
      { type: 'codeBlock', text: 'x' },
    ])
  })

  it('starts every list item with a paragraph', () => {
    const heading = { type: 'heading', level: 2, content: [t('h')] }
    const list = { type: 'list', ordered: false, items: [item(heading), item()] }
    expect(normalizeRichText(doc(list)).blocks).toEqual([
      { type: 'list', ordered: false, items: [item(p(), heading), item(p())] },
    ])
    expect(codes(doc(list))).toEqual([])
  })

  it('drops a list with no items and a quote with no blocks', () => {
    const read = parseRichText(
      doc({ type: 'list', ordered: true, items: [] }, quote(), quote(quote()), p(t('kept'))),
    )
    expect(read.value.blocks).toEqual([p(t('kept'))])
    expect(read.faults).toEqual([])
  })

  it('removes a link whose target is unsafe and keeps its text, joined to its neighbours', () => {
    const read = parseRichText(doc(p(t('a '), t('click', link('javascript:alert(1)')), t(' b'))))
    expect(read.value.blocks).toEqual([p(t('a click b'))])
    expect(read.faults).toEqual([
      {
        code: 'unsafe-link',
        path: ['blocks', 0, 'content', 1, 'marks', 0],
        message:
          'A link to "javascript:alert(1)" may not be followed. The link is removed and its text kept.',
      },
    ])
  })

  it('keeps the cleaned target of a safe link', () => {
    expect(normalizeRichText(doc(p(t('a', link('  https://a.example/x\n'))))).blocks).toEqual([
      p(t('a', link('https://a.example/x'))),
    ])
  })

  it('writes keys in one order, so equal documents serialize equally', () => {
    const scrambled = {
      blocks: [
        {
          content: [{ marks: [{ href: '/x', type: 'link' }], text: 'a', type: 'text' }],
          type: 'paragraph',
        },
        { text: 'x', language: 'ts', type: 'codeBlock' },
        {
          items: [{ content: [{ content: [], type: 'paragraph' }], type: 'listItem' }],
          start: 2,
          ordered: true,
          type: 'list',
        },
      ],
      format: RICH_TEXT_FORMAT,
    }
    expect(serializeRichText(scrambled)).toBe(
      JSON.stringify(
        doc(
          p(t('a', link('/x'))),
          { type: 'codeBlock', language: 'ts', text: 'x' },
          { type: 'list', ordered: true, start: 2, items: [item(p())] },
        ),
      ),
    )
  })

  it('is stable: reading the normal form again changes nothing', () => {
    const messy = doc(
      p(t('a'), t('b', bold), t('', italic), t('c', bold)),
      { type: 'list', ordered: true, start: 1, items: [item(quote(p(t('q'))))] },
      quote(),
      { type: 'codeBlock', language: '', text: 'x' },
    )
    const once = parseRichText(messy)
    const twice = parseRichText(once.value)
    expect(twice.faults).toEqual([])
    expect(twice.value).toEqual(once.value)
    expect(serializeRichText(serializeRichText(messy))).toBe(serializeRichText(messy))
  })

  it('tells documents apart by their normal forms', () => {
    expect(richTextEquals(doc(p(t('a'), t('b'))), JSON.stringify(doc(p(t('ab')))))).toBe(true)
    expect(richTextEquals(doc(p(t('ab'))), doc(p(t('ab', bold))))).toBe(false)
    expect(richTextEquals(null, emptyRichText())).toBe(true)
  })
})

describe('depth', () => {
  /** `count` quotes inside each other around one paragraph. */
  const nested = (count: number, inner: unknown = p(t('deep'))): unknown => {
    let node = inner
    for (let index = 0; index < count; index += 1) node = quote(node)
    return node
  }

  /** How many quotes deep the first paragraph is. */
  const depthOf = (blocks: unknown[]): number => {
    let depth = 0
    let current = blocks[0] as { type: string; content: unknown[] }
    while (current.type === 'blockquote') {
      depth += 1
      current = current.content[0] as { type: string; content: unknown[] }
    }
    return depth
  }

  it(`keeps ${RICH_TEXT_MAX_DEPTH} quotes inside each other`, () => {
    const read = parseRichText(doc(nested(RICH_TEXT_MAX_DEPTH)))
    expect(read.faults).toEqual([])
    expect(depthOf(read.value.blocks)).toBe(RICH_TEXT_MAX_DEPTH)
  })

  it('flattens a quote inside them to paragraphs of its text', () => {
    const inner = quote(
      { type: 'heading', level: 1, content: [t('Title')] },
      p(t('mention '), { type: 'entity', kind: 'user', id: 'u', label: '@U' }),
      { type: 'codeBlock', text: 'a\nb' },
      { type: 'list', ordered: false, items: [item(p(t('one')), quote(p(t('two'))))] },
      { type: 'callout', text: 'kept' },
    )
    const read = parseRichText(doc(nested(RICH_TEXT_MAX_DEPTH, inner)))
    expect(depthOf(read.value.blocks)).toBe(RICH_TEXT_MAX_DEPTH)
    let innermost = read.value.blocks as unknown[]
    for (let index = 0; index < RICH_TEXT_MAX_DEPTH; index += 1) {
      innermost = (innermost[0] as { content: unknown[] }).content
    }
    expect(innermost).toEqual([
      p(t('Title')),
      p(t('mention '), { type: 'entity', kind: 'user', id: 'u', label: '@U' }),
      p(t('a'), { type: 'break' }, t('b')),
      p(t('one')),
      p(t('two')),
      { type: 'callout', text: 'kept' },
    ])
    const path = [
      'blocks',
      0,
      ...Array.from({ length: RICH_TEXT_MAX_DEPTH }, () => ['content', 0]).flat(),
    ]
    expect(read.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['too-deep', path],
      ['unknown-node', path],
    ])
  })

  it('counts a list and its item as one level, as a quote is', () => {
    const list = (inner: unknown) => ({
      type: 'list',
      ordered: false,
      items: [item(p(t('x')), inner)],
    })
    let node: unknown = p(t('leaf'))
    for (let index = 0; index < RICH_TEXT_MAX_DEPTH; index += 1) node = list(node)
    expect(codes(doc(node))).toEqual([])
    expect(codes(doc(list(node)))).toEqual(['too-deep'])
  })

  it('reads a document nested a hundred thousand deep without recursing into it', () => {
    const depth = 100_000
    const source = `{"format":"${RICH_TEXT_FORMAT}","blocks":[${'{"type":"blockquote","content":['.repeat(depth)}{"type":"paragraph","content":[{"type":"text","text":"bottom"}]}${']}'.repeat(depth)}]}`
    const read = parseRichText(source)
    expect(read.faults.map((fault) => fault.code)).toEqual(['too-deep'])
    expect(depthOf(read.value.blocks)).toBe(RICH_TEXT_MAX_DEPTH)
    expect(serializeRichText(read.value)).toContain('"bottom"')
  })

  it(`cuts what is nested more than ${OPAQUE_MAX_DEPTH} deep inside a node it keeps`, () => {
    let value: unknown = 'bottom'
    for (let index = 0; index < 10_000; index += 1) value = { inner: value }
    const read = parseRichText(doc({ type: 'embed', data: value }, p(t('after'))))
    expect(read.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['unknown-node', ['blocks', 0]],
      ['too-deep', ['blocks', 0]],
    ])
    expect(read.value.blocks[1]).toEqual(p(t('after')))
    // Everything down to the limit is kept, counting the node as the first level.
    let kept: unknown = read.value.blocks[0]
    let levels = 1
    for (;;) {
      const next =
        (kept as { data?: unknown; inner?: unknown }).data ?? (kept as { inner?: unknown }).inner
      if (typeof next !== 'object' || next === null) break
      kept = next
      levels += 1
    }
    expect(levels).toBe(OPAQUE_MAX_DEPTH)
  })
})

describe('what this version does not know', () => {
  const callout = {
    type: 'callout',
    tone: 'warning',
    content: [p(t('Mind the gap', bold))],
    attrs: { b: 1, a: [true, null, 2.5] },
  }

  it('keeps an unknown block where it is, as the same JSON', () => {
    const read = parseRichText(doc(p(t('before')), callout, p(t('after'))))
    expect(read.value.blocks[1]).toEqual(callout)
    expect(read.value.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'callout',
      'paragraph',
    ])
    expect(read.faults).toEqual([
      {
        code: 'unknown-node',
        path: ['blocks', 1],
        message:
          'A node of type "callout" is not one this version knows. It is kept and drawn as its text.',
      },
    ])
  })

  it('keeps an unknown inline where it is, and does not join the text around it', () => {
    const emoji = { type: 'emoji', name: 'wave', label: '👋' }
    const read = parseRichText(doc(p(t('hi '), emoji, t(' there'))))
    expect(read.value.blocks).toEqual([p(t('hi '), emoji, t(' there'))])
    expect(read.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['unknown-node', ['blocks', 0, 'content', 1]],
    ])
  })

  it('keeps an unknown mark on its text, after the known ones', () => {
    const highlight = { type: 'highlight', colour: 'yellow' }
    const read = parseRichText(doc(p(t('x', highlight, bold), t('y', bold, highlight))))
    expect(read.value.blocks).toEqual([p(t('xy', bold, highlight))])
    expect(read.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['unknown-mark', ['blocks', 0, 'content', 0, 'marks', 0]],
      ['unknown-mark', ['blocks', 0, 'content', 1, 'marks', 1]],
    ])
  })

  it('keeps a field a known node does not have, after the known ones', () => {
    const read = parseRichText(
      doc({
        align: 'center',
        type: 'paragraph',
        content: [{ type: 'text', text: 'x', lang: 'fr' }],
      }),
    )
    expect(read.faults).toEqual([])
    expect(serializeRichText(read.value)).toBe(
      JSON.stringify(
        doc({
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', lang: 'fr' }],
          align: 'center',
        }),
      ),
    )
    // Text with a field the other run lacks is not the same run.
    expect(
      normalizeRichText(doc(p(t('a'), { type: 'text', text: 'b', lang: 'fr' }))).blocks[0],
    ).toEqual(p(t('a'), { type: 'text', text: 'b', lang: 'fr' }))
  })

  it('keeps a node of a known type in a place its kind cannot be, as it is', () => {
    const stray = t('loose', bold)
    const read = parseRichText(doc(stray, item(p(t('i')))))
    expect(read.value.blocks).toEqual([stray, item(p(t('i')))])
    expect(read.faults.map((fault) => [fault.code, fault.message])).toEqual([
      ['malformed', 'A "text" cannot stand among blocks. It is kept and drawn as its text.'],
      ['malformed', 'A "listItem" cannot stand among blocks. It is kept and drawn as its text.'],
    ])
  })

  it('keeps a node in a list that is not a list item as the content of one', () => {
    const list = {
      type: 'list',
      ordered: false,
      items: [p(t('plain')), callout, item(p(t('real')))],
    }
    const read = parseRichText(doc(list))
    expect(read.value.blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [item(p(t('plain'))), item(p(), callout), item(p(t('real')))],
      },
    ])
    expect(read.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['malformed', ['blocks', 0, 'items', 0]],
      ['unknown-node', ['blocks', 0, 'items', 1]],
    ])
  })

  it('keeps an unknown node through every later read', () => {
    const once = normalizeRichText(doc(callout))
    expect(normalizeRichText(serializeRichText(once))).toEqual(once)
  })

  it('writes what JSON cannot hold as JSON.stringify does', () => {
    const embed = {
      type: 'embed',
      missing: undefined,
      run: () => 1,
      list: [undefined, Number.NaN, 1],
    }
    expect(normalizeRichText(doc(embed)).blocks[0]).toEqual(JSON.parse(JSON.stringify(embed)))
  })

  it('answers the guards a renderer asks', () => {
    for (const type of ['paragraph', 'heading', 'list', 'blockquote', 'codeBlock']) {
      expect(isRichTextBlockKnown({ type }), type).toBe(true)
    }
    for (const node of [
      { type: 'callout' },
      { type: 'text' },
      { type: 'listItem' },
      null,
      'paragraph',
      {},
    ]) {
      expect(isRichTextBlockKnown(node)).toBe(false)
    }
    for (const type of ['text', 'break', 'entity'])
      expect(isRichTextInlineKnown({ type }), type).toBe(true)
    expect(isRichTextInlineKnown({ type: 'emoji' })).toBe(false)
    expect(isRichTextInlineKnown({ type: 'paragraph' })).toBe(false)
    for (const type of ['link', 'bold', 'italic', 'strike', 'code']) {
      expect(isRichTextMarkKnown({ type }), type).toBe(true)
    }
    expect(isRichTextMarkKnown({ type: 'highlight' })).toBe(false)
    // A field read from a prototype is not the node's.
    expect(isRichTextBlockKnown(Object.create({ type: 'paragraph' }))).toBe(false)
  })
})

describe('faults', () => {
  it('reads anything that is not a document as the empty document', () => {
    const notDocuments: unknown[] = [
      null,
      undefined,
      0,
      42,
      true,
      'not json',
      '"a string"',
      '[]',
      [],
      [doc(p(t('x')))],
      {},
      { blocks: [] },
      { format: 'markdown', blocks: [] },
      { format: 'polymorph-rich-text/0', blocks: [] },
      { format: 'polymorph-rich-text/1.5', blocks: [] },
      { format: RICH_TEXT_FORMAT },
      { format: RICH_TEXT_FORMAT, blocks: {} },
      { format: RICH_TEXT_FORMAT, blocks: 'p' },
    ]
    for (const input of notDocuments) {
      const read = parseRichText(input)
      expect(read.value, JSON.stringify(input)).toEqual(emptyRichText())
      expect(
        read.faults.map((fault) => fault.code),
        JSON.stringify(input),
      ).toEqual(['unreadable'])
    }
  })

  it('reads a later format as far as it can', () => {
    const later = {
      format: 'polymorph-rich-text/2',
      blocks: [p(t('known')), { type: 'table', rows: [] }],
    }
    const read = parseRichText(later)
    expect(read.value).toEqual(doc(p(t('known')), { type: 'table', rows: [] }))
    expect(read.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['newer-format', ['format']],
      ['unknown-node', ['blocks', 1]],
    ])
  })

  it('repairs a known node where the repair is certain', () => {
    const cases: [unknown, unknown[], (string | number)[]][] = [
      [
        { type: 'heading', level: 5, content: [t('h')] },
        [{ type: 'heading', level: 3, content: [t('h')] }],
        ['level'],
      ],
      [{ type: 'heading', level: 0, content: [t('h')] }, [p(t('h'))], ['level']],
      [{ type: 'heading', content: [t('h')] }, [p(t('h'))], ['level']],
      [{ type: 'paragraph' }, [p()], ['content']],
      [{ type: 'paragraph', content: 'text' }, [p()], ['content']],
      [
        { type: 'list', items: [item(p(t('x')))] },
        [{ type: 'list', ordered: false, items: [item(p(t('x')))] }],
        ['ordered'],
      ],
      [
        { type: 'list', ordered: true, start: -1, items: [item(p(t('x')))] },
        [{ type: 'list', ordered: true, items: [item(p(t('x')))] }],
        ['start'],
      ],
      [
        { type: 'list', ordered: true, start: 2.5, items: [item(p(t('x')))] },
        [{ type: 'list', ordered: true, items: [item(p(t('x')))] }],
        ['start'],
      ],
      [{ type: 'list', ordered: false }, [], ['items']],
      [
        { type: 'list', ordered: false, items: [{ type: 'listItem' }] },
        [{ type: 'list', ordered: false, items: [item(p())] }],
        ['items', 0, 'content'],
      ],
      [{ type: 'blockquote', content: 'q' }, [], ['content']],
      [{ type: 'codeBlock' }, [{ type: 'codeBlock', text: '' }], ['text']],
      [
        { type: 'codeBlock', language: 5, text: 'x' },
        [{ type: 'codeBlock', text: 'x' }],
        ['language'],
      ],
    ]
    for (const [block, blocks, path] of cases) {
      const read = parseRichText(doc(block))
      expect(read.value.blocks, JSON.stringify(block)).toEqual(blocks)
      expect(
        read.faults.map((fault) => [fault.code, fault.path]),
        JSON.stringify(block),
      ).toEqual([['malformed', ['blocks', 0, ...path]]])
    }
  })

  it('repairs or drops a known inline', () => {
    const read = parseRichText(
      doc(
        p(
          t('a'),
          { type: 'text' },
          { type: 'text', text: 5 },
          { type: 'entity', label: '@Ada' },
          { type: 'entity', kind: 'user', id: 'u' },
          { type: 'entity', kind: 'user', id: 'u', label: '@Grace' },
          { type: 'text', text: 'b', marks: 'bold' },
          {
            type: 'text',
            text: 'c',
            marks: [null, 'bold', ['bold'], { type: 'link' }, { href: '/x' }],
          },
          { type: 'text', text: 'd', marks: [link('/one'), link('/two')] },
        ),
      ),
    )
    expect(read.value.blocks).toEqual([
      p(
        t('a@Ada'),
        { type: 'entity', kind: 'user', id: 'u', label: '@Grace' },
        t('bc'),
        t('d', link('/one')),
      ),
    ])
    expect(read.faults.map((fault) => [fault.code, fault.path.slice(3)])).toEqual([
      ['malformed', [1]],
      ['malformed', [2]],
      ['malformed', [3]],
      ['malformed', [4]],
      ['malformed', [6, 'marks']],
      ['malformed', [7, 'marks', 0]],
      ['malformed', [7, 'marks', 1]],
      ['malformed', [7, 'marks', 2]],
      ['malformed', [7, 'marks', 3]],
      ['malformed', [7, 'marks', 4]],
      ['malformed', [8, 'marks', 1]],
    ])
  })

  it('drops what is not a node, wherever one is expected', () => {
    const read = parseRichText(
      doc(
        null,
        7,
        'paragraph',
        [p(t('in an array'))],
        { content: [] },
        p(null, ['text'], t('ok')),
        { type: 'list', ordered: false, items: [null, [item(p())], item(p(t('i')))] },
      ),
    )
    expect(read.value.blocks).toEqual([
      p(t('ok')),
      { type: 'list', ordered: false, items: [item(p(t('i')))] },
    ])
    expect(read.faults.map((fault) => fault.code)).toEqual(Array(9).fill('malformed'))
  })

  it('names every code a reader can meet', () => {
    const all = new Set([
      ...codes(null),
      ...codes({ format: 'polymorph-rich-text/9', blocks: [] }),
      ...codes(
        doc({ type: 'x' }, p(t('a', { type: 'y' }), t('b', link('data:text/html,x'))), {
          type: 'paragraph',
        }),
      ),
      ...codes(doc(quote(quote(quote(quote(quote(quote(quote(quote(quote(p()))))))))))),
    ])
    expect([...all].sort()).toEqual([
      'malformed',
      'newer-format',
      'too-deep',
      'unknown-mark',
      'unknown-node',
      'unreadable',
      'unsafe-link',
    ])
  })

  it('says each fault in words, and cuts a long value it names', () => {
    const long = 'x'.repeat(10_000)
    const [fault] = parseRichText(doc({ type: long })).faults
    expect(fault?.message.length).toBeLessThan(200)
    expect(fault?.message).toContain('xxxx…')
  })
})

describe('hostile input', () => {
  it('reads a huge string whole', () => {
    const text = 'a'.repeat(5_000_000)
    const read = parseRichText(JSON.stringify(doc(p(t(text)))))
    expect(read.faults).toEqual([])
    expect((read.value.blocks[0] as { content: { text: string }[] }).content[0]?.text.length).toBe(
      5_000_000,
    )
  })

  it('keeps a __proto__ key as data and changes no prototype', () => {
    const source = `{"format":"${RICH_TEXT_FORMAT}","__proto__":{"polluted":1},"blocks":[{"type":"paragraph","__proto__":{"polluted":2},"content":[]},{"type":"embed","__proto__":{"polluted":3},"data":{"__proto__":{"polluted":4}}}]}`
    const read = parseRichText(source)
    const [paragraph, embed] = read.value.blocks as unknown as Record<string, unknown>[]
    expect(Object.getPrototypeOf(read.value)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(paragraph)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(embed)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(embed?.data)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect('polluted' in read.value).toBe(false)
    expect(Object.getOwnPropertyDescriptor(read.value, '__proto__')?.value).toEqual({
      polluted: 1,
    })
    // The keys survive the round trip as they were read.
    expect(JSON.parse(serializeRichText(read.value))).toEqual(JSON.parse(source))
  })

  it('ignores a field a node inherits rather than holds', () => {
    const inherited = Object.create({ type: 'paragraph', content: [t('x')] }) as object
    expect(codes(doc(inherited))).toEqual(['malformed'])
    expect(normalizeRichText(doc(inherited)).blocks).toEqual([])
  })

  it('stops at a value that holds itself', () => {
    const embed: Record<string, unknown> = { type: 'embed' }
    embed.self = embed
    embed.list = [embed]
    const loop: Record<string, unknown> = { type: 'blockquote', content: [] }
    ;(loop.content as unknown[]).push(loop, p(t('x')))
    const read = parseRichText(doc(embed, loop))
    expect(read.value.blocks[0]).toEqual({ type: 'embed', list: [null] })
    expect(read.faults.map((fault) => fault.code)).toEqual([
      'unknown-node',
      'malformed',
      'too-deep',
    ])
    expect(serializeRichText(read.value)).toContain('"x"')
  })

  it('never throws, and reads a value that throws as no document', () => {
    const throwing = {
      format: RICH_TEXT_FORMAT,
      get blocks(): unknown[] {
        throw new Error('no')
      },
    }
    expect(parseRichText(throwing)).toEqual({
      value: emptyRichText(),
      faults: [
        {
          code: 'unreadable',
          path: [],
          message: 'The input could not be read: reading it threw.',
        },
      ],
    })
    const proxy = new Proxy(
      {},
      {
        get: () => {
          throw new Error('no')
        },
        ownKeys: () => {
          throw new Error('no')
        },
      },
    )
    expect(() => parseRichText(doc(proxy, p(t('x'))))).not.toThrow()
    expect(() => normalizeRichText(Symbol('x'))).not.toThrow()
    expect(() => serializeRichText(BigInt(1))).not.toThrow()
  })

  it('reads a wide document in one pass', () => {
    const blocks = Array.from({ length: 50_000 }, (_, index) => p(t(`line ${index}`)))
    const read = parseRichText(JSON.stringify(doc(...blocks)))
    expect(read.faults).toEqual([])
    expect(read.value.blocks).toHaveLength(50_000)
  })
})

describe('migration', () => {
  it('is the format this version names', () => {
    expect(richTextFormatName(RICH_TEXT_VERSION)).toBe(RICH_TEXT_FORMAT)
  })

  it('returns a document of this format as it is', () => {
    expect(migrateRichText(WRITTEN)).toBe(WRITTEN)
  })

  it('returns a later format and what is not a document as they are', () => {
    const later = { format: 'polymorph-rich-text/7', blocks: [] }
    expect(migrateRichText(later)).toBe(later)
    for (const input of [null, 'x', [], { blocks: [] }]) expect(migrateRichText(input)).toBe(input)
  })

  it('upgrades an older document one version at a time', () => {
    // The loop a second format will use, run with two steps a test defines.
    const steps = [
      {
        from: 1,
        migrate: (older: Record<string, unknown>) => ({ ...older, trail: ['1→2'] }),
      },
      {
        from: 2,
        migrate: (older: Record<string, unknown>) => ({
          ...older,
          trail: [...(older.trail as string[]), `${String(older.format)}→3`],
        }),
      },
    ]
    expect(migrateRichTextWith(doc(), steps, 3)).toEqual({
      format: 'polymorph-rich-text/3',
      blocks: [],
      trail: ['1→2', 'polymorph-rich-text/2→3'],
    })
    // A version with no step to the next is left as it is.
    const old = { format: 'polymorph-rich-text/1', blocks: [] }
    expect(migrateRichTextWith(old, steps.slice(1), 3)).toBe(old)
  })
})
