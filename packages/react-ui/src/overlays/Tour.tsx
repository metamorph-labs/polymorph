import { TourRoot, TourTarget } from './tour-parts'
import type { TourProps } from './tour-parts'

/**
 * Steps pointing at the parts of a page (`design/components/tour.md`).
 *
 * Each step points at one part with a few words about it, and the reader
 * moves through the steps once and can leave at any step.
 *
 * It is not an onboarding checklist (tasks the reader does, which is a Card of
 * Checkboxes), not an announcement of a feature (Banner or Alert), and not a
 * hint on one control (Tooltip, which holds no controls). A step is a modal
 * panel, as a Dialog is: the page is out of reach while it is open, and focus
 * stays in the panel until the tour ends.
 *
 * A step names the part it points at by the `name` of a `Tour.Target`. A step
 * whose target is not drawn when it opens is drawn centred, as a step with no
 * target is.
 */

export type { TourEnd, TourMessages, TourProps, TourStep, TourTargetProps } from './tour-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read `Tour.Target` from it. A client module's export reaches a server
 * component as a reference with no properties, so a part attached there is
 * `undefined` on a server. The root and the part are the client module's own
 * exports (`tour-parts.tsx`), and this function only renders the root.
 */
export function Tour(props: TourProps) {
  return <TourRoot {...props} />
}
Tour.Target = TourTarget
