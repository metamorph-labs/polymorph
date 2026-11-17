/**
 * `polymorph.js`, the elements for a page with no build (`dist/cdn/`).
 *
 * It defines every `poly-*` tag at once and loads each member's code, a chunk
 * of its own, the first time one of its elements renders, so a page loads the
 * members it uses. A page loads it as a module script, after it has linked
 * `polymorph.css` and a theme, and its own module script imports `restore`,
 * `toast` and `loadAgentBridge` from it.
 *
 * `loadAgentBridge` resolves to `@polymorph/engine/agent`, the agent bridge,
 * which is a chunk of its own, so a page that never calls it does not fetch
 * the bridge. The bridge reads the registry the members on this page write
 * to, because it is built with them: a copy a page loaded from anywhere else
 * would read a registry of its own, which holds nothing.
 *
 * A page states when the bridge loads with `<html data-agent>`, which this
 * script reads once, as it runs, and hands to the engine's
 * `applyAgentSetting`. Without it nothing more is fetched. With `on-call` the
 * registration and the tools' definitions are fetched then, two small chunks,
 * and the bridge's chunk on the first call; with `eager` all three at once.
 */
// First in `polymorph.css`: the base layer, the host rule and the rules for an element that has
// not rendered, before any member's recipe.
import '@polymorph/recipes/base.css'
import '@polymorph/elements/host.css'
import '@polymorph/elements/pending.css'

import { defineAll } from '@polymorph/elements/loader'
import { AGENT_ATTRIBUTE, applyAgentSetting } from '@polymorph/engine/webmcp'

import { DEFINITIONS } from '../definitions'
import { LOADERS } from '../loaders'

defineAll(DEFINITIONS, LOADERS)

export { restore, toast } from '@polymorph/elements/loader'

/** Loads the agent bridge: `createAgentBridge`, `agentTools` and `registerWebMCP`. */
export const loadAgentBridge = () => import('@polymorph/engine/agent')

applyAgentSetting(document.documentElement.getAttribute(AGENT_ATTRIBUTE))
