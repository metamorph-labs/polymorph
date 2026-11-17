import { Badge, Button, Card, Grid, Heading, Inline, Stack, Text } from '@polymorph/react-ui'

import { navigate } from './router'

/**
 * The page index. It shows the designer how the current pairing looks across whole screens.
 *
 * It lists seven exemplars, each an invented product for one archetype, plus Relay, the demo
 * product. Each uses only the vocabulary and no CSS, so each is also a proof artifact. Each
 * renders under the pairing the toolbar (or an ambient draft) has applied. The purpose of the
 * index is to change the system and then review the same decision across seven products.
 */

const EXEMPLARS: {
  slug: string
  product: string
  archetype: string
  domain: string
  blurb: string
}[] = [
  {
    slug: 'analytics',
    product: 'Meter',
    archetype: 'Dashboard',
    domain: 'Product analytics',
    blurb: 'A stat band, two chart panels and a traffic donut — the observing screen.',
  },
  {
    slug: 'crm',
    product: 'Ledger',
    archetype: 'List page',
    domain: 'Sales CRM',
    blurb: 'Accounts under filters, a summary band and the empty story every list owes.',
  },
  {
    slug: 'project',
    product: 'Sprintline',
    archetype: 'Detail page',
    domain: 'Project tracker',
    blurb: 'One issue, whole: identity row, tabbed body, a timeline and the aside.',
  },
  {
    slug: 'onboarding',
    product: 'Northbeam',
    archetype: 'Form page',
    domain: 'Workspace onboarding',
    blurb: 'A stepper over form cards — the committing row with exactly one solid button.',
  },
  {
    slug: 'billing',
    product: 'Meter — billing',
    archetype: 'Settings page',
    domain: 'Plans & billing',
    blurb: 'Setting rows in groups: plan, payment, invoices, and the danger at the end.',
  },
  {
    slug: 'signin',
    product: 'Northbeam — sign in',
    archetype: 'Auth page',
    domain: 'Authentication',
    blurb: 'The centred card: fields, one solid action, the other-account sentence.',
  },
  {
    slug: 'assistant',
    product: 'Pilot',
    archetype: 'Conversation page',
    domain: 'Workspace assistant',
    blurb:
      'A thread of turns — reasoning, a tool, sources, an approval — a composer that streams, and the artifact beside it.',
  },
]

export function PagesIndex() {
  return (
    <Stack as="section" gap={6} p={7}>
      <Stack gap={3}>
        <h1>Pages</h1>
        <Text>
          Whole screens, one per archetype, each a different product — because a design system is
          judged on an app, not on a swatch. Every page is composed from the vocabulary with no
          stylesheet of its own, and every page wears whatever the toolbar wears: switch the system,
          or bring your studio draft, and walk them again.
        </Text>
      </Stack>

      <Grid columns={3} gap={4}>
        {EXEMPLARS.map((exemplar) => (
          <Card key={exemplar.slug}>
            <Stack gap={3}>
              <Inline gap={2} wrap>
                <Heading level={3}>{exemplar.product}</Heading>
                <Badge tone="neutral">{exemplar.archetype}</Badge>
              </Inline>
              <Text size="sm" tone="secondary">
                {exemplar.domain}
              </Text>
              <Text size="sm" tone="secondary">
                {exemplar.blurb}
              </Text>
              <Inline gap={2}>
                <Button
                  variant="outline"
                  tone="accent"
                  size="sm"
                  label="Open full screen"
                  onClick={() => navigate(`/pages/${exemplar.slug}`)}
                />
              </Inline>
            </Stack>
          </Card>
        ))}
      </Grid>

      <Card>
        <Stack gap={3}>
          <Inline gap={2} wrap>
            <Heading level={3}>Compose your own</Heading>
            <Badge tone="accent">Composer</Badge>
          </Inline>
          <Text size="sm" tone="secondary">
            Assemble a screen from the vocabulary — the same document an agent writes and the
            emitter compiles to TSX. It saves into design/screens/ beside the shipped ones.
          </Text>
          <Inline gap={2}>
            <Button
              variant="outline"
              tone="accent"
              size="sm"
              label="Open the composer"
              onClick={() => navigate('/composer')}
            />
          </Inline>
        </Stack>
      </Card>

      <Card>
        <Stack gap={3}>
          <Inline gap={2} wrap>
            <Heading level={3}>Relay</Heading>
            <Badge tone="neutral">The demo product</Badge>
          </Inline>
          <Text size="sm" tone="secondary">
            A support inbox with a queue, a ticket detail, a validated form, settings and a command
            palette — five screens of one coherent product, zero CSS, two declared exceptions the
            inventory prints by name.
          </Text>
          <Inline gap={2}>
            <Button
              variant="outline"
              tone="accent"
              size="sm"
              label="Open Relay"
              onClick={() => navigate('/relay')}
            />
          </Inline>
        </Stack>
      </Card>
    </Stack>
  )
}
