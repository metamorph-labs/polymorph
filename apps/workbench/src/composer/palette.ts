import type { RegistryComponent, RegistryProp } from '@polymorph/registry'
import type { SpecElement, SpecValue } from '@polymorph/spec/schema'

import { REGISTRY } from '../registry'
import { resolveComponent } from './render'

/**
 * The palette: which members the composer can insert, computed from the registry's prop data. The
 * rule: **a member is insertable when every required prop has an inspector control.** A required
 * function prop excludes a member. The renderer could stub one, but a saved document cannot
 * express a function and the composer creates no bindings, so the insert would be invalid from
 * the start. Every other member stays visible as *code-wired*. Search shows the member with the
 * reason, not just a refusal.
 *
 * This file keeps no hand-written list. A census test pins the counts, so any change to palette
 * membership shows up as a test diff to review.
 */

const ICON_ROLES = new Set(REGISTRY.icons.roles.map((role) => role.name))

export type PropControl =
  | { kind: 'union'; options: (string | number | boolean | null)[]; icon: boolean }
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'slot' }
  | { kind: 'numbers' }

/** One literal from a printed union (`"solid"`, `4`, `true`, `null`), or undefined. */
function literalOf(branch: string): string | number | boolean | null | undefined {
  const trimmed = branch.trim()
  if (/^"[^"]*"$/.test(trimmed)) return trimmed.slice(1, -1)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  return undefined
}

/**
 * The control for a prop's printed type, or `null` when the inspector has none. `children` is not
 * handled here, because composition owns it, not the inspector.
 */
export function controlFor(prop: RegistryProp): PropControl | null {
  const type = prop.type.replace(/\s*\|\s*undefined\s*$/, '').trim()

  if (type.includes('=>')) return null
  if (type === 'string') return { kind: 'string' }
  if (type === 'number') return { kind: 'number' }
  if (type === 'boolean') return { kind: 'boolean' }
  if (type === 'number[]' || type === 'readonly number[]') return { kind: 'numbers' }
  if (/\bReact(Node|Element)\b/.test(type)) return { kind: 'slot' }

  if (type.includes('|') || literalOf(type) !== undefined) {
    const branches = type.split('|').map(literalOf)
    if (branches.every((branch) => branch !== undefined)) {
      const options = branches as (string | number | boolean | null)[]
      const strings = options.filter((option): option is string => typeof option === 'string')
      const icon = strings.length > 20 && strings.every((option) => ICON_ROLES.has(option))
      // `false | true` prints as a union; it is a switch, not a two-way select.
      if (options.length === 2 && options.includes(true) && options.includes(false)) {
        return { kind: 'boolean' }
      }
      return { kind: 'union', options, icon }
    }
  }

  return null
}

export interface PaletteEntry {
  component: RegistryComponent
  /** `null` means insertable; otherwise the reason it is code-wired. */
  codeWired: string | null
}

function judge(component: RegistryComponent): string | null {
  if (resolveComponent(component.name) === null) {
    return 'no drawable component — wired from code'
  }
  for (const prop of component.props) {
    if (prop.optional || prop.name === 'children') continue
    // A dotted name (`Group.title`) belongs to a compound part, not to the owner. Inserting the
    // owner does not require the part's props.
    if (prop.name.includes('.')) continue
    if (prop.type.includes('=>'))
      return `requires a handler (\`${prop.name}\`) a document cannot say`
    if (controlFor(prop) === null) return `requires \`${prop.name}\`, which needs code-shaped data`
  }
  return null
}

export const PALETTE: readonly PaletteEntry[] = REGISTRY.components
  .map((component) => ({ component, codeWired: judge(component) }))
  .sort((a, b) => a.component.name.localeCompare(b.component.name))

export const INSERTABLE = PALETTE.filter((entry) => entry.codeWired === null)
export const CODE_WIRED = PALETTE.filter((entry) => entry.codeWired !== null)

/* -------------------------------------------------------------------------- */
/* Templates: every insert starts valid                                       */
/* -------------------------------------------------------------------------- */

/** A readable default for a required string, chosen by the prop's name. */
function stringSeed(name: string, member: string): string {
  if (/label|title|name/i.test(name)) return member
  if (/description|purpose/i.test(name)) return 'A short description.'
  if (/placeholder/i.test(name)) return 'Type here…'
  return 'Text'
}

function seedFor(prop: RegistryProp, member: string): SpecValue {
  const control = controlFor(prop)
  if (control === null) return 'unseedable'
  switch (control.kind) {
    case 'string':
      return stringSeed(prop.name, member)
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'numbers':
      return [3, 5, 4, 8, 6, 7]
    case 'slot':
      return { component: 'Text', children: ['Content'] }
    case 'union': {
      if (control.icon) return 'confirm'
      const first = control.options.find((option) => option !== null)
      return (first ?? null) as SpecValue
    }
  }
}

/**
 * The element an insert creates. Every required prop gets a default value, and required children
 * get a line of text. So the tree never holds a new node that `validateSpec` would refuse.
 */
export function templateFor(component: RegistryComponent): SpecElement {
  const props: Record<string, SpecValue> = {}
  for (const prop of component.props) {
    if (prop.optional || prop.name === 'children' || prop.name.includes('.')) continue
    props[prop.name] = seedFor(prop, component.name)
  }

  const childrenProp = component.props.find((prop) => prop.name === 'children')
  const needsChildren = childrenProp !== undefined && !childrenProp.optional

  return {
    component: component.name,
    ...(Object.keys(props).length > 0 ? { props } : {}),
    ...(needsChildren ? { children: [component.name] } : {}),
  }
}

/** Whether a member can hold children, which decides where "insert inside" is offered. */
export function acceptsChildren(name: string): boolean {
  const component = REGISTRY.components.find((candidate) => candidate.name === name)
  return component !== undefined && component.props.some((prop) => prop.name === 'children')
}
