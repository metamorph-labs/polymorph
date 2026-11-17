'use client'

/**
 * Arrow keys in a radio group: focus moves to the next or previous enabled
 * radio, wrapping at the ends, and selection follows it, as WAI-ARIA's radio
 * group pattern and Radix's radio group do. The group is the radios' nearest
 * `role="radiogroup"`, and a radio's value is its `value` attribute.
 *
 * A machine whose radios are visually hidden native inputs gets this from the
 * browser. A member whose radio is the drawn control (its recipe rings the
 * circle) calls this from the circle's keydown.
 */
const STEPS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
}

export function roveRadio(event: KeyboardEvent, select: (value: string) => void): void {
  const step = STEPS[event.key]
  if (step === undefined || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
  const current = event.currentTarget
  if (!(current instanceof HTMLElement)) return
  const group = current.closest('[role="radiogroup"]')
  if (group === null) return
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
    (radio) => !radio.hasAttribute('disabled') && radio.getAttribute('aria-disabled') !== 'true',
  )
  const at = radios.indexOf(current)
  if (at === -1 || radios.length === 0) return
  const next = radios[(at + step + radios.length) % radios.length] as HTMLElement
  event.preventDefault()
  next.focus()
  select(next.getAttribute('value') ?? '')
}

/**
 * Moves focus to the item a machine highlights, so a list whose machine keeps
 * a virtual highlight (`aria-activedescendant`) also has real focus on that
 * item, as Radix's menus do. A pointer resting on a row, an arrow key and
 * typeahead all highlight a row, and focus follows. The item is found by the
 * `data-value` the machine writes on it. Focus moves only from inside the
 * list, so a list opened under the pointer does not take focus from the page.
 */
export function followHighlight(list: HTMLElement | null | undefined, value: string | null): void {
  if (!list || value === null) return
  const active = document.activeElement
  if (active !== null && active !== document.body && !list.contains(active)) return
  const item = Array.from(list.querySelectorAll<HTMLElement>('[data-value]')).find(
    (candidate) => candidate.getAttribute('data-value') === value,
  )
  if (item !== undefined && item !== active) item.focus()
}

/**
 * Returns focus to a control when the list it opened closes, as Radix does,
 * when focus is in the closing list or nowhere. A list that plays its exit
 * stays in the document a moment longer, and focus inside it would otherwise
 * fall to the page when it goes.
 */
export function returnFocus(
  control: HTMLElement | null | undefined,
  list: HTMLElement | null | undefined,
): void {
  if (!control) return
  const active = document.activeElement
  if (active === null || active === document.body || list?.contains(active) === true)
    control.focus()
}
