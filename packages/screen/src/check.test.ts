import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateSpec } from '@polymorph/spec/validate'
import { describe, expect, it } from 'vitest'

import { checkAnswer, checkScreen } from './check'
import { parsePartial } from './partial'
import { addressFault, addressListFault, ADDRESS_KEYS } from './urls'
import { VOCABULARY } from './vocabulary'
import { createScreen } from './walk'

/**
 * `checkScreen`: the validator bound to the run-time table, and the two
 * faults the run-time adds, in the validator's shape and voice.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const inbox = JSON.parse(
  readFileSync(resolve(ROOT, 'design/screens/inbox.json'), 'utf8'),
) as unknown

const screen = (root: object) => ({
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A screen checked at run time.',
  inputs: [],
  root,
})

describe('checkScreen is the validator, bound to the run-time table', () => {
  it('passes a lawful screen', () => {
    expect(checkScreen(inbox)).toEqual({ ok: true, faults: [] })
  })

  it('gives the validator’s faults, first', () => {
    const document = screen({ component: 'Buton', props: { label: 'Save' } })
    const { faults } = checkScreen(document)
    expect(faults).toEqual(validateSpec(VOCABULARY, document).faults)
    expect(faults[0]?.message).toContain('no component called `Buton`')
  })

  it('checks for the framework it is told', () => {
    const document = {
      ...screen({ component: 'ImageEditor', props: { onConfirm: { $: 'onCrop' } } }),
      inputs: [{ name: 'onCrop', type: '(image: Blob) => void' }],
    }
    expect(checkScreen(document).ok).toBe(true)
    expect(checkScreen(document, { framework: 'elements' }).faults[0]?.message).toMatch(
      /^`ImageEditor` is absent in elements/,
    )
  })
})

describe('a member the host does not allow', () => {
  const thirdParty = {
    ...screen({
      component: 'ThirdParty',
      props: { library: 'leaflet', reason: 'The map draws itself.' },
    }),
  }
  thirdParty.root = {
    ...thirdParty.root,
    exception: { rung: 4, because: 'The map is another library entirely.' },
  } as typeof thirdParty.root

  it('is a fault by default when it hosts another library’s code, and lawful once the host allows it', () => {
    expect(checkScreen(thirdParty).faults).toEqual([
      {
        path: '$.root',
        message:
          '`ThirdParty` hosts another library’s code, which this host does not allow — compose the screen from the members the card lists',
      },
    ])
    expect(checkScreen(thirdParty, { members: ['ThirdParty'] }).ok).toBe(true)
  })

  it('is a fault where the host narrows the vocabulary, and a part answers for its member', () => {
    const document = screen({
      component: 'Stack',
      children: [{ component: 'Table', children: [{ component: 'Table.Body' }] }],
    })
    expect(checkScreen(document, { members: ['Stack'] }).faults).toEqual([
      {
        path: '$.root.children[0]',
        message:
          '`Table` is not one of the members this host draws — compose the screen from the members the card lists',
      },
      {
        path: '$.root.children[0].children[0]',
        message:
          '`Table.Body` is a part of `Table`, and `Table` is not one of the members this host draws — compose the screen from the members the card lists',
      },
    ])
  })

  it('leaves a name the vocabulary does not have to the validator', () => {
    const { faults } = checkScreen(screen({ component: 'Modal' }), { members: ['Stack'] })
    expect(faults).toHaveLength(1)
  })
})

describe('a name the screen’s values cannot hold', () => {
  it('is a fault where two controls share it, and where every object has it, as the walk says', () => {
    const document = screen({
      component: 'Stack',
      children: [
        { component: 'Input', props: { name: 'q' } },
        {
          component: 'Card',
          props: { title: 'More' },
          children: [{ component: 'Input', props: { name: 'q' } }],
        },
        { component: 'Checkbox', props: { name: '__proto__', label: 'x' } },
        // A name that is no control's is no value's.
        { component: 'Avatar', props: { name: 'q' } },
      ],
    })
    const faults = checkScreen(document).faults.filter(({ path }) => path.endsWith('.name'))
    expect(faults).toEqual([
      {
        path: '$.root.children[1].children[0].props.name',
        message:
          'the control at `$.root.children[0]` is named `q` too; `values` holds the last of them, this one',
      },
      {
        path: '$.root.children[2].props.name',
        message:
          'a control may not be named `__proto__`, a name every object has, as a host reads `values` as an object; it is left out of `values`',
      },
    ])
    const walked = createScreen({ document, vocabulary: VOCABULARY }).faults
    expect(
      walked
        .filter(({ path }) => path.endsWith('.name'))
        .map(({ path, message }) => ({ path, message })),
    ).toEqual(faults)
  })
})

describe('what the walk refuses of a document, checkScreen reports in the same words', () => {
  it('a callback input no callback receives, an element in a data field, and a type too long', () => {
    const approved = { component: 'Input', props: { name: 'approved', defaultValue: 'yes' } }
    const document = {
      ...screen({
        component: 'Stack',
        children: [
          { component: 'Button', props: { label: { $: 'onApprove' } } },
          { component: 'Text', children: [{ $: 'onApprove' }] },
          {
            component: 'Breadcrumbs',
            props: { items: [{ $object: { label: 'A', x: { $: 'onApprove' } } }] },
          },
          {
            component: 'ListPage',
            props: {
              title: 'Requests',
              emptyState: { $object: { title: 'None', x: approved, description: [approved] } },
            },
          },
          {
            component: 'Select',
            props: { options: [{ $object: { value: 'a', label: approved } }] },
          },
          { component: 'Button', props: { label: 'Go', onClick: { $: 'onApprove' } } },
        ],
      }),
      inputs: [
        { name: 'onApprove', type: '() => void' },
        { name: 'long', type: `(${'x'.repeat(600)}) => void` },
      ],
    }
    const NEW = /callback input|has no field|is data, not a node|characters long/
    const pick = (faults: readonly { path: string; message: string }[]) =>
      faults
        .filter(({ message }) => NEW.test(message))
        .map(({ path, message }) => ({ path, message }))
        .sort((a, b) => a.path.localeCompare(b.path))
    const walked = pick(createScreen({ document, vocabulary: VOCABULARY }).faults)
    expect(walked.map(({ path }) => path)).toEqual([
      '$.inputs[1].type',
      '$.root.children[0].props.label',
      '$.root.children[1].children[0]',
      '$.root.children[2].props.items[0].x',
      '$.root.children[3].props.emptyState.description',
      '$.root.children[3].props.emptyState.x',
      '$.root.children[4].props.options[0].label',
    ])
    expect(pick(checkScreen(document).faults)).toEqual(walked)
  })
})

describe('a name two controls share, where one is not drawn', () => {
  it('is no fault in checkScreen, as in the walk, when the control lacks a prop it requires', () => {
    // The Select lacks its required `options`, so the walk does not draw it and it holds no name.
    const document = screen({
      component: 'Stack',
      children: [
        { component: 'Select', props: { name: 'q' } },
        { component: 'Input', props: { name: 'q' } },
      ],
    })
    const named = (faults: readonly { path: string; message: string }[]) =>
      faults.filter(({ path }) => path.endsWith('.name')).map(({ path }) => path)
    expect(named(createScreen({ document, vocabulary: VOCABULARY }).faults)).toEqual([])
    expect(named(checkScreen(document).faults)).toEqual([])
  })
})

describe('a prop that takes one element', () => {
  it('is a fault in checkScreen, as in the walk, when it is handed no element', () => {
    const document = screen({
      component: 'Dialog',
      props: { title: 'Hi', trigger: 'Open' },
      children: ['x'],
    })
    const pick = (faults: readonly { path: string; message: string }[]) =>
      faults.filter(({ message }) => message.includes('takes one element')).map(({ path }) => path)
    expect(pick(createScreen({ document, vocabulary: VOCABULARY }).faults)).toEqual([
      '$.root.props.trigger',
    ])
    expect(pick(checkScreen(document).faults)).toEqual(['$.root.props.trigger'])
  })
})

describe('an address a screen may not hold', () => {
  it('is a fault at a prop, at an object’s key and in a list, wherever the element is', () => {
    const document = screen({
      component: 'Stack',
      children: [
        { component: 'Link', props: { href: 'javascript:alert(1)' }, children: ['a'] },
        {
          component: 'Breadcrumbs',
          props: {
            items: [
              { $object: { label: 'Home', href: '/' } },
              { $object: { label: 'Bad', href: 'data:text/html,<script>' } },
            ],
          },
        },
        { component: 'Image', props: { src: 'vbscript:x', alt: 'x' } },
        { component: 'Avatar', props: { name: 'Ada', src: 'https://example.com/ada.png' } },
      ],
    })
    expect(checkScreen(document).faults).toEqual([
      {
        path: '$.root.children[0].props.href',
        message:
          '"javascript:alert(1)" is not an address a screen may hold: it names the scheme `javascript:` — an address is relative, a fragment (`#id`), or `http:`, `https:`, `mailto:` or `tel:`',
      },
      {
        path: '$.root.children[1].props.items[1].href',
        message: expect.stringContaining('names the scheme `data:`') as string,
      },
      {
        path: '$.root.children[2].props.src',
        message: expect.stringContaining('names the scheme `vbscript:`') as string,
      },
    ])
  })

  it('reads an address as a browser follows it', () => {
    for (const lawful of [
      '',
      '/orders/7',
      'orders/7',
      '#total',
      '?page=2',
      '//cdn.example.com/a.png',
      'https://example.com',
      'HTTP://EXAMPLE.COM',
      'mailto:a@example.com',
      'tel:+442079460958',
      '/a:b',
      '#x:y',
      ' javascript:alert(1)',
    ]) {
      expect(addressFault(lawful), lawful).toBeNull()
    }
    for (const refused of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      '\u0001javascript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,x',
      'vbscript:x',
      'file:///etc/passwd',
      'blob:https://example.com/x',
    ]) {
      expect(addressFault(refused), JSON.stringify(refused)).not.toBeNull()
    }
  })

  it('reads each candidate of a set of files as an address', () => {
    for (const lawful of [
      '/a-400.jpg 400w, /a-800.jpg 800w',
      'https://example.com/a.jpg 1x, https://example.com/a@2x.jpg 2x',
      '/a.jpg',
      '/a,b.jpg 2x',
    ]) {
      expect(addressListFault(lawful), lawful).toBeNull()
    }
    for (const refused of [
      'javascript:alert(1) 1x',
      '/a.jpg 1x, data:image/svg+xml,x 2x',
      '/a.jpg 1x,  ,data:image/svg+xml,x 2x',
      '/a.jpg 1x,\tdata:image/svg+xml,x 2x',
    ]) {
      expect(addressListFault(refused), JSON.stringify(refused)).not.toBeNull()
    }
  })

  it('checks a pager’s addresses and a picture’s set of files', () => {
    const faults = checkScreen(
      screen({
        component: 'Stack',
        children: [
          {
            component: 'CursorPagination',
            props: { hasPrevious: true, hasNext: true, nextHref: 'javascript:alert(1)' },
          },
          {
            component: 'Image',
            props: { src: '/a.jpg', alt: '', srcSet: '/a.jpg 1x, data:text/html,x 2x' },
          },
        ],
      }),
    ).faults.map((fault) => fault.path)
    expect(faults).toContain('$.root.children[0].props.nextHref')
    expect(faults).toContain('$.root.children[1].props.srcSet')
  })
})

describe('a host that refuses addresses', () => {
  const refused = { addresses: 'refused' } as const
  const holding = (children: object[]) => ({
    ...screen({ component: 'Stack', children }),
    inputs: [{ name: 'picture', type: 'string' }],
  })
  const children = [
    { component: 'Card', props: { title: 'Order', href: '/orders/1042' }, children: ['x'] },
    { component: 'Avatar', props: { name: 'Ada', src: { $: 'picture' } } },
    {
      component: 'Breadcrumbs',
      props: {
        items: [
          { $object: { label: 'Home', href: 'https://example.com/' } },
          { $object: { label: 'Orders' } },
        ],
      },
    },
    {
      component: 'List',
      props: { label: 'Orders' },
      children: [{ component: 'List.Item', props: { title: 'A', href: '#a' } }],
    },
    { component: 'Link', props: { href: '/help' }, children: ['Help'] },
    { component: 'Markdown', children: ['See [the help](/help).'] },
  ]
  const document = holding(children)

  it('reports every address the document writes or binds, and each member that needs one', () => {
    expect(checkScreen(document).ok).toBe(true)
    expect(checkScreen(document, refused).faults).toEqual([
      {
        path: '$.root.children[0].props.href',
        message: '`href` takes an address, and this host takes none — leave `href` out',
      },
      {
        path: '$.root.children[1].props.src',
        message: '`src` takes an address, and this host takes none — leave `src` out',
      },
      {
        path: '$.root.children[2].props.items[0].href',
        message: '`href` takes an address, and this host takes none — leave `href` out',
      },
      {
        path: '$.root.children[3].children[0].props.href',
        message: '`href` takes an address, and this host takes none — leave `href` out',
      },
      {
        path: '$.root.children[4]',
        message:
          '`Link` requires an address at `href`, and this host takes no address — compose the screen from the members the card lists',
      },
      {
        path: '$.root.children[4].props.href',
        message: '`href` takes an address, and this host takes none — leave `href` out',
      },
      {
        path: '$.root.children[5]',
        message:
          '`Markdown` draws the links and pictures its text writes, and this host takes no address — compose the screen from the members the card lists',
      },
    ])
  })

  it('reports in the walk’s words, at the walk’s paths', () => {
    // The walk reads no prop of a member it does not draw, so the Link's own `href` is left out.
    const drawn = holding(children.filter((_, at) => at !== 4))
    const pick = (faults: readonly { path: string; message: string }[]) =>
      faults
        .filter(({ message }) => /address/.test(message))
        .map(({ path, message }) => ({ path, message }))
        .sort((a, b) => a.path.localeCompare(b.path))
    const walked = pick(
      createScreen({
        document: drawn,
        vocabulary: VOCABULARY,
        addresses: 'refused',
        data: { picture: 'https://example.com/ada.png' },
      }).faults,
    )
    expect(walked.length).toBe(5)
    expect(pick(checkScreen(drawn, refused).faults)).toEqual(walked)
  })

  it('names a member that needs an address in a data type, with the field', () => {
    const nav = screen({
      component: 'SectionNav',
      props: { label: 'On this page', items: [{ $object: { label: 'A' } }] },
    })
    expect(checkScreen(nav, refused).faults[0]?.message).toBe(
      '`SectionNav` requires an address at `items` (`SectionNavItem.href`), and this host takes no address — compose the screen from the members the card lists',
    )
  })

  it('reads every address key, as the walk does', () => {
    for (const key of ADDRESS_KEYS) {
      const keyed = screen({
        component: 'DataTable',
        props: {
          label: 'Rows',
          data: [{ $object: { [key]: '/a' } }],
          columns: [],
          getRowId: { $: 'rowId' },
        },
      })
      const paths = checkScreen(
        { ...keyed, inputs: [{ name: 'rowId', type: '(row: Row) => string' }] },
        refused,
      ).faults.map(({ path }) => path)
      expect(paths, key).toContain(`$.root.props.data[0].${key}`)
    }
  })
})

describe('checkAnswer: a model’s whole answer', () => {
  const text = JSON.stringify(inbox, null, 2)
  const answer = [
    'Here is the inbox.',
    '',
    '```json',
    text,
    '```',
    '',
    'It binds the tickets.',
  ].join('\n')

  it('is checkScreen for a whole answer, with the document, whether it is whole, and the prose', () => {
    expect(checkAnswer(answer)).toEqual({
      ok: true,
      faults: [],
      document: inbox,
      complete: true,
      prose: 'Here is the inbox.\n\nIt binds the tickets.',
    })
    const broken = answer.replace('"component": "Grid"', '"component": "Modal"')
    expect(broken).not.toBe(answer)
    expect(checkAnswer(broken).faults).toEqual(checkScreen(parsePartial(broken).document).faults)
    expect(checkAnswer(answer, { members: ['Stack'] }).faults).toEqual(
      checkScreen(inbox, { members: ['Stack'] }).faults,
    )
  })

  it('reports an answer cut anywhere between its fence’s first backtick and the document’s last brace', () => {
    const opening = answer.indexOf('```json')
    const end = answer.indexOf(text) + text.length
    let lawfulCuts = 0
    for (let at = opening + 1; at < end; at += 1) {
      const cut = answer.slice(0, at)
      // The document a cut holds can be lawful as far as it goes, which `checkScreen` alone passes.
      if (at % 50 === 0) {
        const read = parsePartial(cut)
        if (read.document !== undefined && checkScreen(read.document).ok) lawfulCuts += 1
      }
      const checked = checkAnswer(cut)
      expect(checked.ok, `${at}`).toBe(false)
      expect(checked.faults, `${at}`).toEqual([
        {
          path: '$',
          message: expect.stringMatching(/^the answer ends before its document does/) as string,
        },
      ])
      expect(checked.complete).toBe(false)
    }
    expect(lawfulCuts).toBeGreaterThan(0)
    expect(checkAnswer(answer.slice(0, end)).ok).toBe(true)
  }, 60_000)

  it('says where the answer ends, in words a retry can carry', () => {
    const cut = answer.slice(0, answer.indexOf('"children"'))
    const { faults } = checkAnswer(cut)
    expect(faults[0]?.message).toBe(
      `the answer ends before its document does, inside \`${parsePartial(cut).cut ?? ''}\`: it was cut off, as at an output limit. Answer with the whole document, with fewer elements if it was long`,
    )
    expect(checkAnswer('Here it is:\n```json\n').faults[0]?.message).toBe(
      'the answer ends before its document does, inside the fenced block that holds it: it was cut off, as at an output limit. Answer with the whole document, with fewer elements if it was long',
    )
  })

  it('reports text that stops being JSON, and nothing the document so far lacks', () => {
    const broken = '```json\n{"spec": "polymorph-screen/1", "root": nope}\n```'
    const checked = checkAnswer(broken)
    expect(checked.ok).toBe(false)
    expect(checked.faults).toEqual([
      {
        path: '$',
        message: `the answer stops being JSON at character ${broken.indexOf('nope')}: a value`,
      },
    ])
  })

  it('passes an answer that is prose only, with no document', () => {
    expect(checkAnswer('I need the order number first.')).toEqual({
      ok: true,
      faults: [],
      document: undefined,
      complete: false,
      prose: 'I need the order number first.',
    })
  })

  it('takes the host’s addresses as checkScreen does', () => {
    const linked = JSON.stringify(
      screen({ component: 'Card', props: { title: 'A', href: '/a' }, children: ['x'] }),
    )
    expect(checkAnswer(linked).ok).toBe(true)
    expect(checkAnswer(linked, { addresses: 'refused' }).faults.map(({ path }) => path)).toEqual([
      '$.root.props.href',
    ])
  })
})
