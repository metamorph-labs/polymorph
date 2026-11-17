import { EventEmitter } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { COMPOSER_SAVE_ROUTE, type ComposerSaveResult } from './protocol'
import { composerSave } from './save-endpoint'

/**
 * The composer's save endpoint.
 *
 * Four checks, each on a way the endpoint could respond wrongly:
 *
 *  - **Does a saved screen reach the Open list?** `design/screens/` is outside the Vite root, so
 *    nothing watches it by default. The glob that builds the Open list would never be
 *    invalidated, and the in-app note that promises the file "on the next reload" would be false,
 *    because it would take a server restart. The dev server watches the directory, and the law
 *    below runs a real Vite server to prove that a saved file reaches the glob.
 *  - **What does an oversize body get?** A 413, and the request is stopped after the reply has
 *    flushed. Not a 400 written while the client is still uploading, which browsers report as
 *    "Failed to fetch" and the message is lost.
 *  - **What does a missing registry get?** A 500 with the message that explains the fix. The
 *    problem is entirely on the server side, so it is not a 400.
 *  - **Does a failed validator load persist?** No. A cached jiti promise that holds a rejection
 *    would refuse every save until the server restarts, so a transient failure is retried.
 *
 * The first check above runs a real `createServer`. The others call the middleware directly,
 * which is the whole endpoint and needs no port.
 */

const ROOT = resolve(import.meta.dirname, '../../../..')
const SCREENS = 'design/screens'

const screen = (name: string) => ({
  spec: 'polymorph-screen/1',
  name,
  purpose: 'A probe screen, saved by a test.',
  inputs: [],
  root: { component: 'Stack', props: { gap: 4 }, children: [{ component: 'Spinner' }] },
})

// `realpathSync`, because macOS returns `/var/folders/…` for a directory whose real path is
// `/private/var/folders/…`. Vite normalises its root to the real path while chokidar reports the
// symlinked one, and a glob matcher built from one never matches a file reported as the other.
// Without it, the test would fail for a reason unrelated to the endpoint.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'pm-composer-save-')))

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/**
 * A root shaped like the repository. It links the real packages and registry (the endpoint loads
 * the validator from `packages/spec/src/validate.ts` and reads `registry/registry.json`), and has
 * its own screens directory to write into.
 */
function makeRoot(name: string, { packages = true, registry = true } = {}): string {
  const root = join(scratch, name)
  mkdirSync(resolve(root, SCREENS), { recursive: true })
  if (packages) symlinkSync(resolve(ROOT, 'packages'), resolve(root, 'packages'), 'dir')
  if (registry) symlinkSync(resolve(ROOT, 'registry'), resolve(root, 'registry'), 'dir')
  return root
}

/* -------------------------------------------------------------------------- */
/* The middleware, called directly                                            */
/* -------------------------------------------------------------------------- */

type Handler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void

class FakeRequest extends EventEmitter {
  method = 'POST'
  headers: Record<string, string> = {}
  destroyed = false
  paused = false
  destroy(): this {
    this.destroyed = true
    return this
  }
  pause(): this {
    this.paused = true
    return this
  }
}

class FakeResponse {
  statusCode = 200
  ended = 0
  body = ''
  destroyedAtEnd: boolean | null = null
  setHeader(): void {}
  end(text: string, callback?: () => void): void {
    this.ended += 1
    this.body = text
    callback?.()
  }
}

/** The plugin's middleware, plus the paths it asked the dev server to watch. */
function endpoint(root: string): { handle: Handler; watched: string[] } {
  const watched: string[] = []
  let handle: Handler | undefined
  const configure = composerSave({ root }).configureServer as (server: unknown) => void
  configure({
    middlewares: {
      use: (route: string, fn: Handler) => {
        expect(route).toBe(COMPOSER_SAVE_ROUTE)
        handle = fn
      },
    },
    watcher: { add: (path: string) => watched.push(path) },
  })
  if (handle === undefined) throw new Error('the plugin registered no middleware')
  return { handle, watched }
}

/** Sends a body in chunks and resolves when the endpoint has replied. */
async function post(
  handle: Handler,
  chunks: string[],
): Promise<{ status: number; result: ComposerSaveResult; request: FakeRequest }> {
  const request = new FakeRequest()
  const response = new FakeResponse()
  const answered = new Promise<void>((settle) => {
    const original = response.end.bind(response)
    response.end = (text: string, callback?: () => void) => {
      original(text, callback)
      settle()
    }
  })

  handle(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => {})
  for (const chunk of chunks) request.emit('data', Buffer.from(chunk))
  request.emit('end')
  await answered

  return {
    status: response.statusCode,
    result: JSON.parse(response.body) as ComposerSaveResult,
    request,
  }
}

const body = (name: string, overwrite = false) =>
  JSON.stringify({ screen: screen(name), overwrite })

describe('the endpoint refuses with the correct status', () => {
  it('writes a lawful screen, and asks before amending one', async () => {
    const { handle } = endpoint(makeRoot('writes'))

    const first = await post(handle, [body('ProbeScreen')])
    expect(first.status).toBe(200)
    expect(first.result).toEqual({ ok: true, written: [`${SCREENS}/probe-screen.json`] })

    const again = await post(handle, [body('ProbeScreen')])
    expect(again.result).toEqual({ ok: false, existing: [`${SCREENS}/probe-screen.json`] })
    expect(again.status).toBe(200)
  })

  it('refuses an unlawful screen with the validator message', async () => {
    const { handle } = endpoint(makeRoot('unlawful'))
    const bad = JSON.stringify({
      screen: { ...screen('BadScreen'), root: { component: 'Buton' } },
    })
    const answer = await post(handle, [bad])
    expect(answer.status).toBe(400)
    expect(answer.result.error).toContain('no component called `Buton`')
  })

  it('answers an oversize body 413, and stops reading it', async () => {
    // A browser reports a reply written into an in-flight request as "Failed to fetch", and the
    // endpoint's message is lost. So the size check must not reply while the client is still
    // uploading.
    const { handle } = endpoint(makeRoot('oversize'))
    const answer = await post(handle, ['x'.repeat(300 * 1024)])

    expect(answer.status).toBe(413)
    expect(answer.result.error).toContain('too large')
    // Paused rather than drained before the reply, then destroyed.
    expect(answer.request.paused).toBe(true)
    expect(answer.request.destroyed).toBe(true)
  })

  it('answers a missing registry with 500, because the fault is on the server', async () => {
    // A 4xx says the client sent something wrong. A dev server without its generated registry is
    // not caused by the page, and the message says so.
    const { handle } = endpoint(makeRoot('no-registry', { registry: false }))
    const answer = await post(handle, [body('ProbeScreen')])

    expect(answer.status).toBe(500)
    expect(answer.result.error).toContain('pnpm registry')
  })

  it('retries a validator that failed to load instead of refusing forever', async () => {
    // A jiti promise cached with `??=`, including a rejection, would turn one transient failure
    // (a half-written `validate.ts`, a file that does not exist yet) into the same error for
    // every save until the server restarts.
    const root = makeRoot('late-validator', { packages: false })
    const { handle } = endpoint(root)

    const refused = await post(handle, [body('ProbeScreen')])
    expect(refused.status).toBe(500)
    expect(refused.result.ok).toBe(false)

    symlinkSync(resolve(ROOT, 'packages'), resolve(root, 'packages'), 'dir')
    const accepted = await post(handle, [body('ProbeScreen')])
    expect(accepted.result.ok).toBe(true)
  })

  it('tells the dev server to watch the directory it writes into', () => {
    const root = makeRoot('watched')
    expect(endpoint(root).watched).toEqual([resolve(root, SCREENS)])
  })
})

describe('a saved screen reaches the Open list', () => {
  it('invalidates the glob that builds it, on a real dev server', async () => {
    /*
     * The end-to-end check of the in-app note's promise. `design/screens/` is outside the Vite
     * root. Without a watcher, the eager glob in `ComposerPage.tsx` would keep its original map,
     * and only a restart would update it, not a reload. This runs a real dev server with a module
     * that globs the same directory, saves a screen through the endpoint, and waits until the
     * transform includes it.
     */
    const { createServer } = await import('vite')
    const root = makeRoot('served')
    // The same layout as the app. The Vite root is the app, and the screens directory is next to
    // it in the repository, which is why the default watcher does not cover it.
    const appRoot = resolve(root, 'app')
    mkdirSync(appRoot, { recursive: true })
    writeFileSync(
      resolve(appRoot, 'main.js'),
      "export const screens = import.meta.glob('../design/screens/*.json', { eager: true })\n",
    )

    const server = await createServer({
      root: appRoot,
      configFile: false,
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: [] },
      // One explicit address for both sides. `localhost` can resolve to ::1 for the listener and
      // to 127.0.0.1 for the client (Ubuntu 26.04 maps both), and then the running server refuses
      // the request.
      server: { host: '127.0.0.1', port: 0 },
      plugins: [composerSave({ root })],
    })
    await server.listen()

    try {
      const before = await server.transformRequest('/main.js')
      expect(before?.code).not.toContain('served-screen.json')

      const port = (server.httpServer?.address() as { port: number }).port
      const answer = await fetch(`http://127.0.0.1:${port}${COMPOSER_SAVE_ROUTE}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body('ServedScreen'),
      })
      expect(answer.status).toBe(200)
      expect((await answer.json()) as ComposerSaveResult).toEqual({
        ok: true,
        written: [`${SCREENS}/served-screen.json`],
      })
      expect(existsSync(resolve(root, SCREENS, 'served-screen.json'))).toBe(true)

      // The watcher's `add` event invalidates a glob importer, so this checks the whole chain:
      // file written → watched → importer invalidated → the next transform includes the screen.
      const deadline = Date.now() + 15_000
      let code = ''
      while (Date.now() < deadline && !code.includes('served-screen.json')) {
        await new Promise((settle) => setTimeout(settle, 100))
        code = (await server.transformRequest('/main.js'))?.code ?? ''
      }
      expect(code, 'the glob importer never saw the saved screen').toContain('served-screen.json')
    } finally {
      await server.close()
    }
  }, 90_000)
})
