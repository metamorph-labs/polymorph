import type { RegistryProp } from '@polymorph/registry'
import { ScreenView, type ScreenNode } from '@polymorph/react/screen'
import { surfaceOf, VOCABULARY } from '@polymorph/screen/vocabulary'
import type { ScreenSpec, SpecElement } from '@polymorph/spec/schema'
import { useCallback, type ReactNode } from 'react'

import { REGISTRY } from '../registry'
import { addressOf, drawBinding, drawFault, EVERY_MEMBER, MEMBERS } from './draw'

/**
 * The composer's drawing of a spec: the run-time renderer with the workbench's picture options
 * (`draw.tsx`), with each binding shown as a named placeholder.
 *
 * A binding renders as its own name. A spec with inputs is the developer part of the format, so
 * the composer shows where the data goes and does not invent any. The canvas is one drawing for
 * the composer's life: an edit redraws the elements it changed, and the rest keep their state.
 */

export { resolveComponent } from './draw'

/**
 * The props of `'A'` or `'A.B'`, as the inspector offers them: the props the validator's rule
 * gives the name (`surfaceOf`), each with the registry's record of it, its words included.
 *
 * A compound part's props are its own, not its owner's. A rule that stripped any dotted prefix
 * from the owner's props would offer a required `Header.onSort` on `Table.Cell`, putting a handler
 * on the wrong element.
 */
export function propsOf(componentName: string): RegistryProp[] {
  const surface = surfaceOf(VOCABULARY, componentName)
  if (surface === null) return []
  const member = REGISTRY.components.find((candidate) => candidate.name === surface.member)
  const recorded =
    surface.part === null
      ? member?.props
      : member?.parts.find((candidate) => candidate.name === surface.part)?.props
  return surface.props.flatMap((prop) => {
    const found = recorded?.find((candidate) => candidate.name === prop.name)
    return found === undefined ? [] : [found]
  })
}

/** Wraps every element. The composer passes selection chrome through here. */
export type Decorate = (node: ReactNode, element: SpecElement, address: string) => ReactNode

export function ComposerCanvas({ spec, decorate }: { spec: ScreenSpec; decorate?: Decorate }) {
  const decorateNode = useCallback(
    (drawn: ReactNode, node: ScreenNode) =>
      decorate === undefined ? drawn : decorate(drawn, node.element, addressOf(node.path)),
    [decorate],
  )
  return (
    <ScreenView
      document={spec}
      members={MEMBERS}
      allow={EVERY_MEMBER}
      fill="sample"
      faults="inline"
      renderFault={drawFault}
      renderBinding={drawBinding}
      decorate={decorate === undefined ? undefined : decorateNode}
    />
  )
}

export function renderSpec(spec: ScreenSpec, decorate?: Decorate): ReactNode {
  return <ComposerCanvas spec={spec} decorate={decorate} />
}
