import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { TOOLS_NAME, type InitPrograms } from '@polymorph/cli'
import type { BrowserSetup, ToolContext } from '@polymorph/mcp'
import type { Registry } from '@polymorph/registry'

/**
 * What the published tools ship, and where each entry point finds it.
 *
 * The package's `dist/` is a slice of the repository at the repository's own
 * paths: the modules the bins run, each built from its package's `src/`, and
 * the files an install copies, as they are. So `dist/` is the source root the CLI and the
 * server read, as a checkout is in a checkout, and a module that reads a file
 * beside it finds it where it does in a checkout. This module is
 * `dist/packages/tools/src/shipped.js`, three directories below that root.
 *
 * Beside the slice are the entry points (`polymorph.js`, `polymorph-mcp.js`,
 * `emit.js`) and the two things a checkout builds and the package ships
 * built: the registry (`registry/registry.json`, where `pnpm registry` writes
 * it) and the page `render_screen` draws in (`screen/`).
 */
export const SOURCE = resolve(import.meta.dirname, '../../..')

/** The registry of the release, written by the build from the tree it ran in. */
export function shippedRegistry(): Registry {
  return JSON.parse(readFileSync(resolve(SOURCE, 'registry/registry.json'), 'utf8')) as Registry
}

/** The page `render_screen` draws in, built by the workbench when the package was built. */
export const SCREEN_PAGE = resolve(SOURCE, 'screen')

/**
 * What `polymorph init` and `agents` wire a project to. The CLI and the MCP
 * server are this release run with `npx`, a command any machine runs, so the
 * agent files name no path. An app `init` writes lists the release as a dev
 * dependency, so `npx` runs that copy. The screen emitter runs once, while
 * `init` runs, so it is this copy's, by its path.
 */
export function shippedPrograms(registry: Registry): InitPrograms {
  const polymorph = { command: 'npx', args: ['-y', `${TOOLS_NAME}@^${registry.version}`] }
  return {
    mcp: { command: polymorph.command, args: [...polymorph.args, 'mcp'] },
    emit: { command: process.execPath, args: [resolve(SOURCE, 'emit.js')] },
    polymorph,
  }
}

/**
 * What `render_screen` tells a person to run when its browser is missing.
 * Playwright is an optional dependency of this package, and its browsers live
 * in a cache every copy of one Playwright version shares, so the command names
 * the version this package loads. Without Playwright it names the range the
 * package asks for.
 */
export function shippedBrowserSetup(): BrowserSetup {
  const require = createRequire(import.meta.url)
  let version: string
  try {
    const manifest = require.resolve('playwright/package.json')
    version = (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version
  } catch {
    const own = JSON.parse(readFileSync(resolve(SOURCE, '../package.json'), 'utf8')) as {
      optionalDependencies?: Record<string, string>
    }
    version = own.optionalDependencies?.['playwright'] ?? 'latest'
  }
  const download = `npx -y playwright@${version} install chromium`
  return {
    playwright:
      `Install ${TOOLS_NAME} again without leaving out its optional dependencies ` +
      `(no \`--omit=optional\`), then run \`${download}\`.`,
    chromium: `Run \`${download}\`.`,
  }
}

/**
 * The tools' context: the shipped registry and source, the shipped screen page,
 * and the project the write tools write in, or none for a server with no write
 * tool. The CLI's verbs and the server are built from it.
 */
export function shippedContext(
  project: string | undefined,
  registry: Registry = shippedRegistry(),
): ToolContext {
  return {
    registry,
    root: SOURCE,
    ...(project === undefined ? {} : { project }),
    screenPage: SCREEN_PAGE,
    browserSetup: shippedBrowserSetup(),
  }
}
