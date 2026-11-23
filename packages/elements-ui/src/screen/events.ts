/**
 * The events `<poly-screen>` dispatches on itself, by type. No member's
 * callback dispatches either: `screen.test.ts` reads every event a definition
 * names and holds that.
 */

/** A member called one of the screen's callback inputs: `detail` is `{ name, args, values, changed }`. */
export const ACTION_EVENT = 'poly-action'

/** Something in the document cannot be drawn: `detail` is `{ path, message, component? }`. */
export const FAULT_EVENT = 'poly-fault'
