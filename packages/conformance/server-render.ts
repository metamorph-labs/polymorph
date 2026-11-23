import { vi } from 'vitest'
import { builtinEnvironments } from 'vitest/environments'

/**
 * What the generated vocabularies' server-render laws share
 * (`packages/{vue,solid,angular}-ui/server-render.test.ts`).
 *
 * Each law has two halves in one file. The first renders every states fixture
 * entry as a server does, in Node with no document, so a member that reads
 * `document`, `window` or a frame while it renders fails there. The second
 * gives the same process a document and hydrates the first half's markup in
 * it. So the file runs in the `logic` project's Node environment, and the
 * document is installed between the halves, here.
 *
 * The `logic` project runs its files in one process without isolating them,
 * so what a law leaves on the process reaches the files after it. A law sets
 * up its servers, its document and its clock through one `lawProcess`, which
 * undoes them.
 */

/** A Vite server for a law's module runner: no config file, watcher, socket or dependency scan. */
export const LAW_SERVER: {
  configFile: false
  logLevel: 'error'
  appType: 'custom'
  server: { middlewareMode: true; hmr: false; ws: false; watch: null }
  optimizeDeps: { noDiscovery: true; include: string[] }
} = {
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
}

/** The export conditions a browser build resolves, for the half that hydrates. */
export const BROWSER_CONDITIONS = ['browser', 'development', 'module', 'import']

/**
 * Records the process's globals, and returns what puts them back: it removes
 * each one added since and restores each one replaced since.
 *
 * `keep` names a global to leave as it is: one a framework sets for itself and
 * reads for as long as the process holds its modules, which is longer than the
 * file.
 */
function recordGlobals(keep: (name: string) => boolean): () => void {
  const before = new Map<string | symbol, PropertyDescriptor>()
  for (const name of Reflect.ownKeys(globalThis)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(globalThis, name)
    if (descriptor !== undefined) before.set(name, descriptor)
  }
  const kept = (name: string | symbol) => typeof name === 'string' && keep(name)
  return () => {
    for (const name of Reflect.ownKeys(globalThis)) {
      if (!before.has(name) && !kept(name)) Reflect.deleteProperty(globalThis, name)
    }
    for (const [name, descriptor] of before) {
      if (kept(name)) continue
      const now = Reflect.getOwnPropertyDescriptor(globalThis, name)
      const same =
        now !== undefined &&
        Object.is(now.value, descriptor.value) &&
        now.get === descriptor.get &&
        now.set === descriptor.set
      if (!same) Reflect.defineProperty(globalThis, name, descriptor)
    }
  }
}

/**
 * Gives this process a document (jsdom), as Vitest's `jsdom` environment does
 * for a whole file, and returns what removes it.
 *
 * jsdom has no `matchMedia` and no observers. Every query answers `false`, as
 * a server render reads it and as the browser laws' desktop width answers the
 * `phone` query. An observer reports nothing, because a hydration is checked
 * before any layout is read.
 *
 * Removing the document puts the process's globals back as they were before
 * it. The environment's own teardown leaves some replaced (`URL`, `Request`,
 * `navigator`), the observers are added here, and a framework loaded for the
 * browser adds its own (Solid's hydration state, `_$HY`).
 */
async function installDocument(keep: (name: string) => boolean): Promise<() => Promise<void>> {
  const restoreGlobals = recordGlobals(keep)
  const environment = await builtinEnvironments.jsdom.setup(globalThis, {
    jsdom: { url: 'http://localhost/', pretendToBeVisual: true },
  })
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
  class Observer {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): never[] {
      return []
    }
  }
  Object.assign(globalThis, { ResizeObserver: Observer, IntersectionObserver: Observer })
  return async () => {
    await environment.teardown(globalThis)
    restoreGlobals()
  }
}

/** The instant a law holds the clock at. */
const NOW = Date.UTC(2030, 0, 15, 12)

/** What one law sets up on the process for its whole file, and what undoes it. */
export interface LawProcess {
  /** The law's Vite servers, closed when the file is done. */
  readonly servers: { close(): Promise<unknown> }[]
  /** Gives the process a document, for the half that hydrates. */
  installDocument(): Promise<void>
  /** Runs `work`, then puts the process's globals back as they were before it. */
  restoringGlobals<Value>(work: () => Promise<Value>): Promise<Value>
  /** Closes the servers, removes the document, and puts the clock back. */
  undo(): Promise<void>
  /**
   * Runs one half. A half runs while the file loads, where a throw ends the
   * file before its `afterAll` is reached, so a half that throws is undone
   * here.
   */
  half<Value>(work: () => Promise<Value>): Promise<Value>
}

/**
 * Starts a law's file. The clock is held at one instant, because both halves
 * load the fixtures, each as modules of its own, and a fixture reads the clock
 * as it loads (RelativeTime's moments): the two halves then give a member the
 * same props. Only `Date` is held, so every timer still runs.
 *
 * `keep` names a global that stays when the globals are put back: one a
 * framework sets for itself and reads for as long as the process holds its
 * modules, which is longer than the file.
 */
export function lawProcess(keep: (name: string) => boolean = () => false): LawProcess {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  const servers: { close(): Promise<unknown> }[] = []
  const documents: (() => Promise<void>)[] = []
  let undone = false
  const undo = async (): Promise<void> => {
    if (undone) return
    undone = true
    await Promise.all(servers.map((server) => server.close()))
    for (const remove of documents) await remove()
    vi.useRealTimers()
  }
  return {
    servers,
    installDocument: async () => {
      documents.push(await installDocument(keep))
    },
    restoringGlobals: async (work) => {
      const restoreGlobals = recordGlobals(keep)
      try {
        return await work()
      } finally {
        restoreGlobals()
      }
    },
    undo,
    half: async (work) => {
      try {
        return await work()
      } catch (thrown) {
        await undo()
        throw thrown
      }
    },
  }
}

/** One line for a value a console call or a `throw` carried. */
function line(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return String(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/**
 * Runs `work` and returns what it reported: every `console.warn` and
 * `console.error` call, and what it threw, each as one line. A framework
 * reports a fault in a render that does not throw through one of the two.
 */
export async function reported(work: () => unknown): Promise<string[]> {
  const messages: string[] = []
  const { warn, error } = console
  console.warn = (...args: unknown[]) => messages.push(args.map(line).join(' '))
  console.error = (...args: unknown[]) => messages.push(args.map(line).join(' '))
  try {
    await work()
  } catch (thrown) {
    messages.push(`threw: ${line(thrown)}`)
  } finally {
    console.warn = warn
    console.error = error
  }
  return messages.map((message) => message.replace(/\s+/g, ' ').trim())
}

/**
 * The warnings the system writes itself, which start with its name. A member
 * writes one about what it was given (`devWarning`), and every renderer prints
 * it in a browser for the fixture entries that show a refused value. They say
 * nothing about a server render or a hydration.
 */
export const isDevWarning = (message: string): boolean => message.startsWith('polymorph: ')
