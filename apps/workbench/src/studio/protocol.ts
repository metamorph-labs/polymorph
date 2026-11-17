import type { Palette, System } from '@polymorph/engine'

/**
 * The studio's only server request, defined in one place.
 *
 * Both sides import this file: the Vite middleware that handles the route and the page that calls
 * it. It has no node imports and no engine imports, so the middleware can load it from a bundled
 * config and the browser can load it from application code.
 */
export const STUDIO_SAVE_ROUTE = '/__studio/save'

export interface SavePayload {
  system: System
  palette: Palette
  /** Required to amend a file that already exists. The UI confirms by name first. */
  overwrite?: boolean
}

export interface SaveResult {
  ok: boolean
  /** Repo-relative paths, in the order they were written. */
  written?: string[]
  /** Files that already exist and were not overwritten, so the UI can confirm by name. */
  existing?: string[]
  /** The parser's or the guard's message, passed through unchanged. */
  error?: string
}

/**
 * Asks the dev server to write the pair.
 *
 * A failure returns a `SaveResult` rather than throwing, because the designer needs to read every
 * failure reason: a Zod path, a name that would write outside `design/`, or a file that already
 * exists. A rejected promise would reduce all of those to a generic error.
 */
export async function requestSave(
  pair: { system: System; palette: Palette },
  overwrite: boolean,
): Promise<SaveResult> {
  try {
    const response = await fetch(STUDIO_SAVE_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...pair, overwrite } satisfies SavePayload),
    })
    return (await response.json()) as SaveResult
  } catch (error) {
    return {
      ok: false,
      error:
        `the dev server did not answer ${STUDIO_SAVE_ROUTE} — the studio saves through a Vite ` +
        `middleware, so this only works under \`pnpm dev\` (${
          error instanceof Error ? error.message : String(error)
        })`,
    }
  }
}
