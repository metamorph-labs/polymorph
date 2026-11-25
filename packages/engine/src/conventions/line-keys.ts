/**
 * The arrow key that moves toward the start of a line in `element`'s writing
 * direction: ArrowLeft, or ArrowRight where the element's computed direction is
 * right to left. A row of chips before a text field reads in that direction, so
 * this key moves back through the chips and the other key forward. It reads a
 * computed style, so a key handler asks for it only once the key is an arrow.
 */
export function lineStartKey(element: Element): 'ArrowLeft' | 'ArrowRight' {
  const view = element.ownerDocument.defaultView
  return view?.getComputedStyle(element).direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
}
