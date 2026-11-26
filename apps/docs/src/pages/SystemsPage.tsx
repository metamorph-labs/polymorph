import { getSystem } from '@polymorph/theme'
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  Grid,
  Heading,
  Inline,
  Link,
  PageHeader,
  Progress,
  SegmentedControl,
  Separator,
  Stack,
  Stat,
  Switch,
  Text,
} from '@polymorph/react-ui'
import { Fragment, useState } from 'react'

import { TypeSample } from '../harness/TypeRamp'
import { useMeta } from '../meta'
import { fontsOf } from '../reference/tokens'
import { REGISTRY } from '../registry'
import { DEFAULT_SYSTEM, findSystem, selectSystem } from '../themes'

/**
 * Every house system: its own introduction, its eight axes, its fonts and palette, and a specimen
 * drawn in a nested pairing scope. A reader can put any system on the whole site from here.
 *
 * The page takes the current system and the handler that changes it from the shell, which owns
 * the theme control, so the control and this page agree. Without them the page changes the
 * system itself through `selectSystem`, and the theme control shows the change on its next
 * render.
 */

/** Each axis in a reader's words. The axis names are the registry's. */
const AXIS_LABELS: Readonly<Record<string, string>> = {
  geometry: 'Corners',
  depth: 'Depth',
  density: 'Density',
  contrastTemperament: 'Contrast',
  typePersonality: 'Type',
  colorStrategy: 'Colour',
  motionTemperament: 'Motion',
  ornament: 'Ornament',
}

const title = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

/** How a system greets someone who has not picked light or dark yet. */
function opensIn(mode: 'light' | 'dark' | 'system'): string {
  return mode === 'system'
    ? 'it follows your device’s light or dark setting until you pick one'
    : `it opens in ${mode} mode until you pick another`
}

/**
 * A small product screen in the system's own pairing: a display title, a figure with its trend,
 * a few controls and status. The Card shows the system's depth, and the title its display face.
 */
function Specimen({ name }: { name: string }) {
  const system = findSystem(name)
  const mode = system.defaultMode === 'dark' ? 'dark' : 'light'

  return (
    <div data-system={name} data-palette={system.defaultPalette} data-mode={mode}>
      <Card>
        <Stack gap={6}>
          <Stack gap={1}>
            <TypeSample kind="display" step="sm">
              Today
            </TypeSample>
            <Text size="sm" tone="secondary">
              What your team has shipped so far.
            </Text>
          </Stack>
          <Grid columns={2} gap={6}>
            <Stat
              label="Active users"
              value="12,480"
              delta={{ value: '8.2%', direction: 'up' }}
              spark={[8, 9, 8.5, 10, 11, 10.5, 12.4]}
            />
            <Stack gap={4}>
              <SegmentedControl
                label="Period"
                size="sm"
                defaultValue="week"
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
              <Progress value={64} label="Release progress" />
              <Inline gap={2} wrap>
                <Badge tone="success">Live</Badge>
                <Badge tone="warning">In review</Badge>
              </Inline>
            </Stack>
          </Grid>
          <Inline gap={3} align="center" justify="between" wrap>
            <Switch defaultChecked label="Tell the team" />
            <Inline gap={2} wrap>
              <Button variant="outline" tone="neutral" label="Preview" />
              <Button variant="solid" tone="accent" label="Publish" />
            </Inline>
          </Inline>
        </Stack>
      </Card>
    </div>
  )
}

function SystemBlock({
  name,
  current,
  onApply,
}: {
  name: string
  current: boolean
  onApply: (name: string) => void
}) {
  const system = findSystem(name)
  const entry = REGISTRY.theme.systems.find((candidate) => candidate.name === name)
  const axes = REGISTRY.theme.axes.map((axis) => ({
    term: AXIS_LABELS[axis.name] ?? axis.name,
    detail: entry?.axes[axis.name as keyof typeof entry.axes] ?? '',
  }))

  return (
    <Stack as="section" gap={5}>
      <Inline gap={4} align="center" justify="between" wrap>
        <Heading id={`system-${name}`}>{title(name)}</Heading>
        {current ? (
          <Badge tone="accent" icon="confirm">
            On this site now
          </Badge>
        ) : (
          <Button
            variant="outline"
            tone="accent"
            size="sm"
            label={`Try ${title(name)} on this site`}
            onClick={() => onApply(name)}
          />
        )}
      </Inline>
      {/* The system's own introduction: `register` in its design/systems file. */}
      {system.register === undefined ? null : <Text tone="secondary">{system.register}</Text>}
      <Grid columns={2} gap={6}>
        <Stack gap={5}>
          <DescriptionList orientation="horizontal" items={axes} />
          <Text size="sm" tone="secondary">
            {`It uses ${fontsOf(name)}. Its own palette is ${system.defaultPalette}, and ${opensIn(system.defaultMode)}.`}
          </Text>
        </Stack>
        <Specimen name={name} />
      </Grid>
    </Stack>
  )
}

export function SystemsPage({
  system,
  onSystemChange,
}: {
  system?: string
  onSystemChange?: (name: string) => void
}) {
  const [own, setOwn] = useState(() => getSystem() ?? DEFAULT_SYSTEM)
  const current = system ?? own
  const apply =
    onSystemChange ??
    ((name: string) => {
      selectSystem(name)
      setOwn(name)
    })

  useMeta({
    title: 'Systems',
    description:
      'A system sets the shape of your product: corners, depth, spacing, type and motion. See every ready-made one side by side, and try any of them on this site.',
  })

  const designed = REGISTRY.theme.systems.filter((entry) => entry.kind === 'designed')
  const tenants = REGISTRY.theme.systems.filter((entry) => entry.kind === 'tenant')

  return (
    <Stack gap={8}>
      <PageHeader
        title="Systems"
        description={`A system decides how your product is built: its corners, depth, spacing, contrast, type and motion. Colour comes from a palette, and any palette works with any system. Here are the ${designed.length} systems that come with Polymorph. Try any of them on this site.`}
      />

      <Inline gap={5} wrap>
        {designed.map((entry) => (
          <Link key={entry.name} variant="standalone" href={`#system-${entry.name}`}>
            {title(entry.name)}
          </Link>
        ))}
      </Inline>

      {designed.map((entry) => (
        <Fragment key={entry.name}>
          <Separator />
          <SystemBlock name={entry.name} current={entry.name === current} onApply={apply} />
        </Fragment>
      ))}

      {tenants.length > 0 ? (
        <>
          <Separator />
          <Stack gap={5}>
            <Stack gap={2}>
              <Heading>Your brand on a house system</Heading>
              <Text tone="secondary">
                You don't need a new system to carry your brand. Copy a house system, add your own
                display font, and bring your palette. The theme engine turns your colours into a
                full, contrast-checked theme.
              </Text>
            </Stack>
            {tenants.map((entry) => (
              <SystemBlock
                key={entry.name}
                name={entry.name}
                current={entry.name === current}
                onApply={apply}
              />
            ))}
          </Stack>
        </>
      ) : null}
    </Stack>
  )
}
