import { type ComponentStates } from '@polymorph/react'
import { Link } from '../controls/Link'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Avatar } from '../structure/Avatar'
import { Badge } from '../structure/Badge'
import { Text } from '../structure/Text'
import { HoverCard } from './HoverCard'

/**
 * States fixture, from `design/components/hover-card.md`'s States table.
 *
 * The open entries use Radix `defaultOpen`, as Tooltip's do, because the
 * preview only appears after hovering and a gallery cannot hover.
 */

const TRIGGER = <Link href="#ada">Ada Lovelace</Link>

function PersonPreview() {
  return (
    <Stack gap={3}>
      <Inline gap={3} align="center">
        <Avatar name="Ada Lovelace" />
        <Text>Ada Lovelace</Text>
      </Inline>
      <Inline gap={2} align="center">
        <Text size="sm" tone="secondary">
          Support
        </Text>
        <Badge tone="accent">12 open tickets</Badge>
      </Inline>
    </Stack>
  )
}

export const states: ComponentStates = {
  component: 'HoverCard',

  entries: [
    {
      name: 'closed — the trigger is all there is',
      render: () => <HoverCard content={<PersonPreview />}>{TRIGGER}</HoverCard>,
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'open — the person behind the link, seen without going',
      render: () => (
        <HoverCard defaultOpen content={<PersonPreview />}>
          {TRIGGER}
        </HoverCard>
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'above its trigger, aligned to the end',
      render: () => (
        <HoverCard defaultOpen side="top" align="end" content={<PersonPreview />}>
          {TRIGGER}
        </HoverCard>
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'long content — wraps at the panel’s max width',
      render: () => (
        <HoverCard
          defaultOpen
          content={
            <Stack gap={3}>
              <Text>T-1041 · Login loop after password reset</Text>
              <Text size="sm" tone="secondary">
                Reported by three customers on the annual plan. Reproduces after a password reset
                followed by an SSO sign-in on a second device; the session cookie is re-issued with
                the old rotation key.
              </Text>
            </Stack>
          }
        >
          <Link href="#t-1041">T-1041</Link>
        </HoverCard>
      ),
      expect: { 'data-state': 'open' },
    },
  ],

  /*
   * The spec's States section leaves this out too. The trigger is the caller's
   * own focusable element (a Link here), which has the focus convention's
   * `:focus-visible` ring in its own stylesheet. This list is what this
   * member's CSS must style, so including it would assert Link's stylesheet
   * under HoverCard's name. Menu's fixture leaves it out for the same reason.
   */
  requiredSelectors: ['[data-state="open"]', '[data-side="top"]', '[data-side="bottom"]'],
}
