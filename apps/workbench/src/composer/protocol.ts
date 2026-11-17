/**
 * The composer's save request, mirroring `studio/protocol.ts`: one route, the payload and result
 * shapes, and no node imports, so the page can import this without bundling the endpoint.
 */

export const COMPOSER_SAVE_ROUTE = '/__composer/save'

/**
 * The gallery slug of the emitted component's name, which is also the file name.
 *
 * It is defined here rather than in the endpoint because both sides use it. The endpoint writes
 * `design/screens/<slug>.json`, and the page uses the same name in the copied emit command and the
 * downloaded file. Two separate functions could disagree at an acronym boundary: `APIScreen` could
 * become `apiscreen` in the copied command and `api-screen.json` on disk, so the pasted command
 * would name a file that was never written. One shared function keeps them identical.
 */
export function slugOf(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export interface ComposerSavePayload {
  /** A `polymorph-screen/1` document. The endpoint validates it, and this type assumes nothing. */
  screen: unknown
  /** Required to amend a file that already exists. The UI confirms by name first. */
  overwrite?: boolean
}

export interface ComposerSaveResult {
  ok: boolean
  written?: string[]
  existing?: string[]
  error?: string
}

export async function requestScreenSave(
  screen: unknown,
  overwrite: boolean,
): Promise<ComposerSaveResult> {
  try {
    const response = await fetch(COMPOSER_SAVE_ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ screen, overwrite }),
    })
    return (await response.json()) as ComposerSaveResult
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
