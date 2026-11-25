/**
 * Keys an input method is handling.
 *
 * While an input method composes text (Japanese, Chinese or Korean, or an
 * accent typed in two strokes), the keys a person presses belong to it: Enter
 * confirms a candidate and Escape abandons the composition. A text field that
 * commits, submits, adds or clears on Enter, a comma or Escape must leave those
 * keys alone, or it acts on half-typed text.
 *
 * A browser marks such a key with `isComposing`. Safari sends the Enter that
 * confirms a composition after `compositionend`, with `isComposing` false, so
 * the key code a browser reports for a key an input method processed (229) is
 * read as well.
 */

/** The key code a browser reports for a key an input method processed. */
const PROCESSED = 229

/**
 * Whether a key belongs to an input method: marked as composing, or processed
 * by one. A React member passes the native event (`event.nativeEvent`).
 */
export function composingKey(event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return event.isComposing || event.keyCode === PROCESSED
}
