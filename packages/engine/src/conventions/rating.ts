import { readDirection, type ReadingDirection } from './direction'

/**
 * Rating's model (`design/components/rating.md`): what each mark draws, what it
 * is named, what a press and a key leave the rating holding. Every
 * framework's Rating renders it, so each one rounds, fills, names and steps
 * the same way.
 *
 * A rating that is set holds a whole number from 1 to its most, or nothing. A
 * rating that is shown holds any value from 0 to its most, drawn and spoken to
 * one decimal place, because an average such as 4.3 is what a shown rating
 * usually holds.
 */

/** The most marks a rating has when it is not told. */
export const RATING_DEFAULT_MAX = 5

/** The fewest marks: one mark is a toggle, which is a pressed Button. */
const FEWEST = 2

/** The most marks: past ten, a reader counts marks instead of reading them, and a Slider fits. */
const MOST = 10

/** How much of a mark is drawn filled. */
export type RatingFill = 'full' | 'part' | 'none'

/** One mark, as a renderer draws it. */
export interface RatingMark {
  /** The value choosing the mark sets: 1 for the first. */
  value: number
  fill: RatingFill
  /** The filled share of a part-filled mark, as a length a style takes (`"30%"`), and nothing otherwise. */
  share: string | undefined
  /** The mark's accessible name, which a control's radio carries. */
  name: string
}

/** Rating's words. The member's `messages` prop has this shape. */
export interface RatingWords {
  mark: (value: number, numeral: string) => string
  shown: (label: string, value: string, max: string) => string
}

const WORDS: RatingWords = {
  mark: (value, numeral) => `${numeral} ${value === 1 ? 'star' : 'stars'}`,
  shown: (label, value, max) => `${label}: ${value} out of ${max}`,
}

export interface RatingOptions {
  /** What the rating holds. A control rounds it to a whole mark; nothing, 0 and less hold nothing. */
  value: number | null | undefined
  /** The rating's name: the group's in a control, the start of the image's sentence when shown. */
  label: string
  max?: number | undefined
  readOnly?: boolean | undefined
  locale?: string | undefined
  messages?: RatingWords | undefined
}

export interface RatingModel {
  /** The number of marks: a whole number from 2 to 10. */
  max: number
  /** What the rating holds after rounding: whole in a control, to one decimal place when shown. */
  value: number | null
  marks: RatingMark[]
  /** The shown rating's accessible name, one sentence. */
  sentence: string
}

/** The number of marks for a given `max`: whole, from 2 to 10, and 5 when it is not a number. */
export function ratingMax(max: number | undefined): number {
  if (max === undefined || !Number.isFinite(max)) return RATING_DEFAULT_MAX
  return Math.min(MOST, Math.max(FEWEST, Math.round(max)))
}

/** What a rating holds, rounded as its form needs. */
function held(value: number | null | undefined, max: number, readOnly: boolean): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  if (readOnly) return Math.min(max, Math.max(0, Math.round(value * 10) / 10))
  const whole = Math.min(max, Math.round(value))
  return whole < 1 ? null : whole
}

export function ratingModel(options: RatingOptions): RatingModel {
  const max = ratingMax(options.max)
  const readOnly = options.readOnly === true
  const value = held(options.value, max, readOnly)
  const words = options.messages ?? WORDS
  const whole = new Intl.NumberFormat(options.locale)
  const tenths = new Intl.NumberFormat(options.locale, { maximumFractionDigits: 1 })

  const marks = Array.from({ length: max }, (_, at): RatingMark => {
    const mark = at + 1
    // The share of this mark the value covers: 1 for a mark at or under it, 0 past it.
    const covered = Math.min(1, Math.max(0, (value ?? 0) - at))
    const fill: RatingFill = covered >= 1 ? 'full' : covered <= 0 ? 'none' : 'part'
    return {
      value: mark,
      fill,
      share: fill === 'part' ? `${Math.round(covered * 100)}%` : undefined,
      name: words.mark(mark, whole.format(mark)),
    }
  })

  return {
    max,
    value,
    marks,
    sentence: words.shown(options.label, tenths.format(value ?? 0), whole.format(max)),
  }
}

/**
 * What a press on a mark leaves the rating holding: that mark, or nothing
 * when it held that mark already. A required rating keeps the mark, because a
 * press that emptied it would leave the form unanswered.
 */
export function ratingPress(
  mark: number,
  holding: number | null,
  required: boolean,
): number | null {
  if (mark !== holding) return mark
  return required ? mark : null
}

/**
 * The mark a key moves to from the mark that has focus, or `undefined` for a
 * key the rating does not take. The arrows that point along the row follow
 * the reading direction: in a right-to-left document the row starts at the
 * right, so the arrow that points left moves to the next mark. Down is the
 * next mark and Up the previous one, as in a radio group. Home and End move to
 * the first and the last mark. A move stops at either end and does not wrap,
 * because one press past the top would set the lowest score.
 */
export function ratingStep(
  key: string,
  from: number,
  max: number,
  direction: ReadingDirection,
): number | undefined {
  const forward = direction === 'rtl' ? -1 : 1
  const step: Readonly<Record<string, number>> = {
    ArrowRight: forward,
    ArrowLeft: -forward,
    ArrowDown: 1,
    ArrowUp: -1,
  }
  if (key === 'Home') return 1
  if (key === 'End') return max
  const by = step[key]
  if (by === undefined) return undefined
  return Math.min(max, Math.max(1, from + by))
}

/** The parts of a keyboard event `roveRating` reads, which a DOM event and React's both have. */
export interface RatingKeyEvent {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly currentTarget: EventTarget | null
  preventDefault(): void
}

/**
 * A key on a mark of a rating control: focus moves to the mark `ratingStep`
 * names and `choose` is called with its value, so the choice follows focus as
 * it does in a radio group. Enter does nothing, as WAI-ARIA's radio group
 * pattern has it: on a `<button>` the browser would make it a press. A key
 * with a modifier is left to the browser. The marks are the `role="radio"`
 * elements of the mark's nearest `role="radiogroup"`, in document order.
 */
export function roveRating(event: RatingKeyEvent, choose: (value: number) => void): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
  const mark = event.currentTarget
  if (!(mark instanceof HTMLElement)) return
  const group = mark.closest('[role="radiogroup"]')
  if (group === null) return
  const marks = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
  const at = marks.indexOf(mark)
  if (at === -1) return
  const target = ratingStep(event.key, at + 1, marks.length, readDirection())
  if (target === undefined) return
  event.preventDefault()
  marks[target - 1]?.focus()
  choose(target)
}
