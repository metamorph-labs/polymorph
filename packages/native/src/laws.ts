import { argumentsAt, expressionAfter, lex, lineOf, type Lexed } from './swift-source'

/**
 * The laws a SwiftUI member is held to, over its source text. Each returns
 * every violation it finds as a sentence naming the file and line;
 * `laws.test.ts` runs them over `platforms/ios/Sources/PolymorphUI` and
 * proves each one on a fault.
 *
 * - **Token-only.** A member expresses every design value through the theme
 *   (`theme.…`): no colour built from channels, a hex code or a platform colour,
 *   no named system colour, no system font, no number written into a length,
 *   and no number multiplying a theme length (`space.s10 * 4`), which is a
 *   recipe's number and comes from `PMRecipe`.
 * - **No hand-typed measures.** No file initialises a `CGFloat`, `Double` or
 *   `Float` constant with a number (`static let narrow: CGFloat = 11`,
 *   `static let ratio = 0.58`): a recipe's number, and a number the chart
 *   engine writes, is generated into `PMRecipe` from
 *   `packages/native/src/recipes.ts`. The foundation's geometry, a spec's
 *   default and a fixture's device sizes are the exceptions, each in a type
 *   `FOUNDATION_CONSTANTS` names (`staticNumberViolations`).
 * - **No literal strings.** Text a person reads comes from props, so it passes
 *   through the app's localisation; a literal in `Text`, a label, a title, a
 *   hint, a field's or a picker's title, an announcement, a named action or a
 *   `String(localized:)` is a hole in that seam. Interpolations of
 *   props and punctuation are allowed; a default the spec names is
 *   `PMStrings`'s, generated from `packages/native/src/strings.ts`.
 * - **Containment.** A member imports SwiftUI, Foundation and PolymorphTokens;
 *   Charts only in a chart member and the charts' foundation file; UIKit or AppKit only behind
 *   `#if canImport(…)`. It draws icons only through `PMIconView`.
 * - **Conformance.** Each member file declares `PM<Member>`, conforming to the
 *   generated `PM<Member>Rendering`, and `<Member>States`, conforming to
 *   `PMStates` for that member (`conformanceViolations`). The foundation,
 *   `PolymorphUI.swift`, and its further files, `PolymorphUI+<Topic>.swift`,
 *   are no member's and are not passed to it.
 * - **No shadowing.** No type `PolymorphUI` declares has the name of one
 *   `PolymorphTokens` declares. Inside `PolymorphUI` the local type silently
 *   wins; in an app that imports both, the name is ambiguous and stops compiling.
 */

export interface SwiftFile {
  /** Path relative to `Sources/PolymorphUI`, such as `Badge.swift`. */
  path: string
  source: string
}

const at = (file: SwiftFile, offset: number) => `${file.path}:${lineOf(file.source, offset)}`

/* -------------------------------------------------------------------------- */
/* Token-only                                                                 */
/* -------------------------------------------------------------------------- */

/** Constructors that make a colour from something other than a theme role. */
const RAW_COLOURS = [
  /\bColor\s*\(\s*(?:red|hue|white|hex)\s*:/g,
  /\bColor\s*\(\s*\.(?:sRGB|sRGBLinear|displayP3)\b/g,
  /\bColor\s*\(\s*(?:uiColor|nsColor|cgColor)\s*:/g,
  /\.init\s*\(\s*(?:red|hue|white|hex)\s*:/g,
  /\b(?:UIColor|NSColor|CGColor)\s*\(/g,
  /\b(?:UIColor|NSColor)\s*\.\s*(?:system\w+|label|secondaryLabel|red|blue|green|black|white|gray)\b/g,
]

const NAMED_COLOURS =
  'red|orange|yellow|green|mint|teal|cyan|blue|indigo|purple|pink|brown|white|gray|black|primary|secondary|accentColor'

/** A named SwiftUI colour, as `Color.red`, or as `.red` handed to a modifier that takes a colour. */
const NAMED_COLOUR_USES = [
  new RegExp(`\\bColor\\s*\\.\\s*(?:${NAMED_COLOURS})\\b`, 'g'),
  new RegExp(
    `\\.(?:foregroundStyle|foregroundColor|background|tint|fill|stroke|strokeBorder|border|shadow|overlay)\\s*\\(\\s*\\.(?:${NAMED_COLOURS}|tertiary|quaternary)\\b`,
    'g',
  ),
]

/** Calls whose arguments are lengths, radii or type sizes: no number may be written there. */
const LENGTH_CALLS = [
  'padding',
  'frame',
  'cornerRadius',
  'shadow',
  'offset',
  'lineSpacing',
  'tracking',
  'kerning',
  'font',
  'blur',
]

/** Labels whose value is a length wherever they appear: `HStack(spacing:)`, `.rect(cornerRadius:)`. */
const LENGTH_LABELS = ['spacing', 'cornerRadius', 'radius', 'size', 'minLength']

/** A numeric literal not part of a name (`s4`) or a member access (`.5` in `x.5`). */
const NUMBER = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g

/** The one number a length may be: none at all. */
const ALLOWED_NUMBERS = new Set(['0'])

/**
 * A number multiplying a theme length, on either side: `space.s10 * 4`,
 * `2 * space.s1`, `theme.radius.lg * 2`. The first group is the number.
 */
const THEME_LENGTH = String.raw`\b(?:space|theme|density)\.[A-Za-z_]`
const MULTIPLIED_LENGTHS = [
  new RegExp(
    String.raw`${THEME_LENGTH}[\w.]*(?:\[[^\]\n]*\])?\s*\*\s*(\d+(?:\.\d+)?)(?![\w.])`,
    'g',
  ),
  new RegExp(String.raw`(?<![\w.])(\d+(?:\.\d+)?)\s*\*\s*[\w.]*?${THEME_LENGTH}`, 'g'),
]

/** SwiftUI's own type styles and font constructors: type decisions the theme did not make. */
const SYSTEM_FONTS =
  /\.font\s*\(\s*(?:Font\s*)?\.(?:system|custom|largeTitle|title|title2|title3|headline|subheadline|body|callout|footnote|caption|caption2)\b/g

export function tokenViolations(file: SwiftFile, lexed: Lexed = lex(file.source)): string[] {
  const { code, strings } = lexed
  // Offset → sentence, so a number inside both a length call and a length
  // label (`.font(.system(size: 13))`) is reported once, and in source order.
  const found = new Map<number, string>()
  const report = (offset: number, message: string) => {
    if (!found.has(offset)) found.set(offset, `${at(file, offset)}: ${message}`)
  }

  for (const pattern of RAW_COLOURS) {
    for (const match of code.matchAll(pattern)) {
      report(
        match.index,
        `\`${match[0].trim()}\` is a colour the theme did not decide — read a role from \`theme.colors\``,
      )
    }
  }
  for (const pattern of NAMED_COLOUR_USES) {
    for (const match of code.matchAll(pattern)) {
      report(
        match.index,
        `\`${match[0].trim()}\` is a system colour — read a role from \`theme.colors\``,
      )
    }
  }
  for (const match of code.matchAll(/\b0x[0-9A-Fa-f]+\b/g)) {
    report(match.index, `the hex literal \`${match[0]}\` — read the value from \`theme\``)
  }
  for (const literal of strings) {
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(literal.text)) {
      report(literal.start, `the hex colour "${literal.text}" — read a role from \`theme.colors\``)
    }
  }
  for (const match of code.matchAll(SYSTEM_FONTS)) {
    report(
      match.index,
      `\`${match[0].replace(/\s+/g, '')}\` is a system type style — use \`.pmTextStyle(theme.text.…)\``,
    )
  }

  const numbersIn = (start: number, text: string, where: string) => {
    for (const number of text.matchAll(NUMBER)) {
      if (ALLOWED_NUMBERS.has(number[0])) continue
      report(
        start + number.index,
        `the number ${number[0]} in ${where} — a length comes from \`theme\``,
      )
    }
  }
  for (const call of LENGTH_CALLS) {
    for (const match of code.matchAll(new RegExp(`\\.${call}\\s*\\(`, 'g'))) {
      const open = match.index + match[0].length - 1
      numbersIn(open + 1, argumentsAt(code, open), `\`.${call}(…)\``)
    }
  }
  for (const label of LENGTH_LABELS) {
    for (const match of code.matchAll(new RegExp(`\\b${label}\\s*:`, 'g'))) {
      const from = match.index + match[0].length
      numbersIn(from, expressionAfter(code, from), `\`${label}:\``)
    }
  }
  for (const pattern of MULTIPLIED_LENGTHS) {
    for (const match of code.matchAll(pattern)) {
      const number = match[1] as string
      if (ALLOWED_NUMBERS.has(number)) continue
      // The number's own offset, so a number a length call also reads is reported once.
      const at = match[0].startsWith(number) ? 0 : match[0].lastIndexOf(number)
      report(
        match.index + at,
        `the number ${number} multiplies a theme length — a recipe’s multiple of a token is ` +
          '`PMRecipe`’s (packages/native/src/recipes.ts)',
      )
    }
  }

  return [...found.entries()].sort(([a], [b]) => a - b).map(([, message]) => message)
}

/* -------------------------------------------------------------------------- */
/* No hand-typed measures                                                     */
/* -------------------------------------------------------------------------- */

/** A static constant's declaration, its type when it names one, up to its `=`. */
const STATIC_CONSTANT = /\bstatic\s+(?:let|var)\s+(\w+)\s*(?::\s*(\w+)\s*)?=(?!=)/g

/** The types of a measure: a length, a ratio, a scale. */
const MEASURE_TYPES = new Set(['CGFloat', 'Double', 'Float'])

/** A literal Swift infers as a `Double`: it has a fraction. */
const DECIMAL = /(?<![\w.])\d+\.\d+(?![\w.])/

/**
 * The types whose numbers are the foundation's own, so `staticNumberViolations`
 * passes them by name: lengths that are geometry rather than a design decision
 * (a rem, the hairline, an icon's clear margin), the defaults a spec names that
 * are values (a toast's lifetime), and the sizes of the devices and boxes a
 * states fixture lays a member out in. No recipe and no engine source holds
 * any of them.
 */
export const FOUNDATION_CONSTANTS: readonly string[] = [
  'PMGeometry',
  'PMSpecDefault',
  'PMFixtureWindow',
  'PMFixtureSpan',
]

/** A type's declaration up to the brace that opens its body; the first group is its name. */
const TYPE_DECLARATION = /\b(?:struct|enum|class|actor|extension)\s+([A-Za-z_]\w*)[^{;=]*\{/g

/**
 * The innermost type whose body holds `offset` in `code`, by name: a `struct`,
 * an `enum`, a `class`, an `actor` or an `extension`, or `undefined` at the
 * top level.
 */
function enclosingType(code: string, offset: number): string | undefined {
  let found: { name: string; open: number } | undefined
  for (const match of code.matchAll(TYPE_DECLARATION)) {
    const open = match.index + match[0].length - 1
    if (open >= offset) break
    let depth = 0
    let close = open
    for (; close < code.length; close += 1) {
      if (code[close] === '{') depth += 1
      else if (code[close] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (offset < close && (found === undefined || open > found.open)) {
      found = { name: match[1] as string, open }
    }
  }
  return found?.name
}

/**
 * A `static let` or `static var` that a number initialises as a measure:
 * typed `CGFloat`, `Double` or `Float` with a number other than 0 in its
 * value, or untyped with a decimal literal, which Swift infers as a `Double`.
 * Each such constant is a copy of a decision made elsewhere, so it goes stale
 * when the recipe, the engine or the spec changes. A constant declared in a
 * type `exempt` names is passed: the foundation's files are read with
 * `FOUNDATION_CONSTANTS`, and a member file with none.
 */
export function staticNumberViolations(
  file: SwiftFile,
  lexed: Lexed = lex(file.source),
  exempt: readonly string[] = [],
): string[] {
  const { code } = lexed
  const found: string[] = []
  for (const match of code.matchAll(STATIC_CONSTANT)) {
    const [, name, type] = match as unknown as [string, string, string | undefined]
    const from = match.index + match[0].length
    const value = expressionAfter(code, from)
    const numbers = [...value.matchAll(NUMBER)].filter((number) => !ALLOWED_NUMBERS.has(number[0]))
    const measure =
      type === undefined ? DECIMAL.test(value) : MEASURE_TYPES.has(type) && numbers.length > 0
    if (!measure) continue
    const owner = enclosingType(code, match.index)
    if (owner !== undefined && exempt.includes(owner)) continue
    found.push(
      `${at(file, match.index)}: \`static let ${name}\` is initialised with ${numbers[0]?.[0] ?? 'a number'} — ` +
        'a recipe’s number is `PMRecipe`’s (packages/native/src/recipes.ts), a spec’s default ' +
        '`PMSpecDefault`’s, and geometry or a fixture’s device size the foundation’s',
    )
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* No literal strings                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Calls whose first argument is text a person reads or hears: a view's text,
 * a control's title (a field's, a picker's, which VoiceOver speaks), an
 * announcement, and a named accessibility action. `String(localized:)` and
 * `LocalizedStringResource` are on the list too: a member that looks a literal
 * up in a string catalog still decides its words, so the default a spec names
 * is `PMStrings`'s, generated from `packages/native/src/strings.ts`, which
 * holds each to the sentence of the spec that names it.
 */
const TEXT_CALLS = [
  /\bString\s*\(\s*localized\s*:/g,
  /\bLocalizedStringResource\s*\(/g,
  /\bText\s*\(/g,
  /\bLabel\s*\(/g,
  /\bButton\s*\(/g,
  /\bToggle\s*\(/g,
  /\bLink\s*\(/g,
  /\bTextField\s*\(/g,
  /\bSecureField\s*\(/g,
  /\bPicker\s*\(/g,
  /\bDatePicker\s*\(/g,
  /\bColorPicker\s*\(/g,
  /\bAccessibilityNotification\s*\.\s*Announcement\s*\(/g,
  /\.accessibilityAction\s*\(\s*named\s*:/g,
  /\.navigationTitle\s*\(/g,
  /\.accessibilityLabel\s*\(/g,
  /\.accessibilityHint\s*\(/g,
  /\.accessibilityValue\s*\(/g,
  /\.help\s*\(/g,
]

/** Text with nothing to translate: punctuation, symbols and space. */
const PUNCTUATION_ONLY = /^[\s\p{P}\p{S}]*$/u

export function literalStringViolations(
  file: SwiftFile,
  lexed: Lexed = lex(file.source),
): string[] {
  const { code, strings } = lexed
  const found: string[] = []
  const byStart = new Map(strings.map((literal) => [literal.start, literal]))

  for (const pattern of TEXT_CALLS) {
    for (const match of code.matchAll(pattern)) {
      let first = match.index + match[0].length
      while (/\s/.test(code[first] ?? '')) first += 1
      // `Text(verbatim: "…")` and `Text(LocalizedStringKey("…"))` are the same literal.
      const label = /^(?:verbatim\s*:\s*|LocalizedStringKey\s*\(\s*)/.exec(code.slice(first))
      if (label) first += label[0].length
      const literal = byStart.get(first)
      if (literal === undefined) continue
      const text = literal.text.replace(/\\./g, '')
      if (PUNCTUATION_ONLY.test(text)) continue
      found.push(
        `${at(file, match.index)}: the literal "${literal.text}" in \`${match[0].replace(/\s+/g, '')}…)\` — ` +
          'text a person reads comes from props, through the app’s localisation',
      )
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* Containment                                                                */
/* -------------------------------------------------------------------------- */

const ALWAYS = new Set(['SwiftUI', 'Foundation', 'PolymorphTokens'])
const BEHIND_CAN_IMPORT = new Set(['UIKit', 'AppKit'])

/**
 * The modules one member, or one foundation file, may import besides the three
 * every file may, each the platform's own way to do what the file does:
 * QRCode's matrix is CoreImage's QR generator, so no member file encodes one by
 * hand. The file gate (`PolymorphUI+Files`) names the files a field accepts as
 * `UTType`s, which the system's file picker takes, and the type a dropped file
 * is read as, for FileUpload and PromptInput. ImageEditor chooses a photo with
 * the system's picker (PhotosUI), decodes and encodes the image with ImageIO,
 * and names the exported format as a `UTType`. AudioPlayer plays its recording
 * with AVFoundation's `AVPlayer`, the platform's media player, because its
 * contract makes the member own the playback, as the web's owns its `<audio>`.
 */
export const MEMBER_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  AudioPlayer: ['AVFoundation'],
  ImageEditor: ['ImageIO', 'PhotosUI', 'UniformTypeIdentifiers'],
  'PolymorphUI+Files': ['UniformTypeIdentifiers'],
  QRCode: ['CoreImage'],
}

export interface ContainmentOptions {
  /** A chart member may import Charts. */
  chart: boolean
  /** The foundation is the icon gateway, so it may draw a symbol. */
  foundation: boolean
  /** The further modules this member may import: its entry in `MEMBER_IMPORTS`. */
  imports?: readonly string[]
}

export function containmentViolations(
  file: SwiftFile,
  options: ContainmentOptions,
  lexed: Lexed = lex(file.source),
): string[] {
  const { code } = lexed
  const found: string[] = []
  // The condition of each enclosing `#if` branch, innermost last.
  const branches: string[] = []
  let offset = 0

  for (const line of code.split('\n')) {
    const directive = /^\s*#(if|elseif|else|endif)\b(.*)$/.exec(line)
    if (directive) {
      const [, kind, condition] = directive as unknown as [string, string, string]
      if (kind === 'if') branches.push(condition.trim())
      else if (kind === 'elseif') branches.splice(-1, 1, condition.trim())
      else if (kind === 'else') branches.splice(-1, 1, '')
      else branches.pop()
    }

    const imported =
      /^\s*(?:@\w+\s+)*import\s+(?:(?:struct|class|enum|protocol|typealias|func|let|var)\s+)?(\w+)/.exec(
        line,
      )
    if (imported) {
      const module = imported[1] as string
      const where = `${file.path}:${lineOf(file.source, offset)}`
      if (
        ALWAYS.has(module) ||
        (module === 'Charts' && options.chart) ||
        options.imports?.includes(module)
      ) {
        // Lawful.
      } else if (module === 'Charts') {
        found.push(`${where}: imports Charts — only a chart member draws with Swift Charts`)
      } else if (BEHIND_CAN_IMPORT.has(module)) {
        if (!branches.some((condition) => condition.includes(`canImport(${module})`))) {
          found.push(`${where}: imports ${module} outside \`#if canImport(${module})\``)
        }
      } else {
        found.push(
          `${where}: imports ${module} — a member imports SwiftUI, Foundation and PolymorphTokens ` +
            '(Charts in a chart member, a module MEMBER_IMPORTS names in its member, UIKit or ' +
            'AppKit behind `#if canImport`)',
        )
      }
    }
    offset += line.length + 1
  }

  if (!options.foundation) {
    for (const match of code.matchAll(
      /\b(?:Image\s*\(\s*(?:systemName\s*:|")|UIImage\s*\(|NSImage\s*\()/g,
    )) {
      found.push(
        `${at(file, match.index)}: \`${match[0].trim()}\` draws an icon or image directly — draw a role with \`PMIconView\``,
      )
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* Conformance                                                                */
/* -------------------------------------------------------------------------- */

export interface ConformanceInput {
  /**
   * The member files: every Swift file under `Sources/PolymorphUI` but the
   * foundation, its further files and `Generated/`.
   */
  files: SwiftFile[]
  /** The members the iOS platform map marks native or adapted. */
  members: readonly string[]
  /** `pending.ts`: the members with no rendering yet. */
  pending: readonly string[]
}

/** The member a file is named for: `Badge.swift`, `charts/BarChart.swift` → `BarChart`. */
export const memberOfFile = (path: string) =>
  (path.split('/').at(-1) ?? path).replace(/\.swift$/, '')

export function conformanceViolations({ files, members, pending }: ConformanceInput): string[] {
  const found: string[] = []
  const known = new Set(members)
  const implemented = new Set<string>()

  for (const file of files) {
    const member = memberOfFile(file.path)
    if (!known.has(member)) {
      found.push(
        `${file.path}: ${member} is not a member the iOS platform map marks native or adapted — ` +
          'a file here is one member, named for it, or a foundation file, `PolymorphUI+<Topic>.swift`',
      )
      continue
    }
    implemented.add(member)
    const { code } = lex(file.source)
    const rendering = new RegExp(
      `\\b(?:struct|final\\s+class|class|enum|extension)\\s+PM${member}\\b[^{]*:[^{]*\\bPM${member}Rendering\\b`,
    )
    if (!rendering.test(code)) {
      found.push(`${file.path}: declares no \`PM${member}\` conforming to \`PM${member}Rendering\``)
    }
    const fixture = new RegExp(`\\bstruct\\s+${member}States\\s*:[^{]*\\bPMStates\\b`).exec(code)
    if (!fixture) {
      found.push(`${file.path}: declares no \`${member}States\` conforming to \`PMStates\``)
    } else {
      const names = new RegExp(
        `\\bmember\\b\\s*(?::\\s*String\\s*)?(?:=|\\{\\s*(?:return\\s+)?)\\s*"${member}"`,
      )
      if (!names.test(file.source.slice(fixture.index))) {
        found.push(`${file.path}: \`${member}States\` does not name its member "${member}"`)
      }
    }
  }

  const seen = new Set<string>()
  for (const name of pending) {
    if (seen.has(name)) found.push(`pending.ts: ${name} is listed twice`)
    seen.add(name)
    if (!known.has(name))
      found.push(`pending.ts: ${name} is not a member the iOS platform map marks native or adapted`)
    if (implemented.has(name))
      found.push(
        `pending.ts: ${name} has a rendering — remove it from the list and lower the pinned count`,
      )
  }
  for (const member of members) {
    if (!implemented.has(member) && !seen.has(member)) {
      found.push(`${member} renders on iOS but has no member file and is not in pending.ts`)
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* No shadowing                                                               */
/* -------------------------------------------------------------------------- */

const DECLARATION =
  /\bpublic\s+(?:final\s+)?(?:struct|enum|class|actor|protocol|typealias)\s+(PM\w+)/g

/** The `PM…` types a set of files declares in public, with where. */
function declarations(files: SwiftFile[]): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of files) {
    const { code } = lex(file.source)
    for (const match of code.matchAll(DECLARATION)) {
      if (!found.has(match[1] as string)) found.set(match[1] as string, at(file, match.index))
    }
  }
  return found
}

export function shadowViolations(ui: SwiftFile[], tokens: SwiftFile[]): string[] {
  const theirs = declarations(tokens)
  return [...declarations(ui)]
    .filter(([name]) => theirs.has(name))
    .map(
      ([name, where]) =>
        `${where}: declares ${name}, which PolymorphTokens declares at ${theirs.get(name)} — ` +
        'an app importing both could not name either',
    )
}
