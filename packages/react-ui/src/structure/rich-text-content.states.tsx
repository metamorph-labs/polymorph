import { type ComponentStates } from '@polymorph/react'
import { RichTextContent } from './RichTextContent'

/** States fixture, from `design/components/rich-text-content.md`'s States table. */

export const states: ComponentStates = {
  component: 'RichTextContent',

  /*
   * DECIDE: one entry per row of the spec's States table. Every entry is
   * rendered by `laws.test.tsx` — which asserts each `expect` attribute it
   * promises and runs axe over the result — and drawn by the workbench gallery.
   * An entry that renders nothing says so with `rendersNothing: true`, and is
   * held to that in both directions.
   */
  entries: [{ name: 'default', render: () => <RichTextContent label="RichTextContent" /> }],

  /*
   * DECIDE: the states a **prop cannot reach** — hover, focus-visible, active,
   * and the attribute states a substrate sets on its own. A fixture can never
   * render those, so `selectors.test.ts` greps the shipped stylesheet (through
   * `composes`) for each selector listed here instead.
   *
   * That is the whole of what this field means: it is not the component's
   * published attribute contract, which the registry reads from the stylesheet
   * that keys on it. A component whose every state is prop-reachable leaves this
   * empty and is complete — an empty list is a claim, not an omission.
   */
  requiredSelectors: [],
}
