import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parsePartial } from './partial'

/**
 * `parsePartial`'s laws, over every cut of real screens.
 *
 * Each prefix of a document a model writes is read as the document it holds
 * so far. Three things hold at every cut:
 *
 *  - nothing in it is half-written but the one string being written, and
 *    that only where a reader reads it: every component name, prop name,
 *    number, literal and binding is the whole document's at the same path;
 *  - the text a renderer draws, read in document order, only grows;
 *  - the whole text gives exactly `JSON.parse`'s result.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const SCREENS = resolve(ROOT, 'design/screens')

/** Every screen under `design/screens/`, the agent loop's attempts included. */
const texts = readdirSync(SCREENS, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ file, text: readFileSync(join(SCREENS, file), 'utf8') }))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Whether `partial` is a cut of `whole` at `path`: every key it has, the whole
 * has; every value it has is the whole's, except the one string at `open`,
 * which is a prefix of the whole's.
 */
function cutOf(partial: unknown, whole: unknown, path: string, open: string | null): string | null {
  if (Array.isArray(partial)) {
    if (!Array.isArray(whole)) return `${path}: a list where the whole has ${JSON.stringify(whole)}`
    if (partial.length > whole.length) return `${path}: more items than the whole`
    for (const [at, item] of partial.entries()) {
      const fault = cutOf(item, whole[at], `${path}[${at}]`, open)
      if (fault !== null) return fault
    }
    return null
  }
  if (isRecord(partial)) {
    if (!isRecord(whole)) return `${path}: an object where the whole has ${JSON.stringify(whole)}`
    // A binding and a component name are whole or absent.
    if ('$' in partial && partial['$'] !== whole['$']) return `${path}: a half-written binding`
    if ('component' in partial && partial['component'] !== whole['component']) {
      return `${path}: a half-written component name`
    }
    for (const [key, item] of Object.entries(partial)) {
      if (!Object.prototype.hasOwnProperty.call(whole, key))
        return `${path}: a key the whole lacks, ${key}`
      // A structured object's fields sit at its own path, as the validator writes them.
      const at = key === '$object' ? path : `${path}.${key}`
      const fault = cutOf(item, whole[key], at, open)
      if (fault !== null) return fault
    }
    return null
  }
  if (typeof partial === 'string' && typeof whole === 'string' && path === open) {
    return whole.startsWith(partial)
      ? null
      : `${path}: an open string that is not the whole's start`
  }
  return Object.is(partial, whole)
    ? null
    : `${path}: ${JSON.stringify(partial)} is not ${JSON.stringify(whole)}`
}

/** The text a renderer draws, in document order: each string a child or a prop value holds. */
function drawnText(value: unknown, drawn = false): string {
  if (typeof value === 'string') return drawn ? value : ''
  if (Array.isArray(value)) return value.map((item) => drawnText(item, drawn)).join('')
  if (!isRecord(value)) return ''
  let out = ''
  for (const [key, item] of Object.entries(value)) {
    if (key === 'props' || key === '$object') {
      out += isRecord(item)
        ? Object.values(item)
            .map((prop) => drawnText(prop, true))
            .join('')
        : ''
    } else if (key === 'children') out += drawnText(item, true)
    else if (key === 'root') out += drawnText(item)
  }
  return out
}

/** Every cut of a text, checked against the whole: the laws above. */
function everyCut(text: string, whole: unknown, offset = 0) {
  let drawn = ''
  let open = 0
  for (let end = offset; end <= text.length; end += 1) {
    const cut = parsePartial(text.slice(0, end))
    expect(cut.error, `cut at ${end}`).toBeNull()
    if (cut.document === undefined) continue
    const fault = cutOf(cut.document, whole, '$', cut.open)
    if (fault !== null) throw new Error(`cut at ${end}: ${fault}`)
    const now = drawnText(cut.document)
    if (!now.startsWith(drawn)) {
      throw new Error(
        `cut at ${end}: the drawn text went from ${JSON.stringify(drawn)} to ${JSON.stringify(now)}`,
      )
    }
    drawn = now
    if (cut.open !== null) open += 1
  }
  return { drawn, open }
}

describe('every cut of a real screen', () => {
  it('reads at least three screens', () => {
    expect(texts.length).toBeGreaterThanOrEqual(3)
  })

  for (const { file, text } of texts) {
    it(`${file}: holds nothing half-written, and its drawn text only grows`, () => {
      const whole = JSON.parse(text) as unknown
      const { drawn, open } = everyCut(text, whole)
      // The laws held over cuts that draw text and keep a string open.
      expect(drawn.length).toBeGreaterThan(0)
      expect(open).toBeGreaterThan(0)
    }, 60_000)

    it(`${file}: the whole text is JSON.parse's result`, () => {
      const read = parsePartial(text)
      expect(read.complete).toBe(true)
      expect(read.open).toBeNull()
      expect(read.error).toBeNull()
      expect(read.document).toEqual(JSON.parse(text))
    })
  }
})

describe('a model’s answer', () => {
  const [first] = texts
  const text = first?.text ?? '{}'
  const answer = [
    'Here is the screen. It lists the tickets, with { braces } in the prose.',
    '',
    '```json',
    text.trimEnd(),
    '```',
    '',
    'The filters are inputs.',
  ].join('\n')

  it('reads the fenced block after prose, at every cut', () => {
    const whole = JSON.parse(text) as unknown
    everyCut(answer, whole)
    expect(parsePartial(answer).document).toEqual(whole)
    expect(parsePartial(answer).complete).toBe(true)
  }, 60_000)

  it('waits for a fence still being opened instead of reading the prose’s braces', () => {
    expect(parsePartial('Here { it } is:\n``').document).toBeUndefined()
    expect(parsePartial('Here { it } is:\n```js').document).toBeUndefined()
    expect(parsePartial('Here { it } is:\n```json\n{"spec"').document).toEqual({})
  })

  it('reads the first block marked json, after a block of another language', () => {
    const read = parsePartial('```ts\nconst a = {}\n```\n\n```json\n{"name":"A"}\n```')
    expect(read.document).toEqual({ name: 'A' })
    expect(read.complete).toBe(true)
  })

  it('reads a bare document, with prose before and after it', () => {
    expect(parsePartial('Sure: {"name":"A"} — done.').document).toEqual({ name: 'A' })
    expect(parsePartial('no document yet').document).toBeUndefined()
  })
})

describe('what a cut keeps and what it leaves out', () => {
  const doc = (root: string) => `{"spec":"polymorph-screen/1","inputs":[],"root":${root}`

  it('leaves out a component name, a prop name, a number and a literal while they are written', () => {
    expect(parsePartial(doc('{"component":"Butt')).document).toEqual({
      spec: 'polymorph-screen/1',
      inputs: [],
    })
    expect(parsePartial(doc('{"component":"Button","props":{"lab')).document).toMatchObject({
      root: { component: 'Button', props: {} },
    })
    expect(parsePartial(doc('{"component":"Stack","props":{"gap":1')).document).toMatchObject({
      root: { component: 'Stack', props: {} },
    })
    expect(parsePartial(doc('{"component":"Stack","props":{"gap":12}')).document).toMatchObject({
      root: { component: 'Stack', props: { gap: 12 } },
    })
    expect(parsePartial(doc('{"component":"Stack","props":{"gap":1.')).document).toMatchObject({
      root: { props: {} },
    })
    expect(
      parsePartial(doc('{"component":"Button","props":{"loading":tru')).document,
    ).toMatchObject({
      root: { props: {} },
    })
    expect(
      parsePartial(doc('{"component":"Button","props":{"loading":true')).document,
    ).toMatchObject({
      root: { props: { loading: true } },
    })
  })

  it('keeps a string a reader reads while it is written, and says where it is', () => {
    const label = parsePartial(doc('{"component":"Button","props":{"label":"Sa'))
    expect(label.document).toMatchObject({ root: { props: { label: 'Sa' } } })
    expect(label.open).toBe('$.root.props.label')
    const child = parsePartial(doc('{"component":"Text","children":["Hello, wor'))
    expect(child.document).toMatchObject({ root: { children: ['Hello, wor'] } })
    expect(child.open).toBe('$.root.children[0]')
    const field = parsePartial(
      doc('{"component":"EmptyState","props":{"emptyState":{"$object":{"title":"No'),
    )
    expect(field.document).toMatchObject({
      root: { props: { emptyState: { $object: { title: 'No' } } } },
    })
    expect(field.open).toBe('$.root.props.emptyState.title')
  })

  it('leaves out a binding until its path is whole', () => {
    expect(parsePartial(doc('{"component":"Text","children":[{"$":"draft')).document).toMatchObject(
      {
        root: { children: [] },
      },
    )
    expect(
      parsePartial(doc('{"component":"Text","children":[{"$":"draft"')).document,
    ).toMatchObject({
      root: { children: [{ $: 'draft' }] },
    })
  })

  it('leaves out an element until it says what it is', () => {
    expect(
      parsePartial(doc('{"component":"Stack","children":[{"props":{"label":"Save"},"comp'))
        .document,
    ).toMatchObject({ root: { children: [] } })
    expect(
      parsePartial(
        doc('{"component":"Stack","children":[{"props":{"label":"Save"},"component":"Button"'),
      ).document,
    ).toMatchObject({ root: { children: [{ component: 'Button', props: { label: 'Save' } }] } })
  })

  it('keeps an input only when it is whole', () => {
    const text =
      '{"spec":"polymorph-screen/1","inputs":[{"name":"a","type":"string"},{"name":"b","type":"(id: str'
    expect(parsePartial(text).document).toEqual({
      spec: 'polymorph-screen/1',
      inputs: [{ name: 'a', type: 'string' }],
    })
    expect(parsePartial('{"name":"Inbo').document).toEqual({})
  })

  it('leaves out an escape until it is whole, and a high surrogate until its pair', () => {
    const at = (text: string) =>
      parsePartial(doc(`{"component":"Text","children":["${text}`)).document
    expect(at('a\\')).toMatchObject({ root: { children: ['a'] } })
    expect(at('a\\u00')).toMatchObject({ root: { children: ['a'] } })
    expect(at('a\\u00e9')).toMatchObject({ root: { children: ['aé'] } })
    expect(at('a\\ud83d')).toMatchObject({ root: { children: ['a'] } })
    expect(at('a\\ud83d\\ude00')).toMatchObject({ root: { children: ['a😀'] } })
  })

  it('sets a `__proto__` key as the object’s own, as JSON.parse does', () => {
    const text = '{"spec":"x","root":{"component":"A","props":{"__proto__":{"polluted":true}}}}'
    const read = parsePartial(text)
    expect(read.document).toEqual(JSON.parse(text))
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  it('reads every JSON number and escape as JSON.parse does', () => {
    const text =
      '{"a":[0,-0,1.5,-2e3,1E-2,123456789012],"b":"\\"\\\\\\/\\b\\f\\n\\r\\t\\u2028","c":[true,false,null],"d":{}}'
    expect(parsePartial(text).document).toEqual(JSON.parse(text))
  })
})

describe('text that stops being JSON', () => {
  it('says where, and holds what came before', () => {
    const read = parsePartial('{"name":"A","inputs":[1,],"root":{}}')
    expect(read.error?.at).toBe('{"name":"A","inputs":[1,'.length)
    // The inputs hold the item that was whole.
    expect(read.document).toEqual({ name: 'A', inputs: [1] })
    expect(read.complete).toBe(false)
  })

  it('refuses a control character inside a string and a leading zero', () => {
    expect(parsePartial('{"name":"A\nB"}').error?.message).toContain('control character')
    expect(parsePartial('{"a":01}').error?.message).toBe('a number')
    expect(parsePartial('{"a":tx}').error?.message).toBe('a value')
  })
})
