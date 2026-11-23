import { describe, expect, it } from 'vitest'

import {
  isRichTextEmpty,
  parseRichText,
  RICH_TEXT_FORMAT,
  RICH_TEXT_FORMATS,
  restrictRichText,
  richTextEntities,
  richTextExcerpt,
  richTextFromText,
  richTextLength,
  richTextNodeText,
  richTextPlainText,
  type RichTextFormat,
} from './src/rich-text/index'

/**
 * The document as text, and back: plain text, the preview line, the length a
 * field's limit counts, emptiness, entities, a document from plain text, and
 * the document a field with fewer formats holds. It lives at the package root,
 * not in `src/`, because `src/**` is the engine's browser project and these
 * functions read no document object.
 */

const doc = (...blocks: unknown[]) => ({ format: RICH_TEXT_FORMAT, blocks })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }
const br = { type: 'break' }
const ada = { type: 'entity', kind: 'user', id: 'u_1', label: '@Ada Lovelace' }
const issue = { type: 'entity', kind: 'issue', id: 'i_7', label: '#7' }
const heading = (level: number, ...content: unknown[]) => ({ type: 'heading', level, content })
const quote = (...content: unknown[]) => ({ type: 'blockquote', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })
const list = (ordered: boolean, ...items: unknown[]) => ({ type: 'list', ordered, items })
const codeBlock = (text: string, language?: string) =>
  language === undefined ? { type: 'codeBlock', text } : { type: 'codeBlock', language, text }
const bold = { type: 'bold' }
const link = (href: string) => ({ type: 'link', href })

/** A reply with every kind of block. */
const REPLY = doc(
  heading(1, t('Plan')),
  p(t('Thanks '), ada, t(', see '), t('the doc', link('/docs')), t('.'), br, t('Next line.')),
  list(true, item(p(t('first'))), item(p(t('second')), list(false, item(p(t('nested')))))),
  quote(p(t('quoted '), issue)),
  codeBlock('const a = 1\nconst b = 2', 'ts'),
)

describe('richTextPlainText', () => {
  it('reads the text a person reads, a block to a line', () => {
    expect(richTextPlainText(REPLY)).toBe(
      [
        'Plan',
        'Thanks @Ada Lovelace, see the doc.\nNext line.',
        'first',
        'second',
        'nested',
        'quoted #7',
        'const a = 1\nconst b = 2',
      ].join('\n'),
    )
  })

  it('separates blocks with what it is given', () => {
    expect(richTextPlainText(doc(p(t('a')), p(t('b'))), { blockSeparator: '\n\n' })).toBe('a\n\nb')
  })

  it('writes list markers for a preview, numbered from the list start', () => {
    const numbered = {
      type: 'list',
      ordered: true,
      start: 4,
      items: [item(p(t('d'))), item(p(t('e')))],
    }
    expect(
      richTextPlainText(doc(numbered, list(false, item(p(t('x'))))), { listMarkers: true }),
    ).toBe('4. d\n5. e\n- x')
    expect(richTextPlainText(REPLY, { listMarkers: true })).toContain(
      '1. first\n2. second\n- nested',
    )
  })

  it('keeps an empty paragraph as an empty line', () => {
    expect(richTextPlainText(doc(p(t('a')), p(), p(t('b'))))).toBe('a\n\nb')
  })

  it('reads a node it does not know as the text found in it', () => {
    const callout = { type: 'callout', content: [p(t('Mind')), p(t('the gap'))] }
    const emoji = { type: 'emoji', label: '👋' }
    const image = { type: 'image', src: '/a.png' }
    expect(richTextPlainText(doc(p(t('hi '), emoji), callout, image, p(t('end'))))).toBe(
      'hi 👋\nMind\nthe gap\nend',
    )
  })

  it('reads anything that is not a document as no text', () => {
    expect(richTextPlainText(null)).toBe('')
    expect(richTextPlainText('{')).toBe('')
  })
})

describe('richTextNodeText', () => {
  it('reads text, then label, then the children', () => {
    expect(
      richTextNodeText({ type: 'x', text: 'own', label: 'not this', content: [t('nor this')] }),
    ).toBe('own')
    expect(richTextNodeText({ type: 'x', label: 'label', content: [t('not this')] })).toBe('label')
    expect(richTextNodeText({ type: 'x', content: [t('a'), t('b')] })).toBe('ab')
  })

  it('reads content, items and blocks, in that order', () => {
    expect(
      richTextNodeText({ type: 'x', blocks: [t('3')], items: [t('2')], content: [t('1')] }),
    ).toBe('123')
  })

  it('separates the blocks found in it and joins the inlines', () => {
    const table = {
      type: 'table',
      rows: 'not read',
      blocks: [
        {
          type: 'row',
          content: [
            { type: 'cell', content: [p(t('a'))] },
            { type: 'cell', content: [p(t('b'))] },
          ],
        },
        { type: 'row', content: [{ type: 'cell', content: [p(t('c'), br, t('d'))] }] },
      ],
    }
    expect(richTextNodeText(table)).toBe('a\nb\nc\nd')
    expect(richTextNodeText(table, { blockSeparator: ' | ' })).toBe('a | b | c\nd')
    expect(
      richTextNodeText({ type: 'x', content: [t('a'), { type: 'y', label: 'b' }, codeBlock('c')] }),
    ).toBe('ab\nc')
  })

  it('reads a known node as its own text', () => {
    expect(richTextNodeText(p(t('a'), ada))).toBe('a@Ada Lovelace')
    expect(richTextNodeText(br)).toBe('\n')
    expect(
      richTextNodeText(list(true, item(p(t('a'))), item(p(t('b')))), { listMarkers: true }),
    ).toBe('1. a\n2. b')
  })

  it('finds nothing in what is not a node', () => {
    for (const value of [
      null,
      undefined,
      'text',
      42,
      [t('a')],
      { type: 'x', content: 'a' },
      { type: 'x' },
    ]) {
      expect(richTextNodeText(value)).toBe('')
    }
  })

  it('stops at a value that holds itself, and at depth', () => {
    const loop: Record<string, unknown> = { type: 'x', content: [] }
    ;(loop.content as unknown[]).push(t('a'), loop, t('b'))
    expect(richTextNodeText(loop)).toBe('ab')
    let deep: unknown = t('bottom')
    for (let index = 0; index < 100_000; index += 1) deep = { type: 'x', content: [deep] }
    expect(richTextNodeText(deep)).toBe('')
  })
})

describe('richTextExcerpt', () => {
  it('is one line, with every run of whitespace one space', () => {
    expect(richTextExcerpt(REPLY, 1000)).toBe(
      'Plan Thanks @Ada Lovelace, see the doc. Next line. first second nested quoted #7 const a = 1 const b = 2',
    )
  })

  it('cuts to the length with an ellipsis as its last code point', () => {
    const text = doc(p(t('The quick brown fox jumps')))
    expect(richTextExcerpt(text, 25)).toBe('The quick brown fox jumps')
    expect(richTextExcerpt(text, 24)).toBe('The quick brown fox jum…')
    // A space before the cut is not kept before the ellipsis.
    expect(richTextExcerpt(text, 11)).toBe('The quick…')
    expect(richTextExcerpt(text, 1)).toBe('…')
  })

  it('never cuts a surrogate pair', () => {
    const faces = doc(p(t('😀😁😂🤣😃')))
    expect(richTextExcerpt(faces, 5)).toBe('😀😁😂🤣😃')
    expect(richTextExcerpt(faces, 4)).toBe('😀😁😂…')
    expect(Array.from(richTextExcerpt(faces, 4))).toHaveLength(4)
  })

  it('is empty for a length of nothing', () => {
    for (const length of [0, -1, Number.NaN, 0.5]) expect(richTextExcerpt(REPLY, length)).toBe('')
    expect(richTextExcerpt(REPLY, Number.POSITIVE_INFINITY)).toBe(richTextExcerpt(REPLY, 10_000))
  })
})

describe('richTextLength', () => {
  it('counts code points of text, labels and code, and one per hard break', () => {
    expect(richTextLength(doc(p(t('ab'), br, t('c'))))).toBe(4)
    expect(richTextLength(doc(p(ada)))).toBe('@Ada Lovelace'.length)
    expect(richTextLength(doc(codeBlock('a\nb')))).toBe(3)
  })

  it('counts nothing for a block boundary', () => {
    expect(
      richTextLength(doc(p(t('a')), p(t('b')), list(false, item(p(t('c')))), quote(p(t('d'))))),
    ).toBe(4)
    expect(richTextLength(doc(p(), heading(2), codeBlock('')))).toBe(0)
  })

  it('counts an astral character once and a combining mark on its own', () => {
    expect(richTextLength(doc(p(t('😀'))))).toBe(1)
    expect(richTextLength(doc(p(t('é'))))).toBe(2)
    expect(richTextLength(doc(p(t('👩‍💻'))))).toBe(3)
  })

  it('counts the text of a node it does not know', () => {
    expect(richTextLength(doc({ type: 'callout', content: [p(t('abc'))] }))).toBe(3)
  })
})

describe('isRichTextEmpty', () => {
  it('is empty with no text but whitespace', () => {
    expect(isRichTextEmpty(doc())).toBe(true)
    expect(isRichTextEmpty(null)).toBe(true)
    expect(isRichTextEmpty(doc(p(t('    '), br), p()))).toBe(true)
  })

  it('counts formatting with nothing in it as empty', () => {
    expect(
      isRichTextEmpty(
        doc(heading(1), list(false, item(p())), quote(p(br)), codeBlock(''), codeBlock('  \n')),
      ),
    ).toBe(true)
  })

  it('counts an entity as content', () => {
    expect(isRichTextEmpty(doc(p(ada)))).toBe(false)
    expect(isRichTextEmpty(doc({ type: 'callout', content: [p(issue)] }))).toBe(false)
  })

  it('counts any text as content', () => {
    expect(isRichTextEmpty(doc(p(t('.'))))).toBe(false)
    expect(isRichTextEmpty(doc(codeBlock('x')))).toBe(false)
    expect(isRichTextEmpty(doc({ type: 'callout', text: 'x' }))).toBe(false)
  })
})

describe('richTextEntities', () => {
  it('lists every entity in the order a person reads them', () => {
    expect(richTextEntities(REPLY)).toEqual([ada, issue])
    expect(
      richTextEntities(
        doc(
          list(false, item(p(issue), quote(p(ada)))),
          { type: 'callout', content: [p(t('x'), { ...ada, id: 'u_2' })] },
          p(ada),
        ),
      ),
    ).toEqual([issue, ada, { ...ada, id: 'u_2' }, ada])
  })

  it('lists none for a document without them', () => {
    expect(richTextEntities(doc(p(t('a'))))).toEqual([])
    expect(richTextEntities('nonsense')).toEqual([])
  })
})

describe('richTextFromText', () => {
  it('makes a paragraph of each run of lines, and a hard break of a line break', () => {
    expect(richTextFromText('Hello\nworld\n\nSecond')).toEqual(
      doc(p(t('Hello'), br, t('world')), p(t('Second'))),
    )
  })

  it('reads any line ending, and a line of spaces as a blank line', () => {
    expect(richTextFromText('a\r\nb\r\r\n  \t\n\nc')).toEqual(doc(p(t('a'), br, t('b')), p(t('c'))))
  })

  it('keeps the spaces inside a line', () => {
    expect(richTextFromText('  indented  ')).toEqual(doc(p(t('  indented  '))))
  })

  it('makes no paragraph of blank lines at either end, or of nothing', () => {
    expect(richTextFromText('\n\n  \nmiddle\n\n')).toEqual(doc(p(t('middle'))))
    expect(richTextFromText('')).toEqual(doc())
    expect(richTextFromText('  \n \n')).toEqual(doc())
    expect(richTextFromText(42 as unknown as string)).toEqual(doc())
  })

  it('is a document in normal form', () => {
    const made = richTextFromText('one\ntwo\n\nthree')
    expect(parseRichText(made)).toEqual({ document: made, faults: [] })
  })
})

describe('restrictRichText', () => {
  const restricted = (formats: readonly RichTextFormat[], ...blocks: unknown[]) =>
    restrictRichText(doc(...blocks), formats).blocks

  it('is the normal form with every format allowed', () => {
    expect(restrictRichText(REPLY, RICH_TEXT_FORMATS)).toEqual(parseRichText(REPLY).document)
  })

  it('makes a heading a paragraph', () => {
    expect(restricted([], heading(2, t('Title', bold)))).toEqual([p(t('Title'))])
    expect(restricted(['bold'], heading(2, t('Title', bold)))).toEqual([p(t('Title', bold))])
  })

  it('makes a list its items’ blocks, each kind by its own format', () => {
    const bullets = list(false, item(p(t('a'))), item(p(t('b')), list(true, item(p(t('c'))))))
    expect(restricted(['orderedList'], bullets)).toEqual([
      p(t('a')),
      p(t('b')),
      list(true, item(p(t('c')))),
    ])
    expect(restricted(['bulletList'], bullets)).toEqual([
      list(false, item(p(t('a'))), item(p(t('b')), p(t('c')))),
    ])
    expect(restricted([], bullets)).toEqual([p(t('a')), p(t('b')), p(t('c'))])
  })

  it('makes a quote its blocks', () => {
    expect(restricted([], quote(p(t('a')), heading(1, t('b'))))).toEqual([p(t('a')), p(t('b'))])
    expect(restricted(['blockquote'], quote(heading(1, t('b'))))).toEqual([quote(p(t('b')))])
  })

  it('makes a code block one paragraph of its lines', () => {
    expect(restricted([], codeBlock('a\n\nb', 'ts'))).toEqual([p(t('a'), br, br, t('b'))])
    expect(restricted([], codeBlock(''))).toEqual([p()])
  })

  it('starts a list item with a paragraph when a quote in it opens', () => {
    expect(restricted(['bulletList'], list(false, item(quote(heading(1, t('h'))))))).toEqual([
      list(false, item(p(), p(t('h')))),
    ])
  })

  it('removes each mark it does not allow and joins the runs', () => {
    const marked = p(
      t('a'),
      t('b', bold),
      t('c', { type: 'italic' }),
      t('d', { type: 'strike' }),
      t('e', { type: 'code' }),
      t('f', link('/x')),
    )
    expect(restricted([], marked)).toEqual([p(t('abcdef'))])
    for (const format of ['bold', 'italic', 'strike', 'code', 'link'] as const) {
      const kept = (
        restricted([format], marked)[0] as { content: { marks?: { type: string }[] }[] }
      ).content
      expect(
        kept.flatMap((node) => node.marks?.map((mark) => mark.type) ?? []),
        format,
      ).toEqual([format])
    }
  })

  it('keeps entities, hard breaks and what it does not know', () => {
    const highlight = { type: 'highlight' }
    const callout = { type: 'callout', content: [heading(1, t('x'))] }
    expect(restricted([], p(ada, br, t('a', highlight, bold)), callout)).toEqual([
      p(ada, br, t('a', highlight)),
      callout,
    ])
  })

  it('is a document in normal form', () => {
    const made = restrictRichText(REPLY, ['bold'])
    expect(parseRichText(made)).toEqual({ document: made, faults: [] })
  })
})
