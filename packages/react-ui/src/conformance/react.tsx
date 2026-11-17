'use client'

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { GALLERIES } from '../galleries'
import * as vocabulary from '../index'

/*
 * The runner's adapter interface (`@polymorph/conformance`), written out
 * structurally: this directory sits in the vendorable tree, where a file may
 * import only what `@polymorph/react-ui` declares. The law assigns the adapter
 * to the runner's `MountAdapter`, so the two cannot drift.
 */
type Override = string | number | boolean | readonly unknown[] | ((...args: never[]) => void)
interface MountProps {
  state: string
  overrides?: Readonly<Record<string, Override>>
}
interface Mounted {
  root: HTMLElement
  unmount(): void
}
interface MountAdapter {
  mount(member: string, props: MountProps): Promise<Mounted>
}

/**
 * The React shell's mount adapter (`docs/conformance.md`).
 *
 * It renders a states fixture entry, the same entry the completeness law
 * renders, into its own root on the page. Another framework's adapter renders
 * its own fixtures by the same entry names, so a statement starts from the
 * same state in every shell.
 *
 * `overrides` set props on the member inside the entry: a probe string for an
 * accessible name, or a spy in a handler prop. The adapter finds the member's
 * element in the tree the entry returns (through `children` and any prop that
 * holds an element) and clones it with the new props, which replace the
 * fixture's own. An entry that builds the member inside a component of its own
 * hides the element, and the adapter says so rather than rendering the entry
 * unchanged.
 */

/** Gallery entries whose component is exported under another name (`vocabulary.ts`). */
const DECLARATIONS: Readonly<Record<string, string>> = { Toast: 'Toaster' }

function componentOf(member: string): unknown {
  const exported = (vocabulary as Record<string, unknown>)[DECLARATIONS[member] ?? member]
  if (exported === undefined) throw new Error(`conformance: the vocabulary exports no ${member}`)
  return exported
}

/** The tree with the first element of `type` cloned with `props`, or `null` when there is none. */
function withProps(
  node: ReactNode,
  type: unknown,
  props: Readonly<Record<string, Override>>,
): ReactNode | null {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      const replaced = withProps(child as ReactNode, type, props)
      if (replaced !== null) return node.map((item, at) => (at === index ? replaced : item))
    }
    return null
  }
  if (!isValidElement(node)) return null
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === type) return cloneElement(element, props)
  for (const [key, value] of Object.entries(element.props)) {
    if (!isValidElement(value) && !Array.isArray(value)) continue
    const replaced = withProps(value as ReactNode, type, props)
    if (replaced !== null) return cloneElement(element, { [key]: replaced })
  }
  return null
}

/** Numbers each mount's host, so no two hosts on the page share an id. */
let mounts = 0

export const reactAdapter: MountAdapter = {
  async mount(member: string, { state, overrides }: MountProps): Promise<Mounted> {
    const entry = GALLERIES.find((gallery) => gallery.component === member)?.entries.find(
      (candidate) => candidate.name === state,
    )
    if (entry === undefined) throw new Error(`conformance: ${member} has no entry "${state}"`)

    let tree: ReactNode = entry.render()
    if (overrides !== undefined) {
      const replaced = withProps(tree, componentOf(member), { ...overrides })
      if (replaced === null) {
        throw new Error(
          `conformance: ${member}'s entry "${state}" renders the member inside a component of ` +
            'its own, so its props cannot be set',
        )
      }
      tree = replaced
    }

    const host = document.createElement('div')
    // An id, so a pointer harness that addresses an element by a selector
    // built from its ancestors finds the host however portals come and go
    // beside it in the body.
    host.id = `conformance-mount-${++mounts}`
    document.body.append(host)
    const root = createRoot(host)
    flushSync(() => root.render(tree))
    return {
      root: host,
      unmount() {
        flushSync(() => root.unmount())
        host.remove()
      },
    }
  },
}
