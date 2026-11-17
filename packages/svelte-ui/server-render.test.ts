/**
 * @vitest-environment jsdom
 */
import { resolve } from 'node:path'

import { svelte } from '@sveltejs/vite-plugin-svelte'
import type * as Svelte from 'svelte'
import { compile, compileModule } from 'svelte/compiler'
import type * as SvelteServer from 'svelte/server'
import { createServer, type InlineConfig, type Plugin, type ViteDevServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * The server-render law: every states fixture entry, rendered on the server
 * with `svelte/server`'s `render`, holds the same text and the same `data-*`
 * attributes, element by element in document order, as the entry's first
 * render in a client mount. A server render runs once, from the top down, so
 * a member that reads its slot before it renders it, or reads the slot's text,
 * renders the slot first into a string of its own (`@polymorph/svelte`'s
 * `server.ts`): FormField lays its label out by its control's kind, ChatThread
 * chooses its empty state by its turns, and Markdown parses its source on the
 * server as it does in the browser.
 *
 * The server half is the package as a server-rendering application loads it,
 * through Vite and Svelte's plugin. The client half compiles the same sources
 * for the browser and runs them in this file's document (jsdom), and reads the
 * first render before any effect runs, because the server markup is that
 * render. Two things differ by construction and are read past: an id
 * `$props.id()` makes (`s1` on the server, `c1` in a mount), which is compared
 * by where it first appears, and a `<textarea>`'s value, which is text in
 * server markup and a property in the document. A portal's content is drawn at
 * the end of the body in a mount and not at all on the server, as in React, so
 * neither half compares it.
 *
 * It is at the package root, in the `logic` project, because it starts its own
 * Vite servers; the docblock asks for a document.
 */

const PACKAGE = import.meta.dirname
const CACHE = resolve(PACKAGE, 'node_modules/.cache/server-render')

/** What both halves load: a server for the module runner, and no watcher, socket or discovery. */
const BASE: InlineConfig = {
  root: PACKAGE,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
}

/**
 * Svelte compiled for the browser in a server's module runner, so a mount runs
 * in this file's document: components and rune modules in client mode, and
 * `import.meta.env` read as a browser build reads it, with no server render.
 */
const browserSvelte: Plugin = {
  name: 'polymorph:browser-svelte',
  transform(source, id) {
    const file = id.split('?')[0] as string
    const code = source.replaceAll('import.meta.env', '({ SSR: false })')
    if (file.endsWith('.svelte')) {
      const out = compile(code, { filename: file, generate: 'client', dev: true })
      return { code: out.js.code, map: out.js.map }
    }
    if (/\.svelte\.(ts|js)$/.test(file)) {
      const out = compileModule(code, { filename: file, generate: 'client', dev: true })
      return { code: out.js.code, map: out.js.map }
    }
    return code === source ? null : { code, map: null }
  },
}

const BROWSER_CONDITIONS = ['svelte', 'browser', 'development', 'module', 'import']

/** A states fixture as `src/galleries.ts` lists it: the member's name and its entries. */
interface ComponentStates {
  component: string
  entries: readonly StateEntry[]
}

interface StateEntry {
  name: string
  render: unknown
}

/** `src/MountedEntry.svelte`: one entry, with the props the laws set on its member. */
type MountedEntry = Svelte.Component<{
  render: unknown
  overrides: Readonly<Record<string, unknown>>
}>

interface Half {
  galleries: readonly ComponentStates[]
  entry: MountedEntry
}

async function load(server: ViteDevServer): Promise<Half> {
  const { GALLERIES } = (await server.ssrLoadModule('/src/galleries.ts')) as {
    GALLERIES: readonly ComponentStates[]
  }
  const { default: entry } = (await server.ssrLoadModule('/src/MountedEntry.svelte')) as {
    default: MountedEntry
  }
  return { galleries: GALLERIES, entry }
}

const servers: ViteDevServer[] = []
afterAll(async () => {
  await Promise.all(servers.map((server) => server.close()))
})

/* The server half: every entry rendered to markup, as a server-rendering application renders it. */
const onServer = await createServer({
  ...BASE,
  cacheDir: resolve(CACHE, 'server'),
  plugins: [svelte({ configFile: resolve(PACKAGE, 'svelte.config.js') })],
  ssr: { noExternal: [/^@polymorph\//] },
})
servers.push(onServer)
const server = await load(onServer)
const { render } = (await onServer.ssrLoadModule('svelte/server')) as typeof SvelteServer
const key = (states: ComponentStates, entry: StateEntry) => `${states.component} — ${entry.name}`
const markup = new Map<string, string>()
for (const states of server.galleries) {
  for (const entry of states.entries) {
    const props = { render: entry.render, overrides: {} }
    markup.set(key(states, entry), render(server.entry, { props }).body)
  }
}

/*
 * The client half: the same sources compiled for the browser, mounted in this document. jsdom
 * has no `matchMedia`; every query answers as at the browser law's desktop width, where the
 * vocabulary's one query (`phone`) does not hold, as it does not on the server.
 */
window.matchMedia = (media: string) =>
  ({
    media,
    matches: false,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) satisfies MediaQueryList
const inBrowser = await createServer({
  ...BASE,
  cacheDir: resolve(CACHE, 'browser'),
  plugins: [browserSvelte],
  resolve: { conditions: BROWSER_CONDITIONS },
  ssr: {
    noExternal: true,
    resolve: { conditions: BROWSER_CONDITIONS, externalConditions: BROWSER_CONDITIONS },
  },
})
servers.push(inBrowser)
const browser = await load(inBrowser)
const { mount, unmount } = (await inBrowser.ssrLoadModule('svelte')) as typeof Svelte

/** What the law compares: an element's text, and each element's `data-*` attributes in order. */
interface Reading {
  text: string
  data: string[]
}

function read(root: Node): Reading {
  const ids = new Map<string, string>()
  const id = (token: string) => {
    if (!ids.has(token)) ids.set(token, `id${ids.size + 1}`)
    return ids.get(token) as string
  }
  const data: string[] = []
  for (const element of Array.from((root as ParentNode).querySelectorAll('*'))) {
    const attributes = Array.from(element.attributes)
      .filter((attribute) => attribute.name.startsWith('data-'))
      .map((attribute) => `${attribute.name}=${attribute.value.replace(/\b[sc]\d+\b/g, id)}`)
      .sort()
    if (attributes.length > 0) data.push(`${element.localName}[${attributes.join(' ')}]`)
  }
  let text = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.localName !== 'textarea') text += (node as Text).data
  }
  return { text, data }
}

/** The first difference between an entry's server markup and its first render in a mount. */
function difference(states: ComponentStates, entry: StateEntry): string | null {
  const template = document.createElement('template')
  template.innerHTML = markup.get(key(states, entry)) ?? ''
  const onTheServer = read(template.content)
  const host = document.createElement('div')
  document.body.append(host)
  const instance = mount(browser.entry, {
    target: host,
    props: { render: entry.render, overrides: {} },
  })
  const inAMount = read(host)
  void unmount(instance)
  host.remove()
  if (onTheServer.text !== inAMount.text) {
    return `text: ${JSON.stringify(onTheServer.text)} on the server, ${JSON.stringify(inAMount.text)} in a mount`
  }
  const length = Math.max(onTheServer.data.length, inAMount.data.length)
  for (let at = 0; at < length; at += 1) {
    if (onTheServer.data[at] !== inAMount.data[at]) {
      return `element ${at}: ${onTheServer.data[at] ?? 'none'} on the server, ${inAMount.data[at] ?? 'none'} in a mount`
    }
  }
  return null
}

describe('a server render holds what the first render in a mount holds', () => {
  for (const states of browser.galleries) {
    it(states.component, () => {
      const differences = states.entries.flatMap((entry) => {
        const found = difference(states, entry)
        return found === null ? [] : [`${entry.name} — ${found}`]
      })
      expect(differences).toEqual([])
    })
  }
})
