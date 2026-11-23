import '@angular/compiler'

import { resolve } from 'node:path'

import {
  createComponent,
  DOCUMENT,
  provideZonelessChangeDetection,
  type ApplicationRef,
  type Type,
} from '@angular/core'
import { createApplication, provideClientHydration } from '@angular/platform-browser'
import { provideServerRendering, renderApplication } from '@angular/platform-server'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

import {
  isDevWarning,
  LAW_SERVER,
  lawProcess,
  reported,
} from '@polymorph/conformance/server-render'

import { angularPlugins } from './vitest.plugins'

/**
 * The server-render law: every states fixture entry renders on a server with
 * no error and no warning, and a browser hydrates that markup with no error,
 * keeping the server's elements.
 *
 * The server half is the package as a server-rendering application loads it:
 * compiled ahead of time by the Angular compiler through Vite, and rendered by
 * `@angular/platform-server` in Node, where the document is the server
 * platform's own and there is no `window`. A member, or a fixture's helper,
 * that reads `window`, the global `document` or a frame while it renders fails
 * there, and so does an entry whose application never becomes stable, because
 * a server sends its markup only then. The application provides hydration, so the markup carries
 * what a browser needs to hydrate it.
 *
 * The client half loads the same sources again in a document this file
 * installs once the server half is done (jsdom), and attaches each fixture to
 * the element the server rendered it in. Angular reports a node that differs
 * from the server's as an error, and a component that is not hydrated clears
 * its host and renders afresh. So the law reads what the hydration reported,
 * and checks that the host's first element is still the server's.
 *
 * A fixture is attached to a host element inside one application, as the
 * browser laws mount it (`src/mount.ts`), because an entry is chosen by an
 * input and a bootstrapped root component takes none.
 *
 * Both halves run the one Angular that Node loads for this file. Angular
 * reads the document and the platform when an application is created, and not
 * when it loads, so the second half's applications are a browser's. Only the
 * members are loaded again, so one that reads the document as it loads reads
 * the installed one.
 *
 * The file's clock is held at one instant, and what it leaves on the process
 * is undone when it ends (`lawProcess`). The server platform copies its DOM
 * classes onto the process as it renders (`Node`, `HTMLElement`, and an
 * `Event` in place of Node's own), so the globals are put back once the
 * server half has rendered. The globals Angular names for itself (`ng…`) are
 * left, because the Angular this process has loaded reads them after the file.
 *
 * It is at the package root, in the `logic` project, because it starts its own
 * Vite servers. `@angular/compiler` is imported first: Angular's packages ship
 * partly compiled, and outside a build that links them the compiler finishes
 * them when they load.
 */

const PACKAGE = import.meta.dirname
const CACHE = resolve(PACKAGE, 'node_modules/.cache/server-render')

const law = lawProcess((name) => name.startsWith('ng'))
afterAll(law.undo)

/** How long an entry's application has to become stable before the law calls it stuck. */
const STABLE_MS = 5_000

/** A states fixture as `src/galleries.ts` lists it: the member's name, its fixture and its entries. */
interface ComponentStates {
  component: string
  fixture: Type<unknown>
  entries: readonly { name: string }[]
}

async function load(server: ViteDevServer): Promise<readonly ComponentStates[]> {
  const { GALLERIES } = (await server.ssrLoadModule('/src/galleries.ts')) as {
    GALLERIES: readonly ComponentStates[]
  }
  return GALLERIES
}

const key = (states: ComponentStates, entry: number) => `${states.component} — ${entry}`

async function lawServer(cache: string): Promise<ViteDevServer> {
  const vite = await createServer({
    ...LAW_SERVER,
    root: PACKAGE,
    cacheDir: resolve(CACHE, cache),
    plugins: angularPlugins(),
    resolve: { dedupe: ['@angular/core', '@angular/common', '@angular/platform-browser'] },
    ssr: { noExternal: [/^@polymorph\//] },
  })
  law.servers.push(vite)
  return vite
}

/** Attaches one fixture entry to `host` in `application`, as `src/mount.ts` attaches it. */
function attach(
  application: ApplicationRef,
  fixture: Type<unknown>,
  entry: number,
  host: Element,
): void {
  const ref = createComponent(fixture, {
    environmentInjector: application.injector,
    hostElement: host,
  })
  ref.setInput('entry', entry)
  ref.setInput('overrides', {})
  application.attachView(ref.hostView)
}

/** Settles with `work`, or rejects once `STABLE_MS` has passed. */
async function withinTime<Value>(work: Promise<Value>, otherwise: string): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(otherwise)), STABLE_MS)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/* The server half: every entry rendered to a page, as a server-rendering application renders it. */
const server = await law.half(async () => {
  const pages = new Map<string, string>()
  const faults = new Map<string, string[]>()
  const galleries = await load(await lawServer('server'))
  await law.restoringGlobals(async () => {
    for (const states of galleries) {
      const found: string[] = []
      for (const [at, entry] of states.entries.entries()) {
        const messages = await reported(async () => {
          const page = await withinTime(
            renderApplication(
              async (context) => {
                const application = await createApplication(
                  {
                    providers: [
                      provideZonelessChangeDetection(),
                      provideServerRendering(),
                      provideClientHydration(),
                    ],
                  },
                  context,
                )
                const page = application.injector.get(DOCUMENT)
                const host = page.createElement('div')
                host.id = 'host'
                page.body.appendChild(host)
                attach(application, states.fixture, at, host)
                return application
              },
              { document: '<!doctype html><html><head></head><body></body></html>' },
            ),
            'the application did not become stable, so a server would send no markup',
          )
          pages.set(key(states, at), page)
        })
        found.push(...messages.map((message) => `${entry.name} — ${message}`))
      }
      faults.set(states.component, found)
    }
  })
  return { galleries, pages, faults }
})

/*
 * The client half: a document, then the same sources loaded again, so a module that reads the
 * document as it loads reads this one. The server platform marks the process as a server while it
 * renders, and the mark is cleared for the browser's half.
 */
const browser = await law.half(async () => {
  Object.assign(globalThis, { ngServerMode: undefined })
  await law.installDocument()
  return { galleries: await load(await lawServer('browser')) }
})

/** What hydrating one entry's server page reported, the members' own warnings left out. */
async function hydrationFaults(states: ComponentStates, entry: number): Promise<string[]> {
  const page = server.pages.get(key(states, entry))
  if (page === undefined) return ['the server half rendered no page']
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
  const host = document.getElementById('host')
  if (host === null) return ['the server page holds no host']
  const first = host.firstElementChild

  let application: ApplicationRef | undefined
  const messages = await reported(async () => {
    application = await createApplication({
      providers: [provideZonelessChangeDetection(), provideClientHydration()],
    })
    attach(application, states.fixture, entry, host)
    await withinTime(application.whenStable(), 'the application did not become stable')
    if (first !== null && host.firstElementChild !== first) {
      throw new Error('the host was rendered afresh: its first element is not the server’s')
    }
  })
  application?.destroy()
  document.head.innerHTML = ''
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

describe('a browser hydrates the server markup and keeps its elements', () => {
  for (const states of browser.galleries) {
    it(
      states.component,
      async () => {
        const faults: string[] = []
        for (const [at, entry] of states.entries.entries()) {
          const found = await hydrationFaults(states, at)
          faults.push(...found.map((message) => `${entry.name} — ${message.slice(0, 400)}`))
        }
        expect(faults).toEqual([])
      },
      120_000,
    )
  }
})
