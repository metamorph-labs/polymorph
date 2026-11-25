'use client'

import { TOOLTIP_DELAY_MS, TOOLTIP_SKIP_DELAY_MS } from './tooltip'

/**
 * The name tip: an icon-only Button's label, shown in a bubble while the
 * pointer rests on the button or keyboard focus is on it
 * (`design/components/button.md`). A Button with a visible label needs none,
 * and every icon-only Button gets one without a `<Tooltip>` around it.
 *
 * It is not the Tooltip member. A Tooltip's machinery (Radix's positioner in
 * React, Zag's machine and popper elsewhere) would reach every bundle that
 * draws a Button, so the tip is this one small behaviour, which every web
 * renderer's Button calls on its `<button>`, as do the members that draw
 * Button's icon-only box without the Button member (SplitButton's chevron,
 * CopyButton, AvatarButton and Pagination's arrows drawn as links).
 *
 * - **What it shows.** The `label` the Button would have drawn, in the class
 *   the Button's recipe gives it, which composes the Tooltip's bubble. The
 *   bubble is for the eye: it is `aria-hidden`, so the button's name stays its
 *   `aria-label` and nothing is announced twice.
 * - **When.** Hover by a mouse opens it after `TOOLTIP_DELAY_MS`, at once
 *   while another tip shows or within `TOOLTIP_SKIP_DELAY_MS` of one closing.
 *   Touch and pen contact do not open it. Focus opens it when the person
 *   moved focus to the button with the keyboard: the last key pressed was
 *   Tab, an arrow key, Home or End, and the button matches `:focus-visible`.
 *   So roving focus a member gives on an arrow key opens it, and focus a
 *   script gives after Enter, Space or a press does not: a Dialog that puts
 *   focus on its icon-only close button opens no tip, and the first Escape
 *   closes the Dialog.
 * - **Closing.** The pointer leaving the button, the bubble and the gap
 *   between them; blur; Escape; a press anywhere; a scroll of anything that
 *   holds the button; and the function this returns, which the Button calls
 *   when it unmounts, is disabled or loses `iconOnly`. Escape on an open tip
 *   closes the tip and nothing else, however it opened: the key does not reach
 *   the page, so a Dialog or Menu around the button stays open and focus stays
 *   where it is (WCAG 1.4.13).
 * - **Never twice.** A button inside a Tooltip's trigger (`data-tooltip-part`)
 *   shows the app's Tooltip instead, decided when a tip would open.
 * - **Never in the way.** The bubble takes no pointer events. Whether the
 *   pointer rests on it is read from where the pointer is, so the pointer may
 *   move onto it (WCAG 1.4.13) while every click goes to what is under it.
 *   Nothing is added inside or around the button.
 * - **Above everything.** The bubble is a manual popover, so it is drawn in
 *   the top layer, over a Dialog, Drawer, Popover or Menu the button sits in.
 *   It is a child of the document's body, where every renderer mounts its
 *   portals, so it wears the page's pairing, mode and density, as a Tooltip's
 *   bubble does.
 *
 * Nothing runs on a server, and no element exists until a tip first opens.
 * The page shares one bubble, which leaves the document when its tip closes,
 * and one set of listeners on the window, added when the first button takes a
 * tip.
 */

/** The page's one bubble, made when a tip first opens. */
let bubble: HTMLElement | undefined
/** The button whose tip shows. */
let owner: Element | undefined
/** True when the pointer opened the tip, so the pointer's place decides when it closes. */
let held = false
/** When the last tip closed, for the skip delay: never, at first. */
let closedAt = 0
/** True while the last key pressed moves focus (Tab, an arrow key, Home, End), and no press came since. */
let moving = false
/** True once the window's listeners are added, with the first tip. */
let listening = false

/**
 * Adds each of `handlers` to `target`, captured, until `signal` aborts. On the
 * window, capturing reads Escape before any listener of the page's; on the
 * control, every event the tip follows targets the control or its glyph, so
 * capturing it there changes nothing.
 */
function listen(
  target: EventTarget,
  handlers: Record<string, (event: Event) => void>,
  signal?: AbortSignal,
): void {
  for (const type in handlers) {
    target.addEventListener(type, handlers[type] as EventListener, { capture: true, signal })
  }
}

/**
 * Whether the pointer is on the bubble, or in the column the button's width
 * makes from the bubble's far edge to the button's: the button and the gap.
 */
function over({ clientX: x, clientY: y }: PointerEvent): boolean {
  const button = (owner as Element).getBoundingClientRect()
  const tip = (bubble as HTMLElement).getBoundingClientRect()
  return (
    (x >= tip.left && x <= tip.right && y >= tip.top && y <= tip.bottom) ||
    (x >= button.left &&
      x <= button.right &&
      y >= Math.min(tip.top, button.top) &&
      y <= Math.max(tip.bottom, button.bottom))
  )
}

function close(): void {
  if (!owner) return
  owner = undefined
  closedAt = Date.now()
  ;(bubble as HTMLElement).remove()
}

/**
 * Places the bubble centred over the button, the Tooltip's default side, or
 * under it when it would cross the window's top edge and the window has more
 * room below. The bubble's far edge is placed, and the margin the Tooltip's
 * recipe gives its edge that faces the button is the gap. It stays inside the
 * window's width.
 */
function place(button: Element, tip: HTMLElement): void {
  const { clientWidth, clientHeight } = document.documentElement
  const edges = button.getBoundingClientRect()
  const { style, dataset } = tip
  dataset.side = 'top'
  style.top = ''
  style.bottom = `${clientHeight - edges.top}px`
  // Measured from the window's start edge, where nothing narrows the bubble.
  style.left = '0'
  const width = tip.offsetWidth
  if (tip.getBoundingClientRect().top < 0 && clientHeight - edges.bottom > edges.top) {
    dataset.side = 'bottom'
    style.top = `${edges.bottom}px`
    style.bottom = ''
  }
  style.left = `${Math.max(0, Math.min(clientWidth - width, edges.left + (edges.width - width) / 2))}px`
}

function open(
  button: Element,
  label: string,
  className: string | undefined,
  pointer: boolean,
): void {
  // The app's Tooltip around the button shows its own bubble.
  if (button.closest('[data-tooltip-part]')) return
  if (!bubble) {
    bubble = document.createElement('div')
    bubble.popover = 'manual'
    bubble.ariaHidden = 'true'
  }
  bubble.className = className ?? ''
  bubble.textContent = label
  if (!owner) {
    document.body.append(bubble)
    bubble.showPopover?.()
  }
  owner = button
  held = pointer
  place(button, bubble)
}

/**
 * Gives `control` a name tip showing `label`, drawn with `className`, and
 * returns the function that takes it away. With no control or no label it
 * gives nothing: a Button passes `label` only while it is icon-only and
 * enabled, and calls the returned function before it passes a new one.
 */
export function nameTip(
  control: Element | null | undefined,
  label: string | undefined,
  className: string | undefined,
): () => void {
  if (!control || !label) return () => {}
  if (!listening) {
    listening = true
    listen(window, {
      keydown(event) {
        const { key, isComposing } = event as KeyboardEvent
        moving = /^(Tab|Arrow|Home|End)/.test(key)
        if (!owner || key !== 'Escape' || isComposing) return
        event.preventDefault()
        event.stopPropagation()
        close()
      },
      pointerdown() {
        moving = false
        close()
      },
      pointermove(event) {
        if (owner && held && !over(event as PointerEvent)) close()
      },
      scroll(event) {
        // `contains` is false for no owner.
        if ((event.target as Node).contains(owner as Element)) close()
      },
    })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const own = new AbortController()
  const mine = () => owner === control
  const show = (pointer: boolean) => open(control, label, className, pointer)
  const wait = () => clearTimeout(timer)
  const dismiss = () => {
    wait()
    if (mine()) close()
  }
  listen(
    control,
    {
      pointerenter(event) {
        if ((event as PointerEvent).pointerType !== 'mouse' || mine()) return
        if (owner || Date.now() - closedAt < TOOLTIP_SKIP_DELAY_MS) show(true)
        else timer = setTimeout(show, TOOLTIP_DELAY_MS, true)
      },
      // A press closes any tip, through the window's listener, and ends the wait for this one.
      pointerleave: wait,
      pointerdown: wait,
      click: dismiss,
      blur: dismiss,
      focus() {
        // Read now: the key that moved focus here. The tip opens a frame later, once the browser
        // has scrolled the button into view, so it is placed where the button is and that scroll
        // does not close it.
        const keyed = moving
        requestAnimationFrame(() => {
          if (!keyed || own.signal.aborted || !control.matches(':focus-visible')) return
          if (mine()) held = false
          else show(false)
        })
      },
    },
    own.signal,
  )
  return () => {
    own.abort()
    dismiss()
  }
}
