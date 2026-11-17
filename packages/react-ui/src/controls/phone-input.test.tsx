import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { phoneInputLaw, type PhoneInputLawProps } from '@polymorph/conformance/phone-input'
import { createAgentBridge } from '@polymorph/engine/agent'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { FormField } from './FormField'
import { PhoneInput, type PhoneInputProps } from './PhoneInput'

/**
 * What a browser settles for PhoneInput: how FormField names and describes the group and its
 * two controls, the form's autofill tokens, the number's direction in a right-to-left page, and
 * the row's layout. What the member reports (typing, the commit, a country chosen, the paste
 * rule, the shared calling codes, the controlled value and the limit) is the law's
 * (`@polymorph/conformance/phone-input`), which this file calls for React.
 */

beforeAll(installTestTheme)

afterEach(() => {
  document.documentElement.removeAttribute('dir')
})

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<PhoneInputProps>(true)
  })
})

/** The field in a component that holds its value, as the application around it does. */
function Held({
  props,
  onChange,
  expose,
}: {
  props: PhoneInputLawProps
  onChange: (value: string) => void
  expose: (set: (value: string) => void) => void
}) {
  const [value, setValue] = useState(props.value)
  expose(setValue)
  return <PhoneInput {...props} value={value} onChange={onChange} />
}

phoneInputLaw({
  shell: 'React',
  async mount({ props, onChange }) {
    let set: (value: string) => void = () => {}
    render(<Held props={props} onChange={onChange} expose={(setter) => (set = setter)} />)
    return { set: (value) => set(value) }
  },
})

describe('PhoneInput in a FormField', () => {
  it('is one group named by the label, with both controls described and named apart', () => {
    render(
      <FormField label="Mobile" description="We text a code to it" required>
        <PhoneInput defaultCountry="GB" locale="en-GB" />
      </FormField>,
    )
    const group = screen.getByRole('group', { name: 'Mobile' })
    const description = screen.getByText('We text a code to it')
    const number = screen.getByRole('textbox', { name: 'Mobile' })
    const country = screen.getByRole('combobox', { name: 'Country calling code Mobile' })

    for (const part of [group, number, country]) {
      expect(part.getAttribute('aria-describedby')).toContain(description.id)
    }
    expect(number.getAttribute('aria-required')).toBe('true')
    expect(group.contains(number) && group.contains(country)).toBe(true)
  })

  it('takes the error from FormField on both controls', () => {
    render(
      <FormField label="Mobile" error="Enter a mobile number">
        <PhoneInput defaultCountry="GB" locale="en-GB" />
      </FormField>,
    )
    const error = screen.getByText('Enter a mobile number')
    for (const part of [screen.getByRole('textbox'), screen.getByRole('combobox')]) {
      expect(part.getAttribute('aria-invalid')).toBe('true')
      expect(part.getAttribute('aria-describedby')).toContain(error.id)
    }
  })

  it('puts the id on the number, so a link to the field reaches a control that takes focus', () => {
    render(
      <FormField label="Mobile" id="mobile">
        <PhoneInput defaultCountry="GB" locale="en-GB" />
      </FormField>,
    )
    const number = document.getElementById('mobile')
    expect(number?.getAttribute('type')).toBe('tel')
  })
})

describe('PhoneInput — the form and the page', () => {
  it('asks autofill for the national number and nothing for the country', () => {
    render(<PhoneInput defaultCountry="GB" aria-label="Phone" />)
    expect(screen.getByRole('textbox').getAttribute('autocomplete')).toBe('tel-national')
    expect(screen.getByRole('combobox').getAttribute('autocomplete')).toBe('off')
  })

  it('reads the number left to right in a right-to-left page, with no dir attribute', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    render(<PhoneInput defaultValue="+442079460958" locale="en-GB" aria-label="Phone" />)
    const number = screen.getByRole('textbox')
    expect(getComputedStyle(number).direction).toBe('ltr')
    expect(document.querySelector('[dir="ltr"]')).toBeNull()
    // The row mirrors: the country is at the inline start, which is the right.
    const country = screen.getByRole('combobox')
    expect(country.getBoundingClientRect().left).toBeGreaterThan(
      number.getBoundingClientRect().left,
    )
  })

  it('writes the calling code as a left-to-right isolate in the country text', () => {
    render(<PhoneInput defaultValue="+442079460958" locale="en-GB" aria-label="Phone" />)
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('⁦+44⁩ United Kingdom')
  })

  it('gives the number the rest of the row', () => {
    render(
      <div style={{ inlineSize: '600px' }}>
        <PhoneInput defaultValue="+442079460958" locale="en-GB" aria-label="Phone" />
      </div>,
    )
    const root = document.querySelector<HTMLElement>('[data-member="phone-input"]') as HTMLElement
    const [country, number] = [...root.children] as HTMLElement[]
    const width = root.getBoundingClientRect().width
    expect(width).toBe(600)
    expect(number?.getBoundingClientRect().width).toBeGreaterThan(
      country?.getBoundingClientRect().width ?? Infinity,
    )
  })

  it('shows the country as read-only text when the field is read-only', () => {
    render(<PhoneInput readOnly defaultValue="+442079460958" locale="en-GB" aria-label="Phone" />)
    expect(screen.queryByRole('combobox')).toBeNull()
    const country = screen.getByRole('textbox', { name: 'Country calling code' })
    expect((country as HTMLInputElement).readOnly).toBe(true)
    expect((country as HTMLInputElement).value).toContain('United Kingdom')
  })
})

/**
 * An agent sees one PhoneInput where a person sees one phone field, and sets and clears its
 * number through the member's own commit, as the spec's `agent` fence declares
 * (`design/components/phone-input.md`, Agent).
 */
describe('an agent', () => {
  it('sets a number with its calling code or under the shown country, and clears it', async () => {
    const bridge = createAgentBridge()
    try {
      const changes: string[] = []
      render(
        <PhoneInput
          defaultCountry="GB"
          locale="en-GB"
          onChange={(value) => changes.push(value)}
          aria-label="Phone"
        />,
      )
      const members = bridge.snapshot().members
      expect(members.map((member) => [member.member, member.name])).toEqual([
        ['PhoneInput', 'Phone'],
      ])
      const id = members[0]?.id
      expect(members[0]?.state).toMatchObject({ value: '', country: 'GB', readonly: false })
      const { results } = await bridge.act([
        { id, action: 'set', value: '+1 (415) 555-0132' },
        { id, action: 'set', value: '416 555 0132' },
        { id, action: 'clear' },
      ])
      expect(results).toMatchObject([
        {
          ok: true,
          changed: { value: { from: '', to: '+14155550132' }, country: { from: 'GB', to: 'US' } },
        },
        { ok: true, changed: { value: { from: '+14155550132', to: '+14165550132' } } },
        { ok: true, changed: { value: { from: '+14165550132', to: '' } } },
      ])
      expect(changes).toEqual(['+14155550132', '+14165550132', ''])
      expect(bridge.snapshot().members[0]?.state['country']).toBe('US')
    } finally {
      bridge.dispose()
    }
  })

  it('reports through a controlled caller, and refuses text it cannot read and a read-only field', async () => {
    const bridge = createAgentBridge()
    try {
      function Held() {
        const [value, setValue] = useState('+442079460958')
        return <PhoneInput value={value} onChange={setValue} locale="en-GB" aria-label="Held" />
      }
      render(
        <>
          <Held />
          <PhoneInput readOnly defaultValue="+442079460958" locale="en-GB" aria-label="Fixed" />
        </>,
      )
      const [held, fixed] = bridge.snapshot().members
      const moved = await bridge.act([{ id: held?.id, action: 'set', value: '020 7946 0959' }])
      expect(moved.results[0]).toMatchObject({
        ok: true,
        changed: { value: { from: '+442079460958', to: '+442079460959' } },
      })
      for (const [id, step, words] of [
        [held?.id, { action: 'set', value: 'call me' }, 'not a phone number'],
        [held?.id, { action: 'set', value: '+999 123' }, 'not a phone number'],
        [fixed?.id, { action: 'set', value: '+14155550132' }, 'read-only'],
        [fixed?.id, { action: 'clear' }, 'read-only'],
      ] as const) {
        const { results } = await bridge.act([{ id, ...step }])
        expect(results[0]).toMatchObject({
          ok: false,
          error: { code: 'failed', message: expect.stringContaining(words) },
        })
      }
      expect(bridge.snapshot().members.map((member) => member.state['value'])).toEqual([
        '+442079460959',
        '+442079460958',
      ])
    } finally {
      bridge.dispose()
    }
  })
})
