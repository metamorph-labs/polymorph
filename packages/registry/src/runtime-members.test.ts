import { describe, expect, it } from 'vitest'

import { FRAMEWORKS } from './frameworks'
import { PLATFORMS } from './platforms'
import { composeOutputContract, composeRuntimeCard } from './runtime-card'
import { addressNeed, allowedMembers, defaultMembers } from './runtime-members'
import type { ScreenTable, TableMember, TableProp } from './screen-table'

/**
 * Which members a host that refuses addresses can draw, on a vocabulary
 * written here. The generated table is held by `packages/screen/src/card.test.ts`
 * and `packages/screen/src/check.test.ts`.
 */

const prop = (name: string, type: string, optional = false): TableProp => ({
  name,
  type,
  optional,
})

const member = (name: string, props: TableProp[]): TableMember => ({
  name,
  tier: 'controls',
  purpose: `The ${name}`,
  props,
  parts: [],
  grid: null,
  platforms: Object.fromEntries(
    PLATFORMS.map((platform) => [platform, { status: 'native' }]),
  ) as TableMember['platforms'],
  frameworks: Object.fromEntries(
    FRAMEWORKS.map((framework) => [framework, { status: 'native' }]),
  ) as TableMember['frameworks'],
  controlled: {},
  call: null,
})

const VOCABULARY: ScreenTable = {
  version: '0.0.0',
  components: [
    member('Link', [prop('href', 'string'), prop('children', 'string')]),
    member('Card', [prop('href', 'string | undefined', true), prop('title', 'string')]),
    member('Nav', [prop('items', 'NavItem[]')]),
    member('Crumbs', [prop('items', 'readonly Crumb[]')]),
    member('Gallery', [prop('images', 'Array<Picture>')]),
    member('Loop', [prop('node', 'LoopNode')]),
    member('Either', [prop('value', 'NavItem | string')]),
    member('Maybe', [prop('items', 'NavItem[] | undefined', true)]),
    member('Markdown', [prop('children', 'string')]),
  ],
  exceptions: { primitives: [] },
  icons: { roles: [], trailing: [] },
  dataTypes: [
    { name: 'NavItem', params: [], fields: [prop('label', 'string'), prop('href', 'string')] },
    {
      name: 'Crumb',
      params: [],
      fields: [prop('label', 'string'), prop('href', 'string | undefined', true)],
    },
    { name: 'Picture', params: [], union: ['Photo', 'Drawing'], fields: [] },
    { name: 'Photo', params: [], fields: [prop('src', 'string'), prop('alt', 'string')] },
    { name: 'Drawing', params: [], fields: [prop('frame', 'Frame')] },
    { name: 'Frame', params: [], fields: [prop('src', 'string')] },
    { name: 'LoopNode', params: [], fields: [prop('next', 'LoopNode | null')] },
  ],
}

describe('a member a host that refuses addresses cannot draw', () => {
  it('requires an address in a prop, or in a required field of the data type a prop takes', () => {
    expect(addressNeed(VOCABULARY, 'Link')).toBe('requires an address at `href`')
    expect(addressNeed(VOCABULARY, 'Nav')).toBe('requires an address at `items` (`NavItem.href`)')
    // Each type of a union needs one, here one of them through another type.
    expect(addressNeed(VOCABULARY, 'Gallery')).toBe('requires an address at `images` (`Photo.src`)')
  })

  it('draws the links and pictures its text writes', () => {
    expect(addressNeed(VOCABULARY, 'Markdown')).toBe('draws the links and pictures its text writes')
  })

  it('is no member whose address is optional, or whose prop takes something else beside', () => {
    for (const name of ['Card', 'Crumbs', 'Either', 'Maybe', 'Loop', 'Nothing']) {
      expect(addressNeed(VOCABULARY, name), name).toBeNull()
    }
  })

  it('is left out of the members a host allows only when the host refuses addresses', () => {
    const all = defaultMembers(VOCABULARY)
    expect([...allowedMembers(VOCABULARY)]).toEqual(all)
    expect([...allowedMembers(VOCABULARY, { addresses: 'allowed' })]).toEqual(all)
    expect([...allowedMembers(VOCABULARY, { addresses: 'refused' })]).toEqual([
      'Card',
      'Crumbs',
      'Loop',
      'Either',
      'Maybe',
    ])
    expect([
      ...allowedMembers(VOCABULARY, { members: ['Link', 'Card'], addresses: 'refused' }),
    ]).toEqual(['Card'])
  })
})

describe('the whole card', () => {
  it('opens, lists the members and ends with the output contract, in the format named', () => {
    const card = composeRuntimeCard(VOCABULARY, { members: ['Card'], spec: 'probe/1' })
    expect(card.startsWith('# Writing a screen\n')).toBe(true)
    expect(card).toContain('- **Card** — The Card · href: string · title*: string')
    expect(
      card.endsWith(composeOutputContract(VOCABULARY, { members: ['Card'], spec: 'probe/1' })),
    ).toBe(true)
    expect(card).toContain('in the `probe/1` format')
  })

  it('leaves the address props and the members that need one out for a host that refuses addresses', () => {
    const card = composeRuntimeCard(VOCABULARY, { addresses: 'refused', spec: 'probe/1' })
    expect(card).toContain('- **Card** — The Card · title*: string')
    expect(card).not.toContain('**Link**')
    expect(card).toContain('- **Crumb** · label*: string')
    expect(card).toContain('This host shows no link and loads nothing from an address')
  })
})
