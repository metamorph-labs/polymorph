import type { ScreenInput, ScreenSpec, SpecElement } from '@polymorph/spec/schema'
import { Badge } from '@polymorph/react-ui'
import type { ReactNode } from 'react'

import { REGISTRY } from '../registry'
import { drawElement, propSource, sampleBinding, type Drawing } from './draw'

/**
 * The composer's drawing of a spec: the renderer in `draw.tsx`, with the workbench's registry and
 * with bindings shown as named placeholders.
 *
 * A binding renders as its own name. A spec with inputs is the developer part of the format, so
 * the composer shows where the data goes and does not invent any.
 */

export { resolveComponent } from './draw'

const SOURCE = propSource(REGISTRY.components)

/** The props of `'A'` or `'A.B'` in the workbench's registry (`propSource`). */
export const propsOf = SOURCE.propsOf

/** The chip shown for a binding in a position where a React node would go. */
function BindingChip({ path }: { path: string }) {
  return <Badge tone="neutral">{`⟨${path}⟩`}</Badge>
}

interface RenderContext {
  inputs: readonly ScreenInput[]
  /** Wraps every element. The composer passes selection chrome through here. */
  decorate?: Drawing['decorate']
}

export function renderElement(element: SpecElement, context: RenderContext, path = '$'): ReactNode {
  return drawElement(
    element,
    {
      inputs: context.inputs,
      source: SOURCE,
      bound: sampleBinding,
      boundChild: (binding, key) => <BindingChip key={key} path={binding} />,
      ...(context.decorate === undefined ? {} : { decorate: context.decorate }),
    },
    path,
  )
}

export function renderSpec(spec: ScreenSpec, decorate?: RenderContext['decorate']): ReactNode {
  return renderElement(spec.root, { inputs: spec.inputs, ...(decorate ? { decorate } : {}) })
}
