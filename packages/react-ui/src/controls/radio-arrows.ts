'use client'

import { useRef, type FocusEvent, type KeyboardEvent } from 'react'

/** The keys Radix's roving focus responds to, copied from its own list. */
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** The three handlers a `RadioGroupPrimitive.Item` needs for selection to follow arrow focus. */
export interface ArrowSelectionHandlers {
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onPointerDown: () => void
  onFocus: (event: FocusEvent<HTMLButtonElement>) => void
}

/**
 * Makes selection follow the focus an arrow key moves, however briefly the key was
 * pressed. Every member built on Radix's radio group uses it (RadioGroup, ChoiceCard's
 * single mode, SegmentedControl).
 *
 * Radix moves focus in a task after the keydown, and selects the focused item only
 * while its own arrow flag is set. A document keyup clears that flag. If a quick tap's
 * keyup is handled before that task runs, focus moves but selection does not. The
 * segmented control's tests hit this under CI load, and any busy main thread can cause
 * it, because input events run before timers. This hook's flag is set by the arrow key
 * and cleared by the focus it causes, so the key's hold time does not matter. A pointer
 * press clears it, because a press focuses before it clicks, and the click does the
 * selecting. An arrow with a modifier key never sets it, because Radix moves no focus
 * then, and an unused flag would select on the next unrelated focus.
 *
 * The selection is made with a click, not a value change, so Radix fires its change
 * event as it would for a pointer, the same way Radix itself handles
 * selection-follows-focus.
 */
export function useArrowSelection(): ArrowSelectionHandlers {
  const arrowing = useRef(false)
  return {
    onKeyDown(event) {
      if (!ARROWS.has(event.key)) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      arrowing.current = true
    },
    onPointerDown() {
      arrowing.current = false
    },
    onFocus(event) {
      if (!arrowing.current) return
      arrowing.current = false
      if (event.currentTarget.dataset['state'] === 'unchecked') event.currentTarget.click()
    },
  }
}
