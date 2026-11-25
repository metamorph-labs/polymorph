import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildRegistry } from './build'
import { searchRegistry } from './search'

/**
 * Both fronts use one ranking. The MCP transcript test checks
 * `search_components` against this behaviour over a real transport. This file
 * pins the registry-level behaviour that both fronts share. That includes the
 * `wears` filter that the workbench's Components page adds. It lists the
 * members affected when a class token is re-pointed, read directly from the
 * per-component token lists.
 */

const registry = buildRegistry(resolve(import.meta.dirname, '../../..'))

describe('searchRegistry', () => {
  it('an empty query lists the catalogue, alphabetically', () => {
    const hits = searchRegistry(registry)
    expect(hits.length).toBe(registry.components.length)
    const names = hits.map((hit) => hit.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('a name match outranks a purpose match', () => {
    const hits = searchRegistry(registry, { query: 'button' })
    expect(hits[0]?.name).toBe('Button')
    expect(hits[0]?.matched).toBe('name')
  })

  it('several words find a member by its name as a person says it', () => {
    for (const query of ['date picker', 'date-picker', 'Date Picker']) {
      const hits = searchRegistry(registry, { query })
      expect(hits[0]?.name, query).toBe('DatePicker')
      expect(hits[0]?.matched, query).toBe('name')
    }
  })

  it('several words that are no name and no phrase are matched word by word', () => {
    const hits = searchRegistry(registry, { query: 'table sortable rows' })
    expect(hits[0]?.name).toBe('Table')
    expect(hits[0]?.matched).toContain('name')

    // A member that answers some of the words is found below one that answers them all.
    const some = searchRegistry(registry, { query: 'button zzzz' })
    expect(some[0]?.name).toBe('Button')
    const all = searchRegistry(registry, { query: 'button' })
    expect(all.length).toBeGreaterThanOrEqual(some.length)

    expect(searchRegistry(registry, { query: 'zzzz qqqq' })).toEqual([])
    // Common words that name no member do not match the catalogue through its purposes.
    expect(searchRegistry(registry, { query: 'no member is called this' })).toEqual([])
  })

  it('wears narrows to the members whose own stylesheet reads the token', () => {
    const seat = searchRegistry(registry, { wears: '--pm-shadow-seat' })
    expect(seat.length).toBeGreaterThan(0)
    expect(seat.map((hit) => hit.name)).toContain('Button')
    for (const hit of seat) {
      const component = registry.components.find((entry) => entry.name === hit.name)
      expect(component?.tokens).toContain('--pm-shadow-seat')
    }
    // The filter composes with ranking rather than replacing it.
    const both = searchRegistry(registry, { wears: '--pm-shadow-seat', query: 'input' })
    expect(both.map((hit) => hit.name)).toContain('Input')
    expect(both.map((hit) => hit.name)).not.toContain('Card')
  })

  it('platform leaves out the members absent there, and keeps the adapted ones', () => {
    const android = searchRegistry(registry, { platform: 'android' }).map((hit) => hit.name)
    const absent = registry.components.filter(
      (component) => component.platforms.android.status === 'absent',
    )
    expect(absent.length).toBeGreaterThan(0)
    expect(android).toHaveLength(registry.components.length - absent.length)
    for (const component of absent) expect(android).not.toContain(component.name)
    expect(android).toContain('Dialog')

    // A query for a member absent on the platform finds nothing by name, and
    // the web, where nothing is absent, is the whole catalogue.
    expect(
      searchRegistry(registry, { platform: 'ios', query: 'tooltip' }).map((hit) => hit.name),
    ).not.toContain('Tooltip')
    expect(searchRegistry(registry, { platform: 'web' })).toHaveLength(registry.components.length)
  })

  it('limit caps the hits, and an unset limit returns everything', () => {
    expect(searchRegistry(registry, { limit: 3 })).toHaveLength(3)
    expect(searchRegistry(registry).length).toBeGreaterThan(3)
  })
})
