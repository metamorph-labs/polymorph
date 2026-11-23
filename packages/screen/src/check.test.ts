import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateSpec } from '@polymorph/spec/validate'
import { describe, expect, it } from 'vitest'

import { checkScreen } from './check'
import { addressFault } from './urls'
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
})
