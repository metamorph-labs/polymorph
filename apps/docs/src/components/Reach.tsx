import type { RegistryComponent } from '@polymorph/registry'
import { DescriptionList, Link, Stack, Text } from '@polymorph/react-ui'
import type { ReactNode } from 'react'

import { componentBySlug, componentSlug } from '../registry'
import { PLATFORM_LABELS, series, webReach } from './catalogue'
import { withCode } from './Section'

/**
 * Where a member renders: the web frameworks whose vocabulary ships it, then
 * each phone platform's rendering (`native`, `adapted` with how, or `absent`
 * with why and what to use instead), read from the registry's framework and
 * platform maps.
 */
export function Reach({ component }: { component: RegistryComponent }) {
  const web = webReach(component)

  const items: { term: string; detail: ReactNode }[] = [
    {
      term: 'Web',
      detail: (
        <Stack gap={1}>
          <Text size="sm">{series(web.native)}</Text>
          {web.absent.map((group) => (
            <Text key={group.frameworks.join()} size="sm" tone="secondary">
              {/* The map's reason is written for someone changing the
                  renderers, so the page says only where the member is not. */}
              {`Not in ${series(group.frameworks, 'or')}.`}
            </Text>
          ))}
        </Stack>
      ),
    },
  ]

  for (const [platform, label] of Object.entries(PLATFORM_LABELS)) {
    const entry = component.platforms[platform as 'ios' | 'android']
    const substitute =
      entry.substitute === undefined ? undefined : componentBySlug(componentSlug(entry.substitute))
    items.push({
      term: label.name,
      detail: (
        <Stack gap={1}>
          <Text size="sm">
            {entry.status === 'native'
              ? `Native ${label.toolkit}`
              : entry.status === 'adapted'
                ? `${label.toolkit}, adapted for ${label.name}`
                : `Not on ${label.name}`}
          </Text>
          {entry.as === undefined ? null : (
            <Text size="sm" tone="secondary">
              {withCode(`Drawn as ${entry.as}.`)}
            </Text>
          )}
          {entry.reason === undefined ? null : (
            <Text size="sm" tone="secondary">
              {withCode(entry.reason)}
            </Text>
          )}
          {substitute === undefined ? null : (
            <Text size="sm" tone="secondary">
              {'Use '}
              <Link href={`/components/${componentSlug(substitute.name)}`}>{substitute.name}</Link>
              {' there instead.'}
            </Text>
          )}
        </Stack>
      ),
    })
  }

  return <DescriptionList orientation="horizontal" items={items} />
}
