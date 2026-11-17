import type { RegistryProp } from '@polymorph/registry'
import {
  isBinding,
  isElement,
  isObjectValue,
  type ScreenInput,
  type SpecElement,
  type SpecValue,
} from '@polymorph/spec/schema'
import * as UI from '@polymorph/react-ui'
import { Badge, Card, Inline, Stack, Text } from '@polymorph/react-ui'
import { Component, type ComponentType, type ReactNode } from 'react'

/**
 * The spec renderer. It renders a `polymorph-screen/1` document live with the real vocabulary,
 * under the page's current pairing.
 *
 * Two pages draw with it. The composer (`render.tsx`) draws a document a designer is editing and
 * shows each binding as a named placeholder. The screen page (`../screen`) draws a document for
 * the MCP tool `render_screen` and fills each binding with data. Each page passes its own
 * `Drawing`: where a member's props come from, and what a binding is worth. This module imports
 * no registry, so the screen page can be built without the generated one.
 *
 * It always shows exactly what the document contains:
 *
 *  - An unknown component renders as a visible fault chip and is never skipped, so the tree on
 *    screen matches the document.
 *  - Required callbacks the document cannot express are stubbed with no-ops, based on the
 *    registry's prop data. A preview must not require handlers that a JSON document cannot
 *    contain.
 *  - Every element renders inside its own error boundary, so one broken node shows one fault chip
 *    instead of a blank canvas.
 *
 * Nothing here re-implements a law. `validateSpec` checks the document, and this file only draws
 * it.
 */

const noop = () => {}

/** Resolves `'A'` or `'A.B'` to a component, using the compound-part rule from `validate.ts`. */
export function resolveComponent(name: string): ComponentType<Record<string, unknown>> | null {
  const [owner, part] = name.split('.')
  const map = UI as unknown as Record<string, unknown>
  const root = owner === undefined ? undefined : map[owner]
  const found = part === undefined ? root : ((root ?? {}) as Record<string, unknown>)[part]
  return typeof found === 'function' || (typeof found === 'object' && found !== null)
    ? (found as ComponentType<Record<string, unknown>>)
    : null
}

/** The part of a registry member the renderer reads. */
export interface MemberProps {
  name: string
  props: readonly RegistryProp[]
  /** Its compound parts, each with the props its function takes (`Panel` for `Dashboard.Panel`). */
  parts: readonly { name: string; props: readonly RegistryProp[] }[]
}

/** What a renderer asks about the vocabulary's props. */
export interface PropSource {
  /** The props of `'A'` or `'A.B'`. */
  propsOf: (componentName: string) => RegistryProp[]
  /** Whether the registry has a member by this name, drawable or not. */
  knows: (member: string) => boolean
}

/**
 * The props of `'A'` or `'A.B'` in a list of members, using the validator's rule (`validate.ts`'s
 * `surfaceOf`) so the result agrees with the document. A member's props are its undotted props. A
 * compound part's props are the ones the registry lists under the part (`parts`), named as a spec
 * writes them (`{"component": "SettingsRow.Group", "props": {"title": …}}`).
 *
 * The stub scan below and the inspector's rows both use this function. Two implementations could
 * differ. For example, a scan that stripped any dotted prefix from the owner's props would stub a
 * required `Header.onSort` onto `Table.Cell`, putting a handler on the wrong element.
 */
export function propSource(members: readonly MemberProps[]): PropSource {
  const byMember = new Map(members.map((member) => [member.name, member]))

  return {
    knows: (member) => byMember.has(member),
    propsOf(componentName) {
      const direct = byMember.get(componentName)
      if (direct !== undefined) return direct.props.filter((prop) => !prop.name.includes('.'))

      const [owner, part] = componentName.split('.')
      const owned = owner === undefined ? undefined : byMember.get(owner)
      const found = owned?.parts.find((candidate) => candidate.name === part)
      return found === undefined ? [] : [...found.props]
    },
  }
}

/**
 * The stubs a member needs before it can be drawn. Every required prop whose declared type is a
 * function gets a no-op. The list comes from the registry, so a new required callback is stubbed
 * as soon as it ships instead of crashing the canvas.
 */
function callbackStubs(componentName: string, source: PropSource): Record<string, () => void> {
  const stubs: Record<string, () => void> = {}
  for (const prop of source.propsOf(componentName)) {
    if (prop.optional) continue
    if (!prop.type.includes('=>')) continue
    stubs[prop.name] = noop
  }
  return stubs
}

/**
 * A sample value for a binding, based on the type of the input it names. It never invents data.
 * A string samples as the binding's own path, so the picture shows where the data goes.
 */
export function sampleBinding(path: string, inputs: readonly ScreenInput[]): unknown {
  const head = path.split('.')[0]
  const input = inputs.find((candidate) => candidate.name === head)
  const type = input?.type ?? ''
  if (type.includes('=>')) return noop
  if (type === 'boolean') return false
  if (type === 'number') return 0
  if (type.includes('[]') || type.startsWith('readonly')) return []
  if (type === 'string') return `⟨${path}⟩`
  // A type that includes `null` accepts it, for example a clearable Select's "nothing chosen".
  // Everything else (domain objects, unions) samples as absent. `undefined` lets optional props
  // use their defaults, whereas `null` would suggest a value exists and the member would
  // dereference it.
  if (type.includes('null')) return null
  return undefined
}

/**
 * A structured value in a node position.
 *
 * `{"$object": …}` is a prop form, such as a column, an option or an `emptyState`. In a children
 * position there is nothing to draw. Returning `null` would silently skip it, and this file never
 * skips. The document would contain a value that the canvas did not show, and the reader would
 * see a tree that differs from the picture.
 */
function NotANode({ path }: { path: string }) {
  return (
    <Card>
      <Inline gap={2} align="center">
        <Badge tone="danger">not a node</Badge>
        <Text size="sm" tone="secondary">
          {`a structured value sits where a child goes (${path}) — an object is a prop, never a child`}
        </Text>
      </Inline>
    </Card>
  )
}

function UnknownMember({ name, known }: { name: string; known: boolean }) {
  // Covers members like Toast. The registry knows the member (its API is imperative:
  // `toast(options)`), but there is no component to draw. The message differs from the one for a
  // name the registry does not know.
  return (
    <Card>
      <Inline gap={2} align="center">
        <Badge tone="danger">{known ? 'not renderable' : 'unknown member'}</Badge>
        <Text size="sm" tone="secondary">
          {known
            ? `\`${name}\` is registry-known but has no drawable component — it is wired from code`
            : `the registry has no component called \`${name}\``}
        </Text>
      </Inline>
    </Card>
  )
}

interface BoundaryProps {
  member: string
  /** Told once for each failure, with the error's message. */
  onFailure: ((message: string) => void) | undefined
  children: ReactNode
}

/**
 * One node that fails to render shows one fault chip, not a blank canvas. A live editor's
 * intermediate states may be invalid while the designer edits.
 */
class ElementBoundary extends Component<BoundaryProps, { failed: string | null }> {
  override state = { failed: null }

  static getDerivedStateFromError(error: unknown) {
    return { failed: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown) {
    this.props.onFailure?.(error instanceof Error ? error.message : String(error))
  }

  override componentDidUpdate(previous: BoundaryProps) {
    // A re-render with new content is a new attempt, so clear the old fault.
    if (previous.children !== this.props.children && this.state.failed !== null) {
      this.setState({ failed: null })
    }
  }

  override render() {
    if (this.state.failed !== null) {
      return (
        <Card>
          <Stack gap={2}>
            <Badge tone="warning">{`${this.props.member} could not render`}</Badge>
            <Text size="sm" tone="secondary">
              {this.state.failed}
            </Text>
          </Stack>
        </Card>
      )
    }
    return this.props.children
  }
}

/** What one page decides about a drawing. The walk over the document is the same for each. */
export interface Drawing {
  inputs: readonly ScreenInput[]
  /** The vocabulary's props, which name the callbacks to stub. */
  source: PropSource
  /** The value a binding has in a prop. */
  bound: (path: string, inputs: readonly ScreenInput[]) => unknown
  /** What a binding draws in a child position, where a React node goes. */
  boundChild: (path: string, key: string, inputs: readonly ScreenInput[]) => ReactNode
  /** Wraps every element. The composer passes selection chrome through here. */
  decorate?: (node: ReactNode, element: SpecElement, path: string) => ReactNode
  /** Told when an element throws while it renders, with its path in the document. */
  failed?: (failure: { path: string; component: string; message: string }) => void
}

/** In a prop position, data stays data. Only elements become React nodes. */
function drawPropValue(value: SpecValue, drawing: Drawing, path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => drawPropValue(item, drawing, `${path}[${index}]`))
  }
  if (isBinding(value)) return drawing.bound(value.$, drawing.inputs)
  if (isObjectValue(value)) {
    return Object.fromEntries(
      Object.entries(value.$object).map(([key, item]) => [
        key,
        drawPropValue(item, drawing, `${path}.${key}`),
      ]),
    )
  }
  if (isElement(value)) return drawElement(value, drawing, path)
  return value
}

/** A child position holds React nodes, so a binding is drawn as the page decides. */
function drawChild(value: SpecValue, drawing: Drawing, path: string): ReactNode {
  if (Array.isArray(value)) {
    return value.map((item, index) => drawChild(item, drawing, `${path}[${index}]`))
  }
  if (isBinding(value)) return drawing.boundChild(value.$, path, drawing.inputs)
  if (isElement(value)) return drawElement(value, drawing, path)
  if (isObjectValue(value)) return <NotANode key={path} path={path} />
  return value
}

export function drawElement(element: SpecElement, drawing: Drawing, path = '$'): ReactNode {
  const Resolved = resolveComponent(element.component)
  if (Resolved === null) {
    const known = drawing.source.knows(element.component.split('.')[0] ?? element.component)
    const fault = <UnknownMember key={path} name={element.component} known={known} />
    return drawing.decorate ? drawing.decorate(fault, element, path) : fault
  }

  const props: Record<string, unknown> = { ...callbackStubs(element.component, drawing.source) }
  for (const [name, value] of Object.entries(element.props ?? {})) {
    props[name] = drawPropValue(value, drawing, `${path}.props.${name}`)
  }

  const children = (element.children ?? []).map((child, index) =>
    drawChild(child, drawing, `${path}.children[${index}]`),
  )

  // A single child is passed as itself, not as a one-element array. Members that clone their
  // child (FormField reads `children.type` and calls `cloneElement`) then receive what JSX would
  // pass.
  const childNode =
    children.length === 0 ? undefined : children.length === 1 ? children[0] : children

  const report = drawing.failed
  const node = (
    <ElementBoundary
      key={path}
      member={element.component}
      onFailure={
        report === undefined
          ? undefined
          : (message) => report({ path, component: element.component, message })
      }
    >
      <Resolved {...props}>{childNode}</Resolved>
    </ElementBoundary>
  )
  return drawing.decorate ? drawing.decorate(node, element, path) : node
}
