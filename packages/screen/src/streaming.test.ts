import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { surfaceOf } from './members'
import { parsePartial } from './partial'
import { VOCABULARY } from './vocabulary'
import { createScreen, type Drawn, type Screen, type ScreenNode } from './walk'

/**
 * When an element a model is still writing is drawn.
 *
 * While a document streams, an element is drawn once every prop it requires
 * is written whole and the text ends outside it, in its `children`, or in an
 * element one of its props holds. A prop written after that arrives when it is
 * whole. So a renderer is never handed a member without a prop it requires,
 * nor a half-written value, and a container or a page is drawn while its
 * children or the elements in its props are still being written. The laws,
 * over every cut of every screen in `design/screens/` and in the fixtures: a
 * drawn element has every prop it requires, every value it is given is the
 * whole document's, and an element once drawn stays drawn.
 */

const ROOT = resolve(import.meta.dirname, '../../..')

function texts(dir: string): { file: string; text: string }[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') }))
}

const SCREENS = [
  ...texts(resolve(ROOT, 'design/screens')).map(({ file, text }) => ({
    file: `design/screens/${file}`,
    text,
  })),
  ...texts(resolve(ROOT, 'packages/screen/fixtures')).map(({ file, text }) => ({
    file: `fixtures/${file}`,
    text,
  })),
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * What a renderer is handed, as leaves by path: each node as its component,
 * each value it is given as JSON, each function the screen makes as `fn`.
 * Text children are left out: they are drawn as they are written.
 */
function handed(screen: Screen): Map<string, string> {
  const found = new Map<string, string>()
  const leaf = (value: Drawn, at: string) => {
    if (value.kind === 'node') node(value.node)
    else if (value.kind === 'list')
      value.items.forEach((item, index) => leaf(item, `${at}[${index}]`))
    else if (value.kind === 'record') {
      for (const [key, field] of Object.entries(value.fields)) leaf(field, `${at}.${key}`)
    } else if (value.kind === 'value') data(value.value, at)
    else if (value.kind === 'binding') data(value.value, at)
  }
  // Data is compared leaf by leaf, so an object that later holds an element too compares alike.
  const data = (value: unknown, at: string) => {
    if (Array.isArray(value)) value.forEach((item, index) => data(item, `${at}[${index}]`))
    else if (isRecord(value))
      for (const [key, item] of Object.entries(value)) data(item, `${at}.${key}`)
    else found.set(at, typeof value === 'function' ? 'fn' : JSON.stringify(value))
  }
  const node = (at: ScreenNode) => {
    found.set(at.path, `node ${at.component}`)
    for (const [name, value] of Object.entries(at.props)) leaf(value, `${at.path}.props.${name}`)
    for (const child of at.children) if (child.kind === 'node') node(child.node)
  }
  if (screen.root !== null) node(screen.root)
  return found
}

/** Every drawn node without a prop its member requires: a callback is stubbed, a binding may find no data. */
function missing(screen: Screen): string[] {
  const out: string[] = []
  const visit = (value: Drawn) => {
    if (value.kind === 'node') node(value.node)
    else if (value.kind === 'list') value.items.forEach(visit)
    else if (value.kind === 'record') Object.values(value.fields).forEach(visit)
  }
  const node = (at: ScreenNode) => {
    const written = isRecord(at.element.props) ? at.element.props : {}
    for (const prop of at.fault === null
      ? (surfaceOf(VOCABULARY, at.component)?.props ?? [])
      : []) {
      if (prop.optional || prop.name === 'children' || prop.name in at.props) continue
      const value = written[prop.name]
      if (isRecord(value) && typeof value['$'] === 'string') continue
      out.push(`${at.path}.props.${prop.name}`)
    }
    Object.values(at.props).forEach(visit)
    at.children.forEach(visit)
  }
  if (screen.root !== null) node(screen.root)
  return out
}

interface Cut {
  cut: string | null
  streaming: boolean
  handed: Map<string, string>
  missing: string[]
}

/** A screen fed each cut of a text in turn, and what it handed a renderer at each. */
function stream(text: string): { cuts: Cut[]; whole: Map<string, string> } {
  const screen = createScreen({ document: undefined, vocabulary: VOCABULARY, streaming: true })
  const cuts: Cut[] = []
  for (let end = 1; end < text.length; end += 1) {
    const read = parsePartial(text.slice(0, end))
    screen.update({
      document: read.document,
      open: read.open,
      cut: read.cut,
      streaming: !read.complete,
    })
    cuts.push({
      cut: read.cut,
      streaming: !read.complete,
      handed: handed(screen),
      missing: missing(screen),
    })
  }
  screen.update({ document: JSON.parse(text) as unknown, open: null, cut: null, streaming: false })
  return { cuts, whole: handed(screen) }
}

describe('every cut of every screen', () => {
  for (const { file, text } of SCREENS) {
    it(`${file}: draws an element with every prop it requires and whole values, and keeps it drawn`, () => {
      const { cuts, whole } = stream(text)
      let before = new Map<string, string>()
      for (const [at, now] of cuts.entries()) {
        // Once the document is whole every element is drawn, and what it lacks is the validator's.
        if (now.streaming) expect(now.missing, `cut ${at + 1}`).toEqual([])
        for (const [path, value] of now.handed) {
          if (whole.get(path) !== value) {
            throw new Error(
              `cut ${at + 1}: ${path} is handed ${value}, and whole ${whole.get(path) ?? 'nothing'}`,
            )
          }
        }
        for (const [path, value] of before) {
          if (value.startsWith('node ') && !now.handed.has(path)) {
            throw new Error(`cut ${at + 1}: ${path} was drawn, and is not now`)
          }
        }
        before = now.handed
      }
      // The law held over a stream that draws part of the screen before it ends.
      expect(cuts.some((now) => now.handed.size > 0 && now.handed.size < whole.size)).toBe(true)
    }, 60_000)
  }

  it('draws a Dashboard while its last panel is still being written', () => {
    const text = readFileSync(resolve(ROOT, 'packages/screen/fixtures/usage-overview.json'), 'utf8')
    const { cuts } = stream(text)
    const early = cuts.filter(
      (now) =>
        now.handed.get('$.root') === 'node Dashboard' &&
        now.cut !== null &&
        now.cut.startsWith('$.root.props.secondary'),
    )
    expect(early.length).toBeGreaterThan(0)
    // The panel being written is drawn as soon as its children begin.
    expect(
      early.some((now) => now.handed.get('$.root.props.secondary') === 'node Dashboard.Panel'),
    ).toBe(true)
  })

  /**
   * A prop an element requires, written after a prop that holds an element:
   * the element waits for it, and is drawn once it is whole. Two screens write
   * one, and each element waits.
   */
  it('waits for a required data prop written after a prop that holds an element', () => {
    const late: { file: string; at: string; name: string; text: string }[] = []
    const holds = (value: unknown): boolean =>
      Array.isArray(value)
        ? value.some(holds)
        : isRecord(value) &&
          (typeof value['component'] === 'string' ||
            (isRecord(value['$object']) && Object.values(value['$object']).some(holds)))
    const visit = (value: unknown, at: string, file: string, text: string) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${at}[${index}]`, file, text))
        return
      }
      if (!isRecord(value)) return
      if (typeof value['component'] === 'string' && isRecord(value['props'])) {
        const required = new Set(
          (surfaceOf(VOCABULARY, value['component'])?.props ?? [])
            .filter((prop) => !prop.optional && prop.name !== 'children')
            .map((prop) => prop.name),
        )
        let slot = false
        for (const [name, prop] of Object.entries(value['props'])) {
          if (holds(prop)) slot = true
          else if (slot && required.has(name)) late.push({ file, at, name, text })
        }
      }
      for (const [key, item] of Object.entries(value)) visit(item, `${at}.${key}`, file, text)
    }
    for (const { file, text } of SCREENS) {
      visit((JSON.parse(text) as { root: unknown }).root, '$.root', file, text)
    }
    expect(late.map(({ file, at, name }) => `${file} ${at}.props.${name}`)).toEqual([
      'design/screens/agent-loop/attempt-1.json $.root.props.emptyState',
      'fixtures/ticket-queue.json $.root.props.actions.props.items',
    ])
    for (const { file, at, name, text } of late) {
      const { cuts } = stream(text)
      const writing = cuts.filter((now) => now.cut?.startsWith(`${at}.props.${name}`) === true)
      expect(writing.length, file).toBeGreaterThan(0)
      for (const now of writing) expect(now.handed.has(at), `${file} ${now.cut}`).toBe(false)
    }
  })
})

describe('an element still being written', () => {
  const doc = (root: string) =>
    `{"spec":"polymorph-screen/1","name":"A","purpose":"A.","inputs":[],"root":${root}`
  const at = (text: string) => {
    const read = parsePartial(text)
    return createScreen({
      document: read.document,
      vocabulary: VOCABULARY,
      streaming: !read.complete,
      open: read.open,
      cut: read.cut,
    })
  }

  it('is not drawn while its props are written, and is once they close', () => {
    expect(at(doc('{"component":"Select","props":{"name":"room"')).root).toBeNull()
    expect(at(doc('{"component":"Select","props":{"name":"room","options":[]}')).root).toBeNull()
    expect(
      at(doc('{"component":"Select","props":{"name":"room","options":[]}}')).root?.component,
    ).toBe('Select')
  })

  it('is drawn as soon as its children begin, and its children arrive one by one', () => {
    const container = doc('{"component":"Stack","props":{"gap":3},"children":[')
    expect(at(container).root?.children).toEqual([])
    const text = at(`${container}{"component":"Text","children":["Hel`).root
    expect(text?.children.map((child) => child.kind === 'node' && child.node.children)).toEqual([
      [{ kind: 'value', value: 'Hel', from: 'document' }],
    ])
    const leaf = at(
      `${container}{"component":"Text","children":["Hello"]},{"component":"Button","props":{"label":"Sa`,
    )
    expect(
      leaf.root?.children.map((child) => child.kind === 'node' && child.node.component),
    ).toEqual(['Text'])
  })

  it('is drawn once whole, and every element is when the stream ends', () => {
    const text = doc('{"component":"Select","props":{"name":"room"')
    const read = parsePartial(text)
    const screen = createScreen({
      document: read.document,
      vocabulary: VOCABULARY,
      streaming: false,
      cut: read.cut,
    })
    expect(screen.root?.component).toBe('Select')
  })
})

describe('how a member takes its children', () => {
  it('is read from the vocabulary, for a renderer to pass a list or one child as itself', () => {
    expect(surfaceOf(VOCABULARY, 'Stack')?.childrenKind).toBe('nodes')
    expect(surfaceOf(VOCABULARY, 'Heading')?.childrenKind).toBe('text')
    expect(surfaceOf(VOCABULARY, 'Badge')?.childrenKind).toBe('text')
    expect(surfaceOf(VOCABULARY, 'FormField')?.childrenKind).toBe('element')
    expect(surfaceOf(VOCABULARY, 'Separator')?.childrenKind).toBeNull()
    expect(surfaceOf(VOCABULARY, 'Tabs.Content')?.childrenKind).toBe('nodes')
    expect(surfaceOf(VOCABULARY, 'DensityScope')?.childrenKind).toBe('nodes')
  })

  it('is on every node the walk resolves', () => {
    const screen = createScreen({
      vocabulary: VOCABULARY,
      document: {
        spec: 'polymorph-screen/1',
        name: 'A',
        purpose: 'A.',
        inputs: [],
        root: {
          component: 'FormField',
          props: { label: 'Name' },
          children: [{ component: 'Input', props: { name: 'name' } }],
        },
      },
    })
    expect(screen.root?.childrenKind).toBe('element')
    const input = screen.root?.children[0]
    expect(input?.kind === 'node' && input.node.childrenKind).toBeNull()
  })
})
