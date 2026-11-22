import type { RegistryComponent, RegistryProp } from '@polymorph/registry'
import { searchRegistry } from '@polymorph/registry/search'

import { componentsByTier, REGISTRY, TIERS } from '../registry'
import { SITE } from '../site'

/**
 * The reshaping the two component pages share. Every value here is read from
 * the registry. Nothing is computed that the registry does not hold, and the
 * page files only lay these values out.
 */

/** The package a React app imports every member from (`docs/consuming.md`, "Compose"). */
export const VOCABULARY_PACKAGE = '@polymorph/react-ui'

/** The React foundation, which ships the one `installed` member (`docs/architecture.md`). */
export const FOUNDATION_PACKAGE = '@polymorph/react'

/** A file of the repository, on its default branch. */
export function repositoryFile(path: string): string {
  return `${SITE.repository}/blob/main/${path}`
}

/* -------------------------------------------------------------------------- */
/* The index: grouping and filtering                                          */
/* -------------------------------------------------------------------------- */

export interface ListedMember {
  component: RegistryComponent
  /**
   * Why a query found the member, when it was not the name or the summary: the
   * prop or the variant the registry's search matched. `null` otherwise.
   */
  matched: { kind: 'prop' | 'variant'; name: string } | null
}

export interface ListedTier {
  tier: (typeof TIERS)[number]
  members: ListedMember[]
}

/**
 * Reads `searchRegistry`'s `matched` string (`prop \`title\``) back into its
 * parts. The workbench and the MCP server rank with the same function, so a
 * query finds the same members on every front.
 */
function readMatched(matched: string): ListedMember['matched'] {
  const found = /^(prop|variant) `([^`]+)`$/.exec(matched)
  if (!found) return null
  return { kind: found[1] as 'prop' | 'variant', name: found[2] as string }
}

/**
 * The members a query finds, grouped by tier in the registry's tier order.
 * An empty query lists every member in gallery order. A query keeps the
 * search's ranking inside each tier, so a name match comes before a prop match.
 * A tier with no match is left out.
 */
export function listTiers(query: string): ListedTier[] {
  const trimmed = query.trim()
  if (trimmed === '') {
    return TIERS.map((tier) => ({
      tier,
      members: componentsByTier(tier).map((component) => ({ component, matched: null })),
    })).filter((group) => group.members.length > 0)
  }

  const byName = new Map(REGISTRY.components.map((component) => [component.name, component]))
  const hits = searchRegistry(REGISTRY, { query: trimmed })
  return TIERS.map((tier) => ({
    tier,
    members: hits
      .filter((hit) => hit.tier === tier)
      .flatMap((hit) => {
        const component = byName.get(hit.name)
        return component ? [{ component, matched: readMatched(hit.matched) }] : []
      }),
  })).filter((group) => group.members.length > 0)
}

/** The members before and after this one in its tier, in gallery order. */
export function neighbours(component: RegistryComponent): {
  previous: RegistryComponent | null
  next: RegistryComponent | null
} {
  const tier = componentsByTier(component.tier)
  const index = tier.findIndex((candidate) => candidate.name === component.name)
  return {
    previous: index > 0 ? (tier[index - 1] ?? null) : null,
    next: index >= 0 ? (tier[index + 1] ?? null) : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Where a member runs                                                        */
/* -------------------------------------------------------------------------- */

/** How each web framework's vocabulary is named on the page, in `REGISTRY.frameworks` order. */
export const FRAMEWORK_LABELS: Record<string, string> = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  solid: 'Solid',
  angular: 'Angular',
  elements: 'custom elements',
}

/** The phone platforms and the toolkit each one's members are written in (`docs/native.md`). */
export const PLATFORM_LABELS: Record<string, { name: string; toolkit: string }> = {
  ios: { name: 'iOS', toolkit: 'SwiftUI' },
  android: { name: 'Android', toolkit: 'Jetpack Compose' },
}

/** `a`, `a and b`, `a, b and c`. */
export function series(words: readonly string[], conjunction = 'and'): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} ${conjunction} ${words[words.length - 1]}`
}

/** The web frameworks whose vocabulary ships the member, and those that do not, with why. */
export function webReach(component: RegistryComponent): {
  native: string[]
  absent: { frameworks: string[]; reason: string | null }[]
} {
  const native: string[] = []
  const absent = new Map<string, string[]>()
  for (const framework of REGISTRY.frameworks) {
    const entry = component.frameworks[framework]
    const label = FRAMEWORK_LABELS[framework] ?? framework
    if (entry.status === 'absent') {
      const reason = entry.reason ?? ''
      absent.set(reason, [...(absent.get(reason) ?? []), label])
    } else {
      native.push(label)
    }
  }
  return {
    native,
    absent: [...absent].map(([reason, frameworks]) => ({
      frameworks,
      reason: reason === '' ? null : reason,
    })),
  }
}

/**
 * A short note for an index card when the member is not available everywhere,
 * or `null` when it is. Adapted renderings count as available: the member is
 * there, drawn the platform's way.
 */
export function reachNote(component: RegistryComponent): string | null {
  const web = webReach(component)
  const phones = Object.keys(PLATFORM_LABELS).filter(
    (platform) => component.platforms[platform as 'ios' | 'android'].status !== 'absent',
  )
  const everywhere =
    web.absent.length === 0 && phones.length === Object.keys(PLATFORM_LABELS).length
  if (everywhere) return null

  // "Web" while every web framework ships it, otherwise the ones that do.
  const onWeb = web.absent.length === 0 ? ['Web'] : web.native
  const names = phones.map((platform) => PLATFORM_LABELS[platform]?.name ?? platform)
  return `${series([...onWeb, ...names])} only`
}

/* -------------------------------------------------------------------------- */
/* Import line and prop types                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether a member is used through a function rather than under its own name.
 * Toast is: there is no `<Toast>`, and its props are the options of `toast()`.
 * The registry says so by giving the member the same props as one of its
 * function exports. `catalogue.test.ts` holds every import line to the
 * package's real exports.
 */
function usedThroughFunction(component: RegistryComponent): boolean {
  const own = component.props.map((prop) => prop.name).join()
  return component.exports.some(
    (entry) => entry.kind === 'function' && entry.props.map((prop) => prop.name).join() === own,
  )
}

/**
 * The names a React app imports to use the member: its own name, then its
 * other callable exports (`TooltipProvider`, `toast`).
 */
export function importNames(component: RegistryComponent): string[] {
  const own = usedThroughFunction(component) ? [] : [component.name]
  return [...new Set([...own, ...component.exports.map((entry) => entry.name)])]
}

export function importLine(names: readonly string[]): string {
  return `import { ${names.join(', ')} } from '${VOCABULARY_PACKAGE}'`
}

/**
 * Splits a type into the members of its top-level union. A `|` inside
 * parentheses, brackets, braces, angle brackets or a string literal belongs to
 * a nested type. The `>` of an arrow (`=>`) closes nothing.
 */
export function splitUnion(type: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let index = 0; index < type.length; index++) {
    const char = type[index] as string
    if (quote !== null) {
      if (char === quote && type[index - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if ('([{<'.includes(char)) depth++
    else if (')]}'.includes(char) || (char === '>' && type[index - 1] !== '=')) depth--
    else if (char === '|' && depth === 0) {
      parts.push(type.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(type.slice(start).trim())
  return parts.filter((part) => part !== '')
}

/** Whether the parenthesis at the start of `text` is closed by its last character. */
function wrapped(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) return false
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') depth++
    else if (text[index] === ')') depth--
    if (depth === 0 && index < text.length - 1) return false
  }
  return true
}

const ICON_ROLES = new Set(REGISTRY.icons.roles.map((role) => role.name))

/**
 * A prop's type as a reader writes it. The registry prints the checker's
 * expansion: an optional prop's `| undefined`, `boolean` as `false | true`, and
 * the icon role type as its whole union of string literals. The first is said
 * by the "required" mark instead, the second is `boolean` again, and the third
 * is `IconRole`, the name `@polymorph/engine` exports it under.
 */
export function readableType(prop: RegistryProp): string {
  let members = splitUnion(prop.type)
  if (prop.optional) members = members.filter((member) => member !== 'undefined')

  if (members.includes('false') && members.includes('true')) {
    const at = Math.min(members.indexOf('false'), members.indexOf('true'))
    members = members.filter((member) => member !== 'false' && member !== 'true')
    members.splice(at, 0, 'boolean')
  }

  const literals = members.filter((member) => /^"[^"]*"$/.test(member))
  if (
    literals.length === ICON_ROLES.size &&
    literals.every((member) => ICON_ROLES.has(member.slice(1, -1)))
  ) {
    const at = members.indexOf(literals[0] as string)
    members = members.filter((member) => !literals.includes(member))
    members.splice(at, 0, 'IconRole')
  }

  if (members.length === 1 && wrapped(members[0] as string)) {
    return (members[0] as string).slice(1, -1)
  }
  return members.join(' | ')
}

/** The member's own props: the registry also lists a part's props under `Part.prop`. */
export function ownProps(component: RegistryComponent): RegistryProp[] {
  return component.props.filter((prop) => !prop.name.includes('.'))
}
