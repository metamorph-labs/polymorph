/**
 * DurationInput's arithmetic (`design/components/duration-input.md`): which
 * segments a field shows, how a number of seconds is split across them and
 * summed back, how a value is held inside `min` and `max`, how the arrow keys
 * step a segment, how typed digits fill one, and what each key does. A
 * framework renders the segments as spinbuttons and routes their keys here, so
 * every framework's DurationInput splits, steps, carries and clamps the same way.
 *
 * The field is edited one segment at a time, so it holds a draft: a count per
 * unit it shows, any of which may be empty. An empty segment counts as zero,
 * and a draft whose every segment is empty is no value at all (`null`). Every
 * segment but the largest stays below the next larger unit it shows (minutes
 * stay under 60 while hours are shown), so a draft is always one way of writing
 * its seconds. The largest unit has no such ceiling: 36 hours is lawful when
 * hours are the largest unit shown.
 *
 * Only `Intl` is read: no DOM and no framework.
 */

import { unitWords, type TimeUnit } from './time-text'

/** A unit a field can show, from the largest to the smallest. */
export type DurationUnit = 'days' | 'hours' | 'minutes' | 'seconds'

/** The units a field shows when the caller names none: what the surveyed session and retention screens need. */
export const DURATION_DEFAULT_UNITS: readonly DurationUnit[] = ['days', 'hours', 'minutes']

/** Every unit, largest first, with the seconds in one. */
const SECONDS: Readonly<Record<DurationUnit, number>> = {
  days: 86_400,
  hours: 3_600,
  minutes: 60,
  seconds: 1,
}

const ORDER: readonly DurationUnit[] = ['days', 'hours', 'minutes', 'seconds']

/** Each unit's name in `Intl`: `Intl.NumberFormat`'s `unit` and `Intl.DisplayNames`' field. */
const INTL: Readonly<Record<DurationUnit, TimeUnit>> = {
  days: 'day',
  hours: 'hour',
  minutes: 'minute',
  seconds: 'second',
}

export interface DurationFieldOptions {
  /** The units the field shows, in any order; the field shows them largest first. */
  units?: readonly DurationUnit[] | undefined
  /** The fewest seconds the field holds; `0` when absent, because a duration is never negative. */
  min?: number | undefined
  /** The most seconds the field holds; none when absent. */
  max?: number | undefined
  /** The locale that writes the digits, the unit words and the segments' names. */
  locale: string
}

/** What the reader has entered, by unit. A missing unit shows its placeholder and counts as zero. */
export type DurationDraft = Readonly<Partial<Record<DurationUnit, number>>>

/** The words the field writes itself, which a locale replaces. */
export interface DurationMessages {
  /** What an empty segment says as its value to assistive software. */
  empty: string
}

/** The English words. */
export const DURATION_MESSAGES: DurationMessages = { empty: 'Empty' }

export interface DurationSegment {
  unit: DurationUnit
  /** The count as the locale writes its digits, or the placeholder while the segment is empty. */
  text: string
  /** The segment is empty and shows its placeholder. */
  placeholder: boolean
  /** The count; absent while the segment is empty. */
  value?: number
  /** The range typed digits stay inside. */
  min: number
  /** Absent for the largest unit of a field with no `max`. */
  max?: number
  /** The unit's short word, as the locale writes it beside the count ("min"). */
  word: string
  /** The locale writes the word before the count. */
  wordFirst: boolean
  /** The unit's name in the locale ("minute"), which names the segment. */
  name: string
  /** What the segment says as its value: the count and the unit's long word ("15 minutes"). */
  valueText: string
}

/** The placeholder an empty segment shows: dashes, as a time field's empty hour shows. */
const PLACEHOLDER = '––'

/** The units a field shows, largest first, each once; the default units when the list names none. */
export function durationUnits(units?: readonly DurationUnit[]): DurationUnit[] {
  const shown = ORDER.filter((unit) => units?.includes(unit) === true)
  return shown.length === 0 ? [...DURATION_DEFAULT_UNITS] : shown
}

/** The seconds in the smallest unit the field shows: the step every value the field draws is a multiple of. */
function grain(options: DurationFieldOptions): number {
  const units = durationUnits(options.units)
  return SECONDS[units[units.length - 1] as DurationUnit]
}

/**
 * The bounds a committed value is held inside: `min` and `max` moved inwards
 * to whole counts of the smallest unit shown, so the value the field reports is
 * one its segments draw. When no whole count lies between them, they are the
 * caller's own.
 */
export function durationBounds(options: DurationFieldOptions): { min: number; max: number } {
  const step = grain(options)
  const low = Math.max(0, options.min ?? 0)
  const high = Math.max(low, options.max ?? Number.MAX_SAFE_INTEGER)
  const min = Math.ceil(low / step) * step
  const max = Math.floor(high / step) * step
  return max < min ? { min: low, max: high } : { min, max }
}

/**
 * The seconds an agent sets on a duration field (`docs/agents.md`): a whole
 * count of the smallest unit the field shows, inside its bounds, because the
 * field draws only those and a person enters only those. It throws an `Error`
 * that says why on any other number, and the bridge reports the step as failed
 * with that message.
 */
export function agentDuration(seconds: number, options: DurationFieldOptions): number {
  const step = grain(options)
  if (!Number.isInteger(seconds) || seconds % step !== 0) {
    throw new Error(`${seconds} seconds is not a whole number of the field's ${step}-second unit.`)
  }
  const { min, max } = durationBounds(options)
  if (seconds < min || seconds > max) {
    throw new Error(`${seconds} seconds is outside the field's ${min} to ${max} seconds.`)
  }
  return seconds
}

/** Seconds held inside the field's bounds, in whole seconds. `null`, and a number that is not finite, are no value. */
export function clampDuration(
  seconds: number | null | undefined,
  options: DurationFieldOptions,
): number | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null
  const { min, max } = durationBounds(options)
  return Math.min(max, Math.max(min, Math.round(seconds)))
}

/**
 * Seconds as a draft: the count of each unit shown, the largest taking what
 * the smaller ones do not hold. A value the shown units cannot write exactly is
 * rounded to the nearest count of the smallest unit, half up: 90 seconds with
 * only minutes shown is drawn as 2 minutes.
 */
export function durationDraft(
  seconds: number | null | undefined,
  options: DurationFieldOptions,
): DurationDraft {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return {}
  const step = grain(options)
  let rest = Math.round(Math.max(0, seconds) / step) * step
  const draft: Partial<Record<DurationUnit, number>> = {}
  for (const unit of durationUnits(options.units)) {
    const count = Math.floor(rest / SECONDS[unit])
    draft[unit] = count
    rest -= count * SECONDS[unit]
  }
  return draft
}

/** The draft's seconds, an empty segment counting as zero; `null` while every segment is empty. Not clamped. */
export function durationOfDraft(
  draft: DurationDraft,
  options: DurationFieldOptions,
): number | null {
  const units = durationUnits(options.units)
  if (units.every((unit) => draft[unit] === undefined)) return null
  return units.reduce((total, unit) => total + (draft[unit] ?? 0) * SECONDS[unit], 0)
}

/**
 * The range a segment's count stays inside while it is typed: from zero to one
 * less than the next larger unit shown holds of it (59 minutes under hours,
 * 1439 under days with no hours), and for the largest unit, as many as the
 * field's `max` holds.
 */
export function durationSegmentRange(
  unit: DurationUnit,
  options: DurationFieldOptions,
): { min: number; max: number } {
  const units = durationUnits(options.units)
  const at = units.indexOf(unit)
  const larger = units[at - 1]
  if (at > 0 && larger !== undefined) return { min: 0, max: SECONDS[larger] / SECONDS[unit] - 1 }
  return { min: 0, max: Math.floor(durationBounds(options).max / SECONDS[unit]) }
}

/** The unit's name in the locale, from `Intl.DisplayNames`, or `Intl`'s own name where the engine has none. */
function unitName(unit: DurationUnit, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'dateTimeField' }).of(INTL[unit]) ?? INTL[unit]
  } catch {
    return INTL[unit]
  }
}

/**
 * The segments the field shows, largest first. Each carries its count in the
 * locale's digits, the unit's short word and which side of the count the
 * locale writes it on, the unit's name, and its value as words.
 */
export function durationSegments(
  draft: DurationDraft,
  options: DurationFieldOptions,
  messages: DurationMessages = DURATION_MESSAGES,
): DurationSegment[] {
  const units = durationUnits(options.units)
  return units.map((unit) => {
    const value = draft[unit]
    const empty = value === undefined
    const parts = new Intl.NumberFormat(options.locale, {
      style: 'unit',
      unit: INTL[unit],
      unitDisplay: 'short',
      useGrouping: false,
    }).formatToParts(value ?? 0)
    const word = parts
      .filter((part) => part.type === 'unit')
      .map((part) => part.value)
      .join(' ')
    const digits = parts
      .filter((part) => part.type === 'integer')
      .map((part) => part.value)
      .join('')
    const wordAt = parts.findIndex((part) => part.type === 'unit')
    const countAt = parts.findIndex((part) => part.type === 'integer')
    const range = durationSegmentRange(unit, options)
    const bounded = unit !== units[0] || options.max !== undefined
    return {
      unit,
      text: empty ? PLACEHOLDER : digits,
      placeholder: empty,
      ...(empty ? {} : { value }),
      min: range.min,
      ...(bounded ? { max: range.max } : {}),
      word,
      wordFirst: wordAt !== -1 && countAt !== -1 && wordAt < countAt,
      name: unitName(unit, options.locale),
      valueText: empty ? messages.empty : unitWords(value ?? 0, INTL[unit], options.locale),
    }
  })
}

/**
 * The arrow keys: the draft's seconds one of `unit` up (`1`) or down (`-1`),
 * held inside the field's bounds, and split across the segments again. A
 * segment carries into the next larger one: 59 minutes and one more is an hour.
 * An empty field counts as zero, so ArrowUp gives one unit and ArrowDown the
 * minimum.
 */
export function stepDuration(
  draft: DurationDraft,
  unit: DurationUnit,
  delta: 1 | -1,
  options: DurationFieldOptions,
): DurationDraft {
  const total = durationOfDraft(draft, options) ?? 0
  return durationDraft(clampDuration(total + delta * SECONDS[unit], options), options)
}

/**
 * A key typed into a segment. `typed` is what the reader has typed into it
 * since it took focus. A digit extends it while the count stays in the
 * segment's range, and starts it again when it would not, so 90 is never typed
 * into the minutes of a field that shows hours: the 9 fills the minutes and
 * focus moves on. A digit that fits in no count of the segment is refused.
 * Focus moves on once no further digit could fit. Any other key changes nothing.
 */
export function typeIntoDuration(
  draft: DurationDraft,
  unit: DurationUnit,
  typed: string,
  key: string,
  options: DurationFieldOptions,
): { draft: DurationDraft; typed: string; advance: boolean } {
  if (!/^\d$/.test(key)) return { draft, typed, advance: false }
  const { max } = durationSegmentRange(unit, options)
  let entered = `${typed}${key}`
  if (Number(entered) > max) entered = key
  if (Number(entered) > max) return { draft, typed: '', advance: false }
  const advance = Number(`${entered}0`) > max || entered.length >= String(max).length
  return {
    draft: { ...draft, [unit]: Number(entered) },
    typed: advance ? '' : entered,
    advance,
  }
}

/** Backspace: the segment loses its last digit, and is empty once none is left. */
export function eraseDuration(draft: DurationDraft, unit: DurationUnit): DurationDraft {
  const current = draft[unit]
  if (current === undefined) return draft
  const next: Partial<Record<DurationUnit, number>> = { ...draft }
  const rest = String(current).slice(0, -1)
  if (rest === '') delete next[unit]
  else next[unit] = Number(rest)
  return next
}

/**
 * What the field commits when focus leaves it or the reader presses Enter: the
 * draft's seconds, held inside the bounds, and the draft of that value. A
 * draft that holds the seconds `reported` is drawn with commits nothing, so a
 * value the shown units cannot write exactly is kept until the reader changes
 * what the segments show.
 */
export function commitDuration(
  draft: DurationDraft,
  reported: number | null,
  options: DurationFieldOptions,
): { draft: DurationDraft; value: number | null; changed: boolean } {
  const drawn = durationDraft(reported, options)
  if (durationOfDraft(draft, options) === durationOfDraft(drawn, options)) {
    return { draft: drawn, value: reported, changed: false }
  }
  const value = clampDuration(durationOfDraft(draft, options), options)
  return { draft: durationDraft(value, options), value, changed: value !== reported }
}

/** A key as a segment receives it. */
export interface DurationKey {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/** What a key does in a segment, for the renderer to carry out. */
export type DurationKeyResult =
  /** Not the field's key: the browser keeps it (Tab, a shortcut). */
  | { kind: 'pass' }
  /** The field's key, which changes nothing (an edit in a read-only field). */
  | { kind: 'hold' }
  /** Focus moves to the segment `by` places away, staying put at either end; typing starts again. */
  | { kind: 'move'; by: 1 | -1 }
  /** A typed or erased draft, which the field commits when focus leaves it; `advance` moves focus on. */
  | { kind: 'type'; draft: DurationDraft; typed: string; advance: boolean }
  /** A stepped draft, which the field reports at once. */
  | { kind: 'step'; draft: DurationDraft }
  /** Enter: the field commits what has been typed. */
  | { kind: 'commit' }

/**
 * A key in a segment. ArrowLeft and ArrowRight move between segments, reversed
 * in a right-to-left document. ArrowUp and ArrowDown step the segment, carrying
 * into the next larger one and stopping at the bounds. A digit types into it.
 * Backspace and Delete erase its last digit, and in an empty segment move back.
 * Enter commits. A read-only or disabled field moves focus and edits nothing.
 */
export function durationKey(
  draft: DurationDraft,
  unit: DurationUnit,
  typed: string,
  event: DurationKey,
  field: { editable: boolean; rtl: boolean },
  options: DurationFieldOptions,
): DurationKeyResult {
  const { key } = event
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return { kind: 'move', by: (key === 'ArrowRight') === !field.rtl ? 1 : -1 }
  }
  if (event.ctrlKey === true || event.metaKey === true || event.altKey === true || key === 'Tab') {
    return { kind: 'pass' }
  }
  if (key === 'Enter') return { kind: 'commit' }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (!field.editable) return { kind: 'hold' }
    return { kind: 'step', draft: stepDuration(draft, unit, key === 'ArrowUp' ? 1 : -1, options) }
  }
  if (key === 'Backspace' || key === 'Delete') {
    if (!field.editable) return { kind: 'hold' }
    if (draft[unit] === undefined) return { kind: 'move', by: -1 }
    return { kind: 'type', draft: eraseDuration(draft, unit), typed: '', advance: false }
  }
  if (key.length !== 1) return { kind: 'pass' }
  if (!field.editable) return { kind: 'hold' }
  return { kind: 'type', ...typeIntoDuration(draft, unit, typed, key, options) }
}
