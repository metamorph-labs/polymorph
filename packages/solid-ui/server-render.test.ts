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
 * no error and no warning, and a browser hydrates that markup, except the
 * entries `NOT_HYDRATING` names.
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
 * Solid hydrates once in a page: the first hydration marks the page done, and
 * a later `hydrate` renders afresh. Each entry is a page of its own, so the
 * law gives each one the state the page's hydration script would
 * (`globalThis._$HY`) and clears what the last one left on `sharedConfig`.
 *
 * `NOT_HYDRATING` is the list of entries that do not hydrate. The law fails
 * on an entry that is listed and hydrates, as it does on one that is not
 * listed and fails, so the list is exact and an entry leaves it when its
 * member is fixed. It holds that a listed entry fails, and not how it fails.
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

/**
 * The entries a browser does not hydrate, by member.
 *
 * Most fail the same way: a component in the browser asks for the element
 * under a key, and the server's markup holds no element under it. CommentThread
 * fails reading the sibling of an element it did not find. The cause is traced
 * for DescriptionList. A node inside a value is made each time the value is
 * read, and the member reads `items` once for its length and again for its
 * rows, so an item's Badge is made twice. The server keeps the markup of the
 * one it drew, and the browser's other one asks for a key the markup does not
 * hold. The other entries also hold a node the member was given inside a value
 * or a slot (a DataTable column's cell, an EmptyState's action, an AppShell
 * slot's member), and their causes are not traced. An application that renders
 * one of these on a server mounts it in the browser instead of hydrating it.
 */
const NOT_HYDRATING: Readonly<Record<string, readonly string[]>> = {
  Avatar: ['a group of five with max 3 — three marks and a "+2" that is real text'],
  DescriptionList: ['member detail — a value is often a member, not a sentence'],
  CommentThread: ['a thread with replies'],
  DataTable: [
    'plain',
    'sorted, ascending, on one column',
    'sorted the other way',
    'selectable, with nothing selected yet',
    'some selected — the header goes indeterminate and the bar arrives',
    'all selected',
    'expandable, with every row closed',
    'a row open — its detail spans every column',
    'a row that takes no detail — its cell in the expansion column is empty',
    'selection with expansion — a selected row that is open',
    'with a pagination row',
  ],
  ArtifactPane: ['two readings — the switch between code and preview'],
  AppShell: [
    'default — every slot filled',
    'grouped rail, with the user at its foot',
    'collapsed',
    'grouped rail, collapsed — titles gone, names kept',
    'with a banner — a notice across the frame, above the rail and the topbar',
    'counts in the topbar — a capped count beside a neighbour and at the edge',
    'navigation on top — the rail’s items lead the topbar',
    'navigation on top, grouped — a rule between the groups',
    'drawer closed — below the breakpoint, the rail behind the topbar’s menu button',
    'drawer open — below the breakpoint, the rail over the page and the banner',
  ],
  ListPage: [
    'summary survives the empty story — a filter changed the view, not the queue',
    'empty',
    'filtered dry — the way out is a secondary action',
  ],
  Dashboard: ['three stats, a table and a narrow column'],
  MasterDetailPage: [
    'an item selected — the list beside its detail',
    'a long list — the list pane scrolls and the detail stays',
    'narrow, an item selected — the detail alone under the way back',
  ],
  SearchPage: ['nothing found — the way out is a secondary action'],
  ConversationPage: ['with an aside — the artifact beside the thread'],
}

/** A states fixture as `src/galleries.ts` lists it: the member's name and its entries. */
interface ComponentStates {
  component: string
  entries: readonly StateEntry[]
}

interface StateEntry {
  name: string
  render: (overrides?: Readonly<Record<string, unknown>>) => Solid.JSX.Element
}

async function load(server: ViteDevServer): Promise<readonly ComponentStates[]> {
  const { GALLERIES } = (await server.ssrLoadModule('/src/galleries.ts')) as {
    GALLERIES: readonly ComponentStates[]
  }
  return GALLERIES
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
  const { hydrate } = (await vite.ssrLoadModule('solid-js/web')) as typeof SolidWeb
  const { sharedConfig } = (await vite.ssrLoadModule('solid-js')) as typeof Solid
  return { galleries, hydrate, sharedConfig }
})

/** What hydrating one entry's server markup threw or reported, the members' own warnings left out. */
async function hydrationFaults(states: ComponentStates, entry: StateEntry): Promise<string[]> {
  const rendered = server.markup.get(key(states, entry))
  if (rendered === undefined) return ['the server half rendered no markup']

  // A page that has not hydrated yet: what Solid's hydration script leaves for `hydrate`.
  Object.assign(globalThis, { _$HY: { events: [], completed: new WeakSet(), r: {}, fe() {} } })
  Object.assign(browser.sharedConfig, { context: undefined, registry: undefined, done: false })

  const host = document.createElement('div')
  host.innerHTML = rendered
  document.body.append(host)
  const messages = await reported(() => {
    const dispose = browser.hydrate(() => entry.render(), host)
    dispose()
  })
  document.body.innerHTML = ''
  return messages.filter((message) => !isDevWarning(message))
}

describe('a server renders every state with no error and no warning', () => {
  for (const states of server.galleries) {
    it(states.component, () => {
      expect(server.faults.get(states.component)).toEqual([])
    })
  }
})

describe('a browser hydrates the server markup', () => {
  for (const states of browser.galleries) {
    it(states.component, async () => {
      const failing: string[] = []
      const faults: string[] = []
      for (const entry of states.entries) {
        const found = await hydrationFaults(states, entry)
        if (found.length === 0) continue
        failing.push(entry.name)
        faults.push(...found.map((message) => `${entry.name} — ${message.slice(0, 400)}`))
      }
      expect(failing, faults.join('\n')).toEqual(NOT_HYDRATING[states.component] ?? [])
    })
  }

  it('lists only members the vocabulary has', () => {
    const members = new Set(browser.galleries.map((states) => states.component))
    expect(Object.keys(NOT_HYDRATING).filter((member) => !members.has(member))).toEqual([])
  })
})
