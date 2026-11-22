import { Heading, Stack, Text } from '@polymorph/react-ui'
import type { ReactNode } from 'react'

/**
 * One section of a reference page: a heading the page's links can name, a short lede under it,
 * then the content. Every reference page is a column of these, so each page has the same rhythm
 * and a reader can scan the headings.
 */
export function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string
  title: string
  lede?: ReactNode
  children: ReactNode
}) {
  return (
    <Stack as="section" gap={6}>
      <Stack gap={2}>
        <Heading id={id}>{title}</Heading>
        {lede === undefined ? null : <Text tone="secondary">{lede}</Text>}
      </Stack>
      {children}
    </Stack>
  )
}

/** A titled step inside a section: a small heading, a line of help, then what to copy. */
export function Step({
  title,
  help,
  children,
}: {
  title: string
  help?: ReactNode
  children?: ReactNode
}) {
  return (
    <Stack gap={3}>
      <Stack gap={1}>
        <Heading level={4}>{title}</Heading>
        {help === undefined ? null : (
          <Text size="sm" tone="secondary">
            {help}
          </Text>
        )}
      </Stack>
      {children}
    </Stack>
  )
}
