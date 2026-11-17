'use client'

import { useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useLocale } from 'react-aria'

import {
  commitPhone,
  type ControlSize,
  dataAttrs,
  dataFlag,
  isPhoneValue,
  memberAttr,
  phoneCountries,
  phoneCountryOptions,
  phoneDefaultCountry,
  phoneDraft,
  readPhone,
  useAgentMember,
  useDevWarning,
} from '@polymorph/react'
import { Combobox } from './Combobox'
import { Input } from './Input'
import styles from '@polymorph/recipes/controls/phone-input.module.css'

/**
 * A phone number, reported as one E.164 string (`design/components/phone-input.md`).
 *
 * The reader chooses a country, which gives the calling code, and types the national number. It
 * is a Combobox for the country and an Input for the number in one group. The engine's phone
 * model (`@polymorph/engine`'s `commitPhone`, `readPhone`, `splitPhone`) does everything between
 * them: the calling codes, the trunk zero, the limit and the paste rule. Every framework's member
 * calls the same functions, so a number reads the same in each.
 *
 * It is not Input with `type="tel"`, which keeps the text as it was typed and knows no country.
 * It checks the form of a number and not whether the number exists, which the application checks.
 */

/** Every word the member writes itself. Partial: an omitted string keeps its English default. */
export interface PhoneInputMessages {
  /** The country control's name. Default: `Country calling code`. */
  country?: string
  /** The country list button's name. Default: `Show countries`. */
  showCountries?: string
  /** Announced while the list is open. Default: `{count} countries`. */
  countriesShown?: (count: number) => string
  /** The list's one row when nothing matches the typed text. Default: `No matching country`. */
  noCountry?: string
}

const MESSAGES = {
  country: 'Country calling code',
  showCountries: 'Show countries',
  countriesShown: (count: number) => `${count} countries`,
  noCountry: 'No matching country',
} satisfies Required<PhoneInputMessages>

export interface PhoneInputProps {
  /**
   * An E.164 string (`+442079460958`), or the empty string while the national number has no
   * digits. A value that is not E.164 is drawn as well as it can be, with a development warning.
   */
  value?: string
  defaultValue?: string
  /**
   * Reports commits, never drafts, as NumberInput does: the reader leaves the number or presses
   * Enter in it, chooses a country, or pastes a number written with its calling code. It fires
   * only for a value that differs from the one the field holds.
   */
  onChange?: (value: string) => void
  /**
   * ISO 3166-1 alpha-2. The country shown before the reader chooses one, while the value names
   * none. Defaults to the first of `countries`, else the United States.
   */
  defaultCountry?: string
  /** The regions offered, in this order. Every region, sorted by name, when omitted. */
  countries?: string[]
  /** The language of the country names and of their order. */
  locale?: string
  /** Every word the member writes itself. See `PhoneInputMessages`. */
  messages?: PhoneInputMessages
  size?: ControlSize
  disabled?: boolean
  /** The number stays focusable and selectable, and the country is shown as read-only text. */
  readOnly?: boolean
  invalid?: boolean
  /** Serializes the committed E.164 value in one hidden input. */
  name?: string
  /** On the number's `<input>`, so a link to the field reaches a control that takes focus. */
  id?: string
  /** Wired by FormField; set directly only when there is no visible label. */
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-required'?: boolean
}

export function PhoneInput({
  value,
  defaultValue,
  onChange,
  defaultCountry,
  countries,
  locale,
  messages,
  size = 'md',
  disabled = false,
  readOnly = false,
  invalid = false,
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: PhoneInputProps) {
  const say = { ...MESSAGES, ...messages }
  const { locale: appLocale } = useLocale()
  const language = locale ?? appLocale

  /** The committed value while the application does not hold it. */
  const [kept, setKept] = useState(defaultValue ?? '')
  const current = value ?? kept

  /**
   * The country the reader last chose. The value decides the country once it names one; this is
   * the country of the empty value, and the one a shared calling code keeps.
   */
  const [chosen, setChosen] = useState(
    () =>
      readPhone(current, { country: phoneDefaultCountry(defaultCountry, countries), countries })
        .country,
  )

  /** The national text the reader is editing, until it commits. */
  const [draft, setDraft] = useState<string | null>(null)

  const drawn = readPhone(current, { country: chosen, countries })
  const country = drawn.country
  const national = draft ?? drawn.national

  const listed = countries?.join(' ')
  const options = useMemo(
    () =>
      phoneCountryOptions({
        locale: language,
        countries: listed === undefined ? undefined : listed.split(' ').filter(Boolean),
        include: country,
      }),
    [language, listed, country],
  )

  useDevWarning(
    current !== '' && !isPhoneValue(current),
    `PhoneInput's value "${current}" is not an E.164 string. Pass "+", the calling code and the national number, or "".`,
  )
  useDevWarning(
    countries !== undefined && phoneCountries(countries).length !== countries.length,
    `PhoneInput's countries [${countries?.join(', ') ?? ''}] repeat a region or name one with no calling code. Each is listed once, and those are dropped.`,
  )

  /** The reader's commit: the field's country and national text become the value. */
  function commit(nextCountry: string, text: string) {
    const result = commitPhone(nextCountry, text, { countries })
    setChosen(result.country)
    // A number whose calling code the table lacks reports nothing and stays as it was typed.
    setDraft(result.value === '' && result.national !== '' ? result.national : null)
    if (result.value === current) return
    setKept(result.value)
    onChange?.(result.value)
  }

  function commitDraft() {
    if (draft !== null) commit(country, draft)
  }

  function onNumberKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === 'Enter') commitDraft()
  }

  /**
   * The paste rule. A pasted number that starts with `+` replaces the field, and with a calling
   * code the table holds it sets the country and commits. Any other paste puts its digits where
   * the caret is. The member inserts the text itself, so a pasted bracket or dash never reaches
   * the field.
   */
  function onNumberPaste(event: ClipboardEvent<HTMLSpanElement>) {
    const field = event.target
    if (readOnly || !(field instanceof HTMLInputElement) || field.type !== 'tel') return
    const pasted = event.clipboardData.getData('text/plain')
    event.preventDefault()
    if (pasted.trimStart().startsWith('+')) {
      const result = commitPhone(country, pasted, { countries })
      if (result.value === '') setDraft(result.national)
      else commit(country, pasted)
      return
    }
    const start = field.selectionStart ?? national.length
    const end = field.selectionEnd ?? national.length
    setDraft(phoneDraft(`${national.slice(0, start)}${pasted}${national.slice(end)}`, country))
  }

  /** A country chosen from the list. A cleared country text restores the chosen country. */
  function onCountryChange(next: string | null) {
    if (next !== null) commit(next, national)
  }

  /*
   * One phone field is one member: this one registers its group and withholds the Combobox and
   * the Input it draws. An agent's set commits through the member's own `commit`, so the paste
   * rule reads a number written with its calling code, and other text is the national number
   * under the shown country. It refuses text with no number in it, and a read-only field
   * refuses both actions.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  function writable() {
    if (readOnly) throw new Error('The field is read-only.')
  }
  useAgentMember({
    member: 'PhoneInput',
    element: () => rootRef.current,
    state: () => ({ value: current, country, disabled, invalid, readonly: readOnly }),
    actions: {
      set: {
        argument: 'text',
        run: (text) => {
          writable()
          if (commitPhone(country, text, { countries }).value === '') {
            throw new Error(`"${text}" is not a phone number the field can read.`)
          }
          commit(country, text)
        },
      },
      clear: () => {
        writable()
        commit(country, '')
      },
    },
    withholds: () => rootRef.current,
  })

  const countryId = `${useId()}-country`
  const countryLabel = options.find((option) => option.value === country)?.label ?? ''
  // The country's name is its own word and then the field's label, as React Aria names a date
  // segment, so two phone fields on one form name their country controls apart.
  const countryLabelledBy = labelledBy === undefined ? undefined : `${countryId} ${labelledBy}`

  return (
    <div
      ref={rootRef}
      role="group"
      className={styles.root}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      {...dataAttrs({ size, disabled, invalid })}
      {...dataFlag('readonly', readOnly)}
      {...memberAttr('PhoneInput')}
    >
      <span className={styles.country}>
        {readOnly ? (
          // Combobox has no read-only state, so a read-only field shows its country as text that
          // stays focusable and selectable, as Input's read-only state does.
          <Input
            value={countryLabel}
            readOnly
            size={size}
            invalid={invalid}
            disabled={disabled}
            id={countryId}
            aria-label={say.country}
            aria-labelledby={countryLabelledBy}
            aria-describedby={describedBy}
          />
        ) : (
          <Combobox
            options={options}
            value={country}
            onChange={onCountryChange}
            size={size}
            invalid={invalid}
            disabled={disabled}
            id={countryId}
            messages={{ showOptions: say.showCountries, options: say.countriesShown }}
            emptyMessage={say.noCountry}
            aria-label={say.country}
            aria-labelledby={countryLabelledBy}
            aria-describedby={describedBy}
          />
        )}
      </span>

      <span className={styles.number} onKeyDown={onNumberKeyDown} onPaste={onNumberPaste}>
        <Input
          type="tel"
          value={national}
          onChange={(text) => setDraft(phoneDraft(text, country))}
          onBlur={commitDraft}
          size={size}
          invalid={invalid}
          disabled={disabled}
          readOnly={readOnly}
          id={id}
          autoComplete="tel-national"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-required={required}
        />
      </span>

      {name === undefined ? null : (
        <input type="hidden" name={name} value={current} disabled={disabled || undefined} />
      )}
    </div>
  )
}

/**
 * FormField names the group, not a labelable element. `<label for>` cannot target a
 * `role="group"` div, so the field is named by association, as TimeInput is.
 */
PhoneInput.controlKind = 'group' as const
