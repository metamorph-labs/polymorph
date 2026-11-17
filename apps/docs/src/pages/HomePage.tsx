import {
  Badge,
  Button,
  Card,
  Grid,
  Hero,
  Inline,
  Stack,
  Stat,
  Switch,
  Text,
} from '@polymorph/react-ui'

import { REGISTRY } from '../registry'
import { navigate } from '../router'
import { findSystem } from '../themes'

/**
 * The landing page. Its prose is hand-written, but every number it shows comes
 * from the registry, so the numbers always match the tree that published them.
 */

/**
 * One live specimen per system, rendered inside its own scope. A scope needs
 * both halves of a pairing, because a system alone matches no emitted block. So
 * the specimen uses the system with the palette that system declares as its own.
 */
function SystemSpecimen({ name }: { name: string }) {
  const system = findSystem(name)
  return (
    <div
      data-system={name}
      data-palette={system.defaultPalette}
      data-mode={system.defaultMode === 'dark' ? 'dark' : 'light'}
    >
      <Card>
        <Stack gap={3}>
          <Inline gap={2} align="center" justify="between">
            <Badge variant="solid" tone="accent">
              {name}
            </Badge>
            <Switch defaultChecked label={`${name} live`} />
          </Inline>
          <Inline gap={2}>
            <Button variant="solid" tone="accent" size="sm" label="Primary" />
            <Button variant="ghost" tone="neutral" size="sm" label="Quiet" />
          </Inline>
        </Stack>
      </Card>
    </div>
  )
}

export function HomePage() {
  const designed = REGISTRY.theme.systems.filter((system) => system.kind === 'designed')

  return (
    <Stack gap={7} p={7}>
      {/* A Hero rather than a PageHeader, because this is the landing page.
          It keeps `align='start'` because everything below it is left-aligned
          (a Stat row and two card grids), and a centred title above them would
          give the page two reading edges. AuthPage centres because it is one
          narrow column with nothing beside it. This page is a catalogue. */}
      <Hero
        title="One vocabulary. Any number of faces."
        lede="Polymorph is a design system engineered as a decision system: every design decision is made exactly once, referenced everywhere, verified by law, and safely changeable — by people and by agents."
        actions={
          <Button
            variant="solid"
            tone="accent"
            label="Browse components"
            onClick={() => navigate('/components')}
          />
        }
      />

      <Inline gap={5} wrap>
        <Stat label="Components" value={String(REGISTRY.components.length)} />
        {/* Counted separately because they are different things: a system is
            structure and a palette is colour. Every palette is lawful on every
            system. */}
        <Stat label="Design systems" value={String(designed.length)} />
        <Stat label="Palettes" value={String(REGISTRY.theme.palettes.length)} />
        <Stat label="Laws" value={String(REGISTRY.laws.length)} />
        <Stat label="Design tokens" value={String(REGISTRY.theme.customProperties.length)} />
      </Inline>

      <Grid columns={3} gap={4}>
        {designed.map((system) => (
          <SystemSpecimen key={system.name} name={system.name} />
        ))}
      </Grid>

      <Grid columns={3} gap={5}>
        <Card>
          <Stack gap={3}>
            <Badge tone="accent">Consistent by construction</Badge>
            <Text>
              Application code expresses product intent through governed decisions. It cannot invent
              a visual primitive by accident, so consistency comes from the system&rsquo;s
              structure, not from review or discipline.
            </Text>
          </Stack>
        </Card>
        <Card>
          <Stack gap={3}>
            <Badge tone="accent">Changeable as data</Badge>
            <Text>
              A pairing is two JSON files: a system&rsquo;s eight axes and fonts, and a
              palette&rsquo;s handful of colour seeds. Re-branding, changing density or onboarding a
              tenant is an edit to those decisions, not a sweep across screens. The churn proof
              re-runs the redesign on every change.
            </Text>
          </Stack>
        </Card>
        <Card>
          <Stack gap={3}>
            <Badge tone="accent">Verified by law</Badge>
            <Text>
              Contrast, coherence, state completeness, motion rules and the exception ladder are
              lint rules and tests, not guidelines. A deviation either cannot be written or fails a
              check, for people and agents alike.
            </Text>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  )
}
