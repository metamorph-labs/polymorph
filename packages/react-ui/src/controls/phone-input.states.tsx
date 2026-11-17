import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { PhoneInput } from './PhoneInput'

/**
 * States fixture, from `design/components/phone-input.md`'s States table.
 *
 * The numbers are in the ranges their regulators keep for fiction: Ofcom's 020 7946 0xxx in
 * London, and 555-01xx across the North American plan. The locale is pinned, so the country
 * names do not follow the browser running the gallery.
 */

const LONDON = '+442079460958'
const SAN_FRANCISCO = '+14155550132'
const TORONTO = '+14165550132'

export const states: ComponentStates = {
  component: 'PhoneInput',

  entries: [
    {
      name: 'empty — the country before the reader chooses one',
      render: () => <PhoneInput defaultCountry="GB" locale="en-GB" aria-label="Phone" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'with value',
      render: () => <PhoneInput defaultValue={LONDON} locale="en-GB" aria-label="Phone" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'shared code — Canada keeps +1',
      render: () => (
        <PhoneInput defaultValue={TORONTO} defaultCountry="CA" locale="en-CA" aria-label="Phone" />
      ),
    },
    {
      name: 'countries — three regions, in the order given',
      render: () => (
        <PhoneInput
          countries={['GB', 'IE', 'FR']}
          defaultCountry="IE"
          locale="en-GB"
          aria-label="Phone"
        />
      ),
    },
    {
      name: 'value outside the list — its country is listed first',
      render: () => (
        <PhoneInput
          countries={['GB', 'IE']}
          defaultValue={SAN_FRANCISCO}
          locale="en-GB"
          aria-label="Phone"
        />
      ),
    },
    {
      name: 'locale — the names in German',
      render: () => <PhoneInput defaultValue={LONDON} locale="de-DE" aria-label="Telefon" />,
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3} wrap>
          {CONTROL_SIZES.map((size) => (
            <PhoneInput
              key={size}
              size={size}
              defaultValue={LONDON}
              locale="en-GB"
              aria-label={`Phone (${size})`}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'size sm',
      render: () => (
        <PhoneInput size="sm" defaultValue={LONDON} locale="en-GB" aria-label="Phone" />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <PhoneInput size="lg" defaultValue={LONDON} locale="en-GB" aria-label="Phone" />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      render: () => <PhoneInput invalid defaultValue={LONDON} locale="en-GB" aria-label="Phone" />,
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => <PhoneInput disabled defaultValue={LONDON} locale="en-GB" aria-label="Phone" />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'readOnly — the country as read-only text',
      render: () => <PhoneInput readOnly defaultValue={LONDON} locale="en-GB" aria-label="Phone" />,
      expect: { 'data-readonly': '' },
    },
    {
      name: 'in a form — the hidden input carries the value',
      render: () => (
        <PhoneInput name="phone" defaultValue={LONDON} locale="en-GB" aria-label="Phone" />
      ),
    },
  ],

  // Every state is drawn by Combobox's and Input's recipes, which list their own selectors. This
  // recipe lays out the row and styles no state.
  requiredSelectors: [],
}
