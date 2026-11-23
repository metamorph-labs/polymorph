import { describe, expect, it } from 'vitest'

import {
  RICH_TEXT_FORMAT,
  richTextDrawing,
  type RichTextDrawnBlock,
  type RichTextDrawnInline,
  type RichTextPosition,
  richTextPositionAttrs,
  richTextRangeText,
} from './src/rich-text/index'

/**
 * What a reader member draws for a document (`richTextDrawing`): the decisions
 * every framework's RichTextContent draws by, held without a browser. It lives
 * at the package root, not in `src/`, because `src/**` is the engine's browser
 * project and the drawing reads no document object.
 */

const doc = (...blocks: unknown[]) => ({ format: RICH_TEXT_FORMAT, blocks })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const h = (level: number, ...content: unknown[]) => ({ type: 'heading', level, content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }
const a = (id: string) => ({ type: 'annotation', id })
const bold = { type: 'bold' }
const italic = { type: 'italic' }
const code = { type: 'code' }
const link = (href: string) => ({ type: 'link', href })
const entity = (kind: string, label: string, ...marks: unknown[]) => ({
  type: 'entity',
  kind,
  id: label,
  label,
  ...(marks.length === 0 ? {} : { marks }),
})

/** The inlines of the first block, a paragraph or a heading the member draws. */
function inlinesOf(block: RichTextDrawnBlock | undefined): RichTextDrawnInline[] {
  if (block?.kind === 'paragraph' || block?.kind === 'ownHeading') return block.inlines
  throw new Error(`no inlines in ${block?.kind}`)
}

/** The ids of the highlights around a drawn inline, outermost first, with each one's stop. */
function marksOf(node: RichTextDrawnInline): string[] {
  const out: string[] = []
  let at: RichTextDrawnInline | undefined = node
  while (at !== undefined) {
    if (at.kind === 'mark') out.push(at.stop ? `${at.id}*` : at.id)
    at = 'children' in at ? at.children[0] : undefined
  }
  return out
}

/** Every positioned piece of a drawing, in reading order, with the plain text it stands for. */
function positioned(blocks: readonly RichTextDrawnBlock[]): RichTextPosition[] {
  const out: RichTextPosition[] = []
  const inline = (node: RichTextDrawnInline) => {
    if (node.kind === 'piece' || node.kind === 'break') {
      if (node.at !== null) out.push(node.at)
    }
    if ('children' in node && node.kind !== 'piece') node.children.forEach(inline)
  }
  const block = (node: RichTextDrawnBlock) => {
    if (node.kind === 'paragraph' || node.kind === 'ownHeading') node.inlines.forEach(inline)
    if (node.kind === 'list') node.items.forEach((item) => item.forEach(block))
    if (node.kind === 'quote') node.blocks.forEach(block)
    if ((node.kind === 'codeBlock' || node.kind === 'later') && node.at !== null) out.push(node.at)
  }
  blocks.forEach(block)
  return out
}

describe('the drawing of a document', () => {
  it('reads any value, and draws nothing for one with nothing to read', () => {
    expect(richTextDrawing({ not: 'a document' })).toMatchObject({ empty: true, blocks: [] })
    expect(richTextDrawing(doc(p(t('  '))))).toMatchObject({ empty: true, blocks: [] })
    expect(richTextDrawing(doc(p(t('Hi')))).blocks).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'Hi' }] },
    ])
  })

  it('draws emphasis with bold outermost, and inline code as Code', () => {
    const [run, chip] = inlinesOf(
      richTextDrawing(doc(p(t('x', italic, bold, { type: 'strike' }), t('k', code)))).blocks[0],
    )
    expect(run).toEqual({
      kind: 'strong',
      children: [{ kind: 'em', children: [{ kind: 's', children: [{ kind: 'text', text: 'x' }] }] }],
    })
    expect(chip).toEqual({ kind: 'code', text: 'k' })
  })

  it('draws neighbouring runs with one target as one Link, with only the marks they share', () => {
    const inlines = inlinesOf(
      richTextDrawing(
        doc(
          p(
            t('the ', link('https://e.x'), bold),
            t('guide', link('https://e.x'), bold, italic),
            t(' and '),
            t('docs', link('/docs')),
          ),
        ),
      ).blocks[0],
    )
    expect(inlines).toEqual([
      {
        kind: 'strong',
        children: [{ kind: 'link', href: 'https://e.x', external: true, text: 'the guide' }],
      },
      { kind: 'text', text: ' and ' },
      { kind: 'link', href: '/docs', external: false, text: 'docs' },
    ])
  })

  it('draws headings at page levels from headingLevel, never past 4, and leaves out one with no text', () => {
    const drawn = richTextDrawing(doc(h(1, t('A')), h(2, t('B')), h(3, t('C')), h(1, t(' '))), {
      headingLevel: 3,
    })
    expect(drawn.blocks).toEqual([
      { kind: 'heading', level: 3, text: 'A' },
      { kind: 'heading', level: 4, text: 'B' },
      { kind: 'heading', level: 4, text: 'C' },
    ])
  })

  it('draws a heading as its text, an entity as its label and a break as a space', () => {
    const drawn = richTextDrawing(
      doc(h(1, t('Ask '), entity('user', '@Ada'), { type: 'break' }, t('now', link('/x')))),
    )
    expect(drawn.blocks[0]).toEqual({ kind: 'heading', level: 2, text: 'Ask @Ada now' })
  })

  it('draws a list from its start, a quote of its blocks, a code block copyable when it holds text', () => {
    const drawn = richTextDrawing(
      doc(
        {
          type: 'list',
          ordered: true,
          start: 3,
          items: [{ type: 'listItem', content: [p(t('three'))] }],
        },
        { type: 'list', ordered: true, items: [{ type: 'listItem', content: [p(t('one'))] }] },
        { type: 'blockquote', content: [p(t('q'))] },
        { type: 'codeBlock', language: 'ts', text: 'x' },
        { type: 'codeBlock', text: '' },
      ),
    )
    expect(drawn.blocks.map((block) => block.kind)).toEqual([
      'list',
      'list',
      'quote',
      'codeBlock',
      'codeBlock',
    ])
    expect(drawn.blocks[0]).toMatchObject({ ordered: true, start: 3 })
    expect(drawn.blocks[1]).toMatchObject({ ordered: true, start: undefined })
    expect(drawn.blocks[3]).toMatchObject({ language: 'ts', copyable: true, at: null })
    expect(drawn.blocks[4]).toMatchObject({ copyable: false })
  })

  it('draws a block of a later version as its text, and nothing for one with none', () => {
    const drawn = richTextDrawing(
      doc({ type: 'callout', content: [t('Paused')] }, { type: 'callout', content: [] }),
    )
    expect(drawn.blocks).toEqual([{ kind: 'later', text: 'Paused', at: null }])
  })

  it('draws the app’s entity where it draws one, and the token elsewhere', () => {
    const inlines = inlinesOf(
      richTextDrawing(doc(p(entity('user', '@Ada'), entity('issue', '#1'))), {
        appDraws: (node) => node.kind === 'user',
      }).blocks[0],
    )
    expect(inlines.map((node) => (node.kind === 'entity' ? node.app : null))).toEqual([
      true,
      false,
    ])
  })
})

describe('the highlights', () => {
  it('nests overlapping annotations as the editor does: the innermost starts last', () => {
    const inlines = inlinesOf(
      richTextDrawing(
        doc(p(t('twice ', a('outer')), t('as long', a('outer'), a('inner')), t(' x', a('outer')))),
      ).blocks[0],
    )
    expect(inlines.map(marksOf)).toEqual([['outer'], ['outer', 'inner'], ['outer']])
  })

  it('breaks a tie by the one that ends first, then by id', () => {
    const inlines = inlinesOf(
      richTextDrawing(doc(p(t('ab', a('b'), a('a')), t('c', a('a'))))).blocks[0],
    )
    // Both start together; `b` ends first, so it is the innermost.
    expect(marksOf(inlines[0] as RichTextDrawnInline)).toEqual(['a', 'b'])
  })

  it('draws only the annotations given, and marks the active one on every fragment', () => {
    const drawn = richTextDrawing(doc(p(t('one', a('x')), t(' '), t('two', a('y')))), {
      annotations: ['y'],
      activeAnnotation: 'y',
    })
    const [one, , two] = inlinesOf(drawn.blocks[0])
    expect(one).toEqual({ kind: 'text', text: 'one' })
    expect(two).toMatchObject({ kind: 'mark', id: 'y', active: true })
  })

  it('gives each annotation one stop, its first fragment where it is innermost and holds no control', () => {
    const drawn = richTextDrawing(
      doc(
        p(
          t('link', link('/x'), a('a')),
          t(' then ', a('a')),
          t('inner', a('a'), a('b')),
          t(' ', a('c')),
          t('words', a('c'), bold),
        ),
      ),
      { pressable: true },
    )
    const inlines = inlinesOf(drawn.blocks[0])
    // The Link holds no stop; the next fragment of `a` does. A fragment of white space is not one.
    expect(inlines.map(marksOf)).toEqual([['a'], ['a*'], ['a', 'b*'], ['c'], ['c*']])
    expect(drawn.stops).toEqual(['a', 'b', 'c'])
  })

  it('gives no stop without a press, and none on the app’s entity', () => {
    const plain = richTextDrawing(doc(p(t('x', a('a')))))
    expect(plain.stops).toEqual([])
    const drawn = richTextDrawing(doc(p(entity('user', '@Ada', a('a')), t(' x', a('a')))), {
      pressable: true,
      appDraws: () => true,
    })
    expect(inlinesOf(drawn.blocks[0]).map(marksOf)).toEqual([['a'], ['a*']])
  })

  it('draws an annotated code run as the member’s own code, with the highlight inside', () => {
    const [chip] = inlinesOf(richTextDrawing(doc(p(t('k', code, a('a'))))).blocks[0])
    expect(chip).toEqual({
      kind: 'ownCode',
      children: [
        { kind: 'mark', id: 'a', active: false, stop: false, children: [{ kind: 'text', text: 'k' }] },
      ],
    })
  })

  it('draws a heading that holds a drawn annotation as the member’s own, and others as Heading', () => {
    const drawn = richTextDrawing(doc(h(1, t('Webhook '), t('retries', a('a'))), h(2, t('Plain'))))
    expect(drawn.blocks[0]).toMatchObject({ kind: 'ownHeading', level: 2 })
    expect(drawn.blocks[1]).toEqual({ kind: 'heading', level: 3, text: 'Plain' })
    const hidden = richTextDrawing(doc(h(1, t('retries', a('a')))), { annotations: [] })
    expect(hidden.blocks[0]).toEqual({ kind: 'heading', level: 2, text: 'retries' })
  })
})

describe('the positions, while the member maps selections', () => {
  const value = doc(
    h(1, t('Title '), t('x', a('a'))),
    p(
      t('a\ud83d'),
      t('\ude00b', bold),
      entity('user', '@😀'),
      { type: 'break' },
      t('end', link('https://e.x')),
      t(' more', link('https://e.x'), italic),
    ),
    { type: 'list', ordered: false, items: [{ type: 'listItem', content: [p(t('item'))] }] },
    { type: 'blockquote', content: [p(t('quoted'))] },
    { type: 'codeBlock', text: 'const x = 1' },
    { type: 'callout', content: [t('later')] },
  )

  it('draws every heading as the member’s own, and positions every piece', () => {
    const drawn = richTextDrawing(value, { positions: true })
    expect(drawn.blocks.map((block) => block.kind)).toEqual([
      'ownHeading',
      'paragraph',
      'list',
      'quote',
      'codeBlock',
      'later',
    ])
    const pieces = positioned(drawn.blocks)
    // Reading order, end to end, with nothing between blocks.
    pieces.reduce((end, piece) => {
      expect(piece.start).toBe(end)
      return piece.end
    }, 0)
  })

  it('positions each piece at the plain text it is, as the model’s ranges read it', () => {
    const drawn = richTextDrawing(value, { positions: true })
    const texts = positioned(drawn.blocks).map((at) => richTextRangeText(value, at))
    expect(texts).toEqual([
      'Title ',
      'x',
      // A pair split between two runs is one code point, counted in the first.
      'a😀',
      'b',
      '@😀',
      '\n',
      'end more',
      'item',
      'quoted',
      'const x = 1',
      'later',
    ])
  })

  it('counts a surrogate pair split between two runs as one code point', () => {
    const drawn = richTextDrawing(doc(p(t('a\ud83d'), t('\ude00b', bold))), { positions: true })
    expect(positioned(drawn.blocks)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 3 },
    ])
  })

  it('marks an entity and a node of a later version as atoms', () => {
    const inlines = inlinesOf(
      richTextDrawing(doc(p(entity('user', '@Ada'), { type: 'date', label: 'Friday' })), {
        positions: true,
      }).blocks[0],
    )
    expect(inlines.map((node) => (node.kind === 'piece' ? node.atom : null))).toEqual([true, true])
  })

  it('writes the attributes a positioned element carries, and none without a position', () => {
    expect(richTextPositionAttrs({ start: 1, end: 3 }, true, true)).toEqual({
      'data-rich-text-start': '1',
      'data-rich-text-end': '3',
      'data-rich-text-atom': '',
      'data-rich-text-code': '',
    })
    expect(richTextPositionAttrs(null)).toEqual({})
  })

  it('writes no position without the mapping', () => {
    expect(positioned(richTextDrawing(value).blocks)).toEqual([])
  })
})
