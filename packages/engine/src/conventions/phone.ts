/**
 * PhoneInput's model (`design/components/phone-input.md`): the country calling
 * codes, an E.164 string read into a country and a national number and built
 * from them, and the rules for what the national field holds. Every
 * framework's PhoneInput calls these functions, so the table, the paste rule
 * and the limit are decided once.
 *
 * The table holds each region's calling code and nothing else about its
 * numbering: no lengths, no digit patterns and no formats. Whether a number
 * exists, and how long a number is in its country, is the application's to
 * check. The one other fact the table keeps is which regions dial a trunk
 * zero before a national number, so a number written the way it is dialed at
 * home ("020 7946 0958") becomes the E.164 number ("+442079460958").
 *
 * The lookups are built on first use, inside the functions, and the module has
 * no other top-level code. The engine declares no side effects, so a bundler
 * leaves this module out of an application that does not call it.
 */

/** E.164 allows fifteen digits in all, the calling code's included. */
export const PHONE_MAX_DIGITS = 15

/**
 * Each calling code, then the regions that dial it, by ISO 3166-1 alpha-2
 * code. The first region of a shared code is its main region: the region a
 * pasted number with that code takes when the field's country does not have
 * it. Regions with no telephone service of their own (Antarctica, Bouvet
 * Island, Heard Island, the French Southern Territories, South Georgia,
 * Pitcairn and the United States Minor Outlying Islands) are not listed.
 * Ascension (`AC`), Tristan da Cunha (`TA`) and Kosovo (`XK`) are listed with
 * the codes they dial, as `Intl.DisplayNames` names them.
 *
 * The codes are prefix-free, as E.164 assigns them: no code is the start of
 * another, so the digits after a `+` match at most one code.
 */
const CODES = `1 US CA AG AI AS BB BM BS DM DO GD GU JM KN KY LC MP MS PR SX TC TT VC VG VI
7 RU KZ
20 EG
211 SS
212 MA EH
213 DZ
216 TN
218 LY
220 GM
221 SN
222 MR
223 ML
224 GN
225 CI
226 BF
227 NE
228 TG
229 BJ
230 MU
231 LR
232 SL
233 GH
234 NG
235 TD
236 CF
237 CM
238 CV
239 ST
240 GQ
241 GA
242 CG
243 CD
244 AO
245 GW
246 IO
247 AC
248 SC
249 SD
250 RW
251 ET
252 SO
253 DJ
254 KE
255 TZ
256 UG
257 BI
258 MZ
260 ZM
261 MG
262 RE YT
263 ZW
264 NA
265 MW
266 LS
267 BW
268 SZ
269 KM
27 ZA
290 SH TA
291 ER
297 AW
298 FO
299 GL
30 GR
31 NL
32 BE
33 FR
34 ES
350 GI
351 PT
352 LU
353 IE
354 IS
355 AL
356 MT
357 CY
358 FI AX
359 BG
36 HU
370 LT
371 LV
372 EE
373 MD
374 AM
375 BY
376 AD
377 MC
378 SM
380 UA
381 RS
382 ME
383 XK
385 HR
386 SI
387 BA
389 MK
39 IT VA
40 RO
41 CH
420 CZ
421 SK
423 LI
43 AT
44 GB GG IM JE
45 DK
46 SE
47 NO SJ
48 PL
49 DE
500 FK
501 BZ
502 GT
503 SV
504 HN
505 NI
506 CR
507 PA
508 PM
509 HT
51 PE
52 MX
53 CU
54 AR
55 BR
56 CL
57 CO
58 VE
590 GP BL MF
591 BO
592 GY
593 EC
594 GF
595 PY
596 MQ
597 SR
598 UY
599 CW BQ
60 MY
61 AU CC CX
62 ID
63 PH
64 NZ
65 SG
66 TH
670 TL
672 NF
673 BN
674 NR
675 PG
676 TO
677 SB
678 VU
679 FJ
680 PW
681 WF
682 CK
683 NU
685 WS
686 KI
687 NC
688 TV
689 PF
690 TK
691 FM
692 MH
81 JP
82 KR
84 VN
850 KP
852 HK
853 MO
855 KH
856 LA
86 CN
880 BD
886 TW
90 TR
91 IN
92 PK
93 AF
94 LK
95 MM
960 MV
961 LB
962 JO
963 SY
964 IQ
965 KW
966 SA
967 YE
968 OM
970 PS
971 AE
972 IL
973 BH
974 QA
975 BT
976 MN
977 NP
98 IR
992 TJ
993 TM
994 AZ
995 GE
996 KG
998 UZ`

/**
 * The regions whose national numbers are dialed at home after a trunk zero,
 * which is not part of the E.164 number: "020 7946 0958" in the United
 * Kingdom is "+44 20 7946 0958". One leading zero is dropped from a national
 * number in these regions and in no other.
 *
 * The list is the regions known to dial a zero that no national number
 * begins with. A region missing from it keeps a typed zero, which the
 * application's own check then reports; a region listed wrongly would lose a
 * digit. So Italy, San Marino and the Vatican, whose numbers keep their
 * leading zero after the calling code, are not listed, nor are Côte d'Ivoire,
 * Gabon and the Republic of the Congo, nor Hungary, Russia, Kazakhstan and
 * the other regions whose trunk prefix is another digit.
 */
const TRUNK_ZERO = `AE AF AL AM AR AT AU AX AZ BA BD BE BG BL BO BR CC CH CN CU CX DE DZ EC EG EH
ET FI FR GB GE GF GG GH GP HR ID IE IL IM IN IQ IR JE JO JP KE KG KH KR LA LB LK LY MA MD ME
MF MG MK MM MQ MW MY NA NG NL NP NZ PE PH PK PS PY RE RO RS RW SA SD SE SI SK SS SY TH TR TW
TZ UA UG UY VE VN XK YE YT ZA ZM ZW`

interface PhoneTable {
  /** A region's calling code. */
  readonly code: ReadonlyMap<string, string>
  /** A calling code's regions, its main region first. */
  readonly regions: ReadonlyMap<string, readonly string[]>
  /** Every region, in the table's order. */
  readonly all: readonly string[]
  readonly trunkZero: ReadonlySet<string>
}

let table: PhoneTable | null = null

function phoneTable(): PhoneTable {
  if (table !== null) return table
  const code = new Map<string, string>()
  const regions = new Map<string, readonly string[]>()
  const all: string[] = []
  for (const line of CODES.split('\n')) {
    const [calling, ...listed] = line.split(' ')
    if (calling === undefined) continue
    regions.set(calling, listed)
    for (const region of listed) {
      code.set(region, calling)
      all.push(region)
    }
  }
  table = { code, regions, all, trunkZero: new Set(TRUNK_ZERO.split(/\s+/)) }
  return table
}

/** A country and the national number the field shows under it. */
export interface PhoneParts {
  /** ISO 3166-1 alpha-2, upper case. */
  readonly country: string
  /** Digits, or a `+` and digits while the field holds a number it could not split. */
  readonly national: string
}

/** Which country a number with a shared calling code takes. */
export interface PhonePreference {
  /** The country the field has now. A number with its calling code keeps it. */
  readonly country?: string
  /** PhoneInput's `countries`: the first of them with the calling code comes next. */
  readonly countries?: readonly string[]
}

/** The calling code a region dials, digits only (`'44'` for `GB`), or `undefined` for a region the table lacks. */
export function phoneCallingCode(country: string): string | undefined {
  return phoneTable().code.get(country.toUpperCase())
}

/**
 * The regions PhoneInput offers: every region in the table, or the regions of
 * `only` that the table holds, upper-cased, once each, in the order given.
 */
export function phoneCountries(only?: readonly string[]): string[] {
  const { code, all } = phoneTable()
  if (only === undefined) return [...all]
  const kept: string[] = []
  for (const region of only) {
    const upper = region.toUpperCase()
    if (code.has(upper) && !kept.includes(upper)) kept.push(upper)
  }
  return kept
}

/**
 * The country PhoneInput shows before the reader chooses one, when its value
 * names none: `defaultCountry`, else the first of `countries`, else the first
 * region of the table, the United States, which is the main region of `+1`.
 * A code the table lacks is passed over.
 */
export function phoneDefaultCountry(
  defaultCountry: string | undefined,
  countries?: readonly string[],
): string {
  const named = defaultCountry === undefined ? [] : [defaultCountry]
  return phoneCountries([...named, ...(countries ?? [])])[0] ?? phoneTable().all[0] ?? 'US'
}

/** Whether `value` is an E.164 string: `+`, a digit that is not zero, then one to fourteen more. */
export function isPhoneValue(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value)
}

const digitsOf = (text: string): string => text.replace(/\D/g, '')

/** How many national digits fit under `country` before the number passes the E.164 limit. */
function nationalRoom(country: string): number {
  return PHONE_MAX_DIGITS - (phoneCallingCode(country)?.length ?? 0)
}

/**
 * A national number as the value holds it: the digits of `text`, one leading
 * zero dropped where the country dials a trunk zero, and no more digits than
 * the E.164 limit leaves after the calling code.
 */
export function phoneNational(country: string, text: string): string {
  const digits = digitsOf(text)
  const bare =
    digits.startsWith('0') && phoneTable().trunkZero.has(country.toUpperCase())
      ? digits.slice(1)
      : digits
  return bare.slice(0, nationalRoom(country))
}

/**
 * What the national field holds after the reader types or deletes: digits
 * only, or a `+` and digits when the text starts with `+`, which is a number
 * written with its calling code. A typed space, dash or bracket is dropped.
 * The digits stop at the E.164 limit: fifteen after a `+`, and under a
 * country what the calling code leaves, with one more for a trunk zero.
 */
export function phoneDraft(text: string, country: string): string {
  const trimmed = text.trimStart()
  const digits = digitsOf(trimmed)
  if (trimmed.startsWith('+')) return `+${digits.slice(0, PHONE_MAX_DIGITS)}`
  const zero = digits.startsWith('0') && phoneTable().trunkZero.has(country.toUpperCase())
  return digits.slice(0, nationalRoom(country) + (zero ? 1 : 0))
}

/**
 * The E.164 string for a country and a national number: `+`, the calling
 * code, then the national number as `phoneNational` reads it. The empty
 * string when the national number has no digits or the country is not in the
 * table, which is how PhoneInput reports a number that is not complete.
 */
export function phoneValue(country: string, national: string): string {
  const calling = phoneCallingCode(country)
  const digits = phoneNational(country, national)
  if (calling === undefined || digits === '') return ''
  return `+${calling}${digits}`
}

/**
 * Reads a number written with its calling code (`+44 20 7946 0958`,
 * `+44 (0)20 7946 0958`, `+442079460958`) into a country and a national
 * number. This is the paste rule. The text must start with `+`; spaces,
 * dashes, dots and brackets between the digits are ignored. A calling code
 * that several regions share keeps `prefer.country` when it has that code,
 * else takes the first of `prefer.countries` that has it, else the code's main
 * region. The national number drops a trunk zero and stops at the limit, as
 * `phoneNational` does.
 *
 * `null` when the text does not start with `+`, or its digits start with no
 * calling code the table holds.
 */
export function splitPhone(text: string, prefer: PhonePreference = {}): PhoneParts | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('+')) return null
  const digits = digitsOf(trimmed)
  const { regions } = phoneTable()
  for (let length = 1; length <= 3; length += 1) {
    const calling = digits.slice(0, length)
    const sharing = regions.get(calling)
    if (sharing === undefined) continue
    const chosen = prefer.country?.toUpperCase()
    const listed = phoneCountries(prefer.countries ?? []).find((region) => sharing.includes(region))
    const country =
      chosen !== undefined && sharing.includes(chosen) ? chosen : (listed ?? sharing[0] ?? '')
    return { country, national: phoneNational(country, digits.slice(length)) }
  }
  return null
}

/**
 * What PhoneInput draws for a value: an E.164 string read by the paste rule,
 * the empty string as `country` with no number, and anything else in the
 * national field as `phoneDraft` keeps it, under `country`. A value that is
 * not E.164 is the application's mistake, which the member warns about; it is
 * still drawn, so the reader sees what the application holds.
 */
export function readPhone(
  value: string,
  prefer: PhonePreference & { country: string },
): PhoneParts {
  if (value === '') return { country: prefer.country, national: '' }
  return (
    splitPhone(value, prefer) ?? {
      country: prefer.country,
      national: phoneDraft(value, prefer.country),
    }
  )
}

/** What a commit leaves in the field, and the value it reports. */
export interface PhoneCommit extends PhoneParts {
  /** The E.164 string, or the empty string while the number is not complete. */
  readonly value: string
}

/**
 * What the reader's commit (leaving the number, pressing Enter, choosing a
 * country) makes of the field. A national text that starts with `+` is split
 * by the paste rule; one whose calling code the table lacks stays as it was
 * typed and reports the empty string. Any other text is the national number
 * under `country`.
 */
export function commitPhone(
  country: string,
  national: string,
  prefer: Omit<PhonePreference, 'country'> = {},
): PhoneCommit {
  if (national.trimStart().startsWith('+')) {
    const parts = splitPhone(national, { ...prefer, country })
    if (parts === null) return { country, national: phoneDraft(national, country), value: '' }
    return { ...parts, value: phoneValue(parts.country, parts.national) }
  }
  const digits = phoneNational(country, national)
  return { country, national: digits, value: phoneValue(country, digits) }
}

/** One entry of PhoneInput's country list. */
export interface PhoneCountryOption {
  /** ISO 3166-1 alpha-2. */
  readonly value: string
  /**
   * The calling code, then the region's name in the locale: `+44 United
   * Kingdom`. The code is a left-to-right isolate, so it reads `+44` in a
   * right-to-left page, where a `+` before digits would otherwise move to
   * their other side.
   */
  readonly label: string
}

/** What `phoneCountryOptions` lists. */
export interface PhoneCountryListing {
  /** The language of the names, for `Intl.DisplayNames` and the sort. */
  readonly locale?: string
  /** PhoneInput's `countries`: these regions, in this order. Every region, sorted by name, when absent. */
  readonly countries?: readonly string[]
  /** A region listed first when the list lacks it: the country of a value the application holds. */
  readonly include?: string
}

/** The left-to-right isolate a calling code is written in, and the character that ends it. */
const LTR_ISOLATE = '⁦'
const POP_ISOLATE = '⁩'

/**
 * PhoneInput's country list: each region's calling code and its name in
 * `locale`, by `Intl.DisplayNames`, so the member writes no name itself. The
 * list follows `countries` when it is given, and is every region sorted by
 * name in the locale otherwise.
 */
export function phoneCountryOptions(listing: PhoneCountryListing = {}): PhoneCountryOption[] {
  const regions = phoneCountries(listing.countries)
  const include = listing.include?.toUpperCase()
  if (
    include !== undefined &&
    phoneCallingCode(include) !== undefined &&
    !regions.includes(include)
  ) {
    regions.unshift(include)
  }
  const names = new Intl.DisplayNames(listing.locale, { type: 'region', fallback: 'code' })
  const options = regions.map((region) => ({
    value: region,
    name: names.of(region) ?? region,
    label: `${LTR_ISOLATE}+${phoneCallingCode(region) ?? ''}${POP_ISOLATE} ${names.of(region) ?? region}`,
  }))
  if (listing.countries === undefined) {
    const collator = new Intl.Collator(listing.locale)
    options.sort((a, b) => collator.compare(a.name, b.name))
  }
  return options.map(({ value, label }) => ({ value, label }))
}
