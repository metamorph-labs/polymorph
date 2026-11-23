import {
  outputContract as contractWith,
  runtimeCard as cardWith,
  type CardOptions,
} from '@polymorph/screen/card'

import { checkScreen, type CheckOptions, type ScreenCheck } from './check'
import { draw, type DrawOptions, type Drawing, type DrawUpdate, type FaultDisplay } from './draw'

/**
 * What a page's own script draws and checks a run-time screen with: the
 * module `@polymorph/elements-ui/screen` exports, and the one `loadScreen()`
 * resolves to on a page with no build. Every function is the elements':
 * `checkScreen`, `runtimeCard` and `outputContract` check against, and
 * describe, the members the elements draw.
 */

export { parsePartial, type PartialDocument } from '@polymorph/screen/partial'
export type { JsonValue, ScreenAction, ScreenFault } from '@polymorph/screen'
export { checkScreen }
export type { CheckOptions, DrawOptions, DrawUpdate, FaultDisplay, ScreenCheck }

/** A drawing, with what `checkScreen` says of the document it draws now. */
export interface ScreenDrawing extends Drawing {
  check(): ScreenCheck
}

/**
 * Draws a run-time screen into `container`, a plain element, as `poly-*`
 * elements: the drawing's root element is appended to it. `update` changes
 * the document, the data or whether more is to come, and redraws only what
 * changed; `values` is each named control's current value, and `changed` the
 * names of those the person changed; `check` checks the document it draws now;
 * `dispose` takes the drawing out.
 */
export function drawScreen(container: Element, options: DrawOptions = {}): ScreenDrawing {
  let document = options.document
  const members = options.members
  const drawing = draw(container, options)
  return {
    get values() {
      return drawing.values
    },
    get changed() {
      return drawing.changed
    },
    get faults() {
      return drawing.faults
    },
    update(change: DrawUpdate) {
      if ('document' in change) document = change.document
      drawing.update(change)
    },
    check() {
      return checkScreen(document, members === undefined ? {} : { members })
    },
    dispose() {
      drawing.dispose()
    },
  }
}

/** What a host passes the card: the members it allows. */
export type ScreenCardOptions = Omit<CardOptions, 'framework'>

/** The text a host puts in a model's system prompt so the model writes a screen the elements draw. */
export function runtimeCard(options: ScreenCardOptions = {}): string {
  return cardWith({ ...options, framework: 'elements' })
}

/** The card's last part alone: what the model's answer is, and what the host does with it. */
export function outputContract(options: ScreenCardOptions = {}): string {
  return contractWith({ ...options, framework: 'elements' })
}
