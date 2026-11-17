import { TabsContent, TabsRoot } from './tabs-parts'
import type { TabsProps } from './tabs-parts'

/**
 * Switches between peer views of one subject (`design/components/tabs.md`).
 *
 * There is one variant, underline, on purpose. Boxed and pill tabs are the same
 * decision with more chrome. The underline works under both presets: a soft
 * rule under pastel and a sharp one under terminal, with no special case for
 * either.
 *
 * The indicator is one sliding rule, not an underline per trigger. That needs a
 * measurement of the active trigger's offset and width, re-read whenever the
 * selection or the layout changes. In return it gives what the spec asks for:
 * one indicator moving between tabs, rather than one appearing where another
 * disappeared.
 *
 * A horizontal strip wider than its container scrolls inside it. The recipe
 * does the scrolling, the edge fade and the room for the focus ring, and the
 * browser scrolls a tab that takes focus into view. What is left for this
 * component is the current tab: it is brought inside the strip when the strip
 * is laid out and when the value changes.
 */

export type { TabDescriptor, TabsContentProps, TabsOrientation, TabsProps } from './tabs-parts'

/**
 * The member, in a module without `'use client'`, so a server component can
 * read `Tabs.Content` from it. A client module's export reaches a server component
 * as a reference with no properties, so a part attached there is `undefined`
 * on a server. The root and the parts are the client module's own exports
 * (`tabs-parts.tsx`), and this function only renders the root.
 */
export function Tabs(props: TabsProps) {
  return <TabsRoot {...props} />
}
Tabs.Content = TabsContent
