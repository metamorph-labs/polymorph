import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  CalendarDate,
  CalendarDateTime,
  define,
  defineLazy,
  PolyElement,
  restore,
  Time,
  type ElementDefinition,
} from '@polymorph/elements'
import { temporal } from '@polymorph/elements/temporal'
import { installTestTheme } from '@polymorph/engine/testing'
import DatePicker from '@polymorph/solid-ui/controls/DatePicker'
import DateRangePicker from '@polymorph/solid-ui/controls/DateRangePicker'
import TimeInput from '@polymorph/solid-ui/controls/TimeInput'

import '../controls/DatePicker'
import { DEFINITIONS } from '../definitions'

/**
 * A date or a time an element reads through the temporal codecs
 * (`@polymorph/elements/temporal`), which its member's code gives `define`, so
 * the date library loads with that code. An element of a tag defined before
 * the code (`defineLazy`) keeps the text of a date or time attribute, or of
 * its property set to ISO text, and reads it once the code is there, before
 * the member renders; its property reads `undefined` until then, and text the
 * codec cannot read is reported then. An element defined with its code reads
 * the text at once, whether the page wrote it before the tag was defined or
 * sets it after.
 *
 * Each test defines its tags under names of its own; a lazily defined one
 * loads when the test releases it.
 */

beforeAll(installTestTheme)

/** A member's definition under a tag of the test's own. */
const as = (tag: string, from: string): ElementDefinition => ({
  ...(DEFINITIONS[from] as ElementDefinition),
  tag,
})

/** A load the test releases: it runs `define` with the temporal codecs, as a member's module does. */
function held(definition: ElementDefinition, component: Parameters<typeof define>[1]) {
  let release = () => {}
  const loaded = new Promise<void>((done) => {
    release = done
  })
  const load = vi.fn(async () => {
    await loaded
    define(definition, component, temporal)
  })
  return { load, release }
}

const hosts: HTMLElement[] = []

/** Markup in the document, removed after the test. */
function written(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  hosts.push(host)
  return host
}

/** An element's properties, as a page's script reads and sets them. */
const properties = (element: Element | null) => element as unknown as Record<string, unknown>

/** The value DatePicker's hidden input posts, which it draws from the `value` it is handed. */
const posted = (element: Element) =>
  element.querySelector<HTMLInputElement>('input[type="hidden"]')?.value

afterEach(() => {
  vi.restoreAllMocks()
  for (const host of hosts.splice(0)) {
    restore(host)
    host.remove()
  }
})

describe('a date or a time on a tag defined before its member’s code', () => {
  it('keeps an attribute’s text, reads undefined, and reads it before the member renders', async () => {
    const picker = as('temporal-a-picker', 'poly-date-picker')
    const loading = held(picker, DatePicker)
    defineLazy(picker, loading.load)
    // What the member's hidden input posts when it first renders.
    const first: (string | undefined)[] = []
    const stop = PolyElement.observe((element, event) => {
      if (element.localName === 'temporal-a-picker' && event === 'render') {
        first.push(posted(element))
      }
    })

    const host = written(
      '<temporal-a-picker aria-label="Due" name="due" value="2026-07-15"></temporal-a-picker>',
    )
    const element = properties(host.querySelector('temporal-a-picker'))
    await vi.waitFor(() => expect(loading.load).toHaveBeenCalledTimes(1))
    expect(element['value']).toBeUndefined()

    loading.release()
    await vi.waitFor(() => expect(first).toHaveLength(1))
    stop()
    expect(first).toEqual(['2026-07-15'])
    expect(element['value']).toEqual(new CalendarDate(2026, 7, 15))
  })

  it('reads an attribute set after its code has loaded at once', async () => {
    const picker = as('temporal-b-picker', 'poly-date-picker')
    const loading = held(picker, DatePicker)
    defineLazy(picker, loading.load)
    const host = written(
      '<temporal-b-picker aria-label="Due" name="due" value="2026-07-15"></temporal-b-picker>',
    )
    const tag = host.querySelector('temporal-b-picker') as HTMLElement
    loading.release()
    await vi.waitFor(() => expect(posted(tag)).toBe('2026-07-15'))

    tag.setAttribute('value', '2026-08-01')
    expect(properties(tag)['value']).toEqual(new CalendarDate(2026, 8, 1))
    await vi.waitFor(() => expect(posted(tag)).toBe('2026-08-01'))
  })

  it('keeps a property set to ISO text until its code loads, and lets a later value replace it', async () => {
    const picker = as('temporal-c-picker', 'poly-date-picker')
    const loading = held(picker, DatePicker)
    defineLazy(picker, loading.load)
    const host = written('<temporal-c-picker aria-label="Due"></temporal-c-picker>')
    const element = properties(host.querySelector('temporal-c-picker'))
    element['value'] = '2026-07-15'
    host.querySelector('temporal-c-picker')?.setAttribute('min-value', '2026-01-01')
    const february = new CalendarDate(2026, 2, 1)
    element['minValue'] = february
    expect(element['value']).toBeUndefined()
    expect(element['minValue']).toBe(february)

    loading.release()
    await vi.waitFor(() => expect(element['value']).toEqual(new CalendarDate(2026, 7, 15)))
    // The value set after the attribute is the one the element holds.
    expect(element['minValue']).toBe(february)
  })

  it('reads a time and a range the same way', async () => {
    const time = as('temporal-d-time', 'poly-time-input')
    const range = as('temporal-d-range', 'poly-date-range-picker')
    const timeLoad = held(time, TimeInput)
    const rangeLoad = held(range, DateRangePicker)
    defineLazy(time, timeLoad.load)
    defineLazy(range, rangeLoad.load)
    const host = written(
      '<temporal-d-time aria-label="Starts" value="09:30"></temporal-d-time>' +
        '<temporal-d-range aria-label="Stay" value="2026-07-01/2026-07-15"></temporal-d-range>',
    )
    const at = properties(host.querySelector('temporal-d-time'))
    const stay = properties(host.querySelector('temporal-d-range'))
    await vi.waitFor(() => expect(rangeLoad.load).toHaveBeenCalledTimes(1))
    expect([at['value'], stay['value']]).toEqual([undefined, undefined])

    timeLoad.release()
    rangeLoad.release()
    await vi.waitFor(() => expect(at['value']).toEqual(new Time(9, 30)))
    expect(stay['value']).toEqual({
      start: new CalendarDate(2026, 7, 1),
      end: new CalendarDate(2026, 7, 15),
    })
  })

  it('reports text the codec cannot read once its code has loaded, and leaves the prop unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const picker = as('temporal-e-picker', 'poly-date-picker')
    const loading = held(picker, DatePicker)
    defineLazy(picker, loading.load)
    const host = written('<temporal-e-picker aria-label="Due" value="July 15"></temporal-e-picker>')
    const element = host.querySelector('temporal-e-picker') as Element
    await vi.waitFor(() => expect(loading.load).toHaveBeenCalledTimes(1))
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('July 15'))

    loading.release()
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        'polymorph: <temporal-e-picker value>: "July 15" is not an ISO 8601 date (2026-07-15) or date and time; the prop is unset',
      ),
    )
    expect(properties(element)['value']).toBeUndefined()
  })
})

describe('a date or a time on a tag defined with its member’s code', () => {
  it('reads an attribute written before the tag was defined, and one set after, at once', () => {
    const host = written(
      '<temporal-f-picker aria-label="Due" value="2026-07-15"></temporal-f-picker>',
    )
    const element = host.querySelector('temporal-f-picker') as HTMLElement
    define(as('temporal-f-picker', 'poly-date-picker'), DatePicker, temporal)
    expect(properties(element)['value']).toEqual(new CalendarDate(2026, 7, 15))
    element.setAttribute('value', '2026-08-01T09:30')
    expect(properties(element)['value']).toEqual(new CalendarDateTime(2026, 8, 1, 9, 30))
  })

  it('reads them at once through the definition module the vocabulary generates', () => {
    const element = document.createElement('poly-date-picker')
    element.setAttribute('value', '2026-07-15')
    expect(element.value).toEqual(new CalendarDate(2026, 7, 15))
    element.value = '2026-08-01' as unknown as CalendarDate
    expect(element.value).toEqual(new CalendarDate(2026, 8, 1))
  })

  it('reports a date or a time defined without the temporal codecs, and leaves the prop unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    define(as('temporal-g-picker', 'poly-date-picker'), DatePicker)
    const element = document.createElement('temporal-g-picker')
    element.setAttribute('value', '2026-07-15')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '<temporal-g-picker value>: "2026-07-15" is read through the temporal codecs',
      ),
    )
    expect(properties(element)['value']).toBeUndefined()
  })
})
