import { afterNextRender, DestroyRef, inject, untracked } from '@angular/core'

/** How many frames a fixture that types waits for its field before it gives up. */
const FRAMES = 60

/**
 * Cancels a frame a fixture asked for. A server render asks for none, because
 * `afterNextRender` runs in a browser only, and a server has no
 * `cancelAnimationFrame` to call.
 */
function cancel(frame: number): void {
  if (frame !== 0) cancelAnimationFrame(frame)
}

/**
 * Types text into a field once it is in the document, through the field's
 * `input` event, as a reader types it: a states fixture entry whose state no
 * prop sets (Command's query). The field is searched in the document, because
 * an overlay renders at the end of the body. Call it in an injection context.
 */
export function typeInto(spec: () => { into: string; text: string } | undefined): void {
  let frame = 0
  let frames = 0
  inject(DestroyRef).onDestroy(() => cancel(frame))
  afterNextRender(() => {
    const wanted = untracked(spec)
    if (wanted === undefined) return
    const type = () => {
      const field = document.querySelector<HTMLInputElement>(wanted.into)
      if (field === null) {
        frames += 1
        if (frames < FRAMES) frame = requestAnimationFrame(type)
        return
      }
      field.value = wanted.text
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    frame = requestAnimationFrame(type)
  })
}

/**
 * Presses a control once it is in the document, as a reader presses it: a
 * states fixture entry whose state only a press reaches (CursorPagination's
 * append form says the list ran out once it has asked for a window). The
 * control is searched in the document, as `typeInto` searches. Call it in an
 * injection context.
 */
export function pressOnce(selector: () => string | undefined): void {
  let frame = 0
  let frames = 0
  inject(DestroyRef).onDestroy(() => cancel(frame))
  afterNextRender(() => {
    const wanted = untracked(selector)
    if (wanted === undefined) return
    const press = () => {
      const control = document.querySelector<HTMLElement>(wanted)
      // A control that is not drawn is one a reader cannot press.
      if (control === null || control.getClientRects().length === 0) {
        frames += 1
        if (frames < FRAMES) frame = requestAnimationFrame(press)
        return
      }
      control.click()
    }
    frame = requestAnimationFrame(press)
  })
}

/** How long after its element takes focus a fixture that selects selects the words. */
const SELECT_DELAY_MS = 60

/**
 * Selects words once their element is in the document and holds them, as a
 * reader selects them: a states fixture entry whose state only a selection
 * reaches (the words RichTextInput draws its selection bar at). The element
 * is searched in the document, as `typeInto` searches; it takes focus, and the
 * first run of the words in one of its text nodes is selected a moment later,
 * once an editor in it has written its own selection back. Call it in an
 * injection context.
 */
export function selectOnce(spec: () => { in: string; text: string } | undefined): void {
  let frame = 0
  let frames = 0
  let timer = 0
  inject(DestroyRef).onDestroy(() => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  })
  afterNextRender(() => {
    const wanted = untracked(spec)
    if (wanted === undefined) return
    const select = () => {
      const element = document.querySelector<HTMLElement>(wanted.in)
      if (
        element === null ||
        element.getClientRects().length === 0 ||
        !(element.textContent ?? '').includes(wanted.text)
      ) {
        frames += 1
        if (frames < FRAMES) frame = requestAnimationFrame(select)
        return
      }
      element.focus()
      timer = window.setTimeout(() => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          const at = node.textContent?.indexOf(wanted.text) ?? -1
          if (at === -1) continue
          document.getSelection()?.setBaseAndExtent(node, at, node, at + wanted.text.length)
          return
        }
      }, SELECT_DELAY_MS)
    }
    frame = requestAnimationFrame(select)
  })
}
