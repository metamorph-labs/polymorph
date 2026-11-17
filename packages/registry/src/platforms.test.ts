import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PLATFORMS,
  platformFaults,
  type MemberDependencies,
  type Platform,
  type PlatformDocument,
} from './platforms'
import {
  openUiProgram,
  readPlatformDocuments,
  readPlatformMap,
  readVocabulary,
  vocabularyNames,
} from './vocabulary'

/**
 * The platform map's law.
 *
 * The map says how every member renders on every platform
 * (`design/platforms/*.json`). The claims: each file has the map's shape and
 * names its own platform; every member of the vocabulary has an entry in every
 * file, and no file names something that is not a member; the entries are
 * sorted by name; no entry still has the scaffold's `DECIDE` placeholder; an
 * adapted member says how it renders; an absent member says why and names a
 * substitute that exists (or `none`) and is not itself absent there; a native
 * member that composes one absent there says why native still holds; and the
 * web has no absent member, because the React vocabulary is the web rendering.
 *
 * The member list is the one the registry builds (gallery members and the
 * ladder's primitives), and what each member composes is the vocabulary read's
 * `dependencies.components`. `platformFaults` is the function the build runs.
 * A new member without an entry therefore fails here by name, and fails
 * `pnpm registry` with the same sentence. `pnpm new:member` writes a `native`
 * entry into the web file and a `DECIDE` placeholder into the phone files, which
 * fails here until the author decides.
 */

const ROOT = resolve(import.meta.dirname, '../../..')
const ui = openUiProgram(ROOT)
const members = vocabularyNames(ui)
const documents = readPlatformDocuments(ROOT)

/**
 * What each member composes. The vocabulary read needs a lawful map, so this is
 * read only once the map has passed without it, as the build does.
 */
const composition = (): MemberDependencies =>
  Object.fromEntries(
    readVocabulary(ui, readPlatformMap(ROOT, members)).map(({ name, dependencies }) => [
      name,
      dependencies.components,
    ]),
  )

describe('the platform map covers the vocabulary', () => {
  it('reads a whole vocabulary and a file for every platform, so a pass is meaningful', () => {
    expect(members.length).toBeGreaterThan(100)
    expect(members).toContain('Icon')
    for (const primitive of ['Bespoke', 'DensityScope', 'ThirdParty', 'ToneScope']) {
      expect(members).toContain(primitive)
    }
    for (const platform of PLATFORMS) expect(documents[platform], platform).toBeDefined()
  })

  it('is lawful', () => {
    expect(platformFaults(members, documents)).toEqual([])
  })

  it('is lawful about what each member composes', () => {
    const composed = composition()
    // Stat composes Sparkline, which Android lacks, so the clause has something to judge.
    expect(composed['Stat']).toContain('Sparkline')
    expect(platformFaults(members, documents, composed)).toEqual([])
    // Reading what every member composes builds a TypeScript program over the whole vocabulary,
    // which takes longer than the default timeout when the suite runs under coverage.
  }, 60_000)
})

describe('the law can fail', () => {
  /** A copy of the real documents, changed in one way per test. */
  const broken = (
    mutate: (draft: Record<Platform, PlatformDocument>) => void,
    dependencies?: MemberDependencies,
  ): string[] => {
    const draft = JSON.parse(JSON.stringify(documents)) as Record<Platform, PlatformDocument>
    mutate(draft)
    return platformFaults(members, draft, dependencies)
  }

  it('names a member missing from a file, and the file', () => {
    expect(
      broken((draft) => {
        delete draft.android.members['Button']
      }),
    ).toEqual([
      'design/platforms/android.json: no entry for Button — every member has one on every platform',
    ])
  })

  it('names an entry for something that is not a member', () => {
    expect(
      broken((draft) => {
        draft.ios.members['Modal'] = { status: 'native' }
      }),
    ).toContain('design/platforms/ios.json: Modal is not a member of the vocabulary')
  })

  it('refuses a file that is not sorted by name', () => {
    const faults = broken((draft) => {
      const { Accordion, ...rest } = draft.ios.members
      draft.ios.members = { ...rest, Accordion: Accordion as PlatformDocument['members'][string] }
    })
    expect(faults.join('\n')).toContain('entries are not sorted by name')
  })

  it('refuses a missing file, a wrong shape and a file that names another platform', () => {
    expect(
      broken((draft) => {
        delete (draft as Partial<Record<Platform, PlatformDocument>>).android
      }),
    ).toEqual(['design/platforms/android.json: missing — every platform has a map'])

    expect(
      broken((draft) => {
        ;(draft.ios.members['Button'] as { status: string }).status = 'partial'
      }).join('\n'),
    ).toContain('design/platforms/ios.json.members.Button.status: "partial" is not one of')

    expect(
      broken((draft) => {
        draft.ios.platform = 'android'
      }),
    ).toContain(
      'design/platforms/ios.json: names its platform "android" — the file is the map for ios',
    )
  })

  it('wants an absent entry to say why and to name a substitute that exists', () => {
    const faults = broken((draft) => {
      draft.ios.members['Kbd'] = { status: 'absent' }
      draft.ios.members['Avatar'] = { status: 'absent', reason: 'No.', substitute: 'Portrait' }
    })
    expect(faults).toContain(
      'design/platforms/ios.json: Kbd is absent and does not say why (`reason`)',
    )
    expect(faults).toContain(
      'design/platforms/ios.json: Kbd is absent and names no substitute — name a member, or "none"',
    )
    expect(faults).toContain(
      'design/platforms/ios.json: Avatar’s substitute Portrait is not a member of the vocabulary',
    )
  })

  it('accepts `none` as a substitute, and refuses one that is itself absent', () => {
    expect(
      broken((draft) => {
        draft.ios.members['Kbd'] = { status: 'absent', reason: 'No keys.', substitute: 'none' }
      }),
    ).toEqual([])
    expect(
      broken((draft) => {
        draft.ios.members['Kbd'] = { status: 'absent', reason: 'No keys.', substitute: 'Tooltip' }
      }),
    ).toEqual(['design/platforms/ios.json: Kbd’s substitute Tooltip is itself absent on ios'])
  })

  it('wants an adapted entry to say how it renders, and gives a substitute only to the absent', () => {
    const faults = broken((draft) => {
      draft.android.members['Kbd'] = { status: 'adapted' }
      draft.android.members['Avatar'] = { status: 'native', substitute: 'Badge' }
    })
    expect(faults).toEqual([
      'design/platforms/android.json: Avatar is native, so it has no substitute — only an absent member does',
      'design/platforms/android.json: Kbd is adapted but does not say how it renders (`as`)',
    ])
  })

  it('refuses the scaffold’s DECIDE placeholder, so the author decides', () => {
    expect(
      broken((draft) => {
        draft.ios.members['Kbd'] = {
          status: 'native',
          reason: 'DECIDE: read the spec and set the status',
        }
      }),
    ).toEqual([
      'design/platforms/ios.json: Kbd still has the scaffold’s DECIDE placeholder — read its spec and decide how it renders on ios',
    ])
  })

  it('wants a native member that composes an absent one to say why, or to be adapted', () => {
    // Kbd and Badge compose nothing; these say they do, against the real map,
    // where Tooltip and HoverCard are absent on both phone platforms.
    const composes = { Kbd: ['Tooltip'], Badge: ['Button', 'HoverCard', 'Tooltip'] }
    expect(broken(() => {}, composes)).toEqual([
      'design/platforms/ios.json: Badge is native but composes HoverCard and Tooltip, absent on ios — make it adapted and say how it renders without them (`as`), or say why native holds (`reason`)',
      'design/platforms/ios.json: Kbd is native but composes Tooltip, absent on ios — make it adapted and say how it renders without it (`as`), or say why native holds (`reason`)',
      'design/platforms/android.json: Badge is native but composes HoverCard and Tooltip, absent on android — make it adapted and say how it renders without them (`as`), or say why native holds (`reason`)',
      'design/platforms/android.json: Kbd is native but composes Tooltip, absent on android — make it adapted and say how it renders without it (`as`), or say why native holds (`reason`)',
    ])
    expect(
      broken((draft) => {
        for (const platform of ['ios', 'android'] as const) {
          draft[platform].members['Kbd'] = { status: 'native', reason: 'Shortcuts are words here.' }
          draft[platform].members['Badge'] = { status: 'adapted', as: 'a label without a preview' }
        }
      }, composes),
    ).toEqual([])
  })

  it('refuses an absent member on the web, which is the vocabulary’s own rendering', () => {
    expect(
      broken((draft) => {
        draft.web.members['Tooltip'] = { status: 'absent', reason: 'Never.', substitute: 'Text' }
      }),
    ).toEqual([
      'design/platforms/web.json: Tooltip is absent — the vocabulary is the web rendering, so every member exists there',
    ])
  })
})
