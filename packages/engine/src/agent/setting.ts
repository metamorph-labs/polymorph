'use client'

/**
 * A page's agent setting: when the agent bridge loads, stated by the page
 * instead of written as a script. The elements' no-build files read it from
 * `<html data-agent>` as they load and hand it to `applyAgentSetting`, which
 * decides what it means.
 *
 * This module has no static import, and does as little as it can before it
 * imports the rest. The no-build script runs it on every page, and a module
 * it shared with the tools' code would be a chunk of its own that every page
 * fetched, so the check for the WebMCP API and the page-wide slot that holds
 * the tools' names are written here again, over the same slot as
 * `context.ts`.
 */

/** The attribute of the document element that holds a page's agent setting. */
export const AGENT_ATTRIBUTE = 'data-agent'

/** The values the setting takes. Without one, a page registers nothing. */
export type AgentSetting = 'on-call' | 'eager'

/** `AGENT_TOOLS_HOLDER` in `context.ts`. */
const HOLDER = Symbol.for('polymorph.agentTools')

const page = globalThis as { [HOLDER]?: { readonly by: string } }

/** Whether the page has a WebMCP API, as `modelContext()` in `context.ts` finds one. */
const hasWebMCP = (): boolean =>
  [globalThis.document, globalThis.navigator].some(
    (holder) =>
      typeof (holder as { modelContext?: { registerTool?: unknown } } | undefined)?.modelContext
        ?.registerTool === 'function',
  )

/**
 * Registers the bridge's tools with the browser's WebMCP API as a page's
 * agent setting says:
 *
 * - `null` or `undefined` (no setting): nothing registers and nothing loads.
 * - `'on-call'`: the three tools register as soon as their definitions load,
 *   and the bridge loads on the first call, as with `registerWebMCPOnCall`.
 * - `'eager'`: the tools register as soon as their definitions load, and the
 *   bridge loads then, before any call.
 *
 * Any other value warns and registers nothing. Where the browser has no
 * WebMCP API the setting does nothing and loads nothing, because no one could
 * call the tools; a page's own agent loads the bridge itself. The bridge it
 * creates has no `confirm`, so a step that needs a person answers
 * `needs-confirmation`.
 *
 * The setting takes the tools' names as it is read, so a `registerWebMCP` the
 * page's own script makes afterwards registers nothing, and warns. Returns
 * the function that unregisters the tools, once they are registered.
 */
export function applyAgentSetting(setting: string | null | undefined): () => void {
  if (setting === null || setting === undefined) return () => {}
  if (setting !== 'on-call' && setting !== 'eager') {
    console.warn(
      `polymorph: ${AGENT_ATTRIBUTE}="${setting}" is neither on-call nor eager, so no agent tools are registered`,
    )
    return () => {}
  }
  if (!hasWebMCP()) return () => {}
  const claim = { by: `${AGENT_ATTRIBUTE}="${setting}"` }
  // A registration that already holds the names keeps them, and the registration below warns.
  page[HOLDER] ??= claim
  const registering = import('./on-call').then(
    ({ registerForSetting }) => registerForSetting(claim, setting === 'eager'),
    (error: unknown) => {
      if (page[HOLDER] === claim) delete page[HOLDER]
      console.warn('polymorph: the agent tools did not load', error)
      return () => {}
    },
  )
  return () => {
    void registering.then((unregister) => unregister())
  }
}
