import {
  BarChart,
  Button,
  Card,
  Code,
  Grid,
  Heading,
  Icon,
  Inline,
  Link,
  PageHeader,
  Separator,
  Stack,
  Tabs,
  Text,
} from '@polymorph/react-ui'

import { RadiusTile, ShadowTile, SpaceScale } from '../harness/Scales'
import { Ramp, Swatch } from '../harness/Swatches'
import { TypeRamp } from '../harness/TypeRamp'
import { Section } from '../reference/Section'
import { fontsOf, paintOf, pixels, purposeOf, tokenValuesOf, usageOf } from '../reference/tokens'
import { REGISTRY } from '../registry'
import { findSystem } from '../themes'
import { useMeta } from '../meta'

/**
 * The token gallery. Role names and scale steps come from the registry's catalogue, and what a
 * role is for comes from the contrast law and the components that read it
 * (`src/reference/tokens.ts`). Every painted value is the live pairing's own custom property, so
 * the theme control repaints the page. The labels that state a size read the registry's values
 * for the current system at its own density.
 */

const roles = REGISTRY.theme.colorRoles
const scales = REGISTRY.theme.scales

/** One role: its swatch, its name, and what it is for. */
function RoleItem({ role }: { role: string }) {
  const purpose = purposeOf(role)
  const usage = usageOf(role)
  return (
    <Inline gap={4} align="center">
      <Swatch role={role} {...paintOf(role)} />
      <Stack gap={1}>
        <Text size="sm">
          <Code>{role}</Code>
        </Text>
        {purpose === undefined ? null : (
          <Text size="sm" tone="secondary">
            {purpose}
          </Text>
        )}
        {usage === undefined ? null : (
          <Text size="sm" tone="secondary">
            {usage}
          </Text>
        )}
      </Stack>
    </Inline>
  )
}

function RoleGrid({ names }: { names: readonly string[] }) {
  return (
    <Grid columns={3} gap={6}>
      {names.map((role) => (
        <RoleItem key={role} role={role} />
      ))}
    </Grid>
  )
}

function RoleGroup({
  title,
  lede,
  names,
}: {
  title: string
  lede: string
  names: readonly string[]
}) {
  return (
    <Stack gap={5}>
      <Stack gap={1}>
        <Heading level={3}>{title}</Heading>
        <Text size="sm" tone="secondary">
          {lede}
        </Text>
      </Stack>
      <RoleGrid names={names} />
    </Stack>
  )
}

const STATUS_TONES = ['danger', 'warning', 'success', 'info'] as const
const statusRoles = (tone: string) =>
  (roles.status ?? []).filter((role) => role.startsWith(`${tone}.`))

const chart = roles.chart ?? []
const categorical = chart.filter((role) => /^chart\.(\d|other)/.test(role))
const sequential = chart.filter((role) => role.startsWith('chart.seq.'))
const diverging = [
  ...chart.filter((role) => role.startsWith('chart.neg.')).reverse(),
  ...chart.filter((role) => role === 'chart.mid'),
  ...chart.filter((role) => role.startsWith('chart.pos.')),
]
const chartFrame = chart.filter((role) => role === 'chart.grid' || role === 'chart.axis')
const lastPart = (role: string) => role.split('.').slice(1).join('.')

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

export function TokensPage({ system }: { system: string }) {
  useMeta({
    title: 'Tokens',
    description:
      'The named values every Polymorph component is drawn with: colour, type, spacing, corners, shadows and timing, shown live in the theme you pick.',
  })
  const axes = findSystem(system).axes
  const values = tokenValuesOf(system)
  const textSizes = Object.fromEntries(
    (scales.text ?? []).map((step) => [step, pixels(values.text?.[`--pm-text-${step}-size`])]),
  )
  const displaySizes = Object.fromEntries(
    (scales.display ?? []).map((step) => [
      step,
      pixels(values.text?.[`--pm-display-${step}-size`]),
    ]),
  )
  const durations = (scales.duration ?? []).map((step) => {
    const property = `--pm-motion-duration-${step.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`
    // `controlExit` reads as "control exit" on the chart's axis.
    const name = step.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    return { step: name, ms: Number.parseFloat(values.duration?.[property] ?? '0') }
  })
  const size = (name: string) => values.size?.[name] ?? ''

  return (
    <Stack gap={8}>
      <PageHeader
        title="Tokens"
        description={`Tokens are the named values every component is drawn with: ${REGISTRY.theme.customProperties.length} of them, for colour, type, spacing, corners, shadows and timing. Change the theme at the top of the page and watch everything here update.`}
      />

      <Section
        id="colour"
        title="Colour"
        lede="Components never use a raw colour. They ask for a role, like the main text colour or the fill for a primary button, and your theme decides what it is. Every text role is checked for contrast on each background it can sit on, in light and dark. The Lc number is the least contrast it must reach."
      >
        <Stack gap={8}>
          <RoleGroup
            title="Backgrounds"
            lede="The page, the surfaces on it, and the layers that float above. In dark mode each layer is a little lighter than the one below it."
            names={roles.background ?? []}
          />
          <RoleGroup
            title="Text"
            lede="Three levels of text for reading, plus disabled and inverse."
            names={roles.text ?? []}
          />
          <RoleGroup
            title="Borders"
            lede="Hairlines that separate things, the edge of a form field, and the focus ring."
            names={roles.border ?? []}
          />
          <RoleGroup
            title="Accent"
            lede="Your palette's own colour. Solid fills for the main action, soft washes for quieter ones, and text and underlines for links."
            names={roles.accent ?? []}
          />
          <Stack gap={5}>
            <Stack gap={1}>
              <Heading level={3}>Status</Heading>
              <Text size="sm" tone="secondary">
                Danger, warning, success and info. Each one has the same set of roles as the accent,
                so they all work the same way.
              </Text>
            </Stack>
            <Tabs
              tabs={STATUS_TONES.map((tone) => ({ value: tone, label: capitalise(tone) }))}
              defaultValue="danger"
            >
              {STATUS_TONES.map((tone) => (
                <Tabs.Content key={tone} value={tone}>
                  <RoleGrid names={statusRoles(tone)} />
                </Tabs.Content>
              ))}
            </Tabs>
          </Stack>
          <RoleGroup
            title="Selection"
            lede="What a chosen row, date or item looks like."
            names={roles.selection ?? []}
          />
          <RoleGroup
            title="Gradients"
            lede="These two become gradients when your palette has a second hue, and plain colours when it doesn't."
            names={roles.gradient ?? []}
          />
          <Stack gap={5}>
            <Stack gap={1}>
              <Heading level={3}>Charts</Heading>
              <Text size="sm" tone="secondary">
                Eight colours for categories, a ramp for amounts, and two arms for values above and
                below a midpoint.
              </Text>
            </Stack>
            <Grid columns={3} gap={6}>
              <Stack gap={2}>
                <Text size="sm">Categories</Text>
                <Ramp roles={categorical} labels={categorical.map(lastPart)} />
              </Stack>
              <Stack gap={2}>
                <Text size="sm">Amounts</Text>
                <Ramp roles={sequential} labels={sequential.map(lastPart)} />
              </Stack>
              <Stack gap={2}>
                <Text size="sm">Above and below</Text>
                <Ramp roles={diverging} labels={diverging.map(lastPart)} />
              </Stack>
            </Grid>
            <RoleGrid names={chartFrame} />
          </Stack>
        </Stack>
      </Section>

      <Separator />

      <Section
        id="type"
        title="Type"
        lede={`Your system picks the fonts and every size. This one uses ${fontsOf(system)}. The big display sizes are for page titles. Sizes are in rem, so they follow your reader's own text size setting.`}
      >
        <Card>
          <Stack gap={6}>
            <TypeRamp
              kind="display"
              steps={scales.display ?? []}
              sizes={displaySizes}
              sample="Sphinx of black quartz"
            />
            <TypeRamp
              kind="text"
              steps={[...(scales.text ?? [])].reverse()}
              sizes={textSizes}
              sample="Sphinx of black quartz, judge my vow"
            />
          </Stack>
        </Card>
      </Section>

      <Separator />

      <Section
        id="space"
        title="Space, corners and shadows"
        lede="Your system sets these too. Spacing follows its density, corners its geometry, and shadows its depth."
      >
        <Grid columns={3} gap={6}>
          <Card title={`Spacing · ${axes.density}`}>
            <SpaceScale
              steps={scales.space ?? []}
              values={Object.fromEntries(
                (scales.space ?? []).map((step) => [
                  step,
                  values.space?.[`--pm-space-${step}`] ?? '',
                ]),
              )}
            />
          </Card>
          <Card title={`Corners · ${axes.geometry}`}>
            <Inline gap={5} wrap>
              {(scales.radius ?? []).map((step) => (
                <Stack key={step} gap={2}>
                  <RadiusTile step={step} />
                  <Text size="sm">
                    <Code>{`radius.${step}`}</Code>
                  </Text>
                  <Text size="sm" tone="secondary">
                    {step === 'pill'
                      ? 'Fully round'
                      : (values.radius?.[`--pm-radius-${step}`] ?? '')}
                  </Text>
                </Stack>
              ))}
            </Inline>
          </Card>
          <Card title={`Shadows · ${axes.depth}`}>
            <Stack gap={6}>
              {(scales.shadow ?? []).map((step) => (
                <Stack key={step} gap={2}>
                  <ShadowTile step={step} />
                  <Text size="sm">
                    <Code>{`shadow.${step}`}</Code>
                  </Text>
                </Stack>
              ))}
              <Text size="sm" tone="secondary">
                A flat system keeps shadows for things that float, like menus and dialogs.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </Section>

      <Separator />

      <Section
        id="sizes"
        title="Sizes and timing"
        lede="Controls come in three heights, icons in three sizes, and every movement has a set duration."
      >
        <Grid columns={2} gap={6}>
          <Card title="Controls and icons">
            <Stack gap={6}>
              <Inline gap={3} align="center" wrap>
                <Button
                  size="sm"
                  variant="outline"
                  tone="neutral"
                  label={`Small, ${size('--pm-control-height-sm')}`}
                />
                <Button
                  size="md"
                  variant="outline"
                  tone="neutral"
                  label={`Medium, ${size('--pm-control-height-md')}`}
                />
                <Button
                  size="lg"
                  variant="outline"
                  tone="neutral"
                  label={`Large, ${size('--pm-control-height-lg')}`}
                />
              </Inline>
              <Inline gap={6} align="center" wrap>
                {(scales.icon ?? []).map((step) => (
                  <Inline key={step} gap={2} align="center">
                    <Icon name="settings" size={step as 'sm' | 'md' | 'lg'} />
                    <Text size="sm" tone="secondary">
                      {`${step}, ${size(`--pm-icon-size-${step}`)}`}
                    </Text>
                  </Inline>
                ))}
              </Inline>
              <Text size="sm" tone="secondary">
                {`Density sets how tall controls are and how much room they get. This system is ${axes.density}.`}
              </Text>
            </Stack>
          </Card>
          <Card title={`Timing · ${axes.motionTemperament}`}>
            <Stack gap={4}>
              <BarChart
                label="How long each kind of movement takes, in milliseconds"
                orientation="horizontal"
                data={durations}
                series={[{ key: 'ms', label: 'Milliseconds' }]}
                x={{ key: 'step' }}
              />
              <Text size="sm" tone="secondary">
                Exits are quicker than entrances. See them all move on the{' '}
                <Link href="/motion">motion page</Link>.
              </Text>
            </Stack>
          </Card>
        </Grid>
      </Section>
    </Stack>
  )
}
