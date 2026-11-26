import { admitTheme, CHROMA_BUDGETS, MAX_NEUTRAL_TINT } from '@polymorph/theme'
import type { Registry, RegistryPalette, RegistrySystem } from '@polymorph/registry'

/**
 * `propose_theme`: takes an intent and returns a checked candidate theme.
 *
 * There is no embedded model. The connected agent supplies the intelligence,
 * and this module supplies **a vocabulary in which every word can be
 * checked**. An agent says "calmer, more editorial, warmer paper" and gets
 * back two complete JSON documents, a rationale that names which word moved
 * which axis, and a verdict from running the real engine over the pair, not
 * from trusting the table.
 *
 * Three properties hold, and each is tested:
 *
 *  1. **Schema-valid by construction.** Every move is a step along an enum the
 *     registry publishes or a seed clamped into the range the schema allows,
 *     and the candidates go through `parseSystem`/`parsePalette` before they
 *     are returned. A proposal that failed its own schema could not be saved,
 *     which is worse than no proposal.
 *  2. **The verdict is measured.** `resolveTheme` is called on the composed
 *     pair, coherence is audited over the derived tokens, and every lawful
 *     contrast pairing is measured against the emitted values in both modes.
 *     `lawful: false` comes back with the laws' own messages.
 *  3. **Nothing is guessed.** A word the table does not have comes back in
 *     `unmapped`. So does a word of degree, which no move expresses, and an
 *     exact value (`geometry=soft`) whose axis or value the catalogue does not
 *     have, each with why in `unread`. The tool never invents a move for a word
 *     it cannot apply, and it never writes a file. Saving a proposal is the job
 *     of `save_theme` or the studio.
 *
 * **What the catalogue can and cannot carry.** A `basedOn` system is rebuilt
 * from `registry.theme.systems`, which publishes each font slot's *family*,
 * because that is what an install needs. It does not publish a slot's fallback
 * class or font-style. So a proposal based on a system with an italic display
 * carries the family and lets the slot's other properties default. That is a
 * small, known loss. Fixing it means adding to the registry, not to this
 * front.
 */

/* -------------------------------------------------------------------------- */
/* The projection table                                                       */
/* -------------------------------------------------------------------------- */

/** A candidate pair, mid-projection. Axis values stay strings until the schema runs. */
interface Candidate {
  axes: Record<string, string>
  /** `heading` only where the system states a heading face of its own. */
  fonts: Record<'body' | 'display' | 'mono', { family: string }> & { heading?: { family: string } }
  defaultMode: string
  accentHue: number
  gradientHue?: number
  neutralHue?: number
  neutralTint: number
  chromaBudget: string
}

/** What the catalogue is, in the shape the moves need it. */
interface Catalogue {
  /** Axis name -> its values, in the registry's published order. */
  ladders: Record<string, string[]>
  /** The display family of the catalogue's editorial system, when it has one. */
  editorialDisplay: string | null
}

export interface Move {
  /** `axes.motionTemperament`, `palette.neutralTint`, `fonts.display`. */
  field: string
  from: string
  to: string
}

export interface Projection {
  /** The canonical word, and every spelling that selects it. */
  words: readonly string[]
  /** Why this word means these moves: one sentence, kept in the table, not in a doc. */
  why: string
  apply: (candidate: Candidate, catalogue: Catalogue) => Move[]
}

/** One step along an axis's published order, clamped at the ends. */
function step(candidate: Candidate, catalogue: Catalogue, axis: string, direction: 1 | -1): Move[] {
  const ladder = catalogue.ladders[axis] ?? []
  const from = candidate.axes[axis] ?? ''
  const index = ladder.indexOf(from)
  if (index < 0) return []
  const next = ladder[Math.min(ladder.length - 1, Math.max(0, index + direction))]
  if (next === undefined || next === from) return []
  candidate.axes[axis] = next
  return [{ field: `axes.${axis}`, from, to: next }]
}

/** A named axis value, when the word is about a position rather than a direction. */
function set(candidate: Candidate, axis: string, to: string): Move[] {
  const from = candidate.axes[axis] ?? ''
  if (from === to) return []
  candidate.axes[axis] = to
  return [{ field: `axes.${axis}`, from, to }]
}

/** One step along the loudness scale the engine documents: none < ink < low < medium < high. */
function budget(candidate: Candidate, direction: 1 | -1): Move[] {
  const from = candidate.chromaBudget
  const index = CHROMA_BUDGETS.indexOf(from as (typeof CHROMA_BUDGETS)[number])
  if (index < 0) return []
  const next = CHROMA_BUDGETS[Math.min(CHROMA_BUDGETS.length - 1, Math.max(0, index + direction))]
  if (next === undefined || next === from) return []
  candidate.chromaBudget = next
  return [{ field: 'palette.chromaBudget', from, to: next }]
}

/** The hue bands that the two temperature words, warm and cool, refer to. */
const WARM_BAND = 45
const COOL_BAND = 225

/** Half-way to the band centre along the shorter arc, so the move is bounded and reversible. */
function towards(hue: number, band: number): number {
  const delta = ((band - hue + 540) % 360) - 180
  return Math.round((hue + delta / 2 + 360) % 360)
}

function temperature(candidate: Candidate, band: number, tintStep: number): Move[] {
  const moves: Move[] = []

  const hue = towards(candidate.accentHue, band)
  if (hue !== candidate.accentHue) {
    moves.push({ field: 'palette.accentHue', from: String(candidate.accentHue), to: String(hue) })
    candidate.accentHue = hue
  }

  const tint = Math.min(
    MAX_NEUTRAL_TINT,
    Math.max(0, Number((candidate.neutralTint + tintStep).toFixed(3))),
  )
  if (tint !== candidate.neutralTint) {
    moves.push({
      field: 'palette.neutralTint',
      from: String(candidate.neutralTint),
      to: String(tint),
    })
    candidate.neutralTint = tint
  }

  return moves
}

function font(candidate: Candidate, slot: 'body' | 'display' | 'mono', family: string): Move[] {
  const from = candidate.fonts[slot].family
  if (from === family) return []
  candidate.fonts[slot] = { family }
  return [{ field: `fonts.${slot}`, from, to: family }]
}

/**
 * The table. **This is the tool's whole vocabulary**: every word an intent may
 * contain and exactly what it does. It is data instead of a chain of `if`s
 * because it is published. The tool's description is built from it, so an
 * agent is told which words it may use, and a word not on this list can only
 * come back `unmapped`.
 *
 * Moves are applied **in the order the words appear in the intent**, so a
 * contradiction resolves the way a sentence does: "calmer but bolder" ends
 * bolder. Every move is a bounded step, not a jump, so "calmer, and calmer
 * again" has an effect.
 */
export const PROJECTIONS: readonly Projection[] = [
  {
    words: ['calm', 'calmer', 'quiet', 'quieter', 'restrained', 'understated', 'subtle'],
    why: 'Calm is less of three things at once: less movement, less decoration, less colour.',
    apply: (candidate, catalogue) => [
      ...step(candidate, catalogue, 'motionTemperament', -1),
      ...step(candidate, catalogue, 'ornament', -1),
      ...budget(candidate, -1),
      ...set(candidate, 'colorStrategy', 'quiet'),
    ],
  },
  {
    words: ['bold', 'bolder', 'loud', 'louder', 'vivid', 'energetic', 'expressive'],
    why: 'The inverse of calm, along the same three scales.',
    apply: (candidate, catalogue) => [
      ...step(candidate, catalogue, 'motionTemperament', 1),
      ...budget(candidate, 1),
      ...set(candidate, 'colorStrategy', 'tinted'),
    ],
  },
  {
    words: ['editorial', 'magazine', 'literary', 'bookish'],
    why: 'An editorial voice is a type decision first: the editorial personality, and the display slot in the catalogue’s own editorial face.',
    apply: (candidate, catalogue) => [
      ...set(candidate, 'typePersonality', 'editorial'),
      ...(catalogue.editorialDisplay === null
        ? []
        : font(candidate, 'display', catalogue.editorialDisplay)),
    ],
  },
  {
    words: ['technical', 'developer', 'terminal', 'engineering'],
    why: 'A technical voice sets the mono personality and puts the mono face in the display slot; sharp geometry goes with it.',
    apply: (candidate) => [
      ...set(candidate, 'typePersonality', 'mono'),
      ...font(candidate, 'display', candidate.fonts.mono.family),
      ...set(candidate, 'geometry', 'sharp'),
    ],
  },
  {
    words: ['friendly', 'friendlier', 'playful', 'approachable'],
    why: 'Friendliness is shape and movement rather than colour: rounder corners, more motion.',
    apply: (candidate, catalogue) => [
      ...set(candidate, 'geometry', 'round'),
      ...step(candidate, catalogue, 'motionTemperament', 1),
    ],
  },
  {
    words: ['serious', 'formal', 'corporate', 'institutional'],
    why: 'Crisp geometry and the minimum ornament a system can have while still having one.',
    apply: (candidate) => [
      ...set(candidate, 'geometry', 'crisp'),
      ...set(candidate, 'ornament', 'minimal'),
    ],
  },
  {
    words: ['warm', 'warmer', 'paper', 'amber', 'cosy'],
    why: 'Warmth is a hue band plus a warmer neutral: the accent moves toward the amber band and the neutral ramp takes more of it.',
    apply: (candidate) => temperature(candidate, WARM_BAND, 0.005),
  },
  {
    words: ['cool', 'cooler', 'icy', 'glacial'],
    why: 'The same move toward the blue band, with the neutral tint eased back.',
    apply: (candidate) => temperature(candidate, COOL_BAND, -0.005),
  },
  {
    words: ['dense', 'denser', 'compact', 'efficient'],
    why: 'Density is space and control size, never the type scale.',
    apply: (candidate, catalogue) => step(candidate, catalogue, 'density', -1),
  },
  {
    words: ['spacious', 'airy', 'airier', 'roomy', 'generous'],
    why: 'The other direction along the same axis.',
    apply: (candidate, catalogue) => step(candidate, catalogue, 'density', 1),
  },
  {
    words: ['flat', 'flatter'],
    why: 'A flat system separates resting surfaces with borders rather than with shadow.',
    apply: (candidate) => set(candidate, 'depth', 'flat'),
  },
  {
    words: ['layered', 'elevated', 'lifted'],
    why: 'The depth axis at its other end — surfaces that rest on the page rather than in it.',
    apply: (candidate) => set(candidate, 'depth', 'elevated'),
  },
  {
    words: ['glass', 'glassy', 'glassmorphic', 'frosted', 'translucent'],
    why:
      'Depth as material: transient panes go translucent and blur their backdrop, with the ' +
      'glass law holding text over worst-case backdrops.',
    apply: (candidate) => set(candidate, 'depth', 'glass'),
  },
  {
    words: ['sharp', 'sharper', 'angular', 'geometric'],
    why: 'Geometry at zero radius.',
    apply: (candidate) => set(candidate, 'geometry', 'sharp'),
  },
  {
    words: ['rounded', 'round', 'rounder', 'pill'],
    /*
     * `soft` is deliberately absent. It names a value on *two* axes (geometry
     * and contrast temperament), so it would have to be guessed, and this
     * table's rule is that such a word stays unmapped.
     */
    why: 'Geometry at its roundest.',
    apply: (candidate) => set(candidate, 'geometry', 'round'),
  },
  {
    words: ['stark', 'starker', 'contrasty', 'punchy'],
    why: 'Contrast temperament decides how far the text and border families sit from their surfaces.',
    apply: (candidate) => set(candidate, 'contrastTemperament', 'stark'),
  },
  {
    words: ['gentle', 'gentler', 'hazy'],
    why: 'The soft end of the same axis. Still lawful — the contrast floors are enforced under every temperament.',
    apply: (candidate) => set(candidate, 'contrastTemperament', 'soft'),
  },
  {
    words: ['monochrome', 'achromatic', 'greyscale', 'colourless', 'colorless'],
    why: 'The zero budget: the accent family derives from the neutral ramp, and the status lamps stay lit anyway.',
    apply: (candidate) => {
      const from = candidate.chromaBudget
      candidate.chromaBudget = 'none'
      return from === 'none' ? [] : [{ field: 'palette.chromaBudget', from, to: 'none' }]
    },
  },
  {
    words: ['ink', 'inky', 'newsprint'],
    why: 'A hue held to a whisper rather than the absence of one.',
    apply: (candidate) => {
      const from = candidate.chromaBudget
      candidate.chromaBudget = 'ink'
      return from === 'ink' ? [] : [{ field: 'palette.chromaBudget', from, to: 'ink' }]
    },
  },
  {
    words: ['grain', 'grainy', 'textured'],
    why: 'Texture is ornament, so it is that axis and not a ninth one.',
    apply: (candidate) => set(candidate, 'ornament', 'grain'),
  },
  {
    words: ['grid', 'gridded', 'blueprint'],
    why: 'The other textured position on the ornament axis.',
    apply: (candidate) => set(candidate, 'ornament', 'grid'),
  },
  {
    words: ['still', 'motionless', 'static'],
    why: '“None” means none, including the delays a stagger is made of.',
    apply: (candidate) => set(candidate, 'motionTemperament', 'none'),
  },
  {
    words: ['dark', 'darker', 'night', 'nocturnal'],
    why: 'The mode a first visit opens in, whatever the device’s mode. Both modes are always emitted; this is the default.',
    apply: (candidate) => {
      const from = candidate.defaultMode
      candidate.defaultMode = 'dark'
      return from === 'dark' ? [] : [{ field: 'defaultMode', from, to: 'dark' }]
    },
  },
  {
    // Not `light`, which can mean a weight, a mode or a tint. `daylight` has one
    // meaning.
    words: ['daylight', 'daytime'],
    why: 'The other fixed default mode. Without either word the proposal keeps its starting system’s, which may follow the device.',
    apply: (candidate) => {
      const from = candidate.defaultMode
      candidate.defaultMode = 'light'
      return from === 'light' ? [] : [{ field: 'defaultMode', from, to: 'light' }]
    },
  },
  {
    words: ['gradient', 'duotone', 'blended'],
    why: 'Seeds the partner hue gradient roles run to. Without one every gradient role resolves to its own solid.',
    apply: (candidate) => {
      const to = (candidate.accentHue + 40) % 360
      const from = candidate.gradientHue
      candidate.gradientHue = to
      return from === to
        ? []
        : [
            {
              field: 'palette.gradientHue',
              from: from === undefined ? 'none' : String(from),
              to: String(to),
            },
          ]
    },
  },
] as const

/**
 * Words that carry no design decision, so they are neither mapped nor
 * reported. Listing them avoids guessing at them, and avoids hiding a real miss
 * such as "zesty" among articles. "More" is here because every word in the
 * table already means more of itself: "more editorial" is "editorial".
 */
export const IGNORED: readonly string[] = [
  'a',
  'an',
  'and',
  'the',
  'but',
  'or',
  'with',
  'without',
  'more',
  'make',
  'made',
  'making',
  'it',
  'this',
  'that',
  'feel',
  'feels',
  'feeling',
  'look',
  'looks',
  'looking',
  'like',
  'want',
  'should',
  'be',
  'is',
  'to',
  'of',
  'for',
  'in',
  'on',
  'something',
  'please',
  'i',
  'we',
  'my',
  'our',
  'system',
  'theme',
  'palette',
  'design',
]

/** Why a word that asks for part of a move moves nothing. */
const SMALLER =
  'a degree: a word here moves its axis one whole step or sets one value, never part of one, ' +
  'so name the value meant as <axis>=<value>'

/** Why a word that asks for more than one move moves nothing. */
const LARGER =
  'a degree: a word here moves its axis one step each time it is written or sets one value, ' +
  'so write the word again, or name the value meant as <axis>=<value>'

/**
 * Words of degree, each with why the table cannot express it. A word in the
 * table moves its axis one step or sets it to one value, so "slightly rounded"
 * reads as "rounded", the roundest geometry, and "less calm" as "calm". A
 * degree word is reported in `unmapped`, and its reason in `unread`, so a
 * reader knows that it moved nothing.
 */
export const DEGREES: Readonly<Record<string, string>> = {
  less:
    'a degree: it does not turn the word after it around, which still moves its own way, so ' +
    'use the opposite word, or name the value meant as <axis>=<value>',
  slightly: SMALLER,
  somewhat: SMALLER,
  bit: SMALLER,
  little: SMALLER,
  very: LARGER,
  much: LARGER,
}

/**
 * An exact value, `<axis>=<value>`: an axis's name, then the value, to the
 * next space, comma or semicolon. Every other word is a run of letters, as
 * the table reads words, so punctuation and digits split rather than hide one.
 */
const TOKEN = /([A-Za-z][A-Za-z0-9]*)=([^\s,;]*)|[A-Za-z]+/g

const IGNORED_SET = new Set(IGNORED)
const BY_WORD = new Map<string, Projection>(
  PROJECTIONS.flatMap((projection) => projection.words.map((word) => [word, projection] as const)),
)

/**
 * `<axis>=<value>` applied: the axis set to the value, when the catalogue has
 * both, or why it moved nothing. The axis and its values are the registry's
 * (`catalogue.ladders`), matched without regard to case, so `polymorph axes`
 * and `get_theme_axes` list every lawful one.
 */
function exact(
  candidate: Candidate,
  catalogue: Catalogue,
  axisWritten: string,
  valueWritten: string,
): { entry: RationaleEntry; value: string } | { why: string } {
  const axes = Object.keys(catalogue.ladders)
  const axis = axes.find((name) => name.toLowerCase() === axisWritten.toLowerCase())
  if (axis === undefined)
    return { why: `no axis is called ${axisWritten} — the axes are ${axes.join(', ')}` }
  const ladder = catalogue.ladders[axis] ?? []
  const value = ladder.find((entry) => entry.toLowerCase() === valueWritten.toLowerCase())
  if (value === undefined) return { why: `${axis} takes ${ladder.join(', ')}` }
  return {
    value,
    entry: {
      word: `${axis}=${value}`,
      why: `A value named exactly, from the ones ${axis} takes: ${ladder.join(', ')}.`,
      moves: set(candidate, axis, value),
    },
  }
}

/** The canonical word of each entry, which the tool's description publishes. */
export function vocabulary(): string[] {
  return PROJECTIONS.map((projection) => projection.words[0] as string)
}

/* -------------------------------------------------------------------------- */
/* The tool                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProposeArgs {
  intent: string
  basedOn?: { system?: string; palette?: string }
}

export interface RationaleEntry {
  /**
   * The word as the caller wrote it (lowercased), or an exact value as
   * `<axis>=<value>` in the catalogue's spelling.
   */
  word: string
  /** The table's sentence for it. */
  why: string
  /** What it changed. Empty means the draft already had those values. */
  moves: Move[]
}

/** A word that moved nothing although the table read it, and why. */
export interface UnreadEntry {
  /** The word as the caller wrote it: a word of degree, or `<axis>=<value>`. */
  word: string
  why: string
}

export interface ProposeAnswer {
  /** A complete `design/systems/<name>.json`, schema-valid. */
  system: unknown
  /** A complete `design/palettes/<name>.json`, schema-valid. */
  palette: unknown
  /** Which system and palette the proposal started from. */
  basedOn: { system: string; palette: string }
  rationale: RationaleEntry[]
  /**
   * Words that moved nothing: words the table does not have, words of degree,
   * and exact values whose axis or value the catalogue does not have. Never
   * guessed at.
   */
  unmapped: string[]
  /** The words in `unmapped` that the table read and could not apply, each with why. */
  unread: UnreadEntry[]
  lawful: boolean
  /** Every reason this pair was refused, in the words of whatever refused it. */
  faults: string[]
}

function catalogueOf(registry: Registry): Catalogue {
  return {
    ladders: Object.fromEntries(registry.theme.axes.map((axis) => [axis.name, [...axis.values]])),
    editorialDisplay:
      registry.theme.systems
        .find((system) => system.axes['typePersonality'] === 'editorial')
        ?.fonts.find((requirement) => requirement.roles.includes('display'))?.family ?? null,
  }
}

/**
 * The catalogue publishes a family per *package*, listing the roles it serves.
 * The body family lists `heading` when the system states no heading slot, so a
 * heading family is carried only when it is another family than the body's,
 * and a proposal from a system without the slot has none either.
 */
function fontsOf(system: RegistrySystem): Candidate['fonts'] {
  const slots: Candidate['fonts'] = {
    body: { family: '' },
    display: { family: '' },
    mono: { family: '' },
  }
  let heading: string | undefined
  for (const requirement of system.fonts) {
    for (const role of requirement.roles) {
      if (role === 'body' || role === 'display' || role === 'mono') {
        slots[role] = { family: requirement.family }
      }
      if (role === 'heading') heading = requirement.family
    }
  }
  if (heading !== undefined && heading !== slots.body.family) slots.heading = { family: heading }
  return slots
}

/**
 * Where a proposal starts when the caller names nothing.
 *
 * The first *designed* system in the catalogue, with the palette it declares.
 * It is deliberately not called "the product default". The system a product
 * opens in is set in `design/defaults.json`, which is a decision, not a
 * registry fact, and a front that read it would reach past the catalogue for
 * its answer.
 */
function baseSystem(registry: Registry): RegistrySystem | undefined {
  return (
    registry.theme.systems.find((system) => system.kind === 'designed') ?? registry.theme.systems[0]
  )
}

function named<T extends { name: string }>(list: readonly T[], name: string): T | undefined {
  return list.find((entry) => entry.name === name)
}

/** `pop` + [calm, editorial] -> `pop-calm-editorial`; both files take the name. */
function proposalName(base: string, words: readonly string[]): string {
  const suffix = words.slice(0, 2).join('-')
  return suffix === '' ? `${base}-variant` : `${base}-${suffix}`
}

/**
 * Takes the context structurally instead of importing `ToolContext`, which
 * would create an import cycle for a type this needs only one field of.
 * Nothing here reads the repository. A proposal is a projection of the
 * catalogue plus the engine's verdict on it, so there is no file to open.
 */
export function proposeTheme(context: { registry: Registry }, args: ProposeArgs): ProposeAnswer {
  const registry = context.registry
  const faults: string[] = []

  const fallbackSystem = baseSystem(registry)
  if (!fallbackSystem) throw new Error('polymorph: the catalogue has no systems to propose from')

  let system: RegistrySystem = fallbackSystem
  if (args.basedOn?.system !== undefined) {
    const found = named(registry.theme.systems, args.basedOn.system)
    if (found) system = found
    else {
      faults.push(
        `no system called "${args.basedOn.system}" — the catalogue has ` +
          `${registry.theme.systems.map((entry) => entry.name).join(', ')}`,
      )
    }
  }

  let palette: RegistryPalette | undefined = named(registry.theme.palettes, system.defaultPalette)
  if (args.basedOn?.palette !== undefined) {
    const found = named(registry.theme.palettes, args.basedOn.palette)
    if (found) palette = found
    else {
      faults.push(
        `no palette called "${args.basedOn.palette}" — the catalogue has ` +
          `${registry.theme.palettes.map((entry) => entry.name).join(', ')}`,
      )
    }
  }
  if (!palette) throw new Error('polymorph: the catalogue has no palettes to paint a proposal with')

  const candidate: Candidate = {
    axes: { ...system.axes },
    fonts: fontsOf(system),
    defaultMode: system.defaultMode,
    accentHue: palette.accentHue,
    ...(palette.gradientHue === undefined ? {} : { gradientHue: palette.gradientHue }),
    ...(palette.neutralHue === undefined ? {} : { neutralHue: palette.neutralHue }),
    neutralTint: palette.neutralTint,
    chromaBudget: palette.chromaBudget,
  }

  const catalogue = catalogueOf(registry)
  const rationale: RationaleEntry[] = []
  const unmapped: string[] = []
  const unread: UnreadEntry[] = []
  const canonical: string[] = []
  const notRead = (word: string, why: string | null) => {
    if (unmapped.includes(word)) return
    unmapped.push(word)
    if (why !== null) unread.push({ word, why })
  }

  // In the order written, so an exact value and a word that name one axis
  // resolve as two words do: the later one wins.
  for (const [token, axis, written] of args.intent.matchAll(TOKEN)) {
    if (axis !== undefined) {
      // A value written in quotes, or at the end of a sentence, is the value.
      const value = (written ?? '').replace(/[.!?]+$/, '').replace(/^(["'])(.*)\1$/, '$2')
      const applied = exact(candidate, catalogue, axis, value)
      if ('why' in applied) notRead(token, applied.why)
      else {
        rationale.push(applied.entry)
        if (!canonical.includes(applied.value)) canonical.push(applied.value)
      }
      continue
    }
    const word = token.toLowerCase()
    if (IGNORED_SET.has(word)) continue
    // Own keys only: "constructor" is a word, not a degree.
    const degree = Object.hasOwn(DEGREES, word) ? DEGREES[word] : undefined
    if (degree !== undefined) {
      notRead(word, degree)
      continue
    }
    const projection = BY_WORD.get(word)
    if (!projection) {
      notRead(word, null)
      continue
    }
    rationale.push({ word, why: projection.why, moves: projection.apply(candidate, catalogue) })
    const head = projection.words[0] as string
    if (!canonical.includes(head)) canonical.push(head)
  }

  const name = proposalName(system.name, canonical)

  const systemDocument = {
    name,
    axes: candidate.axes,
    fonts: candidate.fonts,
    // The pair is proposed together, so the system declares its own palette. A
    // `defaultPalette` that named something else would record a decision nobody
    // made.
    defaultPalette: name,
    defaultMode: candidate.defaultMode,
    kind: 'designed',
  }

  const paletteDocument = {
    name,
    accentHue: candidate.accentHue,
    // Spread conditionally, so an absent seed is an absent key, in the document
    // and in the schema.
    ...(candidate.gradientHue === undefined ? {} : { gradientHue: candidate.gradientHue }),
    ...(candidate.neutralHue === undefined ? {} : { neutralHue: candidate.neutralHue }),
    neutralTint: candidate.neutralTint,
    chromaBudget: candidate.chromaBudget,
  }

  faults.push(...verdict(systemDocument, paletteDocument))

  return {
    system: systemDocument,
    palette: paletteDocument,
    basedOn: { system: system.name, palette: palette.name },
    rationale,
    unmapped,
    unread,
    lawful: faults.length === 0,
    faults,
  }
}

/**
 * The verdict is measured, not asserted, and it is not measured *here*.
 *
 * The audit is in the engine, as `admitTheme` (`@polymorph/theme`). The agent
 * tool, the CLI and any guest application must give identical messages, so
 * this front calls `admitTheme` like any other engine function. Schema faults
 * name the offending document in the path. The rest are the laws' own
 * messages.
 */
function verdict(systemDocument: unknown, paletteDocument: unknown): string[] {
  return admitTheme({ system: systemDocument, palette: paletteDocument }).faults.map(
    (fault) => fault.message,
  )
}
