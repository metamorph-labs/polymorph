import { Card, Grid, Heading, PageHeader, Stack, Text } from '@polymorph/react-ui'

import { GUIDE_GROUPS, guidePath, guidesInGroup } from '../guides'
import { useMeta } from '../meta'

/**
 * The guides index: every guide in `docs/`, in the groups `guides.ts` puts
 * them in, each a linked Card with the guide's title and a line on what it
 * covers. The groups run in the order a newcomer reads them.
 *
 * It is composed from members with no archetype around it, so its route uses
 * the shell's `'page'` content layout and the page adds no outer padding.
 */
export function GuidesPage() {
  useMeta({
    title: 'Guides',
    description:
      'Everything written down about Polymorph, from your first install to how it all gets tested.',
  })
  return (
    <Stack gap={8}>
      <PageHeader
        title="Guides"
        description="Everything we’ve written down about Polymorph, from your first install to how it all gets tested. If you’re new, start with the first group."
      />
      {GUIDE_GROUPS.map((group) => (
        <Stack key={group.id} as="section" gap={4}>
          <Stack gap={1}>
            <Heading>{group.title}</Heading>
            <Text tone="secondary">{group.description}</Text>
          </Stack>
          <Grid columns={3} gap={4}>
            {guidesInGroup(group.id).map((guide) => (
              // Card's `title` draws the overline recipe, which reads as a
              // label. A guide's title is what the reader scans for, so it is
              // a Heading inside the card.
              <Card key={guide.slug} href={guidePath(guide.slug)} label={guide.title}>
                <Stack gap={2}>
                  <Heading level={3}>{guide.title}</Heading>
                  <Text size="sm" tone="secondary">
                    {guide.description}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        </Stack>
      ))}
    </Stack>
  )
}
