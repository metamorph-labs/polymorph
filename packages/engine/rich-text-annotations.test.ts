import { describe, expect, it } from 'vitest'

import {
  annotateRichText,
  isRichTextMarkKnown,
  normalizeRichText,
  parseRichText,
  removeRichTextAnnotation,
  restrictRichText,
  RICH_TEXT_FORMAT,
  richTextAnnotations,
  richTextEquals,
  richTextFindText,
  richTextLength,
  richTextPlainText,
  richTextRangeText,
  type RichTextDocument,
  type RichTextRange,
  serializeRichText,
} from './src/rich-text/index'
import { positionCounter, positionOf } from './src/rich-text/ranges'

/**
 * Annotations and ranges: the anchor mark as the reader reads it, positions in
 * a document's plain text, and the functions that add, remove, list and find
 * anchors. It lives at the package root, not in `src/`, because `src/**` is the
 * engine's browser project and these functions read no document object.
 */

const doc = (...blocks: unknown[]) => ({ format: RICH_TEXT_FORMAT, blocks })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const h = (level: number, ...content: unknown[]) => ({ type: 'heading', level, content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }
const br = { type: 'break' }
const a = (id: string) => ({ type: 'annotation', id })
const bold = { type: 'bold' }
const italic = { type: 'italic' }
const link = (href: string) => ({ type: 'link', href })
const entity = (label: string, ...marks: unknown[]) =>
  marks.length === 0
    ? { type: 'entity', kind: 'user', id: 'u1', label }
    : { type: 'entity', kind: 'user', id: 'u1', label, marks }
const ada = entity('@Ada')
const quote = (...content: unknown[]) => ({ type: 'blockquote', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })
const list = (ordered: boolean, ...items: unknown[]) => ({ type: 'list', ordered, items })
const code = (text: string) => ({ type: 'codeBlock', text })
const range = (start: number, end: number): RichTextRange => ({ start, end })

const codes = (input: unknown) => parseRichText(input).faults.map((fault) => fault.code)

describe('the annotation mark', () => {
  it('is a known mark that a document this version wrote reads with no fault', () => {
    expect(isRichTextMarkKnown({ type: 'annotation', id: 'c1' })).toBe(true)
    const value = doc(p(t('hi ', a('c1')), entity('@Ada', a('c1')), t(' there')))
    expect(parseRichText(value)).toEqual({ value, faults: [] })
  })

  it('writes annotations after every other mark, by id in code unit order, one per id', () => {
    const read = normalizeRichText(
      doc(
        p(
          t(
            'x',
            a('b'),
            { type: 'highlight' },
            a('Z'),
            bold,
            a('a'),
            a('b'),
            link('https://x.example'),
            a('é'),
          ),
        ),
      ),
    )
    expect(read).toEqual(
      doc(
        p(
          t(
            'x',
            link('https://x.example'),
            bold,
            { type: 'highlight' },
            a('Z'),
            a('a'),
            a('b'),
            a('é'),
          ),
        ),
      ),
    )
    expect(serializeRichText(doc(p(t('x', a('b'), a('a')))))).toBe(
      serializeRichText(doc(p(t('x', a('a'), a('b'))))),
    )
  })

  it('merges two texts only when their annotations are the same', () => {
    expect(normalizeRichText(doc(p(t('a', a('1')), t('b', a('1')), t('c', a('2')))))).toEqual(
      doc(p(t('ab', a('1')), t('c', a('2')))),
    )
    expect(normalizeRichText(doc(p(t('a', a('1'), a('2')), t('b', a('2'), a('1')))))).toEqual(
      doc(p(t('ab', a('1'), a('2')))),
    )
  })

  it.each([
    ['no id', { type: 'annotation' }],
    ['an empty id', { type: 'annotation', id: '' }],
    ['a number', { type: 'annotation', id: 7 }],
  ])('drops an annotation with %s and keeps its text, as malformed', (_, mark) => {
    const result = parseRichText(doc(p(t('kept', mark, bold))))
    expect(result.value).toEqual(doc(p(t('kept', bold))))
    expect(result.faults).toEqual([
      expect.objectContaining({ code: 'malformed', path: ['blocks', 0, 'content', 0, 'marks', 0] }),
    ])
  })

  it('keeps the fields an annotation carries that this version does not know', () => {
    const value = doc(p(t('x', { type: 'annotation', id: 'c1', kind: 'review' })))
    expect(parseRichText(value)).toEqual({ value, faults: [] })
  })

  it('keeps only annotations and unknown marks on an entity, and drops a format silently', () => {
    const result = parseRichText(
      doc(
        p(
          entity(
            '@Ada',
            bold,
            a('c2'),
            link('https://x.example'),
            { type: 'glow' },
            a('c1'),
            italic,
          ),
        ),
      ),
    )
    expect(result.value).toEqual(doc(p(entity('@Ada', { type: 'glow' }, a('c1'), a('c2')))))
    expect(result.faults.map((fault) => [fault.code, fault.path])).toEqual([
      ['unknown-mark', ['blocks', 0, 'content', 0, 'marks', 3]],
    ])
  })

  it('omits an entity’s marks when none is kept, and reports marks that are not a list', () => {
    expect(normalizeRichText(doc(p(entity('@Ada', bold))))).toEqual(doc(p(ada)))
    expect(normalizeRichText(doc(p({ ...ada, marks: [] })))).toEqual(doc(p(ada)))
    expect(codes(doc(p({ ...ada, marks: 'c1' })))).toEqual(['malformed'])
    expect(codes(doc(p(entity('@Ada', { type: 'annotation' }))))).toEqual(['malformed'])
  })

  it('keeps annotations whatever formats a field allows, and loses them with a code block’s text', () => {
    const value = doc(
      h(1, t('Title', a('c1'), bold)),
      list(false, item(p(t('item', a('c2'), italic)))),
      quote(p(entity('@Ada', a('c3')))),
    )
    expect(restrictRichText(value, [])).toEqual(
      doc(p(t('Title', a('c1'))), p(t('item', a('c2'))), p(entity('@Ada', a('c3')))),
    )
    expect(
      richTextEquals(
        restrictRichText(value, ['heading', 'bulletList', 'blockquote', 'bold', 'italic']),
        value,
      ),
    ).toBe(true)
  })

  it('reads back what it serialized', () => {
    const value = annotateRichText(
      doc(p(t('one '), ada, t(' two 😀 three')), list(true, item(p(t('four'))))),
      range(2, 14),
      'c1',
    )
    expect(parseRichText(serializeRichText(value))).toEqual({ value, faults: [] })
  })
})

describe('positions', () => {
  /** Every kind of piece: text, an entity, a hard break, an unknown inline, a code block, an unknown block, lists and quotes. */
  const MIXED = doc(
    h(2, t('Head')),
    p(t('a'), ada, br, t('b', bold), { type: 'emoji', text: '👋' }),
    list(false, item(p(t('one')), list(true, item(p(t('two')))))),
    quote(p(t('q'))),
    code('x\ny'),
    { type: 'callout', content: [p(t('c1')), p(t('c2'))] },
    p(),
  )

  it('count the code points of the plain text with nothing between blocks, as richTextLength does', () => {
    const plain = richTextPlainText(MIXED, { blockSeparator: '' })
    expect(plain).toBe('Heada@Ada\nb👋onetwoqx\nyc1c2')
    expect(richTextRangeText(MIXED, range(0, Infinity))).toBe(plain)
    expect(richTextLength(MIXED)).toBe([...plain].length)
    const points = [...plain]
    for (let start = 0; start <= points.length; start += 1) {
      for (let end = start; end <= points.length; end += 1) {
        expect(richTextRangeText(MIXED, range(start, end))).toBe(points.slice(start, end).join(''))
      }
    }
  })

  it('clamp a range to the document, and read nothing from an empty, reversed or broken one', () => {
    const value = doc(p(t('hello')))
    expect(richTextRangeText(value, range(-3, 2))).toBe('he')
    expect(richTextRangeText(value, range(3, 99))).toBe('lo')
    expect(richTextRangeText(value, range(2, 2))).toBe('')
    expect(richTextRangeText(value, range(4, 1))).toBe('')
    expect(richTextRangeText(value, range(9, 12))).toBe('')
    expect(richTextRangeText(value, range(Number.NaN, 3))).toBe('')
    expect(richTextRangeText(value, null as unknown as RichTextRange)).toBe('')
    expect(richTextRangeText('not a document', range(0, 3))).toBe('')
  })

  it('count a surrogate pair as one code point, and one split across two texts too', () => {
    const value = doc(p(t('a😀b')))
    expect(richTextRangeText(value, range(1, 2))).toBe('😀')
    expect(richTextRangeText(value, range(2, 3))).toBe('b')
    // A pair two texts share reads as one code point in the joined text.
    const split = doc(p(t('a\uD83D', bold), t('\uDE00b')))
    expect(richTextLength(split)).toBe(3)
    expect(richTextRangeText(split, range(1, 2))).toBe('😀')
    expect(richTextRangeText(split, range(2, 3))).toBe('b')
  })
})

describe('annotateRichText', () => {
  it('splits texts at the range ends and marks what lies between, across marks', () => {
    const value = doc(p(t('one '), t('two', bold), t(' three')))
    expect(annotateRichText(value, range(2, 9), 'c1')).toEqual(
      doc(p(t('on'), t('e ', a('c1')), t('two', bold, a('c1')), t(' t', a('c1')), t('hree'))),
    )
  })

  it('lets several annotations cover the same text and overlap', () => {
    const once = annotateRichText(doc(p(t('abcdef'))), range(0, 4), 'x')
    const twice = annotateRichText(once, range(2, 6), 'w')
    expect(twice).toEqual(doc(p(t('ab', a('x')), t('cd', a('w'), a('x')), t('ef', a('w')))))
    // The same id again changes nothing.
    expect(annotateRichText(twice, range(0, 2), 'x')).toEqual(twice)
    expect(richTextAnnotations(twice)).toEqual([
      { id: 'x', text: 'abcd', range: range(0, 4) },
      { id: 'w', text: 'cdef', range: range(2, 6) },
    ])
  })

  it('covers an entity the range holds, and a whole entity the range cuts through', () => {
    const value = doc(p(t('to '), entity('@Ada Lovelace'), t(' now')))
    expect(annotateRichText(value, range(0, 4), 'c1')).toEqual(
      doc(p(t('to ', a('c1')), entity('@Ada Lovelace', a('c1')), t(' now'))),
    )
    const cut = annotateRichText(value, range(10, 18), 'c2')
    expect(cut).toEqual(
      doc(p(t('to '), entity('@Ada Lovelace', a('c2')), t(' n', a('c2')), t('ow'))),
    )
    expect(richTextAnnotations(cut)).toEqual([
      { id: 'c2', text: '@Ada Lovelace n', range: range(3, 18) },
    ])
  })

  it('never divides a surrogate pair, and counts an emoji as one position', () => {
    const value = doc(p(t('a😀b👩‍💻c')))
    const marked = annotateRichText(value, range(1, 2), 'e')
    expect(marked).toEqual(doc(p(t('a'), t('😀', a('e')), t('b👩‍💻c'))))
    // 👩‍💻 is three code points: woman, zero-width joiner, laptop.
    const zwj = annotateRichText(value, range(3, 6), 'z')
    expect(zwj).toEqual(doc(p(t('a😀b'), t('👩‍💻', a('z')), t('c'))))
    expect(richTextAnnotations(zwj)).toEqual([{ id: 'z', text: '👩‍💻', range: range(3, 6) }])
  })

  it('marks across blocks, lists and quotes, and skips what cannot carry it', () => {
    const value = doc(
      p(t('ab'), br, t('cd')),
      list(false, item(p(t('ef')), list(true, item(p(t('gh')))))),
      code('ij'),
      quote(p(t('kl'), { type: 'emoji', text: '👋' })),
    )
    // "ab\ncd" "ef" "gh" "ij" "kl👋": positions 1 to 14 run from "b" to the end.
    const marked = annotateRichText(value, range(1, 14), 'c1')
    expect(marked).toEqual(
      doc(
        p(t('a'), t('b', a('c1')), br, t('cd', a('c1'))),
        list(false, item(p(t('ef', a('c1'))), list(true, item(p(t('gh', a('c1'))))))),
        code('ij'),
        quote(p(t('kl', a('c1')), { type: 'emoji', text: '👋' })),
      ),
    )
    // The listed range ends at "l", the last character that carries it.
    expect(richTextAnnotations(marked)).toEqual([
      { id: 'c1', text: 'bcdefghkl', range: range(1, 13) },
    ])
  })

  it('returns the normal form unchanged for a range over nothing that can carry it', () => {
    const value = doc(p(t('x')), code('let a = 1'), p(br, { type: 'emoji', text: '👋' }))
    const read = normalizeRichText(value)
    expect(annotateRichText(value, range(1, 10), 'c1')).toEqual(read)
    expect(annotateRichText(value, range(10, 12), 'c1')).toEqual(read)
    expect(annotateRichText(value, range(0, 0), 'c1')).toEqual(read)
    expect(annotateRichText(value, range(40, 50), 'c1')).toEqual(read)
    expect(annotateRichText(value, range(0, 1), '')).toEqual(read)
    expect(annotateRichText(value, range(0, 1), 7 as unknown as string)).toEqual(read)
  })

  it('reads a document that is not in normal form first', () => {
    expect(annotateRichText(doc(p(t('a'), t(''), t('b'))), range(0, 2), 'c1')).toEqual(
      doc(p(t('ab', a('c1')))),
    )
  })

  it('does not change its input', () => {
    const value = doc(p(t('one ', bold), ada, t(' two')))
    const before = JSON.stringify(value)
    annotateRichText(value, range(1, 9), 'c1')
    removeRichTextAnnotation(annotateRichText(value, range(1, 9), 'c1'), 'c1')
    richTextAnnotations(value)
    expect(JSON.stringify(value)).toBe(before)
  })

  it('anchors one annotation to every piece a find returns', () => {
    const value = doc(p(t('the cat sat on the mat')))
    const [first, second] = richTextFindText(value, 'the')
    let marked = annotateRichText(value, first!, 'c1')
    marked = annotateRichText(marked, second!, 'c1')
    expect(richTextAnnotations(marked)).toEqual([{ id: 'c1', text: 'thethe', range: range(0, 18) }])
  })
})

describe('removeRichTextAnnotation', () => {
  it('removes every mark of one id and leaves the others', () => {
    const value = doc(
      p(t('ab', a('x')), t('cd', a('w'), a('x')), entity('@Ada', a('x'))),
      p(t('ef', a('x'))),
    )
    expect(removeRichTextAnnotation(value, 'x')).toEqual(
      doc(p(t('ab'), t('cd', a('w')), ada), p(t('ef'))),
    )
    expect(removeRichTextAnnotation(value, 'missing')).toEqual(normalizeRichText(value))
  })
})

describe('richTextAnnotations', () => {
  it('lists one entry per id in order of where each starts, then by id', () => {
    const value = doc(
      p(t('ab', a('b')), t('cd', a('a'), a('b')), t('ef')),
      p(t('gh', a('a'))),
      p(t('ij', a('c'))),
    )
    expect(richTextAnnotations(value)).toEqual([
      { id: 'b', text: 'abcd', range: range(0, 4) },
      { id: 'a', text: 'cdgh', range: range(2, 8) },
      { id: 'c', text: 'ij', range: range(8, 10) },
    ])
    expect(richTextAnnotations(doc(p(t('xy', a('z'), a('y')))))).toEqual([
      { id: 'y', text: 'xy', range: range(0, 2) },
      { id: 'z', text: 'xy', range: range(0, 2) },
    ])
  })

  it('spans two pieces, and joins them when the text between them is deleted', () => {
    const apart = doc(p(t('one', a('c1')), t(' and '), t('two', a('c1'))))
    expect(richTextAnnotations(apart)).toEqual([{ id: 'c1', text: 'onetwo', range: range(0, 11) }])
    // The text between the pieces deleted: the two runs are one.
    const joined = doc(p(t('one', a('c1')), t('two', a('c1'))))
    expect(normalizeRichText(joined)).toEqual(doc(p(t('onetwo', a('c1')))))
    expect(richTextAnnotations(joined)).toEqual([{ id: 'c1', text: 'onetwo', range: range(0, 6) }])
  })

  it('does not list an annotation whose text was deleted, or one inside a node this version does not know', () => {
    expect(richTextAnnotations(doc(p(t('plain'))))).toEqual([])
    expect(
      richTextAnnotations(doc({ type: 'callout', content: [p(t('inside', a('c1')))] })),
    ).toEqual([])
  })
})

describe('richTextFindText', () => {
  it('finds every place, not overlapping, across marks, entities and hard breaks', () => {
    const value = doc(p(t('aa'), t('a', bold), t('a')), p(t('to '), entity('@Ada'), br, t('x')))
    expect(richTextFindText(value, 'aa')).toEqual([range(0, 2), range(2, 4)])
    expect(richTextFindText(value, 'o @Ada\nx')).toEqual([range(5, 13)])
  })

  it('does not find a match that crosses from one block into the next', () => {
    const value = doc(p(t('end')), p(t('Start')), list(false, item(p(t('one'))), item(p(t('two')))))
    expect(richTextPlainText(value, { blockSeparator: '' })).toContain('endStart')
    expect(richTextFindText(value, 'endStart')).toEqual([])
    expect(richTextFindText(value, 'onetwo')).toEqual([])
    expect(richTextFindText(value, 'Start')).toEqual([range(3, 8)])
  })

  it('finds text in a code block and a heading, counting astral characters as one', () => {
    const value = doc(h(1, t('😀 smile')), code('const smile = 1'))
    expect(richTextFindText(value, 'smile')).toEqual([range(2, 7), range(13, 18)])
  })

  it('finds nothing for an empty or missing quote', () => {
    expect(richTextFindText(doc(p(t('abc'))), '')).toEqual([])
    expect(richTextFindText(doc(p(t('abc'))), 3 as unknown as string)).toEqual([])
    expect(richTextFindText(doc(p(t('abc'))), 'abcd')).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* A property: annotating a range anchors exactly the words that can carry it   */
/* -------------------------------------------------------------------------- */

/** A small deterministic generator, so a failure reproduces. */
function random(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(items: readonly T[]): T => items[int(items.length)] as T
  return { int, pick }
}

/** One code point of the generated text: what it is, whether an annotation can sit on it, and the unit it belongs to. */
interface Point {
  char: string
  carrier: boolean
  /** The points of one entity share a unit; every other point is its own. */
  unit: number
}

const CHARS = ['a', 'b', ' ', 'é', '😀', '👩', '‍', '💻', '\n', '中']

/**
 * A random document and, beside it, its plain text as points, built from the
 * same choices. The points are the test's own account of the document: which
 * code point is a text's or an entity's, so which can carry an annotation.
 */
function generate(seed: number): { value: RichTextDocument; points: Point[] } {
  const r = random(seed)
  const points: Point[] = []
  let unit = 0
  const word = () => {
    const out: string[] = []
    for (let n = 1 + r.int(4); n > 0; n -= 1) out.push(r.pick(CHARS))
    return out
  }
  const inline = (): unknown => {
    switch (r.int(6)) {
      case 0: {
        const label = ['@', ...word()]
        unit += 1
        for (const char of label) points.push({ char, carrier: true, unit })
        return entity(label.join(''))
      }
      case 1:
        points.push({ char: '\n', carrier: false, unit: (unit += 1) })
        return br
      case 2: {
        const text = word()
        for (const char of text) points.push({ char, carrier: false, unit: (unit += 1) })
        return { type: 'emoji', text: text.join('') }
      }
      default: {
        const text = word()
        for (const char of text) points.push({ char, carrier: true, unit: (unit += 1) })
        return r.int(2) === 0
          ? t(text.join(''))
          : t(text.join(''), r.pick([bold, italic, a('old')]))
      }
    }
  }
  const line = () => {
    const content: unknown[] = []
    for (let n = r.int(4); n > 0; n -= 1) content.push(inline())
    return content
  }
  const block = (depth: number): unknown => {
    switch (depth > 2 ? r.int(3) : r.int(6)) {
      case 0:
        return h(1 + r.int(3), ...line())
      case 1: {
        const text = word()
        for (const char of text) points.push({ char, carrier: false, unit: (unit += 1) })
        return r.int(2) === 0 ? code(text.join('')) : { type: 'callout', text: text.join('') }
      }
      case 3:
        return quote(block(depth + 1))
      case 4: {
        const items: unknown[] = []
        for (let n = 1 + r.int(2); n > 0; n -= 1)
          items.push(item(p(...line()), ...(r.int(3) === 0 ? [block(depth + 1)] : [])))
        return list(r.int(2) === 0, ...items)
      }
      default:
        return p(...line())
    }
  }
  const blocks: unknown[] = []
  for (let n = 1 + r.int(4); n > 0; n -= 1) blocks.push(block(0))
  return { value: doc(...blocks) as RichTextDocument, points }
}

describe('annotating a random range', () => {
  it('anchors the words the range covered that can carry an annotation, and nothing else', () => {
    let anchored = 0
    for (let seed = 1; seed <= 400; seed += 1) {
      const { value, points } = generate(seed)
      const plain = points.map((point) => point.char).join('')
      expect(richTextPlainText(value, { blockSeparator: '' }), `seed ${seed}`).toBe(plain)
      expect(richTextLength(value), `seed ${seed}`).toBe(points.length)

      const r = random(seed * 7919)
      const start = r.int(points.length + 2) - 1
      const end = start + r.int(points.length + 2)
      const marked = annotateRichText(value, range(start, end), 'a')

      // The range, clamped, and widened to whole entities at its ends.
      let from = Math.max(0, start)
      let to = Math.min(points.length, end)
      if (from < to) {
        while (from > 0 && points[from - 1]!.unit === points[from]!.unit) from -= 1
        while (to < points.length && points[to]!.unit === points[to - 1]!.unit) to += 1
      }
      const carried: number[] = []
      for (let index = from; index < to; index += 1) if (points[index]!.carrier) carried.push(index)

      // Text and length never change.
      expect(richTextPlainText(marked, { blockSeparator: '' }), `seed ${seed}`).toBe(plain)
      const listed = richTextAnnotations(marked).filter((entry) => entry.id === 'a')
      if (carried.length === 0) {
        expect(marked, `seed ${seed}`).toEqual(normalizeRichText(value))
        expect(listed, `seed ${seed}`).toEqual([])
        continue
      }
      anchored += 1
      const first = carried[0]!
      const last = carried.at(-1)! + 1
      expect(listed, `seed ${seed}`).toEqual([
        {
          id: 'a',
          text: carried.map((index) => points[index]!.char).join(''),
          range: range(first, last),
        },
      ])
      expect(richTextRangeText(marked, listed[0]!.range), `seed ${seed}`).toBe(
        points
          .slice(first, last)
          .map((point) => point.char)
          .join(''),
      )
      // Removing it gives back the document as it was.
      expect(removeRichTextAnnotation(marked, 'a'), `seed ${seed}`).toEqual(
        normalizeRichText(value),
      )
    }
    // The generator made ranges that anchored something in most cases.
    expect(anchored).toBeGreaterThan(200)
  })
})

/* -------------------------------------------------------------------------- */
/* Cost on a hostile document                                                  */
/* -------------------------------------------------------------------------- */

/** The least time `run` takes over `times` runs, in milliseconds: the run least disturbed by anything else. */
function fastest(run: () => unknown, times: number): number {
  let best = Infinity
  for (let index = 0; index < times; index += 1) {
    const start = performance.now()
    run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

describe('cost on a hostile document', () => {
  /*
   * Each function runs on a document and on one sixteen times its size, in
   * the same run, so the machine's speed and load cancel out. Work that grows
   * with the document takes about sixteen times as long on the larger one;
   * work that counts from the start for every match or every annotation takes
   * about 256 times as long. The bound, 64, is four times the first and a
   * quarter of the second.
   */
  const SMALL = 2_000
  const FACTOR = 16
  const BOUND = 64

  const ratio = (make: (size: number) => unknown, run: (value: unknown) => unknown) => {
    const small = normalizeRichText(make(SMALL))
    const large = normalizeRichText(make(SMALL * FACTOR))
    run(large)
    return fastest(() => run(large), 3) / fastest(() => run(small), 9)
  }

  it('finds every match of a quote in one pass, however many there are', () => {
    const repeated = (size: number) => doc(p(t('e'.repeat(size))))
    expect(richTextFindText(repeated(SMALL * FACTOR), 'e')).toHaveLength(SMALL * FACTOR)
    expect(ratio(repeated, (value) => richTextFindText(value, 'e'))).toBeLessThan(BOUND)
  })

  it('lists every annotation in one pass, however many there are', () => {
    const anchored = (size: number) =>
      doc(p(...Array.from({ length: size }, (_, index) => t('a😀', a(`c${index}`)))))
    const listed = richTextAnnotations(anchored(SMALL * FACTOR))
    expect(listed).toHaveLength(SMALL * FACTOR)
    expect(listed.at(-1)?.range).toEqual(range(2 * (SMALL * FACTOR - 1), 2 * SMALL * FACTOR))
    expect(ratio(anchored, (value) => richTextAnnotations(value))).toBeLessThan(BOUND)
  })

  it('counts the same positions in one pass as from the start, surrogate halves included', () => {
    const pieces = ['a', '😀', '\uD83D', '\uDE00', 'é', '']
    const r = random(31)
    for (let round = 0; round < 300; round += 1) {
      const text = Array.from({ length: r.int(12) }, () => pieces[r.int(pieces.length)]).join('')
      const indexes = Array.from({ length: r.int(8) }, () => r.int(text.length + 3)).sort(
        (x, y) => x - y,
      )
      const position = positionCounter(text)
      expect(
        indexes.map((index) => position(index)),
        JSON.stringify([text, indexes]),
      ).toEqual(indexes.map((index) => positionOf(text, index)))
    }
  })
})
