import { afterNextRender, DestroyRef, inject, untracked } from '@angular/core'

/** How many frames a fixture that types waits for its field before it gives up. */
const FRAMES = 60

/**
 * Types text into a field once it is in the document, through the field's
 * `input` event, as a reader types it: a states fixture entry whose state no
 * prop sets (Command's query). The field is searched in the document, because
 * an overlay renders at the end of the body. Call it in an injection context.
 */
export function typeInto(spec: () => { into: string; text: string } | undefined): void {
  let frame = 0
  let frames = 0
  inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame))
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
  inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame))
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
