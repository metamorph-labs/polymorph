import type { RegistryProp } from '@polymorph/registry'
import { Badge, Code, Inline, Separator, Stack, Text } from '@polymorph/react-ui'
import { Fragment } from 'react'

import { readableType } from './catalogue'
import { withCode } from './Section'

/**
 * A member's props as a list: the name and a "required" mark, the type under
 * it, then the note. A list, not a Table: below a `36rem` container a Table
 * keeps the width its columns need and scrolls (`table.md`), and a note column
 * of full sentences then becomes one line hundreds of pixels wide. Each entry
 * here wraps at any width.
 *
 * The order is the reader's: what must be passed first, then the member's own
 * props by name, then the `aria-*` and `data-*` attributes it forwards, which
 * most callers never set.
 */
export function PropList({ props }: { props: readonly RegistryProp[] }) {
  const ordered = [...props].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'en'))
  return (
    <Stack gap={4}>
      {ordered.map((prop, index) => (
        <Fragment key={prop.name}>
          {index === 0 ? null : <Separator />}
          <Stack gap={2}>
            <Inline gap={2} align="center" wrap>
              <Code>{prop.name}</Code>
              {prop.optional ? null : (
                <Badge tone="accent" variant="soft">
                  Required
                </Badge>
              )}
            </Inline>
            <Text size="sm" tone="secondary">
              <Code>{readableType(prop)}</Code>
            </Text>
            {prop.doc === undefined || prop.doc === '' ? null : (
              <Text size="sm">{withCode(prop.doc)}</Text>
            )}
          </Stack>
        </Fragment>
      ))}
    </Stack>
  )
}

function rank(prop: RegistryProp): number {
  if (!prop.optional) return 0
  return /^(aria|data)-/.test(prop.name) ? 2 : 1
}
