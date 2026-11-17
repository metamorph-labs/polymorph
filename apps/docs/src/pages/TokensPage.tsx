import { Badge, Card, Heading, Inline, PageHeader, Stack, Text } from '@polymorph/react-ui'

import { Swatches } from '../harness/Swatches'
import { TypeRamp } from '../harness/TypeRamp'
import { REGISTRY } from '../registry'
import { findSystem } from '../themes'

/**
 * The token gallery. Role names and scale steps come from the registry's
 * catalogue. Every painted value is the live pairing's own custom property, so
 * the topbar's system, palette and mode selects repaint the page. Showing that
 * is the page's purpose.
 *
 * The axis badges read the system, not the pairing, because axes are
 * structural and a palette cannot change them.
 */
export function TokensPage({ system }: { system: string }) {
  const resolved = findSystem(system)
  const roles = REGISTRY.theme.colorRoles
  const scales = REGISTRY.theme.scales

  return (
    <Stack gap={7} p={7}>
      <PageHeader
        title="Tokens"
        description={`${REGISTRY.theme.customProperties.length} custom properties under one prefix. Roles are semantic — application code and recipes name meanings, never values — and every colour pairing the vocabulary permits is contrast-checked on every system × palette, in both modes.`}
      />

      <Inline gap={2} wrap>
        {REGISTRY.theme.axes.map((axis) => (
          <Badge
            key={axis.name}
            variant="outline"
            tone="accent"
          >{`${axis.name.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${String(resolved.axes[axis.name as keyof typeof resolved.axes])}`}</Badge>
        ))}
      </Inline>

      {Object.entries(roles).map(([group, names]) => (
        <Stack key={group} gap={3}>
          <Heading>{`Colour · ${group}`}</Heading>
          <Card>
            <Swatches roles={names} />
          </Card>
        </Stack>
      ))}

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>Type</Heading>
          <Text size="sm" tone="secondary">
            Rendered at emitted size in the current system&rsquo;s families. Fonts belong to the
            system, not the palette. Display steps carry their own optical tracking, weight, and
            style slot.
          </Text>
        </Stack>
        <Card>
          <Stack gap={4}>
            <TypeRamp kind="text" steps={scales.text ?? []} />
            <TypeRamp kind="display" steps={scales.display ?? []} />
          </Stack>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Heading>Scales</Heading>
        <Card>
          <Stack gap={3}>
            {Object.entries(scales)
              .filter(([name]) => name !== 'text' && name !== 'display')
              .map(([name, steps]) => (
                <Inline key={name} gap={2} align="center" wrap>
                  <Badge>{name}</Badge>
                  <Text size="sm" tone="secondary">
                    {steps.join(' · ')}
                  </Text>
                </Inline>
              ))}
          </Stack>
        </Card>
      </Stack>
    </Stack>
  )
}
