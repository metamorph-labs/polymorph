import {
  checkAnswer as answerWith,
  checkScreen as checkWith,
  type AnswerCheck,
  type ScreenCheck,
  type ScreenCheckOptions,
} from '@polymorph/screen/check'

/**
 * `checkScreen` for a screen the elements draw: the spec validator's faults
 * and the run-time's, with the elements' members. A module of its own, so a
 * page loads the validator only when it checks a document.
 */

/**
 * What a host passes `checkScreen` and `checkAnswer`: the members it allows, whether it takes
 * addresses, and another vocabulary in a test.
 */
export type CheckOptions = Omit<ScreenCheckOptions, 'framework'>

export type { AnswerCheck, ScreenCheck }

/** The faults a host's `<poly-screen>` or drawing would report for `document`, and the validator's. */
export function checkScreen(document: unknown, options: CheckOptions = {}): ScreenCheck {
  return checkWith(document, { ...options, framework: 'elements' })
}

/**
 * What a model's whole answer, as text, holds for the elements: the document, whether it is
 * whole, the prose, and `checkScreen`'s faults, with an answer that ends before its document
 * does as a fault of its own.
 */
export function checkAnswer(text: string, options: CheckOptions = {}): AnswerCheck {
  return answerWith(text, { ...options, framework: 'elements' })
}
