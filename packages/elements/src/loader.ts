/**
 * What a page with no build loads the elements through (`polymorph.js` in
 * `@polymorph/elements-ui/dist/cdn`): every tag defined at once, each member's
 * code loaded the first time one of its elements renders, and the functions
 * the page's own script calls. Importing it defines no element, so the
 * loader carries no member's code.
 */
import type { ElementDefinition } from './definition'
import { defineLazy } from './element'

export { restore } from './element'
export { toast } from '@polymorph/solid'

/**
 * Defines every tag in `definitions` at once, each loading its member's code
 * with the function `loaders` holds for it. A tag that is already defined
 * keeps its element.
 */
export function defineAll(
  definitions: Readonly<Record<string, ElementDefinition>>,
  loaders: Readonly<Record<string, () => Promise<unknown>>>,
): void {
  for (const [tag, definition] of Object.entries(definitions)) {
    const load = loaders[tag]
    if (load === undefined) throw new Error(`polymorph: no code is named for <${tag}>`)
    defineLazy(definition, load)
  }
}
