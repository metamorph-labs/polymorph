import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { relative, resolve, sep } from 'node:path'

import { createJiti } from 'jiti'
import type { Plugin } from 'vite'

import { COMPOSER_SAVE_ROUTE, slugOf, type ComposerSaveResult } from './protocol'

/**
 * `POST /__composer/save`, the composer's only write.
 *
 * It has the same structure as `studioSave` but is a separate plugin on purpose, because each
 * endpoint handles one kind of document. The studio's jiti loads the theme engine, and this one
 * loads the spec validator. It has the same two guards (`apply: 'serve'` + `configureServer`),
 * the same same-origin check, the same path containment and the same overwrite confirmation.
 *
 * It differs from the studio's endpoint in one way, on purpose. The studio's exceptions audit is
 * skipped when the registry JSON is missing. Without a registry, a screen can only be
 * shape-checked, so a component called `Buton` would be saved. This endpoint exists only under
 * `vite dev`, whose `predev` always generates the registry. So a missing registry is refused,
 * with the fix in the message, rather than accepting a partly checked document.
 */

const SCREENS_DIR = 'design/screens'
const MAX_BODY_BYTES = 256 * 1024

interface Submitted {
  screen?: unknown
  overwrite?: boolean
}

type Validate = (
  registry: unknown,
  document: unknown,
) => { ok: boolean; faults: { path: string; message: string }[] }

export interface ComposerSaveOptions {
  root: string
}

function contain(root: string, name: string): string {
  const base = resolve(root, SCREENS_DIR)
  const file = resolve(base, `${name}.json`)
  const inside = relative(base, file)
  if (inside !== `${name}.json` || inside.startsWith('..') || inside.includes(sep)) {
    throw new Error(`composer: "${name}" would write outside ${SCREENS_DIR}`)
  }
  return file
}

/**
 * Two faults the client cannot fix by sending something different. They are separate from the
 * ordinary "your document is wrong" error so the status code can distinguish them.
 */
class TooLarge extends Error {}
class ServerFault extends Error {}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise<string>((settle, fail) => {
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        // Stop reading before replying. A browser reports a response written into a request that
        // is still uploading as "Failed to fetch", and the endpoint's message is lost. Pausing
        // applies backpressure while the reply is built. The caller destroys the request once
        // the reply has flushed.
        request.pause()
        fail(new TooLarge('composer: payload too large to be a screen'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => settle(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => fail(new Error('composer: the request ended early')))
  })
}

function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (origin === undefined) return true
  const host = request.headers.host
  return host !== undefined && (origin === `http://${host}` || origin === `https://${host}`)
}

function save(root: string, payload: Submitted, validate: Validate): ComposerSaveResult {
  const registryPath = resolve(root, 'registry/registry.json')
  if (!existsSync(registryPath)) {
    // A `ServerFault`, not a refusal. Nothing the page sends could avoid this, and a 4xx would
    // tell the client to fix something it does not control. The message with the fix is the same
    // either way.
    throw new ServerFault(
      'composer: no registry/registry.json — a screen without a registry is only ' +
        'shape-checkable. Run `pnpm registry` (or restart `pnpm dev`, whose predev writes it).',
    )
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as unknown

  const verdict = validate(registry, payload.screen)
  if (!verdict.ok) {
    throw new Error(verdict.faults.map((fault) => `${fault.path}: ${fault.message}`).join(' — '))
  }

  const screen = payload.screen as { name: string }
  const file = contain(root, slugOf(screen.name))
  const rel = `${SCREENS_DIR}/${slugOf(screen.name)}.json`

  if (existsSync(file) && payload.overwrite !== true) {
    return { ok: false, existing: [rel] }
  }

  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(payload.screen, null, 2)}\n`, 'utf8')
  return { ok: true, written: [rel] }
}

export function composerSave({ root }: ComposerSaveOptions): Plugin {
  let validator: Promise<Validate> | undefined

  const load = () => {
    validator ??= createJiti(import.meta.url)
      .import<{ validateSpec: Validate }>(resolve(root, 'packages/spec/src/validate.ts'))
      .then((module) => module.validateSpec)
      .catch((error: unknown) => {
        // A cached rejection would block saving permanently. One transient failure, such as a
        // half-written `validate.ts` or a file that does not exist yet, would refuse every save
        // until the server restarts, always with the first error's message. Clearing the cache
        // costs one extra load attempt and lets the endpoint recover.
        validator = undefined
        throw new ServerFault(
          `composer: the spec validator could not be loaded — ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })
    return validator
  }

  return {
    name: 'pm-composer-save',
    apply: 'serve',
    configureServer(server) {
      /*
       * Watches the screens directory.
       *
       * `design/screens/` is outside the Vite root (`apps/workbench`), so the dev server's watcher
       * does not cover it by default, and a new file there raises no event. A screen saved in this
       * session appears in the Open list on reload because Vite's add/unlink handling invalidates
       * the eager `import.meta.glob` that builds the list, and that handling starts with a watcher
       * event. Watching the directory is enough.
       */
      server.watcher.add(resolve(root, SCREENS_DIR))

      server.middlewares.use(COMPOSER_SAVE_ROUTE, (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        void (async () => {
          let result: ComposerSaveResult
          let status: number
          try {
            if (!sameOrigin(request)) throw new Error('composer: cross-origin save refused')
            const body = await readBody(request)
            result = save(root, JSON.parse(body) as Submitted, await load())
            status = 200
          } catch (error) {
            result = { ok: false, error: error instanceof Error ? error.message : String(error) }
            // The status code says whose fault it is, so a client need not parse the message: 413
            // for a body over the limit, 500 for a server-side condition, 400 for a document the
            // page could send differently.
            status = error instanceof TooLarge ? 413 : error instanceof ServerFault ? 500 : 400
          }

          response.statusCode = status
          response.setHeader('content-type', 'application/json')
          // The refused upload is stopped rather than drained, and only after the reply is sent.
          // A request destroyed before its response flushes shows up as a connection error instead
          // of the message.
          response.end(JSON.stringify(result), () => {
            if (status === 413) request.destroy()
          })
        })()
      })
    },
  }
}
