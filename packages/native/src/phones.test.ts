import { describe, expect, it } from 'vitest'

import { phoneCallingCode, phoneCountries } from '../../engine/src/conventions/phone'
import { swiftPhonesSource } from './contracts'
import { kotlinPhonesSource } from './kotlin'
import { phoneCodes, phoneTrunkZero, wrapList } from './phones'

/**
 * PhoneInput's calling codes as the native members read them (`Phones.swift`, `Phones.kt`):
 * the engine's table, read back through its own lookups. The freshness law in
 * `contracts.test.ts` and `kotlin.test.ts` holds the files on disk to what these write.
 */
describe('the calling codes the native members read', () => {
  it('hold every region the engine offers, once, under its calling code, in its order', () => {
    const codes = phoneCodes()
    expect(codes.flatMap((entry) => entry.regions)).toEqual(phoneCountries())
    expect(new Set(codes.map((entry) => entry.code)).size).toBe(codes.length)
    for (const { code, regions } of codes) {
      for (const region of regions) expect(phoneCallingCode(region)).toBe(code)
    }
  })

  it('put a shared code’s main region first', () => {
    const regions = (code: string) => phoneCodes().find((entry) => entry.code === code)?.regions
    expect(regions('1')?.[0]).toBe('US')
    expect(regions('44')).toEqual(['GB', 'GG', 'IM', 'JE'])
    expect(regions('7')).toEqual(['RU', 'KZ'])
  })

  it('list the regions that dial a trunk zero, and not those whose numbers keep it', () => {
    const trunk = phoneTrunkZero()
    expect(trunk).toEqual(expect.arrayContaining(['GB', 'DE', 'AU', 'FR', 'JP']))
    for (const region of ['IT', 'SM', 'VA', 'US', 'RU', 'HU', 'CI']) {
      expect(trunk).not.toContain(region)
    }
  })

  it('are written whole into Phones.swift and Phones.kt', () => {
    const swift = swiftPhonesSource()
    const kotlin = kotlinPhonesSource()
    expect(swift).toContain('extension PMPhones {')
    expect(swift).toMatch(/\("44", \[\n\s+"GB", "GG", "IM", "JE",\n\s+\]\),/)
    expect(kotlin).toContain(
      'internal val PMPhoneCodes: List<Pair<String, List<String>>> = listOf(',
    )
    expect(kotlin).toMatch(/"44" to listOf\(\n\s+"GB", "GG", "IM", "JE",\n\s+\),/)
    for (const region of phoneCountries()) {
      expect(swift).toContain(`"${region}"`)
      expect(kotlin).toContain(`"${region}"`)
    }
    for (const file of [swift, kotlin]) {
      for (const line of file.split('\n')) expect(line.length).toBeLessThanOrEqual(100)
    }
  })

  it('wraps a list at its width, a comma after each item', () => {
    expect(wrapList(['"A"', '"B"', '"C"'], '  ', 12)).toEqual(['  "A", "B",', '  "C",'])
  })
})
