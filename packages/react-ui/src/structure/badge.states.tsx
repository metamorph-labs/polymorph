import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Badge, BADGE_TONES, BADGE_VARIANTS } from './Badge'

/**
 * States fixture, from `design/components/badge.md`'s States table.
 *
 * All eighteen cells, generated from the two enums. Every cell is lawful, so the
 * gallery shows the full grid without a hand-written list that could go stale.
 */

export const states: ComponentStates = {
  component: 'Badge',

  entries: [
    ...BADGE_VARIANTS.flatMap((variant) =>
      BADGE_TONES.map((tone) => ({
        name: `${variant} / ${tone}`,
        render: () => (
          <Badge variant={variant} tone={tone}>
            Active
          </Badge>
        ),
        expect: { 'data-variant': variant, 'data-tone': tone },
      })),
    ),
    {
      name: 'the whole grid at once',
      render: () => (
        <Stack gap={3}>
          {BADGE_VARIANTS.map((variant) => (
            <Inline key={variant} gap={2} wrap>
              {BADGE_TONES.map((tone) => (
                <Badge key={tone} variant={variant} tone={tone}>
                  {tone}
                </Badge>
              ))}
            </Inline>
          ))}
        </Stack>
      ),
    },
    {
      name: 'with an icon',
      render: () => <Badge icon="time">Waiting</Badge>,
    },
    {
      name: 'a count',
      render: () => <Badge variant="solid" tone="accent" count={3} />,
      expect: { 'data-count': '' },
    },
    {
      name: 'a count past its cap',
      render: () => <Badge variant="solid" tone="accent" count={128} />,
      expect: { 'data-count': '' },
    },
    {
      name: 'a count in every variant',
      render: () => (
        <Inline gap={2}>
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant} tone="accent" count={12} />
          ))}
        </Inline>
      ),
    },
    {
      name: 'a dot',
      render: () => (
        <Badge tone="accent" dot>
          New
        </Badge>
      ),
      expect: { 'data-dot': '' },
    },
    {
      name: 'a dot in every tone',
      render: () => (
        <Inline gap={3} align="center">
          {BADGE_TONES.map((tone) => (
            <Badge key={tone} tone={tone} dot>
              {tone}
            </Badge>
          ))}
        </Inline>
      ),
    },
  ],

  requiredSelectors: [],
}
