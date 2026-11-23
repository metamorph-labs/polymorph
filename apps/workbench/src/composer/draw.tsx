import {
  componentFor,
  type FaultCause,
  type MemberComponent,
  type ScreenFault,
  type ScreenMembers,
} from '@polymorph/react/screen'
import * as UI from '@polymorph/react-ui'
import { Badge, Card, Inline, Stack, Text } from '@polymorph/react-ui'
import { memberNames, VOCABULARY } from '@polymorph/screen/vocabulary'
import type { ReactNode } from 'react'

/**
 * How the workbench draws a screen spec.
 *
 * Two pages draw one. The composer (`render.tsx`) draws a document a designer is editing, and the
 * screen page (`../screen`) draws a document for the MCP tool `render_screen`. Both draw with
 * `@polymorph/react/screen`, the renderer a product draws a model's screen with, and with the
 * real vocabulary under the page's current pairing. The walk over the document, the fill of its
 * inputs and the stubs of its callbacks are the run-time core's (`@polymorph/screen`), so the
 * picture is the screen a product would draw.
 *
 * Both draw a picture, which differs from a product's screen in three ways:
 *
 *  - Every member the vocabulary has is allowed (`EVERY_MEMBER`), `ThirdParty` among them, so
 *    the picture holds every element the document does.
 *  - An input with no data is sampled from its type (`fill="sample"`).
 *  - A node that cannot be drawn shows its fault in place (`drawFault`), and is never skipped, so
 *    the tree on screen matches the document. One node that throws shows one fault chip instead of
 *    a blank canvas.
 *
 * Nothing here re-implements a law. `validateSpec` checks the document, and this file only says
 * how its picture looks.
 */

/** The React vocabulary, as the members a screen is drawn with. */
export const MEMBERS: ScreenMembers = UI

/** Every member and exception primitive the vocabulary has. */
export const EVERY_MEMBER: readonly string[] = memberNames(VOCABULARY)

/** The component that draws `'A'` or `'A.B'`, by the rule the renderer draws with. */
export function resolveComponent(name: string): MemberComponent | null {
  return componentFor(MEMBERS, name)
}

/** A path in the validator's syntax (`$.root.children[0]`) as the composer writes an address (`$.children[0]`). */
export const addressOf = (path: string): string => path.replace(/^\$\.root/, '$')

/** A binding in a place where an element goes, shown as its own name. */
export function drawBinding(path: string): ReactNode {
  return <Badge tone="neutral">{`⟨${path}⟩`}</Badge>
}

/** What a fault chip says it is. */
const TITLE: Record<Exclude<FaultCause, 'threw'>, string> = {
  unknown: 'unknown member',
  // A member React does not draw, such as Toast, whose API is a call (`toast(options)`), or one
  // the host does not allow.
  refused: 'not renderable',
  missing: 'not renderable',
  // `{"$object": …}` is a prop form, such as a column, an option or an `emptyState`. In a children
  // position there is nothing to draw, and skipping it would show a tree that differs from the
  // document.
  value: 'not a node',
}

/** A fault, in the place of what could not be drawn. */
export function drawFault(fault: ScreenFault, cause: FaultCause): ReactNode {
  if (cause === 'threw') {
    return (
      <Card>
        <Stack gap={2}>
          <Badge tone="warning">{`${fault.component ?? 'element'} could not render`}</Badge>
          <Text size="sm" tone="secondary">
            {fault.message}
          </Text>
        </Stack>
      </Card>
    )
  }
  return (
    <Card>
      <Inline gap={2} align="center">
        <Badge tone="danger">{TITLE[cause]}</Badge>
        <Text size="sm" tone="secondary">
          {cause === 'value' ? `${fault.message} (${addressOf(fault.path)})` : fault.message}
        </Text>
      </Inline>
    </Card>
  )
}
