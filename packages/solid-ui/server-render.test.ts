import { resolve } from 'node:path'

import type * as Solid from 'solid-js'
import type * as SolidWeb from 'solid-js/web'
import { createServer, type ViteDevServer } from 'vite'
import solid from 'vite-plugin-solid'
import { afterAll, describe, expect, it } from 'vitest'

import {
  BROWSER_CONDITIONS,
  isDevWarning,
  LAW_SERVER,
  lawProcess,
  reported,
} from '@polymorph/conformance/server-render'

/**
 * The server-render law: every states fixture entry renders on a server with
 * no error and no warning, and a browser hydrates that markup into the
 * document a mount draws.
 *
 * The server half is the package as a server-rendering application loads it
 * (SolidStart, or Vite's own server rendering): through Vite and Solid's
 * plugin, which compiles the members' JSX to strings with hydration keys, in
 * Node with no document. A member that reads `document` or `window` while it
 * renders fails there.
 *
 * The client half compiles the same sources for the browser, hydratable, and
 * hydrates each entry's markup in a document this file installs once the
 * server half is done (jsdom). Solid finds each element by the key the server
 * wrote on it, and throws when a component asks for a key the markup does not
 * hold. So the law reads what the hydration threw or reported.
 *
 * A hydration that throws nothing can still leave the wrong document: Solid
 * keeps the server's text and attributes where it finds an element, and an
 * element created outside the hydration is not put in the place of the
 * server's. So the law also mounts each entry afresh, and compares the two
 * documents (`drawn`).
 *
 * Solid hydrates once in a page: the first hydration marks the page done, and
 * a later `hydrate` renders afresh. Each entry is a page of its own, so the
 * law gives each one the state the page's hydration script would
 * (`globalThis._$HY`) and clears what the last one left on `sharedConfig`.
 *
 * The entries are the states fixtures, and a few more beside them that pass
 * an element a caller wrote where a fixture passes a member
 * (`server-render.cases.tsx`).
 *
 * The file's clock is held at one instant, and what it leaves on the process
 * is undone when it ends (`lawProcess`).
 *
 * It is at the package root, in the `logic` project, because it starts its own
 * Vite servers.
 */

const PACKAGE = import.meta.dirname
const CACHE = resolve(PACKAGE, 'node_modules/.cache/server-render')

const law = lawProcess()
afterAll(law.undo)

/** A states fixture as `src/galleries.ts` lists it: the member's name and its entries. */
interface ComponentStates {
  component: string
  entries: readonly StateEntry[]
}

interface StateEntry {
  name: string
  render: (overrides?: Readonly<Record<string, unknown>>) => Solid.JSX.Element
}

/** The states fixtures, and the entries that pass elements a caller wrote (`server-render.cases.tsx`). */
async function load(server: ViteDevServer): Promise<readonly ComponentStates[]> {
  const { GALLERIES } = (await server.ssrLoadModule('/src/galleries.ts')) as {
    GALLERIES: readonly ComponentStates[]
  }
  const { cases } = (await server.ssrLoadModule('/server-render.cases.tsx')) as {
    cases: ComponentStates
  }
  return [...GALLERIES, cases]
}

const key = (states: ComponentStates, entry: StateEntry) => `${states.component} — ${entry.name}`

/* The server half: every entry rendered to markup, as a server-rendering application renders it. */
const server = await law.half(async () => {
  const vite = await createServer({
    ...LAW_SERVER,
    root: PACKAGE,
    cacheDir: resolve(CACHE, 'server'),
    plugins: [solid({ ssr: true, hot: false })],
    resolve: { dedupe: ['solid-js'] },
    ssr: { noExternal: [/^@polymorph\//] },
  })
  law.servers.push(vite)

  const markup = new Map<string, string>()
  const faults = new Map<string, string[]>()
  const galleries = await load(vite)
  const { renderToString } = (await vite.ssrLoadModule('solid-js/web')) as typeof SolidWeb
  for (const states of galleries) {
    const found: string[] = []
    for (const entry of states.entries) {
      const messages = await reported(() => {
        markup.set(
          key(states, entry),
          renderToString(() => entry.render()),
        )
      })
      found.push(...messages.map((message) => `${entry.name} — ${message}`))
    }
    faults.set(states.component, found)
  }
  return { galleries, markup, faults }
})

/* The client half: a document, then the same sources compiled for the browser, with a Solid of its own. */
const CONDITIONS = ['solid', ...BROWSER_CONDITIONS]
const browser = await law.half(async () => {
  await law.installDocument()
  const vite = await createServer({
    ...LAW_SERVER,
    root: PACKAGE,
    cacheDir: resolve(CACHE, 'browser'),
    // Compiled for the browser whatever asks for the module, and hydratable, as an application
    // that hydrates compiles them.
    plugins: [solid({ hot: false, solid: { generate: 'dom', hydratable: true } })],
    resolve: { dedupe: ['solid-js'], conditions: CONDITIONS },
    ssr: {
      noExternal: true,
      resolve: { conditions: CONDITIONS, externalConditions: CONDITIONS },
    },
  })
  law.servers.push(vite)
  const galleries = await load(vite)
  const { hydrate, render } = (await vite.ssrLoadModule('solid-js/web')) as typeof SolidWeb
  const { sharedConfig } = (await vite.ssrLoadModule('solid-js')) as typeof Solid
  return { galleries, hydrate, render, sharedConfig }
})

/**
 * A document as the law compares two of them: its elements, attributes and
 * text, and each form control's value and checked state, which are properties
 * and not markup.
 *
 * What differs between a hydration and a mount by construction is left out or
 * written one way: the hydration keys, markers and script; the order of the
 * attributes; a class list's spacing; a style, which a server writes as the
 * member gave it and a browser writes as it parsed it, so both are read
 * through a browser's parser; a `value` attribute, which a server writes for
 * the property; and a textarea's content, which is its value in markup.
 */
function drawn(host: Element): string {
  const scratch = document.createElement('div')
  const write = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as HTMLInputElement
    const tag = element.tagName.toLowerCase()
    if (tag === 'script') return ''
    const attributes: string[] = []
    for (const { name, value } of Array.from(element.attributes)) {
      if (name === 'data-hk' || name === 'value') continue
      let written = value
      if (name === 'class') written = value.split(/\s+/).filter(Boolean).join(' ')
      if (name === 'style') {
        scratch.style.cssText = value
        written = scratch.style.cssText
      }
      if ((name === 'class' || name === 'style') && written === '') continue
      attributes.push(` ${name}="${written}"`)
    }
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      attributes.push(` .value="${element.value}"`)
      if (element.checked === true) attributes.push(' .checked')
      if (element.indeterminate === true) attributes.push(' .indeterminate')
    }
    const children = tag === 'textarea' ? '' : Array.from(element.childNodes).map(write).join('')
    return `<${tag}${attributes.sort().join('')}>${children}</${tag}>`
  }
  let out = Array.from(host.childNodes).map(write).join('')
  // An id an element carries is named by its place, because a mount and a hydration generate
  // different ones.
  const ids = new Map<string, string>()
  for (const [, id] of out.matchAll(/ id="([^"]*)"/g)) {
    if (id !== undefined && !ids.has(id)) ids.set(id, `id-${ids.size}`)
  }
  for (const [id, name] of [...ids].sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(`"${id}"`).join(`"${name}"`)
  }
  return out
}

/**
 * Where a hydrated document differs from a mounted one, or `null`. An id no
 * element carries is still generated (an overlay's `aria-controls` while it is
 * closed): a mount writes `cl-7` and a hydration its place in the count, so
 * each generated id of the mount matches any id.
 */
function difference(hydrated: string, mounted: string): string | null {
  const parts = mounted.split(/cl-\d+/)
  let at = 0
  let same = true
  for (const [index, part] of parts.entries()) {
    if (index > 0) at += /^[0-9a-z]+/.exec(hydrated.slice(at))?.[0].length ?? 0
    if (!hydrated.startsWith(part, at)) {
      same = false
      break
    }
    at += part.length
  }
  if (same && at === hydrated.length) return null
  let first = 0
  while (first < hydrated.length && hydrated[first] === mounted[first]) first++
  const from = Math.max(0, first - 80)
  return `the hydrated document differs from a mount’s: …${hydrated.slice(from, first + 120)}… where a mount draws …${mounted.slice(from, first + 120)}…`
}

/** What hydrating one entry's server markup threw or reported, the members' own warnings left out. */
async function hydrationFaults(states: ComponentStates, entry: StateEntry): Promise<string[]> {
  const rendered = server.markup.get(key(states, entry))
  if (rendered === undefined) return ['the server half rendered no markup']

  // A mount, outside any hydration, for the document a hydration is held to.
  Object.assign(browser.sharedConfig, { context: undefined, registry: undefined, done: true })
  const mountHost = document.createElement('div')
  document.body.append(mountHost)
  let mounted = ''
  const mountFaults = await reported(() => {
    const dispose = browser.render(() => entry.render(), mountHost)
    mounted = drawn(mountHost)
    dispose()
  })
  document.body.innerHTML = ''

  // A page that has not hydrated yet: what Solid's hydration script leaves for `hydrate`.
  Object.assign(globalThis, { _$HY: { events: [], completed: new WeakSet(), r: {}, fe() {} } })
  Object.assign(browser.sharedConfig, { context: undefined, registry: undefined, done: false })

  const host = document.createElement('div')
  host.innerHTML = rendered
  document.body.append(host)
  let hydrated = ''
  const messages = await reported(() => {
    const dispose = browser.hydrate(() => entry.render(), host)
    hydrated = drawn(host)
    dispose()
  })
  document.body.innerHTML = ''
  const faults = [...mountFaults.map((message) => `a mount: ${message}`), ...messages].filter(
    (message) => !isDevWarning(message) && !isDevWarning(message.replace(/^a mount: /, '')),
  )
  if (faults.length > 0) return faults
  const differs = difference(hydrated, mounted)
  return differs === null ? [] : [differs]
}

describe('a server renders every state with no error and no warning', () => {
  for (const states of server.galleries) {
    it(states.component, () => {
      expect(server.faults.get(states.component)).toEqual([])
    })
  }
})

describe('a browser hydrates the server markup into the document a mount draws', () => {
  for (const states of browser.galleries) {
    it(states.component, async () => {
      const faults: string[] = []
      for (const entry of states.entries) {
        const found = await hydrationFaults(states, entry)
        faults.push(...found.map((message) => `${entry.name} — ${message.slice(0, 600)}`))
      }
      expect(faults).toEqual([])
    })
  }
})
