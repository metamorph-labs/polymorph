import type { ToolsClaim } from './context'
import { registerOnCall } from './webmcp'

/**
 * What a page's agent setting registers, in a module that nothing else
 * imports. A dynamic import of a module that shares its chunk with others
 * needs the bundler's helper that builds a module namespace, and the
 * elements' no-build build moves that helper into a chunk of its own, which
 * every page then fetches. A module only the setting imports has a chunk
 * whose exports are its own, so the setting's import needs no helper.
 */

/**
 * Registers the tools for `claim`, which the setting took as it was read,
 * and loads the bridge on the first call, or at once with `eager`. The bridge
 * has no options, so no one confirms.
 */
export function registerForSetting(claim: ToolsClaim, eager: boolean): () => void {
  return registerOnCall({ load: () => import('./index'), options: {} }, claim, eager)
}
