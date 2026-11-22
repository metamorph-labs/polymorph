import { Code, Heading, Stack, Text } from '@polymorph/react-ui'
import type { ReactNode } from 'react'

/**
 * One section of a component's page: a level-2 Heading whose `id` the page's
 * TableOfContents links to, an optional line under it, then the content.
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
    <Stack gap={5}>
      <Stack gap={2}>
        <Heading id={id}>{title}</Heading>
        {lede === undefined ? null : <Text tone="secondary">{lede}</Text>}
      </Stack>
      {children}
    </Stack>
  )
}

/**
 * Registry prose with its backtick spans drawn as Code. Prop docs and platform
 * reasons are written in Markdown's inline-code convention, and a literal
 * backtick on the page would read as a typo.
 */
export function withCode(text: string): ReactNode[] {
  const parts = text.split('`')
  // An unmatched backtick is a literal character, not the start of a span.
  if (parts.length % 2 === 0) return [text]
  return parts.map((part, index) =>
    index % 2 === 1 ? <Code key={index}>{part}</Code> : part === '' ? null : part,
  )
}
