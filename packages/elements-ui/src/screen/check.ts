import {
  checkScreen as checkWith,
  type ScreenCheck,
  type ScreenCheckOptions,
} from '@polymorph/screen/check'

/**
 * `checkScreen` for a screen the elements draw: the spec validator's faults
 * and the run-time's, with the elements' members. A module of its own, so a
 * page loads the validator only when it checks a document.
 */

/** What a host passes `checkScreen`: the members it allows, and another vocabulary in a test. */
export type CheckOptions = Omit<ScreenCheckOptions, 'framework'>

export type { ScreenCheck }

/** The faults a host's `<poly-screen>` or drawing would report for `document`, and the validator's. */
export function checkScreen(document: unknown, options: CheckOptions = {}): ScreenCheck {
  return checkWith(document, { ...options, framework: 'elements' })
}
