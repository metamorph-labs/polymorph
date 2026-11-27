/**
 * `polymorph-all.js`, every element in one file for a page with no build
 * (`dist/cdn/`): it defines every `poly-*` tag with its member's code, for a
 * page that prefers one request to loading each member when it is first used.
 * A page's own module script imports `restore`, `toast`, `loadAgentBridge`
 * and `loadScreen` from it. `loadAgentBridge` resolves to
 * `@polymorph/engine/agent`, the agent bridge, which this file holds with
 * everything else, so the bridge reads the registry the members on this page
 * write to. It defines `<poly-screen>` and holds its renderer, the vocabulary
 * table, the validator and the card, and `loadScreen` resolves to them.
 *
 * A page states when the bridge loads with `<html data-agent>`, which this
 * file reads once, as it runs, and hands to the engine's `applyAgentSetting`.
 * The bridge and the tools' definitions are in this file, so with `on-call`
 * and with `eager` alike the tools register at load and nothing is fetched
 * later.
 *
 * It hands the theme runtime the house systems' default modes as it runs
 * (`house-modes.ts`), as `polymorph.js` does. An element renders its member in
 * a microtask, so the runtime holds them before any member reads the mode.
 */
// First in `polymorph.css`: the base layer, the host rule and the rules for an element that has
// not rendered, before any member's recipe.
import '@polymorph/recipes/base.css'
import '@polymorph/elements/host.css'
import '@polymorph/elements/pending.css'
import '../index'

import { hydrateMode } from '@polymorph/engine/runtime'
import { AGENT_ATTRIBUTE, applyAgentSetting } from '@polymorph/engine/webmcp'

import { definePolyScreen } from '../screen/element'
import { HOUSE_MODES } from './house-modes'

hydrateMode(HOUSE_MODES)
definePolyScreen()

export { restore, toast } from '@polymorph/elements'

/** Loads the agent bridge: `createAgentBridge`, `agentTools` and `registerWebMCP`. */
export const loadAgentBridge = () => import('@polymorph/engine/agent')

/** Loads the run-time screens: `drawScreen`, `parsePartial`, `checkScreen`, `checkAnswer`, `runtimeCard` and `outputContract`. */
export const loadScreen = () => import('../screen/api')

applyAgentSetting(document.documentElement.getAttribute(AGENT_ATTRIBUTE))
