import {
  isElement,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from '@polymorph/spec/schema'

/**
 * The composer's document model: pure operations over a `ScreenSpec`.
 *
 * Every node has an *address*. `$` is the root, `.children[n]` steps into a child, and
 * `.props.name` steps into an element-valued prop (an element slot). Addresses compose, for
 * example `$.children[1].props.control`. The renderer passes the same addresses to the selection
 * layer, so the tree, the canvas outline and the operations all refer to the same node.
 *
 * Operations never mutate. Each returns a new spec, sharing structure outside the changed path.
 * So the history stack is a list of specs and undo only moves a pointer.
 */

export type Address = string

interface Step {
  kind: 'child' | 'prop'
  key: string | number
}

/**
 * Parses an address, or returns `null` when the string is not one.
 *
 * The whole string must match. A parser that scanned for steps and skipped everything else would
 * return zero steps for any unparsable string, such as a typo, an empty string or a path in a
 * different grammar. Zero steps is the root. A mistake that should do nothing would then address
 * the whole document, and `removeAt` would replace it.
 */
export function parseAddress(address: Address): Step[] | null {
  if (!address.startsWith('$')) return null
  const steps: Step[] = []
  const pattern = /^\.children\[(\d+)\]|^\.props\.([A-Za-z0-9_$]+)/
  let rest = address.slice(1)
  while (rest.length > 0) {
    const match = pattern.exec(rest)
    if (match === null) return null
    if (match[1] !== undefined) steps.push({ kind: 'child', key: Number(match[1]) })
    else steps.push({ kind: 'prop', key: match[2] as string })
    rest = rest.slice(match[0].length)
  }
  return steps
}

export function elementAt(spec: ScreenSpec, address: Address): SpecElement | null {
  const steps = parseAddress(address)
  if (steps === null) return null
  let current: SpecValue = spec.root
  for (const step of steps) {
    if (!isElement(current)) return null
    const next: SpecValue | undefined =
      step.kind === 'child'
        ? (current.children ?? [])[step.key as number]
        : (current.props ?? {})[step.key as string]
    if (next === undefined) return null
    current = next
  }
  return isElement(current) ? current : null
}

/** The address of this node's parent, and the step from the parent to this node. */
export function parentOf(address: Address): { parent: Address; step: Step } | null {
  const steps = parseAddress(address)
  if (steps === null) return null
  const last = steps[steps.length - 1]
  if (last === undefined) return null
  const parent =
    '$' +
    steps
      .slice(0, -1)
      .map((step) => (step.kind === 'child' ? `.children[${step.key}]` : `.props.${step.key}`))
      .join('')
  return { parent, step: last }
}

/** Replaces the element at `address` using `patch`. This is the only write primitive. */
export function updateAt(
  spec: ScreenSpec,
  address: Address,
  patch: (element: SpecElement) => SpecElement | null,
): ScreenSpec {
  const steps = parseAddress(address)
  // An address the grammar does not recognise names no node, so the operation returns the
  // document unchanged.
  if (steps === null) return spec

  const walk = (value: SpecValue, remaining: Step[]): SpecValue | null => {
    if (!isElement(value)) return value
    const [step, ...rest] = remaining
    if (step === undefined) return patch(value)

    if (step.kind === 'child') {
      const index = step.key as number
      const target = (value.children ?? [])[index]
      if (target === undefined) return value
      const next = walk(target, rest)
      // An unchanged subtree keeps its identity all the way up. A refused operation returns the
      // same document object, so the history can compare by reference instead of by content.
      if (next === target) return value
      const children = [...(value.children ?? [])]
      if (next === null) children.splice(index, 1)
      else children[index] = next
      // Omit the key when the list is empty. A literal `children: undefined` stays in memory and
      // fails the shape check with "expected an array", although a JSON round-trip would remove
      // it.
      const { children: _dropped, ...rest2 } = value
      return children.length > 0 ? { ...rest2, children } : rest2
    }

    const key = step.key as string
    const target = (value.props ?? {})[key]
    if (target === undefined) return value
    const next = walk(target, rest)
    if (next === target) return value
    const props = { ...(value.props ?? {}) }
    if (next === null) delete props[key]
    else props[key] = next
    // Same rule as the children branch above and `setProp` below. An empty props object leaves no
    // key, so removing the only slot on a node does not write `"props": {}` into the document.
    const { props: _dropped, ...rest2 } = value
    return Object.keys(props).length > 0 ? { ...rest2, props } : rest2
  }

  const root = walk(spec.root, steps)
  if (root === spec.root) return spec
  // Deleting the root is not supported. The composer resets instead.
  return isElement(root as SpecValue) ? { ...spec, root: root as SpecElement } : spec
}

export function removeAt(spec: ScreenSpec, address: Address): ScreenSpec {
  if (address === '$') return spec
  return updateAt(spec, address, () => null)
}

export function insertChild(
  spec: ScreenSpec,
  parent: Address,
  child: SpecValue,
  index?: number,
): ScreenSpec {
  return updateAt(spec, parent, (element) => {
    const children = [...(element.children ?? [])]
    children.splice(index ?? children.length, 0, child)
    return { ...element, children }
  })
}

export function setProp(
  spec: ScreenSpec,
  address: Address,
  name: string,
  value: SpecValue | undefined,
): ScreenSpec {
  return updateAt(spec, address, (element) => {
    const props = { ...(element.props ?? {}) }
    if (value === undefined) delete props[name]
    else props[name] = value
    const { props: _dropped, ...rest } = element
    return Object.keys(props).length > 0 ? { ...rest, props } : rest
  })
}

/** Moves a child one position among its siblings. Text nodes move with the other children. */
export function moveChild(spec: ScreenSpec, address: Address, direction: -1 | 1): ScreenSpec {
  const location = parentOf(address)
  if (location === null || location.step.kind !== 'child') return spec
  const from = location.step.key as number
  const to = from + direction
  return updateAt(spec, location.parent, (element) => {
    const children = [...(element.children ?? [])]
    if (to < 0 || to >= children.length) return element
    const [moved] = children.splice(from, 1)
    children.splice(to, 0, moved as SpecValue)
    return { ...element, children }
  })
}

/** Wraps the node at `address` in a new element with that node as its only child. */
export function wrapIn(spec: ScreenSpec, address: Address, component: string): ScreenSpec {
  if (address === '$') {
    return { ...spec, root: { component, children: [spec.root] } }
  }
  return updateAt(spec, address, (element) => ({ component, children: [element] }))
}

/* -------------------------------------------------------------------------- */
/* History                                                                    */
/* -------------------------------------------------------------------------- */

export interface History {
  past: ScreenSpec[]
  present: ScreenSpec
  future: ScreenSpec[]
  /**
   * The edit that produced `present`, when it was a continuous edit: the address and prop being
   * typed into. `null` for a structural operation, an undo, or a loaded document.
   */
  tag?: string | null
}

export const HISTORY_LIMIT = 100

/**
 * Moves the present into the past, unless the commit continues the same edit.
 *
 * **Merging.** Typing a nine-character label is one decision, not nine history entries. Undo
 * should take one press, and the cap should hold the last hundred actions rather than the letters
 * of one word. A commit with the same `tag` as the one that produced the present replaces it. The
 * tag is the edit location, for example `$.children[1]:label`. Moving to another prop or node, or
 * any untagged operation, does not match and so ends the run.
 *
 * Undo and redo clear the tag, so a new keystroke does not overwrite the entry an undo just
 * restored.
 */
export function commit(history: History, next: ScreenSpec, tag?: string): History {
  if (next === history.present) return history
  if (tag !== undefined && tag === history.tag) {
    return { past: history.past, present: next, future: [], tag }
  }
  return {
    // One short of the cap, because `present` is added next. `slice(-HISTORY_LIMIT)` would keep a
    // full hundred and then add a hundred-and-first.
    past: [...history.past.slice(1 - HISTORY_LIMIT), history.present],
    present: next,
    future: [],
    tag: tag ?? null,
  }
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1]
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    tag: null,
  }
}

export function redo(history: History): History {
  const [next, ...rest] = history.future
  if (next === undefined) return history
  return { past: [...history.past, history.present], present: next, future: rest, tag: null }
}

/** Ends a run of merged edits without changing the documents. */
export function untag(history: History): History {
  return history.tag === null || history.tag === undefined ? history : { ...history, tag: null }
}
