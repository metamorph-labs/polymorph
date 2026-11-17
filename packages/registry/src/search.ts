import type { Registry } from './build'
import type { Framework } from './frameworks'
import type { Platform } from './platforms'
import type { RegistryComponent } from './vocabulary'

/**
 * Search over the registry. It lives here, not in the MCP server, so that the
 * two fronts that browse the vocabulary (the agent's `search_components` and
 * the workbench's Components page) rank with the same rule. The registry is
 * the single source of what exists, and this file is the single source of how
 * a query finds it. No front computes anything the registry does not hold.
 *
 * It is published as its own subpath (`@polymorph/registry/search`) and is
 * browser-safe because its imports are type-only. So the workbench can rank in
 * the page, while the root index keeps `buildRegistry` and its `node:fs` for
 * the tools that run with file access.
 */

export interface SearchFilters {
  query?: string
  tier?: string
  origin?: 'installed' | 'vendored'
  /** A `--pm-*` class token. Keeps only members whose own stylesheet reads it. */
  wears?: string
  /**
   * Keeps only members that exist on this platform: `absent` ones are left out,
   * `adapted` ones stay. Unset searches the whole vocabulary.
   */
  platform?: Platform
  /**
   * Keeps only members the framework's vocabulary ships: `absent` ones are
   * left out. Unset searches the whole vocabulary.
   */
  framework?: Framework
  limit?: number
}

export interface SearchHit {
  name: string
  tier: string
  origin: 'installed' | 'vendored'
  purpose: string
  /** What the query matched: `name`, `purpose`, a prop or a variant. */
  matched: string
}

/**
 * An empty query lists the whole catalogue, deliberately. A caller usually asks
 * what the system contains before asking what it calls a dropdown. A search
 * that required a term would force the caller to guess one.
 */
export function scoreComponent(
  component: RegistryComponent,
  query: string,
): { rank: number; matched: string } {
  if (query === '') return { rank: 1, matched: 'listed' }

  const name = component.name.toLowerCase()
  if (name === query) return { rank: 100, matched: 'name' }
  if (name.includes(query)) return { rank: 80, matched: 'name' }

  if (component.purpose.toLowerCase().includes(query)) return { rank: 40, matched: 'purpose' }

  const prop = component.props.find(
    (entry) =>
      entry.name.toLowerCase().includes(query) || (entry.doc ?? '').toLowerCase().includes(query),
  )
  if (prop) return { rank: 20, matched: `prop \`${prop.name}\`` }

  // The grid ranks last. A query for "danger" finds every component with a
  // danger tone, below any component named that. The grid maps each variant to
  // the tones lawful with it.
  const cell = Object.entries(component.grid ?? {}).find(
    ([variant, tones]) =>
      variant.toLowerCase() === query || tones.some((tone) => tone.toLowerCase() === query),
  )
  return cell ? { rank: 10, matched: `variant \`${cell[0]}\`` } : { rank: 0, matched: '' }
}

export function searchRegistry(registry: Registry, filters: SearchFilters = {}): SearchHit[] {
  const query = (filters.query ?? '').trim().toLowerCase()

  const scored = registry.components
    .filter((component) => (filters.tier ? component.tier === filters.tier : true))
    .filter((component) => (filters.origin ? component.origin === filters.origin : true))
    .filter((component) => (filters.wears ? component.tokens.includes(filters.wears) : true))
    .filter((component) =>
      filters.platform ? component.platforms[filters.platform].status !== 'absent' : true,
    )
    .filter((component) =>
      filters.framework ? component.frameworks[filters.framework].status !== 'absent' : true,
    )
    .map((component) => ({ component, ...scoreComponent(component, query) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.component.name.localeCompare(b.component.name))

  const limited = filters.limit === undefined ? scored : scored.slice(0, filters.limit)
  return limited.map(({ component, matched }) => ({
    name: component.name,
    tier: component.tier,
    origin: component.origin,
    purpose: component.purpose,
    matched,
  }))
}
