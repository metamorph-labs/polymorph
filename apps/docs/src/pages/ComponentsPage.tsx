import { Badge, Card, Grid, Inline, Link, PageHeader, Stack, Text } from '@polymorph/react-ui'

import { componentSlug, componentsByTier, REGISTRY, TIERS } from '../registry'

const TIER_BLURB: Record<string, string> = {
  controls: 'Inputs and choices — everything a form is made of.',
  overlays: 'Surfaces in front of the page: dialogs, menus, the palette.',
  structure: 'The page fabric: text, cards, tables, status, wayfinding.',
  layout: 'Rhythm without CSS — stacks, inlines, grids.',
  charts: 'Data on the page’s own tokens — one frame, honest axes, a table twin.',
  ai: 'The conversation: a model’s turns, the composer, what it ran and what it cited.',
  archetypes: 'Whole screens with the hierarchy already decided.',
  icon: 'One closed set of meanings; glyphs are a decision, not a search.',
}

export function ComponentsPage() {
  return (
    <Stack gap={7} p={7}>
      <PageHeader
        title="Components"
        description={`${REGISTRY.components.length} members. Every one ships its states, its keyboard behavior, its motion, and its laws — closed props, no style escape hatches.`}
      />

      {TIERS.map((tier) => {
        const members = componentsByTier(tier)
        if (members.length === 0) return null
        return (
          <Stack key={tier} gap={4}>
            <Inline gap={3} align="center">
              <Badge variant="outline" tone="accent">
                {tier}
              </Badge>
              <Text size="sm" tone="secondary">
                {TIER_BLURB[tier] ?? ''}
              </Text>
            </Inline>
            <Grid columns={3} gap={4}>
              {members.map((component) => (
                <Card key={component.name}>
                  <Stack gap={2}>
                    <Inline gap={2} align="center" justify="between">
                      <Link
                        variant="standalone"
                        href={`/components/${componentSlug(component.name)}`}
                      >
                        {component.name}
                      </Link>
                      <Badge>{component.origin}</Badge>
                    </Inline>
                    <Text size="sm" tone="secondary">
                      {component.purpose}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Grid>
          </Stack>
        )
      })}
    </Stack>
  )
}
