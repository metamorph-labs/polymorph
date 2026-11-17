import { beforeAll, describe, expect, it } from 'vitest'
import { h } from 'vue'

import { installTestTheme } from '@polymorph/engine/testing'

import { mount } from '../mount'
import SectionNav from './SectionNav.vue'

/**
 * Which item the generated SectionNav marks as current, as the React member's
 * test holds it (`design/components/section-nav.md`, Matching).
 */

beforeAll(installTestTheme)

const PAGES = [
  { label: 'Users', href: '/identity/users' },
  { label: 'Groups', href: '/identity/groups/' },
  { label: 'Roles', href: '/identity/roles' },
]

async function marked(items: { label: string; href: string }[], current?: string) {
  const { host } = await mount(() => h(SectionNav, { label: 'Identity sections', items, current }))
  return [...host.querySelectorAll('[aria-current="page"]')].map((item) => item.textContent?.trim())
}

describe('the current item', () => {
  it('is matched on the page `current` names: a trailing slash, a query and a hash are not part of it', async () => {
    expect(await marked(PAGES, '/identity/users/')).toEqual(['Users'])
    expect(await marked(PAGES, '/identity/users?page=2#top')).toEqual(['Users'])
    expect(await marked(PAGES, '/identity/groups')).toEqual(['Groups'])
    expect(await marked(PAGES, '/identity/users/42')).toEqual([])
    expect(await marked(PAGES)).toEqual([])
  })

  it('is matched for a `current` written with its origin, as `location.href` is', async () => {
    expect(await marked(PAGES, 'https://app.example.com/identity/users?page=2#top')).toEqual([
      'Users',
    ])
    expect(
      await marked([{ label: 'Home', href: '/' }, ...PAGES], 'HTTPS://App.Example.com'),
    ).toEqual(['Home'])
    const withOrigins = [
      { label: 'Docs', href: 'https://docs.example.com/identity/users' },
      { label: 'Users', href: 'https://app.example.com/identity/users/' },
    ]
    expect(await marked(withOrigins, 'https://app.example.com/identity/users')).toEqual(['Users'])
    expect(await marked(withOrigins, '/identity/users')).toEqual([])
  })

  it('is the item with exactly the `current` href, where items differ only by a query', async () => {
    const ranges = [
      { label: 'This week', href: '/reports?range=week' },
      { label: 'This month', href: '/reports?range=month' },
    ]
    expect(await marked(ranges, '/reports?range=month')).toEqual(['This month'])
    expect(await marked(ranges, '/reports/')).toEqual(['This week'])
  })

  it('is one of two items that share an href, and both are drawn', async () => {
    const twice = [
      { label: 'Overview', href: '/identity' },
      { label: 'Summary', href: '/identity' },
    ]
    const { host } = await mount(() =>
      h(SectionNav, { label: 'Identity sections', items: twice, current: '/identity' }),
    )
    expect(host.querySelectorAll('a')).toHaveLength(2)
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('compares an href that is only a hash as it is written', async () => {
    const hashes = [
      { label: 'Users', href: '#users' },
      { label: 'Roles', href: '#roles' },
    ]
    expect(await marked(hashes, '#roles')).toEqual(['Roles'])
  })
})
