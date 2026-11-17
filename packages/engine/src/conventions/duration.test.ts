import { describe, expect, it } from 'vitest'

import {
  agentDuration,
  clampDuration,
  commitDuration,
  durationBounds,
  durationDraft,
  durationKey,
  durationOfDraft,
  durationSegmentRange,
  durationSegments,
  durationUnits,
  eraseDuration,
  stepDuration,
  typeIntoDuration,
  type DurationDraft,
  type DurationFieldOptions,
} from './duration'

/**
 * DurationInput's arithmetic. A framework's DurationInput renders these
 * segments and routes its keys here; its own tests check the spinbuttons, and
 * `@polymorph/conformance/duration-input` holds every web renderer to the same
 * behaviour.
 */

/** The default units, as the session-lifetime screens use them. */
const DHM: DurationFieldOptions = { locale: 'en-US' }
const HM: DurationFieldOptions = { locale: 'en-US', units: ['hours', 'minutes'] }
const HMS: DurationFieldOptions = { locale: 'en-US', units: ['hours', 'minutes', 'seconds'] }
const MINUTES: DurationFieldOptions = { locale: 'en-US', units: ['minutes'] }
/** An inactivity lifetime: 15 minutes to 7 days. */
const INACTIVITY: DurationFieldOptions = { locale: 'en-US', min: 900, max: 604_800 }

describe('the units a field shows', () => {
  it('are days, hours and minutes unless the caller names others', () => {
    expect(durationUnits()).toEqual(['days', 'hours', 'minutes'])
    expect(durationUnits([])).toEqual(['days', 'hours', 'minutes'])
  })

  it('are largest first and each once, whatever order the caller names them in', () => {
    expect(durationUnits(['seconds', 'minutes', 'seconds'])).toEqual(['minutes', 'seconds'])
  })
})

describe('seconds and drafts', () => {
  it('splits seconds across the units shown, the largest taking the rest', () => {
    expect(durationDraft(604_800, DHM)).toEqual({ days: 7, hours: 0, minutes: 0 })
    expect(durationDraft(129_600, HM)).toEqual({ hours: 36, minutes: 0 })
    expect(durationDraft(5_400, HM)).toEqual({ hours: 1, minutes: 30 })
  })

  it('draws no value as an empty draft', () => {
    expect(durationDraft(null, DHM)).toEqual({})
    expect(durationDraft(undefined, DHM)).toEqual({})
    expect(durationDraft(Number.NaN, DHM)).toEqual({})
  })

  it('rounds a value the units cannot write to the nearest count of the smallest, half up', () => {
    expect(durationDraft(90, MINUTES)).toEqual({ minutes: 2 })
    expect(durationDraft(89, MINUTES)).toEqual({ minutes: 1 })
    // The rounding carries: 59 minutes and 45 seconds is an hour at minute grain.
    expect(durationDraft(3_585, HM)).toEqual({ hours: 1, minutes: 0 })
  })

  it('sums a draft back to seconds, an empty segment counting as zero', () => {
    expect(durationOfDraft({ days: 7, hours: 0, minutes: 0 }, DHM)).toBe(604_800)
    expect(durationOfDraft({ minutes: 45 }, DHM)).toBe(2_700)
  })

  it('is no value while every segment is empty', () => {
    expect(durationOfDraft({}, DHM)).toBeNull()
  })

  it('reads only the units it shows', () => {
    expect(durationOfDraft({ seconds: 30, minutes: 1 }, MINUTES)).toBe(60)
  })
})

describe('bounds', () => {
  it('holds a value between min and max', () => {
    expect(clampDuration(300, INACTIVITY)).toBe(900)
    expect(clampDuration(700_000, INACTIVITY)).toBe(604_800)
    expect(clampDuration(3_600, INACTIVITY)).toBe(3_600)
  })

  it('is never negative', () => {
    expect(clampDuration(-60, DHM)).toBe(0)
  })

  it('keeps no value as no value', () => {
    expect(clampDuration(null, INACTIVITY)).toBeNull()
  })

  it('moves min and max inwards to whole counts of the smallest unit shown', () => {
    expect(durationBounds({ locale: 'en-US', units: ['minutes'], min: 90, max: 330 })).toEqual({
      min: 120,
      max: 300,
    })
  })

  it('keeps the caller’s bounds when no whole count lies between them', () => {
    expect(durationBounds({ locale: 'en-US', units: ['minutes'], min: 70, max: 100 })).toEqual({
      min: 70,
      max: 100,
    })
  })
})

describe('segment ranges', () => {
  it('holds a smaller unit below the next larger unit shown', () => {
    expect(durationSegmentRange('minutes', HM)).toEqual({ min: 0, max: 59 })
    expect(durationSegmentRange('hours', DHM)).toEqual({ min: 0, max: 23 })
    expect(
      durationSegmentRange('minutes', { locale: 'en-US', units: ['days', 'minutes'] }),
    ).toEqual({ min: 0, max: 1_439 })
  })

  it('bounds the largest unit by what max holds', () => {
    expect(durationSegmentRange('days', INACTIVITY)).toEqual({ min: 0, max: 7 })
  })
})

describe('the segments', () => {
  it('writes each count with the unit’s short word after it, in the locale', () => {
    const segments = durationSegments({ days: 7, hours: 0, minutes: 15 }, DHM)
    expect(segments.map((segment) => [segment.text, segment.word, segment.wordFirst])).toEqual([
      ['7', 'days', false],
      ['0', 'hr', false],
      ['15', 'min', false],
    ])
  })

  it('names each segment by its unit and says its value with the long word', () => {
    const segments = durationSegments({ days: 1, hours: 2, minutes: 15 }, DHM)
    expect(segments.map((segment) => segment.name)).toEqual(['day', 'hour', 'minute'])
    expect(segments.map((segment) => segment.valueText)).toEqual(['1 day', '2 hours', '15 minutes'])
  })

  it('shows a placeholder and says the empty word while a segment is empty', () => {
    const [days] = durationSegments({}, DHM, { empty: 'Leer' })
    expect(days).toMatchObject({ text: '––', placeholder: true, valueText: 'Leer' })
    expect(days?.value).toBeUndefined()
  })

  it('takes the words and digits of the locale it is given', () => {
    const segments = durationSegments({ hours: 1, minutes: 30 }, { ...HM, locale: 'de-DE' })
    expect(segments.map((segment) => segment.word)).toEqual(['Std.', 'Min.'])
    expect(segments.map((segment) => segment.valueText)).toEqual(['1 Stunde', '30 Minuten'])
  })

  it('gives the largest unit no maximum unless max sets one', () => {
    expect(durationSegments({}, DHM)[0]?.max).toBeUndefined()
    expect(durationSegments({}, INACTIVITY)[0]?.max).toBe(7)
    expect(durationSegments({}, DHM)[1]?.max).toBe(23)
  })
})

describe('stepping', () => {
  it('adds one of the segment’s unit to the whole value', () => {
    expect(stepDuration({ days: 7, hours: 0, minutes: 0 }, 'hours', 1, DHM)).toEqual({
      days: 7,
      hours: 1,
      minutes: 0,
    })
  })

  it('carries into the next larger unit, and borrows from it', () => {
    expect(stepDuration({ hours: 0, minutes: 59 }, 'minutes', 1, HM)).toEqual({
      hours: 1,
      minutes: 0,
    })
    expect(stepDuration({ hours: 1, minutes: 0 }, 'minutes', -1, HM)).toEqual({
      hours: 0,
      minutes: 59,
    })
  })

  it('stops at the bounds', () => {
    expect(stepDuration({ days: 7, hours: 0, minutes: 0 }, 'days', 1, INACTIVITY)).toEqual({
      days: 7,
      hours: 0,
      minutes: 0,
    })
    expect(stepDuration({ days: 0, hours: 0, minutes: 15 }, 'minutes', -1, INACTIVITY)).toEqual({
      days: 0,
      hours: 0,
      minutes: 15,
    })
    expect(stepDuration({ hours: 0, minutes: 30 }, 'hours', -1, HM)).toEqual({
      hours: 0,
      minutes: 0,
    })
  })

  it('counts an empty field as zero: up gives one unit, down the minimum', () => {
    expect(stepDuration({}, 'minutes', 1, HM)).toEqual({ hours: 0, minutes: 1 })
    expect(stepDuration({}, 'minutes', -1, INACTIVITY)).toEqual({ days: 0, hours: 0, minutes: 15 })
  })

  it('steps from what the segments draw, so a remainder they cannot show is gone', () => {
    expect(stepDuration(durationDraft(90, MINUTES), 'minutes', 1, MINUTES)).toEqual({ minutes: 3 })
  })
})

describe('typing', () => {
  it('extends the typed count while it fits, and moves on once no digit could', () => {
    const first = typeIntoDuration({}, 'minutes', '', '4', HM)
    expect(first).toEqual({ draft: { minutes: 4 }, typed: '4', advance: false })
    const second = typeIntoDuration(first.draft, 'minutes', first.typed, '5', HM)
    expect(second).toEqual({ draft: { minutes: 45 }, typed: '', advance: true })
  })

  it('refuses 90 in the minutes of a field that shows hours: the 9 fills them and moves on', () => {
    const nine = typeIntoDuration({}, 'minutes', '', '9', HMS)
    expect(nine).toEqual({ draft: { minutes: 9 }, typed: '', advance: true })
  })

  it('starts the count again with a digit that would not fit after the typed ones', () => {
    expect(typeIntoDuration({ hours: 3 }, 'hours', '3', '5', DHM).draft).toEqual({ hours: 5 })
  })

  it('refuses a digit no count of the segment reaches', () => {
    expect(typeIntoDuration({ days: 2 }, 'days', '', '8', INACTIVITY)).toEqual({
      draft: { days: 2 },
      typed: '',
      advance: false,
    })
  })

  it('lets the largest unit pass the next unit’s size', () => {
    let state: { draft: DurationDraft; typed: string } = { draft: {}, typed: '' }
    for (const key of '36') state = typeIntoDuration(state.draft, 'hours', state.typed, key, HM)
    expect(state.draft).toEqual({ hours: 36 })
  })

  it('waits on a leading zero', () => {
    expect(typeIntoDuration({}, 'minutes', '', '0', HM)).toEqual({
      draft: { minutes: 0 },
      typed: '0',
      advance: false,
    })
  })

  it('changes nothing for a key that is not a digit', () => {
    expect(typeIntoDuration({ minutes: 5 }, 'minutes', '5', 'x', HM)).toEqual({
      draft: { minutes: 5 },
      typed: '5',
      advance: false,
    })
  })

  it('erases the last digit, then the segment', () => {
    expect(eraseDuration({ minutes: 45 }, 'minutes')).toEqual({ minutes: 4 })
    expect(eraseDuration({ minutes: 4 }, 'minutes')).toEqual({})
    expect(eraseDuration({}, 'minutes')).toEqual({})
  })
})

describe('committing', () => {
  it('reports the typed seconds, held inside the bounds, and draws them', () => {
    expect(commitDuration({ minutes: 5 }, null, INACTIVITY)).toEqual({
      draft: { days: 0, hours: 0, minutes: 15 },
      value: 900,
      changed: true,
    })
  })

  it('reports no value once every segment is erased', () => {
    expect(commitDuration({}, 3_600, HM)).toEqual({ draft: {}, value: null, changed: true })
  })

  it('keeps a value the segments cannot write while the reader leaves them as drawn', () => {
    expect(commitDuration(durationDraft(90, MINUTES), 90, MINUTES)).toEqual({
      draft: { minutes: 2 },
      value: 90,
      changed: false,
    })
  })

  it('reports nothing for a draft that writes the reported value another way', () => {
    // Erasing a zero leaves the same seconds.
    expect(commitDuration({ hours: 1 }, 3_600, HM).changed).toBe(false)
  })
})

describe('keys', () => {
  const editable = { editable: true, rtl: false }
  const draft = { days: 7, hours: 0, minutes: 0 }

  it('moves with the arrows that point along the row, reversed right to left', () => {
    expect(durationKey(draft, 'days', '', { key: 'ArrowRight' }, editable, DHM)).toEqual({
      kind: 'move',
      by: 1,
    })
    expect(
      durationKey(draft, 'days', '', { key: 'ArrowLeft' }, { editable: true, rtl: true }, DHM),
    ).toEqual({ kind: 'move', by: 1 })
  })

  it('steps with the arrows that point up and down', () => {
    expect(durationKey(draft, 'days', '', { key: 'ArrowDown' }, editable, DHM)).toEqual({
      kind: 'step',
      draft: { days: 6, hours: 0, minutes: 0 },
    })
  })

  it('types digits, and erases, without reporting', () => {
    expect(durationKey({}, 'hours', '', { key: '2' }, editable, DHM)).toEqual({
      kind: 'type',
      draft: { hours: 2 },
      typed: '2',
      advance: false,
    })
    expect(durationKey(draft, 'days', '', { key: 'Backspace' }, editable, DHM)).toMatchObject({
      kind: 'type',
      draft: { hours: 0, minutes: 0 },
    })
  })

  it('moves back from an empty segment on Backspace', () => {
    expect(durationKey({ days: 7 }, 'hours', '', { key: 'Backspace' }, editable, DHM)).toEqual({
      kind: 'move',
      by: -1,
    })
  })

  it('commits on Enter, and leaves Tab and shortcuts to the browser', () => {
    expect(durationKey(draft, 'days', '', { key: 'Enter' }, editable, DHM)).toEqual({
      kind: 'commit',
    })
    expect(durationKey(draft, 'days', '', { key: 'Tab' }, editable, DHM)).toEqual({ kind: 'pass' })
    expect(durationKey(draft, 'days', '', { key: 'a', metaKey: true }, editable, DHM)).toEqual({
      kind: 'pass',
    })
  })

  it('edits nothing in a read-only field, and still moves', () => {
    const still = { editable: false, rtl: false }
    expect(durationKey(draft, 'days', '', { key: 'ArrowUp' }, still, DHM)).toEqual({ kind: 'hold' })
    expect(durationKey(draft, 'days', '', { key: '3' }, still, DHM)).toEqual({ kind: 'hold' })
    expect(durationKey(draft, 'days', '', { key: 'ArrowRight' }, still, DHM)).toEqual({
      kind: 'move',
      by: 1,
    })
  })
})

describe('the seconds an agent sets', () => {
  it('takes a whole count of the smallest unit shown, inside the bounds', () => {
    expect(agentDuration(86_400, DHM)).toBe(86_400)
    expect(agentDuration(900, INACTIVITY)).toBe(900)
    expect(agentDuration(7_261, HMS)).toBe(7_261)
  })

  it('refuses seconds the segments cannot draw, and seconds outside the bounds', () => {
    expect(() => agentDuration(90, MINUTES)).toThrow('not a whole number')
    expect(() => agentDuration(1.5, HMS)).toThrow('not a whole number')
    expect(() => agentDuration(840, INACTIVITY)).toThrow('outside')
    expect(() => agentDuration(604_860, INACTIVITY)).toThrow('outside')
    expect(() => agentDuration(-60, DHM)).toThrow('outside')
  })
})
