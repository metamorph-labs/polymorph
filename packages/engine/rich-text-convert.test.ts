import { describe, expect, it } from 'vitest'

import {
  normalizeRichText,
  restrictRichText,
  RICH_TEXT_FORMAT,
  RICH_TEXT_FORMATS,
  type RichTextFormat,
} from './src/rich-text/index'
import { fromEditorDoc, toEditorDoc } from './src/rich-text-editor/convert'
import { buildSchema } from './src/rich-text-editor/schema'
import type { RichTextEditorClasses } from './src/rich-text-editor/types'

/**
 * The editor's conversion against the model: a document in normal form,
 * restricted to a field's formats, goes into the editor and comes back as the
 * same document. The editor holds what the model keeps and nothing else, so a
 * stored document does not change on its first edit and a server can tell
 * what a field holds from the model alone. It lives at the package root
 * because the conversion reads no document object.
 *
 * One input comes back different, on purpose: a document of one empty
 * paragraph is the empty document, because the editor needs a block to hold
 * a caret and the empty document is no blocks.
 */

const CLASSES: RichTextEditorClasses = {
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

const schemaFor = (formats: readonly RichTextFormat[]) =>
  buildSchema({
    formats,
    entities: [{ kind: 'user', trigger: '@' }],
    classes: CLASSES,
    headingLevel: 2,
  })

/** What a field that allows `formats` gives back for `value`, through the editor. */
function through(value: unknown, formats: readonly RichTextFormat[] = RICH_TEXT_FORMATS) {
  return fromEditorDoc(toEditorDoc(schemaFor(formats), restrictRichText(value, formats)))
}

/** What the model says that field holds: the empty document for one empty paragraph. */
function expected(value: unknown, formats: readonly RichTextFormat[] = RICH_TEXT_FORMATS) {
  const held = restrictRichText(value, formats)
  const [only] = held.blocks
  const bare =
    held.blocks.length === 1 &&
    JSON.stringify(only) === JSON.stringify({ type: 'paragraph', content: [] })
  return bare ? { ...held, blocks: [] } : held
}

const doc = (...blocks: unknown[]) => ({ format: RICH_TEXT_FORMAT, blocks })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, ...marks: unknown[]) =>
  marks.length === 0 ? { type: 'text', text } : { type: 'text', text, marks }

const MARKS: unknown[] = [
  { type: 'bold' },
  { type: 'italic' },
  { type: 'strike' },
  { type: 'code' },
  { type: 'link', href: 'https://a.example' },
  { type: 'link', href: '/x', rel: 'kept' },
  { type: 'annotation', id: 'c1' },
  { type: 'annotation', id: 'c2', by: 'ada' },
  { type: 'highlight', colour: 'yellow' },
  { type: 'bold', weight: 7 },
]

describe('every mark on every inline in every block', () => {
  /** Every set of up to three marks, in the order given. */
  const sets = (): unknown[][] => {
    const out: unknown[][] = [[]]
    for (const a of MARKS) {
      out.push([a])
      for (const b of MARKS) {
        if (b === a) continue
        out.push([a, b])
        for (const c of MARKS) if (c !== a && c !== b) out.push([a, b, c])
      }
    }
    return out
  }

  it('comes back as the model reads it, in a paragraph, a heading, a list and a quote', () => {
    const inlines = sets().flatMap((marks) => [
      t('x', ...marks),
      { type: 'entity', kind: 'user', id: 'u1', label: '@Ada', marks },
      { type: 'text', text: 'y', marks, lang: 'fr' },
    ])
    const lines = [
      ...inlines,
      { type: 'break' },
      { type: 'break', extra: true },
      { type: 'emoji', text: '👋' },
    ]
    const blocks = [
      p(...lines),
      { type: 'heading', level: 2, content: lines },
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          {
            type: 'listItem',
            content: [p(...lines), { type: 'heading', level: 1, content: lines }],
          },
        ],
      },
      {
        type: 'blockquote',
        content: [p(...lines), { type: 'codeBlock', language: 'ts', text: 'a\nb' }],
      },
      { type: 'callout', content: [p(t('kept'))] },
    ]
    const value = doc(...blocks)
    expect(through(value)).toEqual(expected(value))
    for (const formats of [
      ['bold', 'link'],
      ['heading', 'code'],
      [],
      ['bulletList', 'italic'],
    ] as const)
      expect(through(value, formats), formats.join()).toEqual(expected(value, formats))
  })

  it('keeps a field named __proto__ as data, and sets no prototype', () => {
    const source = `{"format":"${RICH_TEXT_FORMAT}","__proto__":{"a":1},"blocks":[{"type":"paragraph","__proto__":{"b":2},"content":[{"type":"text","text":"x","__proto__":{"c":3},"marks":[{"type":"bold","__proto__":{"d":4}}]},{"type":"break","__proto__":{"e":5}},{"type":"entity","kind":"user","id":"u","label":"@U","__proto__":{"f":6}}]},{"type":"list","ordered":false,"__proto__":{"g":7},"items":[{"type":"listItem","__proto__":{"h":8},"content":[{"type":"paragraph","content":[]}]}]}]}`
    const value = normalizeRichText(source)
    const back = through(value)
    expect(JSON.stringify(back)).toBe(JSON.stringify(value))
    expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(source))
    const paragraph = back.blocks[0] as unknown as Record<string, unknown>
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(paragraph)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(paragraph, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).b).toBeUndefined()
  })

  it('reads a numbered list’s first number by the reader’s rule', () => {
    const list = (start: unknown) =>
      doc({
        type: 'list',
        ordered: true,
        start,
        items: [{ type: 'listItem', content: [p(t('a'))] }],
      })
    for (const start of [0, 3, 1e300, -2, 2.5, Number.MAX_SAFE_INTEGER + 2])
      expect(through(list(start)), String(start)).toEqual(expected(list(start)))
  })
})

/* -------------------------------------------------------------------------- */
/* A property: random documents                                                */
/* -------------------------------------------------------------------------- */

/** A small deterministic generator, so a failure reproduces from its seed. */
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
  const pick = <T>(list: readonly T[]): T => list[int(list.length)] as T
  const chance = (p: number) => next() < p
  return { int, pick, chance }
}

type Random = ReturnType<typeof random>

const TEXTS = ['a', 'b c', ' ', '😀', 'é', '\t', 'x\ny', '@ada', '']
const LOOSE: unknown[] = [
  { type: 'paragraph' },
  { type: 'text', text: 'loose' },
  null,
  'bold',
  { type: 'text' },
  { type: 'entity', label: '@NoId' },
  { type: 'mention2', text: 'hi' },
]

function marksOf(r: Random): unknown[] | undefined {
  if (r.chance(0.35)) return undefined
  return Array.from({ length: r.int(4) }, () =>
    r.chance(0.9)
      ? r.pick(MARKS)
      : r.pick([{ type: 'link', href: 'javascript:x' }, { type: 'annotation' }, 7]),
  )
}

function inline(r: Random): unknown {
  const roll = r.int(20)
  if (roll < 11) {
    const node: Record<string, unknown> = { type: 'text', text: r.pick(TEXTS) }
    const marks = marksOf(r)
    if (marks) node.marks = marks
    if (r.chance(0.05)) node.lang = 'fr'
    return node
  }
  if (roll < 13) return r.chance(0.8) ? { type: 'break' } : { type: 'break', soft: true }
  if (roll < 16) {
    const node: Record<string, unknown> = {
      type: 'entity',
      kind: 'user',
      id: r.pick(['u1', 'u2']),
      label: '@Ada',
    }
    const marks = marksOf(r)
    if (marks) node.marks = marks
    return node
  }
  if (roll < 18) return { type: 'emoji', text: '👋', name: 'wave' }
  return r.pick(LOOSE)
}

const inlines = (r: Random) => Array.from({ length: r.int(5) }, () => inline(r))

function block(r: Random, depth: number): unknown {
  const roll = r.int(20)
  if (roll < 6 || depth > 11)
    return {
      type: 'paragraph',
      content: inlines(r),
      ...(r.chance(0.05) ? { align: 'center' } : {}),
    }
  if (roll < 9) return { type: 'heading', level: r.pick([1, 2, 3, 4, 0]), content: inlines(r) }
  if (roll < 12) {
    const list: Record<string, unknown> = {
      type: 'list',
      ordered: r.chance(0.5),
      items: Array.from({ length: r.int(3) }, () =>
        r.chance(0.85) ? { type: 'listItem', content: blocks(r, depth + 1) } : block(r, depth + 1),
      ),
    }
    if (r.chance(0.3)) list.start = r.pick([0, 1, 4, -1, 2.5, 1e300])
    return list
  }
  if (roll < 14) return { type: 'blockquote', content: blocks(r, depth + 1) }
  if (roll < 16)
    return {
      type: 'codeBlock',
      text: r.pick(['', 'x', 'a\nb', '😀\r\n']),
      language: r.pick([undefined, '', 'ts', 3]),
    }
  if (roll < 18)
    return { type: 'callout', tone: 'note', content: [{ type: 'paragraph', content: inlines(r) }] }
  return r.pick(LOOSE)
}

const blocks = (r: Random, depth: number) => Array.from({ length: r.int(4) }, () => block(r, depth))

describe('random documents', () => {
  it('come back from the editor as their normal form, restricted to the field’s formats', () => {
    const fields: readonly (readonly RichTextFormat[])[] = [
      RICH_TEXT_FORMATS,
      ['bold', 'italic', 'link'],
      ['heading', 'code', 'codeBlock'],
      ['orderedList', 'blockquote', 'strike'],
      [],
    ]
    for (let seed = 1; seed <= 1500; seed += 1) {
      const value = { format: RICH_TEXT_FORMAT, blocks: blocks(random(seed), 0) }
      for (const formats of fields) {
        expect(through(value, formats), `seed ${seed}, ${formats.join()}`).toEqual(
          expected(value, formats),
        )
      }
    }
  })
})
