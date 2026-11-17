import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Grid,
  Heading,
  Inline,
  Input,
  PageHeader,
  Progress,
  Stack,
  Tabs,
  Text,
} from '@polymorph/react-ui'

import { REGISTRY } from '../registry'
import { findSystem } from '../themes'

function SystemCard({ name }: { name: string }) {
  const system = findSystem(name)
  const entry = REGISTRY.theme.systems.find((candidate) => candidate.name === name)
  const mode = system.defaultMode === 'dark' ? 'dark' : 'light'

  return (
    <Stack gap={3}>
      <Inline gap={3} align="center">
        <Badge variant="solid" tone="accent">
          {name}
        </Badge>
        {/* The system's own introduction: `register` in its design/systems
            file. The catalogue law (`laws.test.ts`) requires it of every
            committed designed system. The rule for its wording is documented
            with the field. */}
        <Text>{system.register ?? ''}</Text>
      </Inline>
      <Inline gap={2} wrap>
        {Object.entries(entry?.axes ?? {}).map(([axis, value]) => (
          <Badge
            key={axis}
            variant="outline"
          >{`${axis.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${value}`}</Badge>
        ))}
        {(entry?.fonts ?? []).map((font) => (
          <Badge key={font.package} tone="accent">
            {font.package}
          </Badge>
        ))}
        {/* The system's default palette. It is a default, not a constraint,
            because every palette is lawful on every system. */}
        <Badge variant="outline" tone="accent">{`palette: ${system.defaultPalette}`}</Badge>
      </Inline>
      <div data-system={name} data-palette={system.defaultPalette} data-mode={mode}>
        <Card>
          <Stack gap={4}>
            <Tabs
              tabs={[
                { value: 'one', label: 'Overview' },
                { value: 'two', label: 'Activity' },
              ]}
              defaultValue="one"
            >
              <Tabs.Content value="one">
                <Text>The same components, this system&rsquo;s decisions.</Text>
              </Tabs.Content>
              <Tabs.Content value="two">
                <Text>Nothing here moves without a law watching.</Text>
              </Tabs.Content>
            </Tabs>
            <Grid columns={2} gap={4}>
              <Input placeholder="you@example.com" />
              <Inline gap={2}>
                <Button variant="solid" tone="accent" label="Save" />
                <Button variant="outline" tone="neutral" label="Cancel" />
              </Inline>
            </Grid>
            <Progress value={64} label={`${name} progress`} />
            <Checkbox defaultChecked label="Notify the requester" />
            <Alert tone="info" title="Heads up">
              This whole card renders inside a nested pairing scope — the same components, this
              system's decisions.
            </Alert>
          </Stack>
        </Card>
      </div>
    </Stack>
  )
}

export function SystemsPage() {
  const designed = REGISTRY.theme.systems.filter((system) => system.kind === 'designed')
  const tenants = REGISTRY.theme.systems.filter((system) => system.kind === 'tenant')

  return (
    <Stack gap={7} p={7}>
      {/* The count is computed, not written, because a number copied from the
          catalogue goes stale when a system is added. Each system introduces
          itself. The page states only what is true of all of them. */}
      <PageHeader
        title="Systems"
        description={`${designed.length} committed house systems, each one coherent assignment of the same eight axes. Below each: its own register — what ours is, not whose it stands beside — the axes as data, the fonts an install brings, the palette it asks for, and a live specimen rendered in a nested pairing scope.`}
      />
      <Stack gap={7}>
        {designed.map((system) => (
          <SystemCard key={system.name} name={system.name} />
        ))}
      </Stack>
      {tenants.length > 0 ? (
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading>Tenants</Heading>
            <Text size="sm" tone="secondary">
              A tenant is mostly a palette, not a new design. Its system file copies a house
              system&rsquo;s axes and adds its own display font, and its palette carries its brand.
              The engine turns arbitrary seeds into a law-checked pairing without a designer.
            </Text>
          </Stack>
          <Inline gap={2}>
            {tenants.map((system) => (
              <Badge key={system.name}>{system.name}</Badge>
            ))}
          </Inline>
        </Stack>
      ) : null}
    </Stack>
  )
}
