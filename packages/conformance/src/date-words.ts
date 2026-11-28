import { beforeAll, describe, expect, it } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

import { harness } from './harness'

/**
 * The laws for the words a segmented date or time field says that `Intl`
 * cannot supply (`design/components/date-picker.md`, `date-range-picker.md`
 * and `time-input.md`, A11y): what an unfilled segment says as its value, and
 * the names of a range's two halves, by default and in a host's words from
 * `messages`. Every web shell's `date-words` test calls them with a mount of
 * its own. A contract statement names a part from one prop
 * (`docs/conformance.md`); a segment's value text is not a name, and a half's
 * name is said with each of its segments' own.
 *
 * The React members' defaults are React Aria's words, which React Aria says in
 * the field's locale, so every field mounts in `en-US`. React Aria writes
 * "Start Date" where a generated member writes "Start date", which a screen
 * reader says alike, so a default half's name is compared without case.
 */

/** DatePicker's other words, which a host's `messages` passes with its own. */
const CALENDAR = {
  previousMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  showCalendar: 'Afficher le calendrier',
  clear: 'Effacer',
}

/** The props the DatePicker law mounts with. A prop the law leaves out is not passed. */
export interface DatePickerWordsProps {
  'aria-label': string
  locale: string
  messages?: typeof CALENDAR & { chooseDate: string; empty?: string }
}

/** The props the DateRangePicker law mounts with. A prop the law leaves out is not passed. */
export interface DateRangePickerWordsProps {
  'aria-label': string
  locale: string
  messages?: typeof CALENDAR & { chooseRange: string; empty?: string; start?: string; end?: string }
}

/** The props the TimeInput law mounts with. A prop the law leaves out is not passed. */
export interface TimeInputWordsProps {
  'aria-label': string
  locale: string
  messages?: { empty: string }
}

export interface DateWordsLaw<Props> {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one field with these props, after any the test mounted before it. */
  mount(props: Props): Promise<unknown>
}

/** The segments of the field mounted last, in reading order: each mount is added at the end. */
function segments(member: string): HTMLElement[] {
  const field = [...document.querySelectorAll<HTMLElement>(`[data-member="${member}"]`)].at(-1)
  if (field === undefined) throw new Error(`the ${member} rendered nothing`)
  const found = [...field.querySelectorAll<HTMLElement>('[data-segment]')]
  if (found.length === 0) throw new Error(`the ${member} drew no segment`)
  return found
}

/** What each segment says as its value. */
const valueTexts = (member: string) =>
  segments(member).map((segment) => segment.getAttribute('aria-valuetext'))

/** A host's word for an unfilled segment, in French. */
const VIDE = 'Vide'

export function datePickerWordsLaw({ shell, mount }: DateWordsLaw<DatePickerWordsProps>): void {
  describe(`${shell} DatePicker — what an unfilled segment says`, () => {
    beforeAll(installTestTheme)

    it('says Empty as its value', async () => {
      await mount({ 'aria-label': 'Échéance', locale: 'en-US' })
      expect(valueTexts('date-picker')).toEqual(['Empty', 'Empty', 'Empty'])
    })

    it('says the host’s word from messages.empty', async () => {
      await mount({
        'aria-label': 'Échéance',
        locale: 'en-US',
        messages: { ...CALENDAR, chooseDate: 'Choisir une date', empty: VIDE },
      })
      expect(valueTexts('date-picker')).toEqual([VIDE, VIDE, VIDE])
    })
  })
}

export function dateRangePickerWordsLaw({
  shell,
  mount,
}: DateWordsLaw<DateRangePickerWordsProps>): void {
  describe(`${shell} DateRangePicker — the halves’ names and what an unfilled segment says`, () => {
    beforeAll(installTestTheme)

    /** Each half's segments' names: a date in `en-US` is three segments. */
    function halves(): { start: string[]; end: string[] } {
      const names = segments('date-range-picker').map((segment) => harness.nameOf(segment))
      expect(names).toHaveLength(6)
      return { start: names.slice(0, 3), end: names.slice(3) }
    }

    it('names each segment by its half, Start date or End date, and says Empty as its value', async () => {
      await mount({ 'aria-label': 'Période', locale: 'en-US' })
      const { start, end } = halves()
      for (const name of start) {
        expect(name.toLowerCase()).toContain('start date')
        expect(name.toLowerCase()).not.toContain('end date')
      }
      for (const name of end) {
        expect(name.toLowerCase()).toContain('end date')
        expect(name.toLowerCase()).not.toContain('start date')
      }
      expect(valueTexts('date-range-picker')).toEqual(Array(6).fill('Empty'))
    })

    it('names the halves and an unfilled segment in the host’s words from messages', async () => {
      await mount({
        'aria-label': 'Période',
        locale: 'en-US',
        messages: {
          ...CALENDAR,
          chooseRange: 'Choisir une période',
          empty: VIDE,
          start: 'Date de début',
          end: 'Date de fin',
        },
      })
      const { start, end } = halves()
      for (const name of start) {
        expect(name).toContain('Date de début')
        expect(name.toLowerCase()).not.toContain('start date')
      }
      for (const name of end) {
        expect(name).toContain('Date de fin')
        expect(name.toLowerCase()).not.toContain('end date')
      }
      expect(valueTexts('date-range-picker')).toEqual(Array(6).fill(VIDE))
    })
  })
}

export function timeInputWordsLaw({ shell, mount }: DateWordsLaw<TimeInputWordsProps>): void {
  describe(`${shell} TimeInput — what an unfilled segment says`, () => {
    beforeAll(installTestTheme)

    it('says Empty as its value', async () => {
      await mount({ 'aria-label': 'Ouverture', locale: 'en-US' })
      // The hour, the minute and the day period of a 12-hour clock.
      expect(valueTexts('time-input')).toEqual(['Empty', 'Empty', 'Empty'])
    })

    it('says the host’s word from messages.empty', async () => {
      await mount({ 'aria-label': 'Ouverture', locale: 'en-US', messages: { empty: VIDE } })
      expect(valueTexts('time-input')).toEqual([VIDE, VIDE, VIDE])
    })
  })
}
