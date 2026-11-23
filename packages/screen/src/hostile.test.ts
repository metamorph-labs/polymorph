import { describe, expect, it } from 'vitest'

import { callbackFill, isCallback, MAX_TYPE_LENGTH, stubFor } from './actions'
import { checkScreen } from './check'
import { argumentsToJson, reduceToJson } from './json'
import { MAX_DEPTH, parsePartial } from './partial'
import { addressFault } from './urls'
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

  /** A list of `count` text children, as text. */
  const many = (count: number) =>
    JSON.stringify({
      root: { component: 'Stack', children: Array.from({ length: count }, () => 'a') },
    })
  /** One object at every level, held twice by the level above: a tree of `2 ** levels` leaves. */
  const shared = (levels: number): unknown => {
    let value: unknown = 'leaf'
    for (let at = 0; at < levels; at += 1) value = { left: value, right: value }
    return value
  }
  const promises = (layers: number) =>
    `() => ${'Promise<'.repeat(layers)}string${'>'.repeat(layers)}`
  const parentheses = (pairs: number) => `${'('.repeat(pairs)}() => void${')'.repeat(pairs)}`
  const cyclic: Record<string, unknown> = { a: 1 }
  cyclic['self'] = cyclic

  it('never throws, for any text or value', () => {
    const texts = [
      deep(3000),
      `{"root":{"component":"Text","children":["${'x'.repeat(100_000)}"]}}`,
      many(10_000),
      `\`\`\`${'a'.repeat(10_000)}`,
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
      { inputs: 'x', root: { component: 'Text', children: [nested(10_000)] } },
      JSON.parse(many(10_000)),
      doc({ component: 'Text', props: { children: { $: 'loop' } } }, [
        { name: 'loop', type: 'Loop' },
      ]),
      // The host's data in named controls, which `values` reduces to JSON: cyclic, deep, and one
      // object shared at sixty levels.
      doc(
        {
          component: 'Stack',
          children: ['loop', 'deepData', 'dag'].map((name) => ({
            component: 'Input',
            props: { name, value: { $: name } },
          })),
        },
        ['loop', 'deepData', 'dag'].map((name) => ({ name, type: 'string' })),
      ),
      // Types longer than any screen declares, which are never read, and one at the limit.
      doc({ component: 'Button', props: { label: 'A', onClick: { $: 'atLimit' } } }, [
        { name: 'parentheses', type: parentheses(20_000) },
        { name: 'promises', type: promises(20_000) },
        { name: 'atLimit', type: parentheses((MAX_TYPE_LENGTH - 10) / 2) },
      ]),
    ]
    for (const text of texts) checkScreen(parsePartial(text).document)
    expect(parsePartial(undefined as unknown as string).document).toBeUndefined()
    for (const value of values) {
      checkScreen(value)
      const screen = createScreen({
        document: value,
        vocabulary: VOCABULARY,
        data: { loop: cyclic, deepData: nested(10_000), dag: shared(60) },
      })
      screen.update({ document: value, data: null as unknown as Record<string, unknown> })
      screen.update({ streaming: true, cut: '$.root.children[0]' })
      expect(typeof screen.values).toBe('object')
    }
    // What a host may call itself, with types no screen may declare.
    expect(stubFor(promises(20_000)).answers).toMatch(/^a promise of a promise of .*the key/)
    expect(callbackFill(promises(20_000))).toMatch(/^answers a promise of/)
    expect(isCallback(parentheses(20_000))).toBe(true)
    expect(reduceToJson(shared(60)).cut).toBe(true)
    expect(argumentsToJson([shared(60)])).toHaveLength(1)
  })

  it('reads a type no longer than the limit, and holds a longer one to be data with no value', () => {
    const type = parentheses(20_000)
    const document = doc({ component: 'Button', props: { label: 'A', onClick: { $: 'act' } } }, [
      { name: 'act', type },
    ])
    const screen = createScreen({ document, vocabulary: VOCABULARY })
    expect(screen.fills).toEqual([{ name: 'act', type, from: 'absent' }])
    expect(screen.faults.map(({ path }) => path)).toEqual(['$.inputs[0].type'])
    expect(checkScreen(document).faults.map(({ path }) => path)).toContain('$.inputs[0].type')
    const longest = parentheses((MAX_TYPE_LENGTH - 10) / 2)
    expect(longest).toHaveLength(MAX_TYPE_LENGTH)
    const lawful = createScreen({
      document: doc({ component: 'Button', props: { label: 'A', onClick: { $: 'act' } } }, [
        { name: 'act', type: longest },
      ]),
      vocabulary: VOCABULARY,
    })
    expect(lawful.fills[0]?.from).toBe('stub')
    expect(lawful.faults).toEqual([])
  })
})

/**
 * The core's work grows in proportion to what it reads, so no input a model or
 * a host can write stalls a page.
 *
 * Each kind of input is read at one size and at eight times that size, the
 * least of seven runs at each, the two sizes taken in turn so a machine busy
 * with other work slows both alike. Work in proportion to the input takes
 * about eight times as long at eight times the size, and work in proportion to
 * its square about sixty-four times. The bound sits between, wide of both: a
 * busy machine's collector can add half again to the larger run, and the
 * square would still be three times the bound. A hang is the test's own
 * timeout's to catch.
 */
describe('no input costs more than in proportion to its size', () => {
  const LINEAR = 20
  const time = (run: () => void) => {
    const start = performance.now()
    run()
    return performance.now() - start
  }
  const growth = <Input>(
    make: (size: number) => Input,
    run: (input: Input) => unknown,
    [size, larger]: readonly [number, number],
  ): number => {
    const small = make(size)
    const large = make(larger)
    let fast = Infinity
    let slow = Infinity
    for (let round = 0; round < 5; round += 1) {
      fast = Math.min(
        fast,
        time(() => run(small)),
      )
      slow = Math.min(
        slow,
        time(() => run(large)),
      )
    }
    return slow / Math.max(fast, 0.05)
  }

  const children = (count: number) =>
    doc({ component: 'Stack', children: Array.from({ length: count }, (_, at) => `line ${at}`) })
  const bound = (count: number) =>
    doc(
      {
        component: 'Stack',
        children: Array.from({ length: count }, (_, at) => ({
          component: 'Button',
          props: { label: { $: `label${at}` }, onClick: { $: `act${at}` } },
        })),
      },
      Array.from({ length: count }, (_, at) => [
        { name: `label${at}`, type: 'string' },
        // A type for each, at the limit, so each is read once.
        { name: `act${at}`, type: `${'('.repeat(200)}(n${at}: number) => void${')'.repeat(200)}` },
      ]).flat(),
    )
  const shared = (levels: number): unknown => {
    let value: unknown = 'leaf'
    for (let at = 0; at < levels; at += 1) value = { left: value, right: value }
    return value
  }
  /** A screen already drawn, with its data, which a run updates once. */
  const drawn = (document: unknown, data: Record<string, unknown> = {}) => ({
    screen: createScreen({ document, vocabulary: VOCABULARY, data }),
    data,
  })
  let tick = 0
  /** New data for a screen drawn: the same values, and one more, so the whole screen is resolved again. */
  const update = ({ screen, data }: ReturnType<typeof drawn>) => {
    tick += 1
    screen.update({ data: { ...data, tick } })
  }

  // Each kind's two sizes: one, and eight times it, small enough that work in proportion to the
  // square of the input still ends within a few seconds, so a slower reading fails and does not
  // hang. A value shared at many levels is read at 16 levels, a tree of 65,536 leaves, and at 21,
  // of two million: the budget holds the second to `MAX_JSON_VALUES`, and without it the second
  // would take thirty-two times as long.
  const kinds: {
    name: string
    sizes: readonly [number, number]
    make: (size: number) => unknown
    run: (input: never) => unknown
  }[] = [
    {
      name: 'parsePartial: a long string',
      sizes: [50_000, 400_000],
      make: (size) => `{"root":{"component":"Text","children":["${'x'.repeat(size)}"]}}`,
      run: (text: string) => parsePartial(text),
    },
    {
      name: 'parsePartial: a fence line with no line break yet',
      sizes: [5_000, 40_000],
      make: (size) => `Here it is.\n\`\`\`${'a'.repeat(size)}`,
      run: (text: string) => parsePartial(text),
    },
    {
      name: 'parsePartial: many children',
      sizes: [2_000, 16_000],
      make: (size) => JSON.stringify(children(size)),
      run: (text: string) => parsePartial(text),
    },
    {
      name: 'parsePartial: text nested deeper than the limit',
      sizes: [50_000, 400_000],
      make: (size) => `{"root":${'['.repeat(size)}${']'.repeat(size)}}`,
      run: (text: string) => parsePartial(text),
    },
    {
      name: 'checkScreen: many children',
      sizes: [1_000, 8_000],
      make: children,
      run: (document: unknown) => checkScreen(document),
    },
    {
      name: 'checkScreen: many inputs, each bound',
      sizes: [25, 200],
      make: bound,
      run: (document: unknown) => checkScreen(document),
    },
    {
      name: 'checkScreen: a long name no member has',
      sizes: [10_000, 80_000],
      make: (size) => doc({ component: `B${'u'.repeat(size)}` }),
      run: (document: unknown) => checkScreen(document),
    },
    {
      // Ten objects of `size` fields each. An engine keeps an object of more than about a thousand
      // fields as a table whose keys it sorts each time they are listed, which no reading of ours
      // can avoid, so each object stays below that.
      name: 'checkScreen: structured objects with many fields',
      sizes: [100, 800],
      make: (size) =>
        doc({
          component: 'Breadcrumbs',
          props: {
            items: Array.from({ length: 10 }, () => ({
              $object: Object.fromEntries(Array.from({ length: size }, (_, at) => [`f${at}`, 'x'])),
            })),
          },
        }),
      run: (document: unknown) => checkScreen(document),
    },
    {
      name: 'createScreen: many children',
      sizes: [2_000, 16_000],
      make: children,
      run: (document: unknown) => drawn(document),
    },
    {
      name: 'createScreen: many inputs, each bound',
      sizes: [25, 200],
      make: bound,
      run: (document: unknown) => drawn(document),
    },
    {
      name: 'one update of a screen drawn: many children',
      sizes: [2_000, 16_000],
      make: (size) => drawn(children(size)),
      run: update,
    },
    {
      name: 'one update of a screen drawn: many inputs, each bound',
      sizes: [25, 200],
      make: (size) => drawn(bound(size)),
      run: update,
    },
    {
      name: 'one update of a screen drawn: a control’s value shared at many levels',
      sizes: [16, 21],
      make: (size) =>
        drawn(
          doc({ component: 'Input', props: { name: 'q', value: { $: 'dag' } } }, [
            { name: 'dag', type: 'string' },
          ]),
          { dag: shared(size) },
        ),
      run: update,
    },
    {
      name: 'an action’s arguments shared at many levels',
      sizes: [16, 21],
      make: shared,
      run: (value: unknown) => argumentsToJson([value]),
    },
    {
      name: 'isCallback: nested parentheses',
      sizes: [500, 4_000],
      make: (size) => `${'('.repeat(size)}() => void${')'.repeat(size)}`,
      run: (type: string) => isCallback(type),
    },
    {
      name: 'stubFor: nested promises',
      sizes: [500, 4_000],
      make: (size) => `() => ${'Promise<'.repeat(size)}string${'>'.repeat(size)}`,
      run: (type: string) => stubFor(type),
    },
    {
      name: 'addressFault: a long address',
      sizes: [100_000, 800_000],
      make: (size) => `${' '.repeat(size)}${'a'.repeat(size)}:x`,
      run: (address: string) => addressFault(address),
    },
  ]

  it('updates a screen whose types are as long as a type may be as fast as one whose types are short', () => {
    // A hundred callback inputs whose types are as long as a type may be, and a hundred whose
    // types are short: an update of either resolves the same screen.
    const screen = (long: boolean) =>
      drawn(
        doc(
          {
            component: 'Stack',
            children: Array.from({ length: 100 }, (_, at) => ({
              component: 'Button',
              props: { label: 'A', onClick: { $: `act${at}` } },
            })),
          },
          Array.from({ length: 100 }, (_, at) => ({
            name: `act${at}`,
            type: long
              ? `${'('.repeat(240)}(n${at}: number) => void${')'.repeat(240)}`
              : `(n${at}: number) => void`,
          })),
        ),
      )
    const long = screen(true)
    const short = screen(false)
    let slow = Infinity
    let fast = Infinity
    for (let round = 0; round < 5; round += 1) {
      slow = Math.min(
        slow,
        time(() => update(long)),
      )
      fast = Math.min(
        fast,
        time(() => update(short)),
      )
    }
    // Read in time that grows as the square of a type's length, the long types would cost a
    // hundred times what the short ones do.
    expect(slow / Math.max(fast, 0.05)).toBeLessThan(3)
  })

  for (const kind of kinds) {
    it(kind.name, () => {
      expect(growth(kind.make, kind.run as (input: unknown) => unknown, kind.sizes)).toBeLessThan(
        LINEAR,
      )
    })
  }
})
