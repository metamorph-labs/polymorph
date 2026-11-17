import { obj, rec, str, validate, type Shape } from './shape'

/**
 * The platform map: how each member renders on each platform it ships to.
 *
 * The vocabulary is one semantic set of members, and a platform renders each
 * of them in one of three ways. A member is `native` when it takes its own form
 * from the platform's own primitives, `adapted` when the platform renders it
 * another way (a popover as a sheet, a table as a list), and `absent` when there
 * is no sensible rendering, in which case the entry names what to use instead.
 *
 * The data lives in `design/platforms/<platform>.json`, one file per platform,
 * and the registry publishes each member's entry. That is what lets the tools
 * answer per platform: the system card for `ios` lists only what exists there,
 * the screen validator refuses a member that is absent on its target, and the
 * MCP tools take a platform.
 *
 * This module holds the map's names, its shape and its law, and reads no file,
 * so the browser can import it (`@polymorph/registry/platforms`). The build
 * reads the files (`vocabulary.ts`) and checks them with `platformFaults` below,
 * the same function `platforms.test.ts` runs, and checks them again with what
 * each member composes once the vocabulary is read (`build.ts`).
 */

export const PLATFORMS = ['web', 'ios', 'android'] as const
export type Platform = (typeof PLATFORMS)[number]

/**
 * The platform a caller means when it names none. The React vocabulary is the
 * web rendering, so every member exists there and the law keeps it that way.
 */
export const DEFAULT_PLATFORM: Platform = 'web'

export const PLATFORM_STATUSES = ['native', 'adapted', 'absent'] as const
export type PlatformStatus = (typeof PLATFORM_STATUSES)[number]

/** The substitute an `absent` entry names when nothing takes the member's place. */
export const NO_SUBSTITUTE = 'none'

/**
 * How the scaffold's placeholder begins. `pnpm new:member` writes a phone
 * platform's entry for a new member with a `reason` that starts with it, and the
 * law refuses any entry that still does, so the author reads the spec and sets
 * the status before the registry builds.
 */
export const UNDECIDED = 'DECIDE'

/**
 * Member -> every member it composes, directly or through another: the
 * registry's `dependencies.components`.
 */
export type MemberDependencies = Readonly<Record<string, readonly string[]>>

export interface PlatformEntry {
  status: PlatformStatus
  /** How the platform renders the member. Required when `adapted`. */
  as?: string
  /** Why the member is absent, or why it is rendered the way it is. */
  reason?: string
  /** For an `absent` member: the member to use instead, or `none`. */
  substitute?: string
}

export type MemberPlatforms = Record<Platform, PlatformEntry>

export interface PlatformDocument {
  platform: Platform
  members: Record<string, PlatformEntry>
}

/** Where a platform's map lives, relative to the repository root. */
export const platformFile = (platform: Platform): string => `design/platforms/${platform}.json`

export const PLATFORM_ENTRY: Shape = obj(
  {
    status: str({
      enum: PLATFORM_STATUSES,
      description:
        '`native`: the member in its own form, from the platform’s own primitives. `adapted`: ' +
        'rendered another way, such as a popover as a sheet. `absent`: no sensible rendering; ' +
        'use the substitute.',
    }),
    as: str({ description: 'How the platform renders it. Required when `adapted`.' }),
    reason: str({ description: 'Why it is absent, or why it renders as it does.' }),
    substitute: str({
      description:
        'For an `absent` member: the member to use instead, or `none`. Never itself absent on ' +
        'the same platform.',
    }),
  },
  { optional: ['as', 'reason', 'substitute'] },
)

export const PLATFORM_DOCUMENT: Shape = obj({
  platform: str({ enum: PLATFORMS }),
  members: rec(PLATFORM_ENTRY, {
    description: 'Member -> its entry on this platform. Every member has one, sorted by name.',
  }),
})

const byName = (a: string, b: string) => a.localeCompare(b)

/** `A`, `A and B`, `A, B and C`. */
const listed = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * Every way the platform files fail the map's law, as sentences that name the
 * file and the member.
 *
 * `members` is the vocabulary as the registry builds it: the gallery members
 * and the exception ladder's primitives. `documents` is each file's parsed
 * JSON, or `undefined` for a file that does not exist. `dependencies` is what
 * each member composes. Only the vocabulary read knows it, and that read needs
 * the map, so the build checks the map without it first and with it once the
 * members are read. Without it, the clause about composition is not checked.
 *
 * The law, per file: it has the shape above and names its own platform; every
 * member has an entry and no entry names something that is not a member; the
 * entries are sorted by name; no entry still carries the scaffold's `DECIDE`
 * placeholder; an `adapted` entry says how it renders; an `absent` entry says
 * why and names a substitute that exists and is not itself absent there, while
 * no other entry names one; and a `native` entry for a member that composes one
 * absent there says why native still holds, since the member cannot render as
 * it does on the web. The web file has no `absent` entry, because the React
 * vocabulary is the web rendering.
 */
export function platformFaults(
  members: readonly string[],
  documents: Partial<Record<Platform, unknown>>,
  dependencies?: MemberDependencies,
): string[] {
  const faults: string[] = []
  const known = new Set(members)

  for (const platform of PLATFORMS) {
    const file = platformFile(platform)
    const document = documents[platform]
    if (document === undefined) {
      faults.push(`${file}: missing — every platform has a map`)
      continue
    }

    const shapeFaults = validate(PLATFORM_DOCUMENT, document, file)
    if (shapeFaults.length > 0) {
      faults.push(...shapeFaults)
      continue
    }

    const map = document as PlatformDocument
    const say = (message: string) => faults.push(`${file}: ${message}`)

    if (map.platform !== platform) {
      say(`names its platform "${map.platform}" — the file is the map for ${platform}`)
    }

    const names = Object.keys(map.members)
    for (const name of members) {
      if (!Object.hasOwn(map.members, name)) {
        say(`no entry for ${name} — every member has one on every platform`)
      }
    }
    for (const name of names) {
      if (!known.has(name)) say(`${name} is not a member of the vocabulary`)
    }

    const sorted = [...names].sort(byName)
    const first = names.findIndex((name, at) => name !== sorted[at])
    if (first !== -1) {
      say(`entries are not sorted by name — ${sorted[first]} belongs before ${names[first]}`)
    }

    for (const [name, entry] of Object.entries(map.members)) {
      if (entry.reason?.startsWith(UNDECIDED) || entry.as?.startsWith(UNDECIDED)) {
        say(
          `${name} still has the scaffold’s ${UNDECIDED} placeholder — read its spec and decide ` +
            `how it renders on ${platform}`,
        )
      }
      if (entry.status === 'native' && entry.reason === undefined && dependencies) {
        const absent = (dependencies[name] ?? []).filter(
          (composed) => map.members[composed]?.status === 'absent',
        )
        if (absent.length > 0) {
          say(
            `${name} is native but composes ${listed(absent)}, absent on ${platform} — make it ` +
              'adapted and say how it renders without ' +
              `${absent.length === 1 ? 'it' : 'them'} (\`as\`), or say why native holds (\`reason\`)`,
          )
        }
      }
      if (entry.status === 'adapted' && entry.as === undefined) {
        say(`${name} is adapted but does not say how it renders (\`as\`)`)
      }
      if (entry.status !== 'absent') {
        if (entry.substitute !== undefined) {
          say(`${name} is ${entry.status}, so it has no substitute — only an absent member does`)
        }
        continue
      }

      if (platform === 'web') {
        say(`${name} is absent — the vocabulary is the web rendering, so every member exists there`)
      }
      if (entry.as !== undefined) say(`${name} is absent, so nothing renders it (\`as\`)`)
      if (entry.reason === undefined) say(`${name} is absent and does not say why (\`reason\`)`)

      const substitute = entry.substitute
      if (substitute === undefined) {
        say(`${name} is absent and names no substitute — name a member, or "${NO_SUBSTITUTE}"`)
      } else if (substitute !== NO_SUBSTITUTE) {
        if (!known.has(substitute)) {
          say(`${name}’s substitute ${substitute} is not a member of the vocabulary`)
        } else if (substitute === name) {
          say(`${name} names itself as its substitute`)
        } else if (map.members[substitute]?.status === 'absent') {
          say(`${name}’s substitute ${substitute} is itself absent on ${platform}`)
        }
      }
    }
  }

  return faults
}

/**
 * Each member's entries, keyed by member, from documents that passed
 * `platformFaults`. The caller checks first; this only rearranges.
 */
export function platformsByMember(
  members: readonly string[],
  documents: Record<Platform, PlatformDocument>,
): Map<string, MemberPlatforms> {
  return new Map(
    members.map((name) => [
      name,
      Object.fromEntries(
        PLATFORMS.map((platform) => [platform, documents[platform].members[name] as PlatformEntry]),
      ) as MemberPlatforms,
    ]),
  )
}
