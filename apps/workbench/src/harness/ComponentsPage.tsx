import { gallerySlug } from '@polymorph/react'
import { searchRegistry } from '@polymorph/registry/search'
import {
  Badge,
  FormField,
  Grid,
  Heading,
  Inline,
  Input,
  Select,
  Stack,
  Text,
} from '@polymorph/react-ui'
import { useMemo, useState } from 'react'

import { REGISTRY, TIERS } from '../registry'
import { findGallery } from './gallery'
import { HarnessLink } from './HarnessLink'

/**
 * The components page: search over the registry. The designer finds a member, opens it under the
 * current pairing (or their draft), and sees which class tokens it reads.
 *
 * The ranking comes from the registry (`searchRegistry`, the same rule the MCP
 * `search_components` tool uses). The page adds one filter the agent lacks, `wears`, and it also
 * uses registry data. The registry lists every `--pm-*` that a member's own stylesheet reads, so
 * finding which components change when a class token is re-pointed is an exact lookup.
 */

const TIER_OPTIONS = [
  { value: 'all', label: 'every tier' },
  ...TIERS.map((tier) => ({ value: tier, label: tier })),
]

/**
 * The nine class tokens, labelled as the studio labels them. The designer's group comes first and
 * the token name follows in brackets, so the two names stay linked.
 */
const WEARS_OPTIONS = [
  { value: 'all', label: 'any decision' },
  { value: '--pm-radius-control', label: 'Corners — buttons & inputs (radius-control)' },
  { value: '--pm-radius-detail', label: 'Corners — small details (radius-detail)' },
  { value: '--pm-radius-surface', label: 'Corners — panels & cards (radius-surface)' },
  { value: '--pm-shadow-seat', label: 'Shadow — buttons & inputs (shadow-seat)' },
  { value: '--pm-shadow-resting', label: 'Shadow — cards (shadow-resting)' },
  { value: '--pm-shadow-transient', label: 'Shadow — floating panels (shadow-transient)' },
  { value: '--pm-inset-surface', label: 'Padding — cards & dialogs (inset-surface)' },
  { value: '--pm-inset-pane', label: 'Padding — small panels (inset-pane)' },
  { value: '--pm-inset-list', label: 'Padding — menus & lists (inset-list)' },
]

export function ComponentsPage() {
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('all')
  const [wears, setWears] = useState('all')

  const hits = useMemo(
    () =>
      searchRegistry(REGISTRY, {
        query,
        tier: tier === 'all' ? undefined : tier,
        wears: wears === 'all' ? undefined : wears,
      }),
    [query, tier, wears],
  )

  return (
    <Stack as="section" gap={6} p={7}>
      <Stack gap={3}>
        <h1>Components</h1>
        <Text>
          Every member of the vocabulary, found by what it is called, what it is for, or which
          decisions it wears — and rendered under the pairing this page is wearing, so the toolbar
          (or your studio draft) re-derives every entry you open.
        </Text>
      </Stack>

      <Grid columns={3} gap={4}>
        <FormField label="Search">
          <Input
            value={query}
            onChange={setQuery}
            placeholder="button, date, empty state, danger…"
          />
        </FormField>
        <FormField label="Tier">
          <Select
            options={TIER_OPTIONS}
            value={tier}
            onChange={(value) => {
              if (value !== null) setTier(value)
            }}
          />
        </FormField>
        <FormField label="Wears">
          <Select
            options={WEARS_OPTIONS}
            value={wears}
            onChange={(value) => {
              if (value !== null) setWears(value)
            }}
          />
        </FormField>
      </Grid>

      <Text size="sm" tone="secondary">
        {hits.length === REGISTRY.components.length
          ? `All ${hits.length} members.`
          : `${hits.length} of ${REGISTRY.components.length} members.`}
      </Text>

      <Grid columns={3} gap={4}>
        {hits.map((hit) => {
          const slug = gallerySlug(hit.name)
          const states = findGallery(slug)
          return (
            <HarnessLink key={hit.name} to={`/components/${slug}`}>
              <Stack gap={2}>
                <Inline gap={2} wrap>
                  <Heading level={3}>{hit.name}</Heading>
                  <Badge tone="neutral">{hit.tier}</Badge>
                  {states ? (
                    <Text size="sm" tone="secondary">{`${states.entries.length} states`}</Text>
                  ) : null}
                </Inline>
                <Text size="sm" tone="secondary">
                  {hit.purpose}
                </Text>
                {query.trim() === '' ? null : (
                  <Text size="sm" tone="secondary">
                    {`matched ${hit.matched}`}
                  </Text>
                )}
              </Stack>
            </HarnessLink>
          )
        })}
      </Grid>
    </Stack>
  )
}
