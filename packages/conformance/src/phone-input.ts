import { getByRole } from '@testing-library/dom'
import { userEvent } from 'vitest/browser'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { installTestTheme } from '@polymorph/engine/testing'

/**
 * The law for what a PhoneInput reports (`design/components/phone-input.md`),
 * which every web shell's PhoneInput test calls with a mount of its own. A
 * contract statement reads one part's role, name or attribute
 * (`docs/conformance.md`). This law reads what the grammar cannot state: the
 * value the member reports after typing, a commit, a country chosen and a
 * paste, the country a shared calling code takes, what a controlled value
 * draws, and the E.164 limit.
 *
 * The law mounts the field with `locale="en-US"`, so the country names are the
 * same in every engine, and waits for each reading, because a shell commits a
 * change a moment after the event.
 */

/** The props the law mounts a PhoneInput with. A prop the law leaves out is not passed. */
export interface PhoneInputLawProps {
  /** The controlled value. Absent, the field holds its own. */
  value?: string
  defaultValue?: string
  defaultCountry?: string
  countries?: string[]
  name?: string
  locale: string
  'aria-label': string
}

export interface PhoneInputLawMount {
  /** The props the field mounts with. */
  readonly props: PhoneInputLawProps
  /** The field's handler. */
  readonly onChange: (value: string) => void
}

export interface MountedPhoneInput {
  /** Sets the controlled value, as the application's state would. */
  set(value: string): void | Promise<void>
}

export interface PhoneInputLaw {
  /** The shell's name as the law's titles say it: `Vue`. */
  readonly shell: string
  /** Mounts one PhoneInput with these props and this handler, and no other PhoneInput. */
  mount(options: PhoneInputLawMount): Promise<MountedPhoneInput>
}

const LONDON = '+442079460958'

/** The one PhoneInput on the page. */
const root = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-member="phone-input"]')
  if (element === null) throw new Error('the PhoneInput rendered nothing')
  return element
}

/** The national number's field. */
const number = (): HTMLInputElement => {
  const field = root().querySelector<HTMLInputElement>('input[type="tel"]')
  if (field === null) throw new Error('the PhoneInput has no number field')
  return field
}

/** The country's field, the combobox's text. */
const country = (): HTMLInputElement => getByRole(root(), 'combobox') as HTMLInputElement

/** The form value, in the one hidden input with a name. */
const formValue = (): string | undefined =>
  root().querySelector<HTMLInputElement>('input[type="hidden"][name]')?.value

/**
 * A paste of `text` into `field`, as the clipboard delivers it. An event a
 * script dispatches inserts nothing by itself, so what reaches the field is
 * what the member does with the paste.
 */
function paste(field: HTMLInputElement, text: string): void {
  field.focus()
  const data = new DataTransfer()
  data.setData('text/plain', text)
  const event = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data,
  })
  // An engine may give a script's paste event a clipboard of its own that reads empty, so the
  // event carries the law's wherever it does not read the text back.
  if (event.clipboardData?.getData('text/plain') !== text) {
    Object.defineProperty(event, 'clipboardData', { value: data })
  }
  field.dispatchEvent(event)
}

/**
 * The options of the open list, read from the document. A substrate may hide
 * the page outside the open list from assistive technology while it is open,
 * so the law reads the options by their role attribute.
 */
const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="option"]')]

/** Chooses a country from the list by filtering it, then pressing the option. */
async function choose(name: string): Promise<void> {
  await userEvent.click(country())
  await userEvent.fill(country(), name)
  const option = await vi.waitFor(() => {
    const found = options().find((each) => each.textContent?.includes(name))
    if (found === undefined) throw new Error(`no option holds ${name}`)
    return found
  })
  await userEvent.click(option)
}

export function phoneInputLaw({ shell, mount }: PhoneInputLaw): void {
  describe(`${shell} PhoneInput — what it reports`, () => {
    beforeAll(installTestTheme)

    afterEach(() => {
      vi.restoreAllMocks()
    })

    /** Mounts the field and waits until it shows its country, which a shell may draw a frame later. */
    const field = (props: Omit<PhoneInputLawProps, 'locale' | 'aria-label'> = {}) => {
      const onChange = vi.fn<(value: string) => void>()
      const mounted = mount({
        props: { ...props, locale: 'en-US', 'aria-label': 'Phone' },
        onChange,
      }).then(async (held) => {
        await vi.waitFor(() => expect(country().value).not.toBe(''))
        return held
      })
      return { onChange, mounted }
    }

    it('keeps digits while the reader types, and reports E.164 when the number commits', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'GB', name: 'phone' })
      await mounted
      await vi.waitFor(() => expect(country().value).toContain('United Kingdom'))
      // The HTML token for a number without its country code.
      expect(number().getAttribute('autocomplete')).toBe('tel-national')

      await userEvent.click(number())
      await userEvent.keyboard('020 7946-0958')
      await vi.waitFor(() => expect(number().value).toBe('02079460958'))
      // A draft is not reported, and the form does not carry it.
      expect(onChange).not.toHaveBeenCalled()
      expect(formValue()).toBe('')

      await userEvent.keyboard('{Enter}')
      // The trunk zero is how the number is dialed at home, and it is not part of E.164.
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+442079460958'))
      await vi.waitFor(() => expect(number().value).toBe('2079460958'))
      expect(formValue()).toBe('+442079460958')
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('commits when the reader leaves the number, and reports nothing for no change', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'US' })
      await mounted

      await userEvent.click(number())
      await userEvent.keyboard('(415) 555-0132')
      await vi.waitFor(() => expect(number().value).toBe('4155550132'))
      await userEvent.tab()
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+14155550132'))

      // Back into the field and out again, with nothing typed.
      number().focus()
      await userEvent.tab()
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('reports the empty string when the number is cleared', async () => {
      const { onChange, mounted } = field({ defaultValue: LONDON })
      await mounted
      await vi.waitFor(() => expect(number().value).toBe('2079460958'))

      await userEvent.clear(number())
      number().focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''))
    })

    it('reports the new calling code when the reader chooses a country', async () => {
      const { onChange, mounted } = field({ defaultValue: LONDON })
      await mounted
      await vi.waitFor(() => expect(country().value).toContain('United Kingdom'))

      await choose('Germany')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+492079460958'))
      await vi.waitFor(() => expect(country().value).toContain('Germany'))
      expect(number().value).toBe('2079460958')
    })

    it('sets the country and the number from a pasted number with its calling code', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'US' })
      await mounted

      paste(number(), '+44 (0)20 7946 0958')
      await vi.waitFor(() => expect(country().value).toContain('United Kingdom'))
      await vi.waitFor(() => expect(number().value).toBe('2079460958'))
      // A paste that sets the country commits, as choosing one does.
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+442079460958'))
    })

    it('puts only the digits of any other paste in the number, and does not commit', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'US' })
      await mounted

      paste(number(), '(415) 555-0132')
      await vi.waitFor(() => expect(number().value).toBe('4155550132'))
      expect(country().value).toContain('United States')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('keeps a number whose calling code it does not know as it was written', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'US' })
      await mounted

      paste(number(), '+999 123 456')
      await vi.waitFor(() => expect(number().value).toBe('+999123456'))
      number().focus()
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(number().value).toBe('+999123456'))
      expect(country().value).toContain('United States')
      expect(onChange).not.toHaveBeenCalled()
    })

    it('keeps the country it has when a pasted number shares its calling code', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'CA' })
      await mounted
      await vi.waitFor(() => expect(country().value).toContain('Canada'))

      paste(number(), '+1 604 555 0123')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+16045550123'))
      expect(country().value).toContain('Canada')
    })

    it("takes a shared calling code's main region when its country has another code", async () => {
      const { mounted } = field({ defaultCountry: 'DE' })
      await mounted

      paste(number(), '+1 415 555 0132')
      await vi.waitFor(() => expect(country().value).toContain('United States'))
      paste(number(), '+7 495 123 4567')
      await vi.waitFor(() => expect(country().value).toContain('Russia'))
    })

    it('takes the first of its countries that shares the code before the main region', async () => {
      const { mounted } = field({ countries: ['GB', 'CA', 'US'], defaultCountry: 'GB' })
      await mounted

      paste(number(), '+1 604 555 0123')
      await vi.waitFor(() => expect(country().value).toContain('Canada'))
    })

    it('draws a controlled value, and returns to it when the application keeps it', async () => {
      const { onChange, mounted } = field({ value: '+14155550132' })
      const held = await mounted
      await vi.waitFor(() => expect(country().value).toContain('United States'))
      expect(number().value).toBe('4155550132')

      await held.set(LONDON)
      await vi.waitFor(() => expect(country().value).toContain('United Kingdom'))
      await vi.waitFor(() => expect(number().value).toBe('2079460958'))

      // The reader edits; the application hears the commit and keeps its own value.
      await userEvent.click(number())
      await userEvent.keyboard('1{Enter}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith('+4420794609581'))
      await vi.waitFor(() => expect(number().value).toBe('2079460958'))
    })

    it('draws the country of a value its list lacks, listed first', async () => {
      const { mounted } = field({ countries: ['GB', 'IE'], value: '+14155550132' })
      await mounted
      await vi.waitFor(() => expect(country().value).toContain('United States'))

      await userEvent.click(country())
      await userEvent.keyboard('{ArrowDown}')
      const listed = await vi.waitFor(() => {
        expect(options()).toHaveLength(3)
        return options().map((option) => option.textContent ?? '')
      })
      expect(listed[0]).toContain('United States')
      expect(listed[1]).toContain('United Kingdom')
      expect(listed[2]).toContain('Ireland')
    })

    it('draws a value that is not E.164 in the number, and warns', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { mounted } = field({ value: '415 555 0132', defaultCountry: 'US' })
      await mounted

      await vi.waitFor(() => expect(number().value).toBe('4155550132'))
      expect(country().value).toContain('United States')
      await vi.waitFor(() =>
        expect(warn.mock.calls.some(([message]) => String(message).includes('E.164'))).toBe(true),
      )
    })

    it('holds no more digits than E.164 allows', async () => {
      const { onChange, mounted } = field({ defaultCountry: 'GB' })
      await mounted

      await userEvent.click(number())
      await userEvent.keyboard('9'.repeat(20))
      // Fifteen digits in all, and the calling code takes two.
      await vi.waitFor(() => expect(number().value).toBe('9'.repeat(13)))
      await userEvent.keyboard('{Enter}')
      await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(`+44${'9'.repeat(13)}`))

      paste(number(), `+44 ${'8'.repeat(20)}`)
      await vi.waitFor(() => expect(number().value).toBe('8'.repeat(13)))
    })
  })
}
