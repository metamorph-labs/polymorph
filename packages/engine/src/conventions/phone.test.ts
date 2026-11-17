import { describe, expect, it } from 'vitest'

import {
  commitPhone,
  isPhoneValue,
  PHONE_MAX_DIGITS,
  phoneCallingCode,
  phoneCountries,
  phoneCountryOptions,
  phoneDefaultCountry,
  phoneDraft,
  phoneNational,
  phoneValue,
  readPhone,
  splitPhone,
} from './phone'

/**
 * PhoneInput's model, which every framework's member calls: the table, the
 * paste rule, the trunk zero and the limit. The members' own tests cover the
 * field around it.
 */

describe('the table', () => {
  it('gives each region its calling code, case-insensitively', () => {
    expect(phoneCallingCode('GB')).toBe('44')
    expect(phoneCallingCode('us')).toBe('1')
    expect(phoneCallingCode('KZ')).toBe('7')
    expect(phoneCallingCode('AX')).toBe('358')
    expect(phoneCallingCode('XK')).toBe('383')
    expect(phoneCallingCode('ZZ')).toBeUndefined()
    expect(phoneCallingCode('AQ')).toBeUndefined()
  })

  it('lists each region once, and the regions of a list the table holds, in its order', () => {
    const all = phoneCountries()
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBeGreaterThan(240)
    expect(all.every((region) => /^[A-Z]{2}$/.test(region))).toBe(true)
    expect(phoneCountries(['de', 'GB', 'ZZ', 'DE'])).toEqual(['DE', 'GB'])
  })

  it('has calling codes no other code starts with, so a number matches at most one', () => {
    const codes = [...new Set(phoneCountries().map((region) => phoneCallingCode(region) ?? ''))]
    for (const code of codes) {
      expect(code).toMatch(/^[1-9]\d{0,2}$/)
      const longer = codes.filter((other) => other !== code && other.startsWith(code))
      expect(longer, `codes that start with +${code}`).toEqual([])
    }
  })

  it('names each region in the locale, after its calling code as a left-to-right isolate', () => {
    const options = phoneCountryOptions({ locale: 'en-US', countries: ['GB', 'DE'] })
    expect(options).toEqual([
      { value: 'GB', label: '⁦+44⁩ United Kingdom' },
      { value: 'DE', label: '⁦+49⁩ Germany' },
    ])
    expect(phoneCountryOptions({ locale: 'de-DE', countries: ['DE'] })[0]?.label).toBe(
      '⁦+49⁩ Deutschland',
    )
  })

  it('sorts every region by its name in the locale when no list is given', () => {
    const names = phoneCountryOptions({ locale: 'en-US' }).map((option) =>
      option.label.slice(option.label.indexOf(' ') + 1),
    )
    const sorted = [...names].sort(new Intl.Collator('en-US').compare)
    expect(names).toEqual(sorted)
    expect(names.length).toBe(phoneCountries().length)
  })

  it('lists a region the list lacks first, for a value the application holds', () => {
    const options = phoneCountryOptions({ locale: 'en-US', countries: ['GB'], include: 'us' })
    expect(options.map((option) => option.value)).toEqual(['US', 'GB'])
    expect(
      phoneCountryOptions({ countries: ['GB'], include: 'GB' }).map((option) => option.value),
    ).toEqual(['GB'])
  })
})

describe('the default country', () => {
  it('is defaultCountry, else the first of countries, else the United States', () => {
    expect(phoneDefaultCountry('gb')).toBe('GB')
    expect(phoneDefaultCountry(undefined, ['FR', 'DE'])).toBe('FR')
    expect(phoneDefaultCountry('ZZ', ['ZZ', 'DE'])).toBe('DE')
    expect(phoneDefaultCountry(undefined)).toBe('US')
  })
})

describe('the national number', () => {
  it('keeps digits only while the reader types', () => {
    expect(phoneDraft('(415) 555-0132', 'US')).toBe('4155550132')
    expect(phoneDraft('20 7946 0958', 'GB')).toBe('2079460958')
    expect(phoneDraft('abc', 'GB')).toBe('')
  })

  it('keeps a leading + while the reader types a number with its calling code', () => {
    expect(phoneDraft('+44 20', 'US')).toBe('+4420')
    expect(phoneDraft('  +1', 'US')).toBe('+1')
    expect(phoneDraft('1+44', 'US')).toBe('144')
  })

  it('drops one trunk zero where the country dials one, and in no other country', () => {
    expect(phoneNational('GB', '020 7946 0958')).toBe('2079460958')
    expect(phoneNational('DE', '030 1234567')).toBe('301234567')
    expect(phoneNational('AU', '0412 345 678')).toBe('412345678')
    // Italy's numbers keep their leading zero after the calling code.
    expect(phoneNational('IT', '06 6982 1234')).toBe('0669821234')
    expect(phoneNational('US', '0415')).toBe('0415')
    // One zero, not every leading zero.
    expect(phoneNational('GB', '00')).toBe('0')
  })

  it('stops at the E.164 limit, the calling code included', () => {
    const many = '9'.repeat(20)
    expect(phoneDraft(many, 'GB')).toHaveLength(PHONE_MAX_DIGITS - 2)
    expect(phoneDraft(many, 'US')).toHaveLength(PHONE_MAX_DIGITS - 1)
    expect(phoneDraft(many, 'AX')).toHaveLength(PHONE_MAX_DIGITS - 3)
    // A trunk zero is typed before the national number, so it has a digit of its own.
    expect(phoneDraft(`0${many}`, 'GB')).toHaveLength(PHONE_MAX_DIGITS - 1)
    expect(phoneDraft(`+${many}`, 'GB')).toBe(`+${'9'.repeat(PHONE_MAX_DIGITS)}`)
    expect(phoneNational('GB', many)).toHaveLength(PHONE_MAX_DIGITS - 2)
    expect(phoneValue('GB', many).replace('+', '')).toHaveLength(PHONE_MAX_DIGITS)
  })
})

describe('the value', () => {
  it('is +, the calling code and the national number', () => {
    expect(phoneValue('GB', '020 7946 0958')).toBe('+442079460958')
    expect(phoneValue('US', '(415) 555-0132')).toBe('+14155550132')
    expect(phoneValue('gb', '2079460958')).toBe('+442079460958')
  })

  it('is the empty string with no national digits, or under a region the table lacks', () => {
    expect(phoneValue('GB', '')).toBe('')
    expect(phoneValue('GB', '0')).toBe('')
    expect(phoneValue('ZZ', '2079460958')).toBe('')
  })

  it('is E.164 exactly when it is a +, a digit that is not zero, and at most fifteen digits', () => {
    expect(isPhoneValue('+442079460958')).toBe(true)
    expect(isPhoneValue(`+1${'2'.repeat(14)}`)).toBe(true)
    expect(isPhoneValue(`+1${'2'.repeat(15)}`)).toBe(false)
    expect(isPhoneValue('+44 20 7946 0958')).toBe(false)
    expect(isPhoneValue('4155550132')).toBe(false)
    expect(isPhoneValue('+0123')).toBe(false)
    expect(isPhoneValue('')).toBe(false)
  })
})

describe('the paste rule', () => {
  it('reads a number written with its calling code into a country and a national number', () => {
    expect(splitPhone('+44 20 7946 0958')).toEqual({ country: 'GB', national: '2079460958' })
    expect(splitPhone('+1 (415) 555-0132')).toEqual({ country: 'US', national: '4155550132' })
    expect(splitPhone('+49-30-1234567')).toEqual({ country: 'DE', national: '301234567' })
    expect(splitPhone('+358 40 1234567')).toEqual({ country: 'FI', national: '401234567' })
  })

  it('drops the bracketed trunk zero some numbers are written with', () => {
    expect(splitPhone('+44 (0)20 7946 0958')).toEqual({ country: 'GB', national: '2079460958' })
  })

  it('reads nothing from a number without +, or with a calling code the table lacks', () => {
    expect(splitPhone('(415) 555-0132')).toBeNull()
    expect(splitPhone('020 7946 0958')).toBeNull()
    expect(splitPhone('+999 123')).toBeNull()
    expect(splitPhone('+')).toBeNull()
  })

  it('keeps the country the field has when it dials the shared calling code', () => {
    expect(splitPhone('+1 604 555 0123', { country: 'CA' })?.country).toBe('CA')
    expect(splitPhone('+44 1534 123456', { country: 'je' })?.country).toBe('JE')
    expect(splitPhone('+7 727 123 4567', { country: 'KZ' })?.country).toBe('KZ')
  })

  it('takes the main region of a shared code when the field has another country', () => {
    expect(splitPhone('+1 604 555 0123', { country: 'GB' })?.country).toBe('US')
    expect(splitPhone('+44 20 7946 0958', { country: 'US' })?.country).toBe('GB')
    expect(splitPhone('+7 495 123 4567', { country: 'DE' })?.country).toBe('RU')
    expect(splitPhone('+39 06 6982 1234')).toEqual({ country: 'IT', national: '0669821234' })
  })

  it("takes the first of the field's countries with the code before the main region", () => {
    expect(
      splitPhone('+1 604 555 0123', { country: 'GB', countries: ['GB', 'CA', 'US'] })?.country,
    ).toBe('CA')
  })

  it('stops the national number at the limit', () => {
    expect(splitPhone(`+44${'9'.repeat(20)}`)?.national).toHaveLength(PHONE_MAX_DIGITS - 2)
  })
})

describe('reading a value', () => {
  it('draws an E.164 value as its country and national number', () => {
    expect(readPhone('+442079460958', { country: 'US' })).toEqual({
      country: 'GB',
      national: '2079460958',
    })
    expect(readPhone('+14165550132', { country: 'CA' })).toEqual({
      country: 'CA',
      national: '4165550132',
    })
  })

  it('draws the empty value as the country with no number', () => {
    expect(readPhone('', { country: 'DE' })).toEqual({ country: 'DE', national: '' })
  })

  it('draws a value that is not E.164 in the national field, under the country', () => {
    expect(readPhone('4155550132', { country: 'US' })).toEqual({
      country: 'US',
      national: '4155550132',
    })
    expect(readPhone('+999123', { country: 'US' })).toEqual({ country: 'US', national: '+999123' })
  })
})

describe('a commit', () => {
  it('reports the national number under the country', () => {
    expect(commitPhone('GB', '020 7946 0958')).toEqual({
      country: 'GB',
      national: '2079460958',
      value: '+442079460958',
    })
    expect(commitPhone('GB', '')).toEqual({ country: 'GB', national: '', value: '' })
  })

  it('splits a national text that starts with + by the paste rule', () => {
    expect(commitPhone('US', '+4420 7946 0958')).toEqual({
      country: 'GB',
      national: '2079460958',
      value: '+442079460958',
    })
    expect(commitPhone('CA', '+16045550123', { countries: ['US', 'CA'] }).country).toBe('CA')
  })

  it('keeps a number whose calling code the table lacks as typed, and reports nothing', () => {
    expect(commitPhone('US', '+999 123')).toEqual({ country: 'US', national: '+999123', value: '' })
  })
})
