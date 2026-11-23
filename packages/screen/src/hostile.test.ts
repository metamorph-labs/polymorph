import { describe, expect, it } from 'vitest'

import { checkScreen } from './check'
import { MAX_DEPTH, parsePartial } from './partial'
import { VOCABULARY } from './vocabulary'
import { createScreen, materialize, type Drawn, type ScreenNode } from './walk'

/**
 * What the run-time core does with a document written to break it.
 *
 * The renderers draw what the walk resolves without running `checkScreen`
 * first, as they draw while a document streams. So the walk must be safe for
 * any JSON value: no shape may carry a `javascript:` address to a member, and
 * no input may make `parsePartial`, `checkScreen` or the walk throw, however
 * deep, long or wrong its shape.
 */

const doc = (root: unknown, inputs: { name: string; type: string }[] = []) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen written to break the walk.',
  inputs,
  root,
})

const SCRIPT = 'javascript:alert(document.domain)'

/** Every string a renderer can reach from what the walk hands it, as a DOM would write it. */
function reachable(node: ScreenNode | null): string[] {
  const out: string[] = []
  const take = (value: unknown, seen: Set<unknown>): void => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) {
      // An attribute writes a list as its items joined: `[["javascript:…"]]` is `javascript:…`.
      out.push(String(value))
      for (const item of value) take(item, seen)
    } else if (typeof value === 'object' && value !== null && !seen.has(value)) {
      seen.add(value)
      for (const item of Object.values(value)) take(item, seen)
    }
  }
  const visit = (at: ScreenNode) => {
    const draw = (drawn: Drawn) =>
      take(
        materialize(drawn, {
          node: (inner) => {
            visit(inner)
            return null
          },
        }),
        new Set(),
      )
    Object.values(at.props).forEach(draw)
    at.children.forEach(draw)
  }
  if (node !== null) visit(node)
  return out
}

/** The shapes a document can write where an address goes, each carrying a script's address. */
const SHAPES: Record<string, unknown> = {
  text: SCRIPT,
  'text with spaces': `  ${SCRIPT}`,
  'nested list': [[SCRIPT]],
  'list with a nested list': ['/ok', [SCRIPT]],
  'deep list': [[[[SCRIPT]]]],
  'plain object': { href: SCRIPT, toString: SCRIPT },
  'structured object': { $object: { href: SCRIPT } },
  'list of objects': [{ $object: { src: SCRIPT } }],
  'mixed list': [1, true, null, SCRIPT],
}

/** The shapes that are no address, whatever they hold. */
const WRONG = {
  number: 42,
  boolean: true,
  null: null,
  'list with a number': ['/a', 2],
  'nested list of addresses': [['/a']],
  'structured object': { $object: { href: '/a' } },
  element: { component: 'Text', children: ['/a'] },
}

/** Members with an address prop, and data types with an address field, each with what it needs besides. */
const HOLDERS: { name: string; at: (address: unknown) => unknown }[] = [
  {
    name: 'Link.href',
    at: (address) => ({ component: 'Link', props: { href: address }, children: ['Open'] }),
  },
  {
    name: 'Avatar.src',
    at: (address) => ({ component: 'Avatar', props: { name: 'Ada', src: address } }),
  },
  {
    name: 'Image.src',
    at: (address) => ({ component: 'Image', props: { alt: 'A', src: address } }),
  },
  {
    name: 'Card.href',
    at: (address) => ({ component: 'Card', props: { href: address }, children: ['x'] }),
  },
  {
    name: 'ChatMessage.avatar',
    at: (address) => ({
      component: 'ChatMessage',
      props: { role: 'user', avatar: address },
      children: ['x'],
    }),
  },
  {
    name: 'List.Item.href',
    at: (address) => ({
      component: 'List',
      props: { label: 'L' },
      children: [{ component: 'List.Item', props: { title: 'T', href: address } }],
    }),
  },
  {
    name: 'BreadcrumbItem.href',
    at: (address) => ({
      component: 'Breadcrumbs',
      props: {
        maxItems: 3,
        items: [
          { $object: { label: 'A', href: '/' } },
          { $object: { label: 'B', href: address } },
          { $object: { label: 'C' } },
          { $object: { label: 'D' } },
        ],
      },
    }),
  },
  {
    name: 'BreadcrumbItem as a plain object',
    at: (address) => ({
      component: 'Breadcrumbs',
      props: {
        items: [
          { label: 'A', href: '/' },
          { label: 'B', href: address },
        ],
      },
    }),
  },
  {
    name: 'LightboxImage.src',
    at: (address) => ({
      component: 'Lightbox',
      props: { images: [{ $object: { alt: 'A', src: address } }] },
    }),
  },
]

describe('no address a screen may not hold reaches a member, in any shape', () => {
  for (const holder of HOLDERS) {
    for (const [shape, address] of Object.entries(SHAPES)) {
      it(`${holder.name}: ${shape}`, () => {
        const screen = createScreen({ document: doc(holder.at(address)), vocabulary: VOCABULARY })
        const found = reachable(screen.root).filter((text) => /javascript:/i.test(text))
        expect(found).toEqual([])
      })
    }
  }

  it('passes no value at an address key that is not text or a flat list of text', () => {
    for (const [shape, value] of Object.entries(WRONG)) {
      const screen = createScreen({
        document: doc({ component: 'Link', props: { href: value }, children: ['Open'] }),
        vocabulary: VOCABULARY,
      })
      expect(screen.root?.props['href'], shape).toBeUndefined()
      expect(
        screen.faults.some((fault) => fault.path.startsWith('$.root.props.href')),
        shape,
      ).toBe(true)
    }
    // A flat list of addresses a screen may hold is passed.
    const list = createScreen({
      document: doc({ component: 'Link', props: { href: ['/a', '/b'] }, children: ['Open'] }),
      vocabulary: VOCABULARY,
    })
    expect(list.root?.props['href']).toEqual({
      kind: 'value',
      value: ['/a', '/b'],
      from: 'document',
    })
  })

  it('is refused by `checkScreen` as well, in every shape the walk refuses', () => {
    for (const holder of HOLDERS) {
      for (const [shape, address] of Object.entries({ ...SHAPES, ...WRONG })) {
        const document = doc(holder.at(address))
        if (createScreen({ document, vocabulary: VOCABULARY }).faults.length === 0) continue
        expect(checkScreen(document).ok, `${holder.name}: ${shape}`).toBe(false)
      }
    }
  })

  it('checks a value a binding puts at an address key, and passes the host’s data inside a bound object as given', () => {
    const links = ['script', 'nested', 'printed', 'url', 'none', 'site']
    const screen = createScreen({
      document: doc(
        {
          component: 'Stack',
          children: [
            ...links.map((name) => ({
              component: 'Link',
              props: { href: { $: name } },
              children: [name],
            })),
            { component: 'Breadcrumbs', props: { items: { $: 'crumbs' } } },
          ],
        },
        [
          ...links.map((name) => ({ name, type: 'string' })),
          { name: 'crumbs', type: 'BreadcrumbItem[]' },
        ],
      ),
      vocabulary: VOCABULARY,
      data: {
        script: SCRIPT,
        nested: [[SCRIPT]],
        // An object a renderer writes as text writes what its `toString` answers.
        printed: { toString: () => SCRIPT },
        url: new URL(SCRIPT),
        none: null,
        site: 'https://example.com/',
        crumbs: [{ label: 'Host', href: '/host' }],
      },
    })
    const children = screen.root?.children ?? []
    const href = (at: number) => {
      const child = children[at]
      return child?.kind === 'node' ? child.node.props['href'] : 'no node'
    }
    for (const at of [0, 1, 2, 3, 4]) expect(href(at), links[at]).toBeUndefined()
    expect(href(5)).toEqual({ kind: 'value', value: 'https://example.com/', from: 'data' })
    // `null` in the host's data is no address, and is no value: a link requires one.
    expect(screen.faults.map(({ path, message }) => [path, message.slice(0, 22)])).toEqual([
      ['$.root.children[0].props.href', '"javascript:alert(docu'],
      ['$.root.children[1].props.href[0]', '`href` takes an addres'],
      ['$.root.children[2].props.href', '`href` takes an addres'],
      ['$.root.children[3].props.href', '`href` takes an addres'],
      ['$.root.children[4].props.href', '`Link` requires `href`'],
    ])
    // The host's own data, bound whole to a prop that is no address, is the host's.
    const crumbs = children[6]
    expect(crumbs?.kind === 'node' && crumbs.node.props['items']).toEqual({
      kind: 'value',
      value: [{ label: 'Host', href: '/host' }],
      from: 'data',
    })
  })
})

describe('a callback is a function or nothing', () => {
  it('passes no value of the document where a member calls what it is given', () => {
    const screen = createScreen({
      document: doc(
        {
          component: 'Stack',
          children: [{ component: 'Button', props: { label: 'A', onClick: SCRIPT } }],
        },
        [],
      ),
      vocabulary: VOCABULARY,
    })
    const button = screen.root?.children[0]
    expect(button?.kind === 'node' && button.node.props['onClick']).toBeUndefined()
    expect(screen.faults.map(({ path }) => path)).toEqual(['$.root.children[0].props.onClick'])
  })
})

describe('a plain object, which the format writes as `$object`, is never passed as it is', () => {
  it('is a fault and is dropped, in a prop, a field and a list, at any depth', () => {
    const screen = createScreen({
      document: doc({
        component: 'Select',
        props: {
          options: [
            { value: 'a', label: 'A' },
            { $object: { value: 'b', label: 'B', extra: { x: 1 } } },
          ],
          name: 'pick',
        },
      }),
      vocabulary: VOCABULARY,
    })
    expect(screen.root?.props['options']).toEqual({
      kind: 'value',
      value: [{ value: 'b', label: 'B' }],
      from: 'document',
    })
    expect(screen.faults.map(({ path }) => path)).toEqual([
      '$.root.props.options[0]',
      '$.root.props.options[1].extra',
    ])
  })

  it('is a fault where something is drawn', () => {
    const screen = createScreen({
      document: doc({ component: 'Stack', children: [{ text: 'x' }] }),
      vocabulary: VOCABULARY,
    })
    expect(screen.root?.children[0]?.kind).toBe('fault')
  })
})

describe('nothing a document holds makes the core throw', () => {
  const deep = (levels: number) => `{"root":${'['.repeat(levels)}${']'.repeat(levels)}}`
  const nested = (levels: number): unknown => {
    let value: unknown = 'leaf'
    for (let at = 0; at < levels; at += 1) value = [value]
    return value
  }
  const time = (run: () => void) => {
    const start = performance.now()
    run()
    return performance.now() - start
  }

  const tooDeep = (faults: readonly { message: string }[]) =>
    faults.some((fault) => fault.message.includes(`deeper than ${MAX_DEPTH}`))

  it('cuts text nested deeper than the limit, with an error, where it goes too deep', () => {
    const read = parsePartial(deep(3000))
    expect(read.error?.message).toContain(`${MAX_DEPTH}`)
    expect(read.complete).toBe(false)
    // The document's own object is the first level, so this nests exactly to the limit.
    const fine = deep(MAX_DEPTH - 1)
    expect(parsePartial(fine)).toMatchObject({ document: JSON.parse(fine), error: null })
    const over = parsePartial(deep(MAX_DEPTH))
    expect(over.error?.at).toBe('{"root":'.length + MAX_DEPTH - 1)
    expect(over.cut).toBe(`$.root${'[0]'.repeat(MAX_DEPTH - 2)}`)
  })

  it('reports a value nested deeper than the limit as a fault, and does not draw it', () => {
    const document = doc({ component: 'Text', children: [nested(3000)] })
    const screen = createScreen({ document, vocabulary: VOCABULARY })
    expect(tooDeep(screen.faults)).toBe(true)
    expect(reachable(screen.root)).not.toContain('leaf')
    const checked = checkScreen(document)
    expect(checked.ok).toBe(false)
    expect(tooDeep(checked.faults)).toBe(true)
  })

  it('draws, checks and reads a document that nests exactly to the limit, and no deeper', () => {
    // The document, the root, its children and the lists inside: three levels before the lists.
    for (const [lists, faulted] of [
      [MAX_DEPTH - 3, false],
      [MAX_DEPTH - 2, true],
    ] as const) {
      const document = doc({ component: 'Text', children: [nested(lists)] })
      const screen = createScreen({ document, vocabulary: VOCABULARY })
      expect(tooDeep(screen.faults), `${lists}`).toBe(faulted)
      expect(reachable(screen.root).includes('leaf'), `${lists}`).toBe(!faulted)
      expect(tooDeep(checkScreen(document).faults), `${lists}`).toBe(faulted)
      expect(parsePartial(JSON.stringify(document)).error !== null, `${lists}`).toBe(faulted)
    }
  })

  it('never throws, and finishes in bounded time, for any text or value', () => {
    const big = 'x'.repeat(5_000_000)
    const many = JSON.stringify({
      root: { component: 'Stack', children: Array.from({ length: 100_000 }, () => 'a') },
    })
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic['self'] = cyclic
    const texts = [
      deep(3000),
      deep(100_000),
      `{"root":{"component":"Text","children":["${big}"]}}`,
      many,
      'null',
      '42',
      '"x"',
      '[1,2,3]',
      '{"root":"x","inputs":"y"}',
      '{"root":{"component":5,"props":"x","children":"y"}}',
    ]
    const values: unknown[] = [
      null,
      undefined,
      42,
      'x',
      [],
      { root: 'x' },
      { root: { component: 'Stack', props: 'x', children: 'y' } },
      { inputs: 'x', root: { component: 'Text', children: [nested(100_000)] } },
      JSON.parse(many),
      doc({ component: 'Text', props: { children: { $: 'loop' } } }, [
        { name: 'loop', type: 'Loop' },
      ]),
      // The host's data, cyclic and deep, in a named control, which `values` reduces to JSON.
      doc(
        {
          component: 'Stack',
          children: [
            { component: 'Input', props: { name: 'a', value: { $: 'loop' } } },
            { component: 'Input', props: { name: 'b', value: { $: 'deepData' } } },
          ],
        },
        [
          { name: 'loop', type: 'string' },
          { name: 'deepData', type: 'string' },
        ],
      ),
      // Types a document declares are read as text, however long or nested.
      doc({ component: 'Text', children: ['a'] }, [
        { name: 'long', type: 'x'.repeat(5_000_000) },
        { name: 'nested', type: `${'('.repeat(20_000)}() => void${')'.repeat(20_000)}` },
      ]),
    ]
    const took = time(() => {
      for (const text of texts) {
        const read = parsePartial(text)
        checkScreen(read.document)
      }
      expect(parsePartial(undefined as unknown as string).document).toBeUndefined()
      for (const value of values) {
        checkScreen(value)
        const screen = createScreen({
          document: value,
          vocabulary: VOCABULARY,
          data: { loop: cyclic, deepData: nested(100_000) },
        })
        screen.update({ document: value, data: null as unknown as Record<string, unknown> })
        screen.update({ streaming: true, cut: '$.root.children[0]' })
        expect(typeof screen.values).toBe('object')
      }
    })
    expect(took).toBeLessThan(20_000)
  }, 60_000)
})
