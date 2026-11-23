import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { createServer, type Plugin, type ViteDevServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { createSSRApp, type VNode } from 'vue'
import type * as Vue from 'vue'
import { renderToString, type SSRContext } from 'vue/server-renderer'

import {
  BROWSER_CONDITIONS,
  isDevWarning,
  LAW_SERVER,
  lawProcess,
  reported,
} from '@polymorph/conformance/server-render'

/**
 * The server-render law: every states fixture entry renders on a server with
 * no error and no warning, and a browser hydrates that markup with no
 * mismatch.
 *
 * The server half is the package as a server-rendering application loads it
 * (Nuxt, or Vite's own server rendering): through Vite and Vue's plugin, which
 * compiles each member's template to strings, in Node with no document. A
 * member that reads `document` or `window` while it renders fails there.
 *
 * The client half compiles the same sources for the browser and hydrates each
 * entry's markup in a document this file installs once the server half is
 * done (jsdom). Vue reports a node, a text or an attribute that differs from
 * the server's through `console.warn`, so the law reads what the hydration
 * reported. The copy of Vue that hydrates is loaded after the document exists,
 * because Vue keeps the document it finds when it loads.
 *
 * An overlay renders through `<Teleport to="body">`. A server render returns a
 * teleport's markup apart from the application's (`teleports.body` on the
 * render's context), and Vue hydrates it from the start of the body. So the
 * law places it there, before the application's root, as Nuxt does and as a
 * hand-written server must.
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
  render: (overrides?: Readonly<Record<string, unknown>>) => VNode
}

async function load(server: ViteDevServer): Promise<readonly ComponentStates[]> {
  const { GALLERIES } = (await server.ssrLoadModule('/src/galleries.ts')) as {
    GALLERIES: readonly ComponentStates[]
  }
  return GALLERIES
}

const key = (states: ComponentStates, entry: StateEntry) => `${states.component} — ${entry.name}`

/** What a server sends for one entry: the application's markup and each teleport target's. */
interface Rendered {
  html: string
  teleports: Readonly<Record<string, string>>
}

/* The server half: every entry rendered to markup, as a server-rendering application renders it. */
const server = await law.half(async () => {
  const vite = await createServer({
    ...LAW_SERVER,
    root: PACKAGE,
    cacheDir: resolve(CACHE, 'server'),
    plugins: [vue()],
    resolve: { dedupe: ['vue'] },
    ssr: { noExternal: [/^@polymorph\//] },
  })
  law.servers.push(vite)

  const markup = new Map<string, Rendered>()
  const faults = new Map<string, string[]>()
  const galleries = await load(vite)
  for (const states of galleries) {
    const found: string[] = []
    for (const entry of states.entries) {
      const messages = await reported(async () => {
        const context: SSRContext = {}
        const html = await renderToString(createSSRApp({ render: () => entry.render() }), context)
        markup.set(key(states, entry), { html, teleports: context.teleports ?? {} })
      })
      found.push(...messages.map((message) => `${entry.name} — ${message}`))
    }
    faults.set(states.component, found)
  }
  return { galleries, markup, faults }
})

/**
 * Vue's plugin compiling for the browser in a server's module runner, where it
 * would compile a template to strings: each hook is told the module is not for
 * a server render.
 */
function compiledForBrowser(plugin: Plugin): Plugin {
  const forBrowser = <Hook>(hook: Hook): Hook => {
    if (hook === undefined || hook === null) return hook
    const handler =
      typeof hook === 'function' ? hook : (hook as unknown as { handler: unknown }).handler
    const wrapped = function (this: unknown, ...args: unknown[]) {
      const options = args[args.length - 1]
      if (typeof options === 'object' && options !== null && 'ssr' in options) {
        args[args.length - 1] = { ...options, ssr: false }
      }
      return (handler as (...all: unknown[]) => unknown).apply(this, args)
    }
    return (typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped }) as Hook
  }
  return {
    ...plugin,
    resolveId: forBrowser(plugin.resolveId),
    load: forBrowser(plugin.load),
    transform: forBrowser(plugin.transform),
  }
}

/* The client half: a document, then the same sources compiled for the browser, with a Vue of its own. */
const browser = await law.half(async () => {
  await law.installDocument()
  const vite = await createServer({
    ...LAW_SERVER,
    root: PACKAGE,
    cacheDir: resolve(CACHE, 'browser'),
    plugins: [compiledForBrowser(vue())],
    resolve: { dedupe: ['vue'], conditions: BROWSER_CONDITIONS },
    ssr: {
      noExternal: true,
      resolve: { conditions: BROWSER_CONDITIONS, externalConditions: BROWSER_CONDITIONS },
    },
  })
  law.servers.push(vite)
  return {
    galleries: await load(vite),
    vue: (await vite.ssrLoadModule('vue')) as typeof Vue,
  }
})

/** What hydrating one entry's server markup reported, the members' own warnings left out. */
async function hydrationFaults(states: ComponentStates, entry: StateEntry): Promise<string[]> {
  const rendered = server.markup.get(key(states, entry))
  if (rendered === undefined) return ['the server half rendered no markup']
  const elsewhere = Object.keys(rendered.teleports).filter((target) => target !== 'body')
  if (elsewhere.length > 0)
    return [`teleports to ${elsewhere.join(', ')}, which the law does not place`]

  const host = document.createElement('div')
  host.innerHTML = rendered.html
  document.body.innerHTML = rendered.teleports['body'] ?? ''
  document.body.append(host)
  const messages = await reported(async () => {
    const app = browser.vue.createSSRApp({ render: () => entry.render() })
    app.mount(host)
    await browser.vue.nextTick()
    app.unmount()
  })
  document.body.innerHTML = ''
  // Vue keeps where the last teleport's markup ended on the target, for the next teleport of the
  // same page. Each entry is a page of its own.
  delete (document.body as { _lpa?: unknown })._lpa
  return messages.filter((message) => !isDevWarning(message))
}

describe('a server renders every state with no error and no warning', () => {
  for (const states of server.galleries) {
    it(states.component, () => {
      expect(server.faults.get(states.component)).toEqual([])
    })
  }
})

describe('a browser hydrates the server markup with no mismatch', () => {
  for (const states of browser.galleries) {
    it(states.component, async () => {
      const faults: string[] = []
      for (const entry of states.entries) {
        const found = await hydrationFaults(states, entry)
        faults.push(...found.map((message) => `${entry.name} — ${message.slice(0, 400)}`))
      }
      expect(faults).toEqual([])
    })
  }
})
