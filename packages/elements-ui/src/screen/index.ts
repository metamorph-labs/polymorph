/**
 * `@polymorph/elements-ui/screen`: run-time screens drawn as `poly-*`
 * elements, for an app with a bundler.
 *
 * Importing it defines `<poly-screen>`, and every element the vocabulary
 * ships, each loading its member's code the first time one of its elements
 * renders (`defineAll`), so a screen draws whichever members the host allows
 * and the bundle splits each member's code into a chunk of its own. A tag the
 * app has already defined keeps its element.
 */
import '@polymorph/elements'
import { defineAll } from '@polymorph/elements/loader'

import { DEFINITIONS } from '../definitions'
import { LOADERS } from '../loaders'
import { definePolyScreen } from './element'

defineAll(DEFINITIONS, LOADERS)
definePolyScreen()

export * from './api'
export { definePolyScreen, PolyScreen, SCREEN_TAG } from './element'
export { ACTION_EVENT, FAULT_EVENT } from './events'
