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
 * While a document streams, an element the text ends inside is not drawn
 * until the text has moved past its own fields: a member is drawn once its
 * props are whole, and a container as soon as its children begin. So a
 * renderer is never handed a member whose required prop has not arrived, nor
 * one whose `value` arrives after it was first drawn. The laws, over every cut
 * of every screen in `design/screens/` and in the fixtures: an element is never
 * drawn with props other than the ones it has in the whole document, and an
 * element once drawn stays drawn.
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

/** Every node a renderer is handed, by path: its component and the props it is given. */
function drawn(screen: Screen): Map<string, string> {
  const found = new Map<string, string>()
  const visit = (value: Drawn) => {
    if (value.kind === 'node') node(value.node)
    else if (value.kind === 'list') value.items.forEach(visit)
    else if (value.kind === 'record') Object.values(value.fields).forEach(visit)
  }
  const node = (at: ScreenNode) => {
    found.set(at.path, `${at.component}(${Object.keys(at.props).sort().join(', ')})`)
    Object.values(at.props).forEach(visit)
    at.children.forEach(visit)
  }
  if (screen.root !== null) node(screen.root)
  return found
}

/** A screen fed each cut of a text in turn, and what it drew at each. */
function stream(text: string): { cuts: Map<string, string>[]; whole: Map<string, string> } {
  const screen = createScreen({ document: undefined, vocabulary: VOCABULARY, streaming: true })
  const cuts: Map<string, string>[] = []
  for (let end = 1; end < text.length; end += 1) {
    const read = parsePartial(text.slice(0, end))
    screen.update({
      document: read.document,
      open: read.open,
      cut: read.cut,
      streaming: !read.complete,
    })
    cuts.push(drawn(screen))
  }
  screen.update({ document: JSON.parse(text) as unknown, open: null, cut: null, streaming: false })
  return { cuts, whole: drawn(screen) }
}

describe('every cut of every screen', () => {
  for (const { file, text } of SCREENS) {
    it(`${file}: draws an element only with its whole props, and keeps it drawn`, () => {
      const { cuts, whole } = stream(text)
      let before = new Map<string, string>()
      for (const [at, now] of cuts.entries()) {
        for (const [path, props] of now) {
          if (whole.get(path) !== props) {
            throw new Error(
              `cut ${at + 1}: ${path} is drawn as ${props}, and whole as ${whole.get(path) ?? 'nothing'}`,
            )
          }
        }
        for (const path of before.keys()) {
          if (!now.has(path)) throw new Error(`cut ${at + 1}: ${path} was drawn, and is not now`)
        }
        before = now
      }
      // The law held over a stream that draws before it ends. A root whose content is all props
      // (a Dashboard's panels) is drawn whole once its props close; a root with children is drawn
      // as they begin.
      expect(cuts.some((now) => now.size > 0)).toBe(true)
      expect(whole.size).toBeGreaterThan(3)
      if ('children' in (JSON.parse(text) as { root: object }).root) {
        expect(cuts.some((now) => now.size > 0 && now.size < whole.size)).toBe(true)
      }
    }, 60_000)
  }
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
