/**
 * Fits a `<textarea>` to the height of its content, never below the height its
 * stylesheet gives it. Every framework's Textarea and PromptInput call it, so
 * the composer and the form field grow the same way for the same text.
 *
 * The height is reset to `auto` before `scrollHeight` is read, because
 * otherwise the box can only grow. The stylesheet's own height is read first
 * and kept as the floor, so `rows` and a control-height minimum still set the
 * height and autosize only adds to it. Under `box-sizing: border-box`,
 * `scrollHeight` is the padding box and `height` is the border box, so the two
 * borders are added back; without them the field ends a pixel short of its
 * content and scrolls.
 *
 * It reads the box's own geometry and writes a pixel height computed from it,
 * which is data and not a design value. It touches the document only when
 * called.
 */
export function fitTextarea(box: HTMLTextAreaElement): void {
  box.style.height = ''
  const floor = box.getBoundingClientRect().height
  box.style.height = 'auto'
  const content = box.scrollHeight + box.offsetHeight - box.clientHeight
  box.style.height = `${Math.max(content, floor)}px`
}
