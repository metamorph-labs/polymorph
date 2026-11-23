import { PassThrough } from 'node:stream'

import { createElement, type ReactNode } from 'react'
import { renderToPipeableStream, renderToString } from 'react-dom/server'
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
 *
 * A server renders no error boundary, so the screen is drawn inside one
 * Suspense boundary (`<!--$-->` in the markup): a member that throws on the
 * server leaves the screen's place empty, marked for the browser to draw, and
 * the host's page is still served.
 */

/** The markup a server writes around a screen it drew. */
const served = (html: string) => `<!--$-->${html}<!--/$-->`

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
      served(
        '<div data-member="div"><p data-member="p">From the server</p><button data-member="button">Open</button></div>',
      ),
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
    expect(html).toBe(served('<div data-member="div"><p data-member="p">Half way</p></div>'))
  })

  describe('a member that throws on the server', () => {
    const Broken = () => {
      throw new Error('The member broke')
    }
    const view = (fallback?: string) =>
      createElement(ScreenView, {
        fallback,
        document: {
          spec: 'polymorph-screen/1',
          name: 'Broken',
          purpose: 'A screen with a member that throws.',
          inputs: [],
          root: {
            component: 'Stack',
            children: [
              { component: 'Text', children: ['Kept'] },
              { component: 'Badge', children: ['Broken'] },
            ],
          },
        },
        members: { ...members, Badge: Broken },
      })

    it('leaves the screen to the browser, and the page around it is written', () => {
      const html = renderToString(createElement('main', null, view()))
      expect(html.startsWith('<main><!--$!-->')).toBe(true)
      expect(html.endsWith('<!--/$--></main>')).toBe(true)
      expect(html).not.toContain('Kept')
    })

    it('writes the host’s fallback in the screen’s place when it gives one', () => {
      const html = renderToString(createElement('main', null, view('Loading the screen')))
      expect(html.startsWith('<main><!--$!-->')).toBe(true)
      expect(html).toContain('Loading the screen')
      expect(html).not.toContain('Kept')
    })

    it('does the same in a stream: the shell is sent, and the error is told to the server', async () => {
      const errors: unknown[] = []
      const html = await new Promise<string>((resolve, reject) => {
        let written = ''
        const out = new PassThrough()
        out.on('data', (chunk: Buffer) => (written += chunk.toString()))
        out.on('end', () => resolve(written))
        const stream = renderToPipeableStream(createElement('main', null, view()), {
          onShellReady: () => stream.pipe(out),
          onShellError: reject,
          onError: (error) => {
            errors.push(error)
          },
        })
      })
      expect(html.startsWith('<main><!--$!-->')).toBe(true)
      expect(errors.map(String)).toEqual(['Error: The member broke'])
    })
  })
})
