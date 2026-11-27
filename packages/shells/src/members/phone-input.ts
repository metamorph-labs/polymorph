import { cond, describeMember, el, flag, identity, lit, member, run } from '../dsl'
import { BROWSER_LANGUAGE, LANGUAGE, readBrowserLanguage } from '../date-field'

/** London, in Ofcom's range for fiction, as the React fixture has it. */
const LONDON = '+442079460958'

/** The props every entry shares: a pinned locale, so the names do not follow the browser. */
const PHONE = { locale: 'en-GB', 'aria-label': 'Phone' }

/**
 * PhoneInput (`design/components/phone-input.md`): a phone number, reported
 * as one E.164 string. The member is the Combobox member for the country and
 * the Input member for the national number, in one group, with the engine's
 * phone model between them, as React's is.
 *
 * The member holds the value it last committed (`kept`) while the caller does
 * not, the country the reader last chose, and the national text the reader is
 * editing (`draft`). It reports commits, never drafts: leaving the number or
 * pressing Enter in it, choosing a country, and a paste of a number written
 * with its calling code, which sets the country. Any other paste puts its
 * digits where the caret is. A value is drawn by the engine's `readPhone`,
 * and its country joins the list when the list lacks it.
 */
export default describeMember({
  member: 'PhoneInput',
  dir: 'controls',
  recipe: 'controls/phone-input',
  types: {
    PhoneInputMessages:
      '{ country?: string; showCountries?: string; countriesShown?: (count: number) => string; noCountry?: string }',
  },
  defaults: { size: lit('md'), disabled: 'false', readOnly: 'false', invalid: 'false' },
  state: {
    ...BROWSER_LANGUAGE,
    // The committed value while the caller does not hold it.
    kept: "defaultValue ?? ''",
    // The country of the empty value, and the one a shared calling code keeps.
    chosen:
      "readPhone(value ?? defaultValue ?? '', { country: phoneDefaultCountry(defaultCountry, countries), countries }).country",
    // The national text the reader is editing, until it commits.
    draft: 'null as string | null',
    // The text the reader typed in the country's field, and the country it was typed under.
    typed: 'null as { text: string; under: string } | null',
  },
  derived: {
    language: LANGUAGE,
    say: "{ country: 'Country calling code', showCountries: 'Show countries', countriesShown: (count: number) => (count === 1 ? '1 country' : `${count} countries`), noCountry: 'No matching country', ...messages }",
    current: 'value ?? kept',
    drawn: 'readPhone(current, { country: chosen, countries })',
    country: 'drawn.country',
    national: 'draft ?? drawn.national',
    options: 'phoneCountryOptions({ locale: language, countries, include: country })',
    countryLabel: "options.find((option) => option.value === country)?.label ?? ''",
    // The country's text: what the reader typed under this country, else its label. A country
    // the member or its caller sets shows its label at once, before the list filters by it.
    countryText: 'typed !== null && typed.under === country ? typed.text : countryLabel',
    countryId: '`${uid}-country`',
    // The country's own word, then the field's label, so two phone fields name their countries apart.
    countryLabelledby:
      'ariaLabelledby === undefined ? undefined : `${countryId} ${ariaLabelledby}`',
    // A number whose calling code the table lacks reports nothing and stays as it was typed.
    commit:
      "(next: string, text: string): void => { const result = commitPhone(next, text, { countries }); chosen = result.country; draft = result.value === '' && result.national !== '' ? result.national : null; if (result.value !== current) { kept = result.value; emit('change', result.value) } }",
    commitDraft: '(): void => { if (draft !== null) commit(country, draft) }',
    // A keystroke the draft drops leaves the field's text as it was, so the member writes the
    // draft back once the change has rendered.
    fitNumber:
      "(event: Event): void => { const field = event.target; if (field instanceof HTMLInputElement && field.type === 'tel') afterRender(() => { if (field.value !== national) field.value = national }) }",
    // The paste rule: the member inserts the text itself, so a pasted bracket never reaches the field.
    pasteInto:
      "(event: ClipboardEvent): void => { const field = event.target; if (readOnly || !(field instanceof HTMLInputElement) || field.type !== 'tel') return; const pasted = event.clipboardData?.getData('text/plain') ?? ''; event.preventDefault(); if (pasted.trimStart().startsWith('+')) { const result = commitPhone(country, pasted, { countries }); if (result.value === '') draft = result.national; else commit(country, pasted); return } const start = field.selectionStart ?? national.length; const end = field.selectionEnd ?? national.length; draft = phoneDraft(`${national.slice(0, start)}${pasted}${national.slice(end)}`, country) }",
  },
  effects: [
    readBrowserLanguage(),
    {
      watch: 'current',
      run: 'devWarning(current !== \'\' && !isPhoneValue(current), `PhoneInput: the value "${current}" is not an E.164 string. Pass +, the calling code and the national number, or the empty string.`)',
    },
    {
      watch: 'countries',
      run: "devWarning(countries !== undefined && phoneCountries(countries).length !== countries.length, 'PhoneInput: `countries` repeats a region or names one with no calling code. Each is listed once, and those are dropped.')",
    },
  ],
  statics: { controlKind: "'group'" },
  // The spec's `agent` fence. One phone field is one member: this one registers its group and
  // withholds the Combobox and the Input it draws. An agent's set commits through the member's
  // own `commit`, so the paste rule reads a number written with its calling code, and other
  // text is the national number under the shown country. It refuses text with no number in it,
  // and a read-only field refuses both actions.
  agent: {
    on: 'root',
    state: {
      value: 'current',
      country: 'country',
      disabled: 'disabled',
      invalid: 'invalid',
      readonly: 'readOnly',
    },
    actions: {
      set: {
        argument: 'text',
        run: `(() => {
          if (readOnly) throw new Error('The field is read-only.')
          if (commitPhone(country, value, { countries }).value === '') {
            throw new Error(\`"\${value}" is not a phone number the field can read.\`)
          }
          commit(country, value)
        })()`,
      },
      clear: `(() => {
        if (readOnly) throw new Error('The field is read-only.')
        commit(country, '')
      })()`,
    },
    withholds: 'root',
  },
  template: el(
    'div',
    {
      part: 'root',
      ref: 'root',
      class: ['root'],
      attrs: {
        role: lit('group'),
        'aria-label': 'ariaLabel',
        'aria-labelledby': 'ariaLabelledby',
        'aria-describedby': 'ariaDescribedby',
        'data-size': 'size',
        'data-disabled': flag('disabled'),
        'data-invalid': flag('invalid'),
        'data-readonly': flag('readOnly'),
        ...identity('PhoneInput'),
      },
    },
    [
      el('span', { part: 'country', class: ['country'] }, [
        cond(
          'readOnly',
          [
            // Combobox has no read-only state, so a read-only field shows its country as text.
            member('Input', {
              value: 'countryLabel',
              readOnly: 'true',
              size: 'size',
              invalid: 'invalid',
              disabled: 'disabled',
              id: 'countryId',
              'aria-label': 'say.country',
              'aria-labelledby': 'countryLabelledby',
              'aria-describedby': 'ariaDescribedby',
            }),
          ],
          [
            member(
              'Combobox',
              {
                options: 'options',
                value: 'country',
                inputValue: 'countryText',
                size: 'size',
                invalid: 'invalid',
                disabled: 'disabled',
                id: 'countryId',
                // The list of countries is named by the word that names their field.
                messages:
                  '{ showOptions: say.showCountries, options: say.countriesShown, list: say.country }',
                emptyMessage: 'say.noCountry',
                'aria-label': 'say.country',
                'aria-labelledby': 'countryLabelledby',
                'aria-describedby': 'ariaDescribedby',
              },
              // A cleared country text restores the chosen country.
              {
                on: {
                  change: run('$event !== null && commit($event, national)'),
                  inputChange: run('typed = { text: $event, under: country }'),
                },
              },
            ),
          ],
        ),
      ]),
      el(
        'span',
        {
          part: 'number',
          class: ['number'],
          on: {
            // The Enter that confirms an input method's candidate is the input method's.
            keydown: run('commitDraft()', "$event.key === 'Enter' && !composingKey($event)"),
            paste: run('pasteInto($event)'),
            input: run('fitNumber($event)'),
          },
        },
        [
          member(
            'Input',
            {
              type: lit('tel'),
              value: 'national',
              size: 'size',
              invalid: 'invalid',
              disabled: 'disabled',
              readOnly: 'readOnly',
              id: 'id',
              autoComplete: lit('tel-national'),
              'aria-label': 'ariaLabel',
              'aria-labelledby': 'ariaLabelledby',
              'aria-describedby': 'ariaDescribedby',
              'aria-required': 'ariaRequired',
            },
            {
              on: {
                change: run('draft = phoneDraft($event, country)'),
                blur: run('commitDraft()'),
              },
            },
          ),
        ],
      ),
      // The committed value under `name`, never the draft.
      cond('name !== undefined', [
        el('input', {
          attrs: {
            type: lit('hidden'),
            name: 'name',
            value: 'current',
            disabled: 'disabled || undefined',
          },
        }),
      ]),
    ],
  ),
  states: [
    {
      name: 'empty — the country before the reader chooses one',
      props: { defaultCountry: 'GB', ...PHONE },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'with value',
      props: { defaultValue: LONDON, ...PHONE },
      expect: { 'data-size': 'md' },
    },
    {
      name: 'shared code — Canada keeps +1',
      props: {
        defaultValue: '+14165550132',
        defaultCountry: 'CA',
        locale: 'en-CA',
        'aria-label': 'Phone',
      },
    },
    {
      name: 'countries — three regions, in the order given',
      props: { countries: ['GB', 'IE', 'FR'], defaultCountry: 'IE', ...PHONE },
    },
    {
      name: 'value outside the list — its country is listed first',
      props: { countries: ['GB', 'IE'], defaultValue: '+14155550132', ...PHONE },
    },
    {
      name: 'locale — the names in German',
      props: { defaultValue: LONDON, locale: 'de-DE', 'aria-label': 'Telefon' },
    },
    {
      name: 'sizes side by side',
      many: {
        within: { member: 'Inline', props: { gap: 3, wrap: true } },
        each: (['sm', 'md', 'lg'] as const).map((size) => ({
          props: { size, defaultValue: LONDON, locale: 'en-GB', 'aria-label': `Phone (${size})` },
        })),
      },
    },
    {
      name: 'size sm',
      props: { size: 'sm', defaultValue: LONDON, ...PHONE },
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      props: { size: 'lg', defaultValue: LONDON, ...PHONE },
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      props: { invalid: true, defaultValue: LONDON, ...PHONE },
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      props: { disabled: true, defaultValue: LONDON, ...PHONE },
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly — the country as read-only text',
      props: { readOnly: true, defaultValue: LONDON, ...PHONE },
      expect: { 'data-readonly': '' },
    },
    {
      name: 'in a form — the hidden input carries the value',
      props: { name: 'phone', defaultValue: LONDON, ...PHONE },
    },
  ],
})
