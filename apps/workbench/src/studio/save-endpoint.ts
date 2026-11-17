import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { relative, resolve, sep } from 'node:path'

import { createJiti } from 'jiti'
import type { Plugin } from 'vite'

import { STUDIO_SAVE_ROUTE, type SaveResult } from './protocol'

/**
 * `POST /__studio/save`, the studio's only write.
 *
 * This is a Vite **dev-server** middleware only. `configureServer` runs for `vite dev` only.
 * `vite build` and `vite preview` never run this plugin's hook, so the shipped site and the proof
 * harness's preview server have no such endpoint. It is same-origin because it is a route on the
 * dev server that served the page. It is also behind `apply: 'serve'`, so a write endpoint has two
 * guards rather than one.
 *
 * It does the minimum needed to save a decision. It validates the payload with the same
 * `parseSystem`/`parsePalette` the engine uses for shipped files, and it writes two JSON files. It
 * runs no git command, no build and no registry refresh. After the write, the repository's
 * existing tooling takes over (discovery, laws, churn, proof). That is why a system is only a
 * file.
 *
 * The schemas are loaded through `jiti` rather than imported. `@polymorph/theme` is not a
 * dependency of this app. The browser build reaches it through a Vite alias. A Vite config is
 * bundled by esbuild and run by Node, where that alias does not exist and `zod` (the theme
 * engine's dependency) cannot be resolved from `apps/workbench`. `jiti` resolves both from the
 * theme engine's own directory, `packages/theme`. The repository already uses `jiti` to load
 * TypeScript from plain entry points (`stylelint.config.js`, `packages/cli/bin`,
 * `packages/mcp/bin`).
 */

/** The only two directories this endpoint may write into. */
const SYSTEM_DIR = 'design/systems'
const PALETTE_DIR = 'design/palettes'

/** A request body larger than this is not a pair of theme files. */
const MAX_BODY_BYTES = 64 * 1024

/** The raw request body. The schemas validate it, and this type assumes nothing. */
interface Submitted {
  system?: unknown
  palette?: unknown
  overwrite?: boolean
}

type Parse = (input: unknown) => { name: string }

type ExceptionsAudit = (
  members: { name: string; tokens: string[] }[],
  exceptions: unknown[],
) => string[]

export interface StudioSaveOptions {
  /** The repository root. It is passed in rather than derived because this module is inlined
   *  into the bundled config, where `import.meta.url` points at the bundle, not this file. */
  root: string
}

/**
 * Returns the path for a named file, and refuses any name that would write outside `dir`.
 *
 * The name has already passed the schema's kebab-case rule, which makes path traversal
 * impossible. The resolved path is still checked, as the installer checks its own writes, so this
 * guard does not depend on a rule defined elsewhere that could change.
 */
function contain(root: string, dir: string, name: string): string {
  const base = resolve(root, dir)
  const file = resolve(base, `${name}.json`)
  const inside = relative(base, file)

  if (inside !== `${name}.json` || inside.startsWith('..') || inside.includes(sep)) {
    throw new Error(`studio: "${name}" would write outside ${dir}`)
  }
  return file
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise<string>((settle, fail) => {
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        fail(new Error('studio: payload too large to be a system and a palette'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => settle(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => fail(new Error('studio: the request ended early')))
  })
}

/**
 * Checks that the request is same-origin.
 *
 * The endpoint is a route on the dev server that served the page. A cross-site `fetch` with
 * `content-type: application/json` is preflighted and refused before it arrives, so this is the
 * second guard, not the first. It reads two headers that the browser sets and page code cannot
 * override. A request that sends an origin must send this server's origin.
 */
function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (origin === undefined) return true
  const host = request.headers.host
  return host !== undefined && (origin === `http://${host}` || origin === `https://${host}`)
}

/**
 * The write, in one function, so the middleware below only handles the request.
 *
 * Order matters in one place: **both files are validated before either is written**. If the
 * palette is malformed, no new system file may be left on disk pointing at a palette that was not
 * written. Discovery would find it on the next reload and the app would fail to boot.
 */
/**
 * The exceptions check at save time. The schema has validated the shape, but it cannot know
 * whether `component` names a member that reads the class token. The registry's audit checks
 * that, and the endpoint repeats it here so a pasted draft cannot save CSS that has no effect.
 * This is best-effort. The registry JSON is generated (predev/prebuild) and gitignored, so when it
 * is missing the endpoint accepts shape-valid exceptions rather than refusing every save on a
 * fresh clone. The registry test suite still checks every shipped file against the full law.
 */
function auditExceptionsAtDoor(
  root: string,
  system: { overrides?: { exceptions?: unknown[] } },
  audit: ExceptionsAudit | null,
): void {
  const exceptions = system.overrides?.exceptions ?? []
  if (exceptions.length === 0 || audit === null) return

  const registryPath = resolve(root, 'registry/registry.json')
  if (!existsSync(registryPath)) return

  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
    components: { name: string; tokens: string[] }[]
  }
  const faults = audit(registry.components, exceptions)
  if (faults.length > 0) throw new Error(faults.join(' '))
}

function save(
  root: string,
  payload: Submitted,
  parse: { system: Parse; palette: Parse },
  audit: ExceptionsAudit | null,
) {
  const system = parse.system(payload.system)
  const palette = parse.palette(payload.palette)
  auditExceptionsAtDoor(root, system as { overrides?: { exceptions?: unknown[] } }, audit)

  const files = [
    {
      path: contain(root, SYSTEM_DIR, system.name),
      rel: `${SYSTEM_DIR}/${system.name}.json`,
      data: system,
    },
    {
      path: contain(root, PALETTE_DIR, palette.name),
      rel: `${PALETTE_DIR}/${palette.name}.json`,
      data: palette,
    },
  ]

  const existing = files.filter((file) => existsSync(file.path)).map((file) => file.rel)
  if (existing.length > 0 && payload.overwrite !== true) {
    return { ok: false, existing } satisfies SaveResult
  }

  // 2-space JSON with a trailing newline, the format of every file in `design/`, so a saved file
  // matches its neighbours and Prettier leaves it unchanged.
  for (const file of files) {
    mkdirSync(resolve(file.path, '..'), { recursive: true })
    writeFileSync(file.path, `${JSON.stringify(file.data, null, 2)}\n`, 'utf8')
  }

  return { ok: true, written: files.map((file) => file.rel) } satisfies SaveResult
}

export function studioSave({ root }: StudioSaveOptions): Plugin {
  // Loaded once, lazily, so a `vite build` that never calls this does not transpile the engine.
  let schemas: Promise<{ system: Parse; palette: Parse }> | undefined
  let audit: Promise<ExceptionsAudit | null> | undefined

  const load = () => {
    schemas ??= createJiti(import.meta.url)
      .import<{ parseSystem: Parse; parsePalette: Parse }>(
        resolve(root, 'packages/theme/src/systems.ts'),
      )
      .then((module) => ({ system: module.parseSystem, palette: module.parsePalette }))
    return schemas
  }

  const loadAudit = () => {
    audit ??= createJiti(import.meta.url)
      .import<{ auditExceptions: ExceptionsAudit }>(
        resolve(root, 'packages/registry/src/exceptions.ts'),
      )
      .then(
        (module) => module.auditExceptions,
        // No registry package is available here. The schema's shape check still applies.
        () => null,
      )
    return audit
  }

  return {
    name: 'pm-studio-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(STUDIO_SAVE_ROUTE, (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

        void (async () => {
          let result: SaveResult
          try {
            if (!sameOrigin(request)) throw new Error('studio: cross-origin save refused')
            const body = await readBody(request)
            result = save(root, JSON.parse(body) as Submitted, await load(), await loadAudit())
          } catch (error) {
            result = { ok: false, error: error instanceof Error ? error.message : String(error) }
          }

          response.statusCode = result.ok || result.existing ? 200 : 400
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify(result))
        })()
      })
    },
  }
}
