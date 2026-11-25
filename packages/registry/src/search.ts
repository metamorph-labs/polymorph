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
 * How one word or phrase matches a member: its name first, then its purpose,
 * a prop, and last the grid.
 */
function scoreTerm(component: RegistryComponent, term: string): { rank: number; matched: string } {
  const name = component.name.toLowerCase()
  if (name === term) return { rank: 100, matched: 'name' }
  if (name.includes(term)) return { rank: 80, matched: 'name' }

  if (component.purpose.toLowerCase().includes(term)) return { rank: 40, matched: 'purpose' }

  const prop = component.props.find(
    (entry) =>
      entry.name.toLowerCase().includes(term) || (entry.doc ?? '').toLowerCase().includes(term),
  )
  if (prop) return { rank: 20, matched: `prop \`${prop.name}\`` }

  // The grid ranks last. A query for "danger" finds every component with a
  // danger tone, below any component named that. The grid maps each variant to
  // the tones lawful with it.
  const cell = Object.entries(component.grid ?? {}).find(
    ([variant, tones]) =>
      variant.toLowerCase() === term || tones.some((tone) => tone.toLowerCase() === term),
  )
  return cell ? { rank: 10, matched: `variant \`${cell[0]}\`` } : { rank: 0, matched: '' }
}

/**
 * An empty query lists the whole catalogue, deliberately. A caller usually asks
 * what the system contains before asking what it calls a dropdown. A search
 * that required a term would force the caller to guess one.
 *
 * A query of several words is read three ways, and the best reading wins. The
 * words joined are a member's name as a person says it: `date picker` and
 * `date-picker` are `DatePicker`. The words as written are a phrase, which a
 * purpose or a prop's doc can hold. And each word of three letters or more is
 * a term of its own. A member answers the terms when one of them is in its
 * name, or when every one of them is in its name or its purpose: a sentence
 * of common words, each found in some prop's doc, would otherwise match much
 * of the catalogue. The rank is the mean of the terms' ranks, a term that
 * matches nothing counting zero, so a member that answers two of three words
 * ranks below one that answers all three, and one below the same match made
 * by a whole phrase. What it matched on is what its strongest term matched
 * on, in the form a single word reports, which the fronts read back.
 */
export function scoreComponent(
  component: RegistryComponent,
  query: string,
): { rank: number; matched: string } {
  if (query === '') return { rank: 1, matched: 'listed' }

  const words = query.split(/[\s_-]+/).filter(Boolean)
  if (words.length < 2) return scoreTerm(component, query)

  const name = component.name.toLowerCase()
  const joined = words.join('')
  if (name === joined) return { rank: 100, matched: 'name' }
  if (name.includes(joined)) return { rank: 80, matched: 'name' }

  const phrase = scoreTerm(component, query)
  const terms = words.filter((word) => word.length >= 3)
  const each = terms.map((term) => scoreTerm(component, term))
  const answers =
    each.length > 0 &&
    (each.some((entry) => entry.matched === 'name') ||
      each.every((entry) => entry.matched === 'name' || entry.matched === 'purpose'))
  const mean = answers
    ? Math.floor(each.reduce((sum, entry) => sum + entry.rank, 0) / each.length) - 1
    : 0
  if (phrase.rank >= mean) return phrase
  if (mean <= 0) return { rank: 0, matched: '' }

  const strongest = each.reduce((best, entry) => (entry.rank > best.rank ? entry : best))
  return { rank: mean, matched: strongest.matched }
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
