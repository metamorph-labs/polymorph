import { createElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ScreenView, type ScreenFault } from './src/screen/index'

/**
 * The screen renderer on a server, where there is no `document` and no
 * `window`. A framework that renders on a server (Next.js's App Router) renders
 * a client component there first, so the renderer may read neither while it
 * renders. This runs in node, which has neither, so a read of one throws here.
 *
 * The members are stand-ins: the vocabulary's own server rendering is the
 * Next.js gate's (`scripts/gate-next.mjs`), and what is checked here is the
 * renderer around them.
 */

const tag =
  (name: string) =>
  ({ children, label }: { children?: ReactNode; label?: string }) =>
    createElement(name, { 'data-member': name }, label ?? children)

const members = { Stack: tag('div'), Text: tag('p'), Button: tag('button') }

describe('a server renders a screen', () => {
  it('writes the markup the client draws, and tells the host nothing there', () => {
    const faults: ScreenFault[] = []
    const html = renderToString(
      createElement(ScreenView, {
        document: {
          spec: 'polymorph-screen/1',
          name: 'Served',
          purpose: 'A screen a server renders.',
          inputs: [{ name: 'title', type: 'string' }],
          root: {
            component: 'Stack',
            children: [
              { component: 'Text', children: [{ $: 'title' }] },
              { component: 'Button', props: { label: 'Open' } },
              { component: 'Buton' },
            ],
          },
        },
        data: { title: 'From the server' },
        members,
        onFault: (fault) => faults.push(fault),
      }),
    )
    expect(html).toBe(
      '<div data-member="div"><p data-member="p">From the server</p><button data-member="button">Open</button></div>',
    )
    // A server runs no effect, so the host hears of the unknown component on the client.
    expect(faults).toEqual([])
  })

  it('reads a model’s answer still being written', () => {
    const text = JSON.stringify({
      spec: 'polymorph-screen/1',
      name: 'Half',
      purpose: 'A screen half written.',
      inputs: [],
      root: { component: 'Stack', children: [{ component: 'Text', children: ['Half way'] }] },
    })
    const html = renderToString(
      createElement(ScreenView, { text: text.slice(0, text.indexOf('way') + 3), members }),
    )
    expect(html).toBe('<div data-member="div"><p data-member="p">Half way</p></div>')
  })
})
