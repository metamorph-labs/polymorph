import { argumentsAt, lex, lineOf, type Lexed } from './kotlin-source'

/**
 * The laws a Compose member is held to, over its source text: the Kotlin
 * counterparts of `laws.ts`. Each returns every violation it finds as a
 * sentence naming the file and line; `kotlin-laws.test.ts` runs them over
 * `platforms/android/ui/src/main/kotlin` and proves each one on a fault.
 *
 * - **Token-only.** A member expresses every design value through the theme
 *   (`PM.theme`): no colour built from channels or a hex code, no named
 *   colour, no number written as a length (`12.dp`, or a `val` holding 12 that
 *   becomes one), no type decision of Compose's (`FontWeight.Bold`,
 *   `FontWeight(600)`, `FontFamily.Serif`), no duration, spring, alpha or radius
 *   written as a number, no circle where the theme decides a radius
 *   (`CircleShape`), no motion of Compose's choosing (`spring()`, an
 *   `AnimatedVisibility` without its `enter` and `exit`, an `animate…AsState`
 *   without its spec), no shadow but the pairing's, and no token multiplied by
 *   a number, in either order, outside a states fixture (`space.s10 * 2`,
 *   `2 * theme.radius.md`): a recipe's multiple is `PMRecipe`'s, and an inset
 *   taken on both edges is `PMGeometry.bothEdges`.
 * - **No literal strings.** Text a person reads comes from props, so it passes
 *   through the app's localisation: a literal in `Text`, a content or state
 *   description, an action's label, a semantics error, or a member's prop in
 *   drawing code is a hole in that seam. Templates of props and punctuation are
 *   allowed, and so is a string resource; a default the spec names is
 *   `PMStrings`'s (`PMSpecDefault`). A states fixture (`object <Member>States`)
 *   writes its sample content as literals.
 * - **Containment.** A member imports Compose (`androidx.compose.*`), Kotlin
 *   (`kotlin.*`, `kotlinx.*`), the token module and this package, and nothing
 *   of Android's own, but for a class `KOTLIN_MEMBER_IMPORTS` admits in its
 *   file. It draws Material 3 only through the bridge: no member
 *   builds or reads a `MaterialTheme`, and every use of a Material component is
 *   inside `PMMaterialTheme { … }`, or in a private function every call of
 *   which is. It draws icons only through `PMIconView`.
 * - **Conformance.** Each member file declares `object PM<Member>`,
 *   implementing the generated `PM<Member>Rendering`, and `object
 *   <Member>States : PMStates` naming its member. The foundation,
 *   `PolymorphUI.kt`, and its further files, `PolymorphUI<Topic>.kt`, are no
 *   member's and are not passed to it.
 * - **No shadowing.** No `PM…` name the member module declares, as a type or a
 *   function, is one the token module declares: an app imports both packages.
 */

export interface KotlinFile {
  /** Path relative to the member module's package directory, such as `Badge.kt`. */
  path: string
  source: string
}

const at = (file: KotlinFile, offset: number) => `${file.path}:${lineOf(file.source, offset)}`

/* -------------------------------------------------------------------------- */
/* Token-only                                                                 */
/* -------------------------------------------------------------------------- */

/** A colour built from channels: `Color(0xFF…)`, `Color(red = …)`, `Color(0.2f, …)`, `Color.hsl(…)`. */
const RAW_COLOURS = [/\bColor\s*\(\s*(?:0x|red\s*=|\d)/g, /\bColor\s*\.\s*(?:hsl|hsv)\s*\(/g]

/** Compose's named colours. `Transparent` and `Unspecified` are no colour, so they pass. */
const NAMED_COLOURS =
  /\bColor\s*\.\s*(?:Red|Green|Blue|Black|White|Gray|LightGray|DarkGray|Yellow|Cyan|Magenta)\b/g

/** Compose's own type decisions, and a weight written as a number. */
const TYPE_DECISIONS = [
  /\bFontWeight\s*\.\s*(?:Thin|ExtraLight|Light|Normal|Medium|SemiBold|Bold|ExtraBold|Black|W\d00)\b/g,
  /\bFontWeight\s*\(\s*\d/g,
  /\bFontFamily\s*\.\s*(?:SansSerif|Serif|Monospace|Cursive|Default)\b/g,
]

/** A numeric literal not part of a name (`s4`) or a member access. */
const NUMBER = /(?<![\w.])\d+(?:\.\d+)?[fFL]?(?![\w.])/g

/** A literal length: a number written straight into a unit. */
const LITERAL_LENGTH = /(?<![\w.])(\d+(?:\.\d+)?[fF]?)\s*\.\s*(dp|sp|em)\b/g

/** A length constructed from a number. */
const LENGTH_CONSTRUCTORS = /\b(?:Dp|TextUnit)\s*\(\s*\d/g

/** Motion written as a number: a tween, a delay or a spring's own values. */
const LITERAL_MOTION = [
  /\btween\s*(?:<[^>]*>)?\s*\(\s*\d+(?:\.\d+)?[fFL]?/g,
  /\b(?:durationMillis|delayMillis)\s*=\s*\d+(?:\.\d+)?[fFL]?/g,
  /\bdelay\s*\(\s*\d+(?:\.\d+)?[fFL]?/g,
  /\b(?:dampingRatio|stiffness)\s*=\s*\d+(?:\.\d+)?[fFL]?/g,
  /\bSpring\s*\.\s*(?:Stiffness|DampingRatio)\w*/g,
  // A spec with no arguments is Compose's own default curve and duration.
  /\b(?:spring|tween|keyframes)\s*(?:<[^>]*>)?\s*\(\s*\)/g,
]

/**
 * Animations whose motion is Compose's unless a named argument gives it: each
 * with the arguments that must be present.
 */
const MOTION_ARGUMENTS: readonly { call: RegExp; needs: readonly string[] }[] = [
  { call: /\bAnimatedVisibility\s*\(/g, needs: ['enter', 'exit'] },
  { call: /\bCrossfade\s*(?:<[^>]*>)?\s*\(/g, needs: ['animationSpec'] },
  { call: /\bAnimatedContent\s*(?:<[^>]*>)?\s*\(/g, needs: ['transitionSpec'] },
]

/** `animate…AsState`: its spec is its second argument, positional or named. */
const ANIMATE_AS_STATE = /\banimate\w*AsState\s*(?:<[^>]*>)?\s*\(/g

/** Calls whose numeric arguments are radii. */
const SHAPE_CALLS = /\b(?:RoundedCornerShape|CutCornerShape|AbsoluteRoundedCornerShape)\s*\(/g

/** Where an alpha is written: `.alpha(…)`'s argument and an `alpha = …` expression. */
const ALPHA_CALL = /\.alpha\s*\(/g
const ALPHA_ASSIGNMENT = /\balpha\s*=(?!=)/g

/**
 * The end of a token's path: a space step (`space.s4`), a radius
 * (`theme.radius.md`), a control height, the hit target, an icon's size, the
 * focus ring's width or offset, or a type step's size or line height, as read
 * or as a length (`.dp`), and any length made with `.dp`.
 */
const TOKEN_PATH =
  String.raw`(?:\.s\d+|\bradius\.\w+|\bcontrolHeight\.\w+|\bhitTarget|\bicon\.\w+\.size|` +
  String.raw`\bfocus\.(?:width|offset)|\btext\.\w+\.(?:size|lineHeight|lineBox))(?:\.(?:dp|sp))?|\.dp`

/**
 * A token multiplied by a number, in either order: a recipe's formula copied
 * into the member (`space.s10 * 2 + space.s7`, `2 * theme.radius.md`), whose
 * multiple the recipe owns. The group is the number.
 */
const TOKEN_MULTIPLES = [
  new RegExp(String.raw`(?:${TOKEN_PATH})\s*\*\s*(\d+(?:\.\d+)?[fF]?)(?![\w.])`, 'g'),
  new RegExp(
    String.raw`(?<![\w.])(\d+(?:\.\d+)?[fF]?)\s*\*\s*[A-Za-z_][\w.]*?(?:${TOKEN_PATH})(?![\w(])`,
    'g',
  ),
]

/** A value named for a number: `const val GAP = 12`, `val gap = 12f`. */
const NUMBER_VALUE =
  /\b(?:const\s+)?val\s+(\w+)\s*(?::\s*\w+\s*)?=\s*(\d+(?:\.\d+)?[fFL]?)[ \t]*(?=[\n;]|$)/g

/** The numbers a length, a radius or an alpha may be: none, and for an alpha, full. */
const isZero = (number: string) => /^0+(?:\.0+)?[fFL]?$/.test(number)
const isZeroOrOne = (number: string) => isZero(number) || /^1(?:\.0+)?[fF]?$/.test(number)

export function tokenViolations(file: KotlinFile, lexed: Lexed = lex(file.source)): string[] {
  const { code, strings } = lexed
  // Offset → sentence, so a number two rules see is reported once, in source order.
  const found = new Map<number, string>()
  const report = (offset: number, message: string) => {
    if (!found.has(offset)) found.set(offset, `${at(file, offset)}: ${message}`)
  }

  for (const pattern of RAW_COLOURS) {
    for (const match of code.matchAll(pattern)) {
      report(
        match.index,
        `\`${match[0].replace(/\s+/g, '')}…\` is a colour the theme did not decide — read a role from \`theme.colors\``,
      )
    }
  }
  for (const match of code.matchAll(NAMED_COLOURS)) {
    report(
      match.index,
      `\`${match[0].replace(/\s+/g, '')}\` is a named colour — read a role from \`theme.colors\``,
    )
  }
  for (const match of code.matchAll(/\b0[xX][0-9A-Fa-f_]+L?\b/g)) {
    report(match.index, `the hex literal \`${match[0]}\` — read the value from \`theme\``)
  }
  for (const literal of strings) {
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(literal.text)) {
      report(literal.start, `the hex colour "${literal.text}" — read a role from \`theme.colors\``)
    }
  }
  for (const pattern of TYPE_DECISIONS) {
    for (const match of code.matchAll(pattern)) {
      report(
        match.index,
        `\`${match[0].replace(/\s+/g, '')}\` is a type decision of Compose's — use a step of \`theme.text\``,
      )
    }
  }
  for (const match of code.matchAll(LITERAL_LENGTH)) {
    if (isZero(match[1] as string)) continue
    report(
      match.index,
      `the length \`${match[0].replace(/\s+/g, '')}\` — a length comes from \`theme\``,
    )
  }
  for (const match of code.matchAll(LENGTH_CONSTRUCTORS)) {
    report(match.index, `\`${match[0].replace(/\s+/g, '')}…\` — a length comes from \`theme\``)
  }
  // A unit applied to a parenthesised expression: every number inside it but
  // an index is part of the length.
  for (const match of code.matchAll(/\)\s*\.\s*(?:dp|sp|em)\b/g)) {
    const open = openingParenthesis(code, match.index)
    if (open === -1) continue
    const inside = code
      .slice(open + 1, match.index)
      .replace(/\[[^\]]*\]/g, (index) => ' '.repeat(index.length))
    for (const number of inside.matchAll(NUMBER)) {
      if (isZero(number[0])) continue
      report(
        open + 1 + number.index,
        `the number ${number[0]} in a length — a length comes from \`theme\``,
      )
    }
  }
  for (const pattern of LITERAL_MOTION) {
    for (const match of code.matchAll(pattern)) {
      report(
        match.index,
        `\`${match[0].replace(/\s+/g, '')}\` is motion the theme did not decide — read \`theme.defaultMotion\``,
      )
    }
  }
  for (const match of code.matchAll(SHAPE_CALLS)) {
    const open = match.index + match[0].length - 1
    for (const number of argumentsAt(code, open).matchAll(NUMBER)) {
      if (isZero(number[0])) continue
      report(
        open + 1 + number.index,
        `the number ${number[0]} in a shape — a radius comes from \`theme.radius\``,
      )
    }
  }
  const alphaNumbers = (start: number, text: string) => {
    for (const number of text.matchAll(NUMBER)) {
      if (isZeroOrOne(number[0])) continue
      report(start + number.index, `the alpha ${number[0]} — a colour's strength is the role's own`)
    }
  }
  for (const match of code.matchAll(ALPHA_CALL)) {
    const open = match.index + match[0].length - 1
    alphaNumbers(open + 1, argumentsAt(code, open))
  }
  for (const match of code.matchAll(ALPHA_ASSIGNMENT)) {
    const start = match.index + match[0].length
    alphaNumbers(start, code.slice(start, expressionEnd(code, start)))
  }
  for (const match of code.matchAll(/\bCircleShape\b/g)) {
    report(
      match.index,
      '`CircleShape` is a radius the theme did not decide — use `theme.rounded(theme.radius.pill)`',
    )
  }
  for (const { call, needs } of MOTION_ARGUMENTS) {
    for (const match of code.matchAll(call)) {
      const open = match.index + match[0].length - 1
      const named = namedArguments(argumentsAt(code, open))
      const missing = needs.filter((name) => !named.has(name))
      if (missing.length === 0) continue
      report(
        match.index,
        `\`${match[0].replace(/[\s(]+$/, '')}\` without ${missing.map((name) => `\`${name}\``).join(' and ')} ` +
          "runs Compose's own motion — give it the temperament's from `theme.defaultMotion`",
      )
    }
  }
  for (const match of code.matchAll(ANIMATE_AS_STATE)) {
    const open = match.index + match[0].length - 1
    const args = topLevelArguments(argumentsAt(code, open))
    const positional = args.filter((argument) => !/^\s*\w+\s*=(?!=)/.test(argument.text))
    if (positional.length >= 2 || namedArguments(argumentsAt(code, open)).has('animationSpec'))
      continue
    report(
      match.index,
      `\`${match[0].replace(/[\s(]+$/, '')}\` without an animation spec runs Compose's own motion — ` +
        "give it the temperament's from `theme.defaultMotion`",
    )
  }
  for (const match of code.matchAll(NUMBER_VALUE)) {
    if (isZero(match[2] as string)) continue
    const name = match[1] as string
    for (const use of code.matchAll(
      new RegExp(`(?<![\\w.])${name}\\s*\\.\\s*(?:dp|sp|em)\\b`, 'g'),
    )) {
      report(
        use.index,
        `\`${name}\` holds ${match[2]} and becomes a length here — a length comes from \`theme\``,
      )
    }
  }
  // Reported at the number, so a product inside a length (`(space.s4 * 2).dp`)
  // is reported once.
  const fixtures = fixtureBodies(code)
  for (const pattern of TOKEN_MULTIPLES) {
    for (const match of code.matchAll(pattern)) {
      if (fixtures.some(([open, close]) => match.index > open && match.index < close)) continue
      const number = match[1] as string
      const at = match[0].startsWith(number)
        ? match.index
        : match.index + match[0].length - number.length
      report(
        at,
        `\`${match[0].replace(/\s+/g, ' ')}\` multiplies a token by a number — ` +
          "read a recipe's multiple from `PMRecipe`, and double an inset on both edges with `PMGeometry.bothEdges`",
      )
    }
  }
  for (const match of code.matchAll(/\.shadow\s*\(/g)) {
    report(
      match.index,
      "`.shadow(…)` draws an elevation Compose decided — draw the pairing's shadow with `pmShadow`",
    )
  }

  return [...found.entries()].sort(([a], [b]) => a - b).map(([, message]) => message)
}

/** The names of a call's named arguments (`enter = …`), from its argument text. */
function namedArguments(text: string): Set<string> {
  const names = new Set<string>()
  for (const argument of topLevelArguments(text)) {
    const named = /^\s*(\w+)\s*=(?!=)/.exec(argument.text)
    if (named) names.add(named[1] as string)
  }
  return names
}

/**
 * Where an expression that starts at `start` ends: at the end of its line, or
 * at a comma, semicolon or closing bracket outside the brackets it opens.
 */
function expressionEnd(code: string, start: number): number {
  let depth = 0
  for (let index = start; index < code.length; index += 1) {
    const char = code[index] as string
    if ('([{'.includes(char)) depth += 1
    if (')]}'.includes(char)) {
      if (depth === 0) return index
      depth -= 1
    }
    if (depth === 0 && (char === '\n' || char === ',' || char === ';')) return index
  }
  return code.length
}

/** The offset of the parenthesis that the one closing at `close` matches, or -1. */
function openingParenthesis(code: string, close: number): number {
  let depth = 0
  for (let index = close; index >= 0; index -= 1) {
    if (code[index] === ')') depth += 1
    if (code[index] === '(') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/* -------------------------------------------------------------------------- */
/* No literal strings                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Calls whose first argument, or whose `text` or `label` argument, is text a
 * person reads: the text composables, an accessibility action's label, and a
 * semantics error.
 */
const TEXT_CALLS = [
  /\bText\s*\(/g,
  /\bBasicText\s*\(/g,
  /\bAnnotatedString\s*\(/g,
  /\bCustomAccessibilityAction\s*\(/g,
  /\bappend\s*\(/g,
  /\berror\s*\(/g,
  /\bdismiss\s*\(/g,
  /\bonClick\s*\(/g,
  /\bonLongClick\s*\(/g,
]

/** Assignments and arguments whose value is text a person reads. */
const TEXT_PROPERTIES =
  /\b(?:contentDescription|stateDescription|onClickLabel|onLongClickLabel|paneTitle)\s*=(?!=)/g

/** A named `label` argument: an action's label, or a member's prop. */
const LABEL_ARGUMENT = /\blabel\s*=(?!=)/g

/**
 * Calls whose `label` names an animation for Compose's tooling, which no person
 * reads.
 */
const ANIMATION_LABELS =
  /^(?:animate\w*|rememberInfiniteTransition|updateTransition|rememberTransition|Crossfade|AnimatedContent)$/

/** A member's composable, called with its props as arguments. */
const MEMBER_CALL = /\bPM[A-Z]\w*\s*(?:<[^>()]*>)?\s*\(/g

/** Text with nothing to translate: punctuation, symbols and space. */
const PUNCTUATION_ONLY = /^[\s\p{P}\p{S}]*$/u

/** The top-level arguments of a call's argument text, each with its offset in it. */
function topLevelArguments(text: string): { start: number; text: string }[] {
  const found: { start: number; text: string }[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if (index === text.length || (char === ',' && depth === 0)) {
      found.push({ start, text: text.slice(start, index) })
      start = index + 1
    }
  }
  return found
}

/** The offset of the brace that closes the one at `open`, in the lexed code. */
function closingBrace(code: string, open: number): number {
  let depth = 0
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1
    if (code[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return code.length
}

/** The ranges of the states fixtures' bodies, `object <Member>States … { … }`, whose sample text is literal. */
function fixtureBodies(code: string): [number, number][] {
  return [...code.matchAll(/\bobject\s+\w+States\b[^{]*\{/g)].map((match) => {
    const open = match.index + match[0].length - 1
    return [open, closingBrace(code, open)]
  })
}

/** The name of the call whose argument list holds `offset`, or undefined. */
function enclosingCall(code: string, offset: number): string | undefined {
  let depth = 0
  for (let index = offset - 1; index >= 0; index -= 1) {
    const char = code[index]
    if (char === ')' || char === ']' || char === '}') depth += 1
    if (char === '[' || char === '{') depth -= 1
    if (char === '(') {
      if (depth === 0) {
        const before = code
          .slice(Math.max(0, index - 200), index)
          .replace(/\s*(?:<[^<>()]*>)?\s*$/, '')
        return /(\w+)$/.exec(before)?.[1]
      }
      depth -= 1
    }
    if (depth < 0) return undefined
  }
  return undefined
}

export function literalStringViolations(
  file: KotlinFile,
  lexed: Lexed = lex(file.source),
): string[] {
  const { code, strings } = lexed
  const found = new Map<number, string>()
  const fixtures = fixtureBodies(code)
  const inFixture = (offset: number) =>
    fixtures.some(([open, close]) => offset > open && offset < close)
  // The member's own name is its identity (`member:<Name>`), which no person reads.
  const own = memberOfKotlinFile(file.path)
  /** Every literal from `start` to `end`, nested template strings included, as text a person reads. */
  const check = (start: number, end: number, where: string, callAt: number) => {
    for (const literal of strings) {
      if (literal.start < start || literal.start >= end || found.has(literal.start)) continue
      const text = literal.text.replace(/\\./g, '')
      if (PUNCTUATION_ONLY.test(text) || (text === own && !literal.interpolated)) continue
      found.set(
        literal.start,
        `${at(file, callAt)}: the literal "${literal.text}" in ${where} — ` +
          'text a person reads comes from props, through the app’s localisation',
      )
    }
  }

  for (const pattern of TEXT_CALLS) {
    for (const match of code.matchAll(pattern)) {
      const open = match.index + match[0].length - 1
      const args = argumentsAt(code, open)
      const where = `\`${match[0].replace(/\s+/g, '')}…)\``
      topLevelArguments(args).forEach((argument, index) => {
        const named = /^\s*(\w+)\s*=(?!=)\s*/.exec(argument.text)
        const start = open + 1 + argument.start
        const end = start + argument.text.length
        if (named && (named[1] === 'text' || named[1] === 'label')) {
          check(start + named[0].length, end, where, match.index)
        } else if (!named && index === 0) {
          check(start, end, where, match.index)
        }
      })
    }
  }
  for (const match of code.matchAll(TEXT_PROPERTIES)) {
    const start = match.index + match[0].length
    check(start, expressionEnd(code, start), `\`${match[0].replace(/\s*=$/, '')}\``, match.index)
  }
  for (const match of code.matchAll(LABEL_ARGUMENT)) {
    if (inFixture(match.index)) continue
    const call = enclosingCall(code, match.index)
    if (call !== undefined && ANIMATION_LABELS.test(call)) continue
    const start = match.index + match[0].length
    check(start, expressionEnd(code, start), `\`${call ?? ''}(label = …)\``, match.index)
  }
  for (const match of code.matchAll(MEMBER_CALL)) {
    const declared = /\bfun\s+(?:<[^>]*>\s*)?$/.test(
      code.slice(Math.max(0, match.index - 80), match.index),
    )
    if (declared || inFixture(match.index)) continue
    const open = match.index + match[0].length - 1
    const end = open + 1 + argumentsAt(code, open).length
    check(open + 1, end, `\`${match[0].replace(/[\s(]+$/, '')}(…)\`, a member's props`, match.index)
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, message]) => message)
}

/* -------------------------------------------------------------------------- */
/* Containment                                                                */
/* -------------------------------------------------------------------------- */

/** What a member may import: Compose, Kotlin, the token module and this package. */
const ALLOWED_IMPORTS =
  /^(?:androidx\.compose\.|kotlin\.|kotlinx\.|dev\.polymorph\.(?:tokens|ui)\.)/

/**
 * Material 3's pieces that carry the content colour and text style the bridge
 * gives them, which a member uses to draw text: no component of Material's.
 */
const MATERIAL_TEXT = new Set([
  'androidx.compose.material3.Text',
  'androidx.compose.material3.LocalContentColor',
  'androidx.compose.material3.LocalTextStyle',
  'androidx.compose.material3.ProvideTextStyle',
  'androidx.compose.material3.ExperimentalMaterial3Api',
])

/** Building or reading a Material theme: the bridge's alone. */
const MATERIAL_THEME =
  /\b(?:MaterialTheme|lightColorScheme|darkColorScheme|dynamicLightColorScheme|dynamicDarkColorScheme|ColorScheme\s*\(|Typography\s*\(|Shapes\s*\()/g

/** Drawing an icon or an image directly. */
const DIRECT_GLYPHS =
  /\b(?:Icons\s*\.|Icon\s*\(|Image\s*\(|painterResource\s*\(|rememberVectorPainter\s*\(|ImageVector\b)/g

/**
 * The classes one member, or one foundation file, may import besides
 * Compose, Kotlin, the token module and this package, by file name, each the
 * platform's own way to do what the file does that Compose has no API for.
 * PhoneInput's country list (`PolymorphUIPhones`) is ordered by the
 * platform's collator for the list's language, as `Intl.Collator` orders the
 * web's; both of the module's targets run on Java's class library, where it
 * is `java.text.Collator`.
 */
export const KOTLIN_MEMBER_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  PolymorphUIPhones: ['java.text.Collator'],
}

export interface KotlinContainmentOptions {
  /**
   * The foundation: it is the Material bridge and the icon gateway, so it may
   * build Material's theme, import Material's icons and ripple, and draw a
   * vector.
   */
  foundation: boolean
  /** The further classes this file may import: its entry in `KOTLIN_MEMBER_IMPORTS`. */
  imports?: readonly string[]
}

export function containmentViolations(
  file: KotlinFile,
  options: KotlinContainmentOptions,
  lexed: Lexed = lex(file.source),
): string[] {
  const { code } = lexed
  const found: string[] = []
  const imports: string[] = []
  for (const match of code.matchAll(/^[ \t]*import\s+([\w.]+)(?:\.\*)?(?:\s+as\s+\w+)?/gm)) {
    const name = match[1] as string
    imports.push(name)
    const where = at(file, match.index)
    if (options.imports?.includes(name)) {
      // Lawful: a class `KOTLIN_MEMBER_IMPORTS` admits in this file.
    } else if (!ALLOWED_IMPORTS.test(`${name}.`)) {
      found.push(
        `${where}: imports ${name} — a member imports Compose, Kotlin, the token module and ` +
          'dev.polymorph.ui, and nothing of Android’s own',
      )
    } else if (/^androidx\.compose\.material\./.test(`${name}.`) && !options.foundation) {
      found.push(
        `${where}: imports ${name} — draw an icon with \`PMIconView\`, and Material through Material 3’s bridge`,
      )
    }
  }
  if (options.foundation) return found

  for (const match of code.matchAll(MATERIAL_THEME)) {
    found.push(
      `${at(file, match.index)}: \`${match[0].replace(/\s+/g, '')}\` builds or reads Material’s theme — ` +
        'read the pairing from `PM.theme`; only the bridge, `PMMaterialTheme`, gives Material the pairing',
    )
  }
  const components = imports.filter(
    (name) => name.startsWith('androidx.compose.material3') && !MATERIAL_TEXT.has(name),
  )
  const bridged = bridgedRanges(code)
  const inside = (offset: number) =>
    bridged.some(([open, close]) => offset > open && offset < close)
  for (const component of components) {
    const simple = component.split('.').at(-1) as string
    for (const use of code.matchAll(new RegExp(`\\b${simple}\\b`, 'g'))) {
      if (/^[ \t]*import\b/.test(code.slice(code.lastIndexOf('\n', use.index) + 1, use.index + 1)))
        continue
      if (inside(use.index)) continue
      found.push(
        `${at(file, use.index)}: draws Material 3 (${component}) outside the bridge — ` +
          'draw the Material component inside `PMMaterialTheme { … }`',
      )
    }
  }
  for (const match of code.matchAll(DIRECT_GLYPHS)) {
    found.push(
      `${at(file, match.index)}: \`${match[0].trim()}\` draws an icon or image directly — draw a role with \`PMIconView\``,
    )
  }
  return found
}

/**
 * The ranges inside the Material bridge: every `PMMaterialTheme { … }` (or
 * `PMMaterialTheme(…)`) call's arguments, and the body of every private
 * function each call of which is inside one, until no more are found.
 */
function bridgedRanges(code: string): [number, number][] {
  const ranges: [number, number][] = []
  for (const match of code.matchAll(/\bPMMaterialTheme\b\s*/g)) {
    let at = match.index + match[0].length
    if (code[at] === '(') {
      const close = at + argumentsAt(code, at).length + 1
      ranges.push([at, close])
      at = close
      while (/\s/.test(code[at] ?? '')) at += 1
    }
    if (code[at] === '{') ranges.push([at, closingBrace(code, at)])
  }
  const inside = (offset: number) => ranges.some(([open, close]) => offset > open && offset < close)
  const functions = [...code.matchAll(/\bprivate\s+fun\s+(?:<[^>]*>\s*)?(\w+)\s*\(/g)].flatMap(
    (match) => {
      const open = match.index + match[0].length - 1
      const body = code.indexOf('{', open + argumentsAt(code, open).length + 1)
      if (body === -1) return []
      return [
        {
          name: match[1] as string,
          at: match.index,
          body: [body, closingBrace(code, body)] as [number, number],
        },
      ]
    },
  )
  let grew = true
  while (grew) {
    grew = false
    for (const fn of functions) {
      if (ranges.some(([open, close]) => open === fn.body[0] && close === fn.body[1])) continue
      const calls = [...code.matchAll(new RegExp(`(?<![\\w.])${fn.name}\\s*\\(`, 'g'))].filter(
        (call) => call.index !== fn.at + code.slice(fn.at).indexOf(fn.name),
      )
      if (calls.length > 0 && calls.every((call) => inside(call.index))) {
        ranges.push(fn.body)
        grew = true
      }
    }
  }
  return ranges
}

/* -------------------------------------------------------------------------- */
/* Conformance                                                                */
/* -------------------------------------------------------------------------- */

export interface KotlinConformanceInput {
  /** The member files: every Kotlin file of the member module but the foundation and its further files. */
  files: KotlinFile[]
  /** The members the Android platform map marks native or adapted. */
  members: readonly string[]
  /** `kotlin-pending.ts`: the members with no rendering yet. */
  pending: readonly string[]
}

/** The member a file is named for: `Badge.kt` → `Badge`. */
export const memberOfKotlinFile = (path: string) =>
  (path.split('/').at(-1) ?? path).replace(/\.kt$/, '')

export function conformanceViolations({
  files,
  members,
  pending,
}: KotlinConformanceInput): string[] {
  const found: string[] = []
  const known = new Set(members)
  const implemented = new Set<string>()

  for (const file of files) {
    const member = memberOfKotlinFile(file.path)
    if (!known.has(member)) {
      found.push(
        `${file.path}: ${member} is not a member the Android platform map marks native or adapted — ` +
          'a file here is one member, named for it, or a foundation file, `PolymorphUI<Topic>.kt`',
      )
      continue
    }
    implemented.add(member)
    const { code } = lex(file.source)
    if (!new RegExp(`\\bobject\\s+PM${member}\\s*:[^{]*\\bPM${member}Rendering\\b`).test(code)) {
      found.push(
        `${file.path}: declares no \`object PM${member}\` implementing \`PM${member}Rendering\``,
      )
    }
    const fixture = new RegExp(`\\bobject\\s+${member}States\\s*:[^{]*\\bPMStates\\b`).exec(code)
    if (!fixture) {
      found.push(`${file.path}: declares no \`object ${member}States\` implementing \`PMStates\``)
    } else if (
      !new RegExp(`\\bmember\\b\\s*(?::\\s*String\\s*)?(?:=|get\\(\\)\\s*=)\\s*"${member}"`).test(
        file.source.slice(fixture.index),
      )
    ) {
      found.push(`${file.path}: \`${member}States\` does not name its member "${member}"`)
    }
  }

  const seen = new Set<string>()
  for (const name of pending) {
    if (seen.has(name)) found.push(`kotlin-pending.ts: ${name} is listed twice`)
    seen.add(name)
    if (!known.has(name))
      found.push(
        `kotlin-pending.ts: ${name} is not a member the Android platform map marks native or adapted`,
      )
    if (implemented.has(name))
      found.push(
        `kotlin-pending.ts: ${name} has a rendering — remove it from the list and lower the pinned count`,
      )
  }
  for (const member of members) {
    if (!implemented.has(member) && !seen.has(member)) {
      found.push(
        `${member} renders on Android but has no member file and is not in kotlin-pending.ts`,
      )
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/* No shadowing                                                               */
/* -------------------------------------------------------------------------- */

/** A `PM…` type, or a `PM…` function: `fun PMMaterialTheme(`, not the extension `fun PMTheme.rounded(`. */
const DECLARATION =
  /\b(?:(?:class|interface|object|typealias)\s+(PM\w+)|fun\s+(?:<[^>]*>\s*)?(PM\w+)\s*(?:<[^>]*>)?\s*\()/g

/** The `PM…` names a set of files declares, with where. */
function declarations(files: KotlinFile[]): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of files) {
    const { code } = lex(file.source)
    for (const match of code.matchAll(DECLARATION)) {
      const name = (match[1] ?? match[2]) as string
      if (!found.has(name)) found.set(name, at(file, match.index))
    }
  }
  return found
}

export function shadowViolations(ui: KotlinFile[], tokens: KotlinFile[]): string[] {
  const theirs = declarations(tokens)
  return [...declarations(ui)]
    .filter(([name]) => theirs.has(name))
    .map(
      ([name, where]) =>
        `${where}: declares ${name}, which the token module declares at ${theirs.get(name)} — ` +
        'an app importing both packages could not name either',
    )
}
