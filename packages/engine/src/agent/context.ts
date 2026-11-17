'use client'

/**
 * The browser's WebMCP API, and which registration of the bridge's tools
 * holds their names on the page.
 *
 * The names are held in a page-wide slot (`AGENT_TOOLS_HOLDER`), because the
 * browser's names are the page's: two copies of the engine on one page share
 * them. `setting.ts` reads the same slot with code of its own, so the script
 * that runs it at load imports nothing it would have to fetch.
 */

/** The part of WebMCP's `ModelContext` the bridge uses, in the current draft's shape and an earlier one's. */
export interface ModelContext {
  registerTool(tool: unknown, options?: { signal?: AbortSignal }): unknown
  unregisterTool?: (name: string) => unknown
}

/** `document.modelContext` (the current draft), else `navigator.modelContext` (earlier builds). */
export function modelContext(): ModelContext | undefined {
  const holders = [
    typeof document === 'undefined' ? undefined : document,
    typeof navigator === 'undefined' ? undefined : navigator,
  ]
  for (const holder of holders) {
    const context = (holder as { modelContext?: unknown } | undefined)?.modelContext
    if (
      typeof context === 'object' &&
      context !== null &&
      typeof (context as { registerTool?: unknown }).registerTool === 'function'
    ) {
      return context as ModelContext
    }
  }
  return undefined
}

/** One registration of the tools, named as a warning names it. */
export interface ToolsClaim {
  readonly by: string
}

/** The page-wide slot that holds the registration whose tools are registered now. */
export const AGENT_TOOLS_HOLDER = Symbol.for('polymorph.agentTools')

const page = globalThis as { [AGENT_TOOLS_HOLDER]?: ToolsClaim }

/**
 * Takes the tools' names for `claim`, and returns false with a warning while
 * another registration holds them. The browser refuses a name registered
 * twice, so a second registration would register nothing and leave every
 * call with the first one's bridge; it is refused here, where it can say so.
 */
export function holdToolNames(claim: ToolsClaim): boolean {
  const holder = page[AGENT_TOOLS_HOLDER]
  if (holder === undefined || holder === claim) {
    page[AGENT_TOOLS_HOLDER] = claim
    return true
  }
  console.warn(
    `polymorph: ${claim.by} registers nothing, because ${holder.by} already registered the agent tools on this page`,
  )
  return false
}

/** Gives the names back, when `claim` holds them. */
export function releaseToolNames(claim: ToolsClaim): void {
  if (page[AGENT_TOOLS_HOLDER] === claim) delete page[AGENT_TOOLS_HOLDER]
}
