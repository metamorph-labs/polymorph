/**
 * PhoneInput's calling codes for the native members (`design/components/phone-input.md`), read
 * from the engine's table (`packages/engine/src/conventions/phone.ts`) through its own lookups,
 * so a SwiftUI or Compose member offers the regions, the codes and the trunk zero the web's
 * offers. `pnpm native:contracts` writes them into `Phones.swift` and `Phones.kt`, and its
 * freshness law fails when the engine's table changes and they do not.
 *
 * The engine keeps the table inside its module and answers questions about it, so the table is
 * read back by asking: every region in the table's order (`phoneCountries`), each region's
 * calling code (`phoneCallingCode`), and whether a region's national number loses a leading zero
 * (`phoneNational`).
 */

import { phoneCallingCode, phoneCountries, phoneNational } from '../../engine/src/conventions/phone'

/** One calling code and the regions that dial it, its main region first. */
export interface PhoneCode {
  /** Digits only: `44`. */
  readonly code: string
  /** ISO 3166-1 alpha-2, upper case, in the engine's order. */
  readonly regions: readonly string[]
}

/**
 * The engine's calling codes, in its table's order: each code once, with the regions that dial
 * it in the order the table lists them, so a shared code's main region comes first (the United
 * States for `+1`). The table lists a code's regions together, so they are read in one run.
 */
export function phoneCodes(): PhoneCode[] {
  const codes = new Map<string, string[]>()
  for (const region of phoneCountries()) {
    const code = phoneCallingCode(region)
    if (code === undefined) continue
    codes.set(code, [...(codes.get(code) ?? []), region])
  }
  return [...codes].map(([code, regions]) => ({ code, regions }))
}

/**
 * The regions that dial a trunk zero before a national number: those whose national number the
 * engine reads `01` as `1`, dropping the zero.
 */
export function phoneTrunkZero(): string[] {
  return phoneCountries().filter((region) => phoneNational(region, '01') === '1')
}

/**
 * `items` as lines of at most `width` characters after `indent`, each item followed by `, `
 * except the last on its line, which takes `,`.
 */
export function wrapList(items: readonly string[], indent: string, width = 100): string[] {
  const lines: string[] = []
  let line = ''
  for (const item of items) {
    const next = line === '' ? `${item},` : `${line} ${item},`
    if (`${indent}${next}`.length > width && line !== '') {
      lines.push(`${indent}${line}`)
      line = `${item},`
    } else {
      line = next
    }
  }
  if (line !== '') lines.push(`${indent}${line}`)
  return lines
}
