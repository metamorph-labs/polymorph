import {
  Button,
  Card,
  EmptyState,
  FilterBar,
  Grid,
  Heading,
  Inline,
  Link,
  PageHeader,
  SearchInput,
  Stack,
  Text,
} from '@polymorph/react-ui'
import { useDeferredValue, useMemo, useState } from 'react'

import { BLURBS } from '../components/blurbs'
import { listTiers, reachNote, type ListedMember } from '../components/catalogue'
import { TIER_COPY } from '../components/tiers'
import { useMeta } from '../meta'
import { componentSlug, REGISTRY } from '../registry'

/**
 * The Components index: every member, grouped by tier, with a filter.
 *
 * It is composed for the shell's `'page'` layout, so it adds no outer padding.
 * No page archetype fits it. ListPage panels one table, and cards do not nest
 * in its panel. SearchPage's measure is for a column of results, not a grid of
 * cards.
 *
 * The filter ranks with the registry's own search (`listTiers`), the rule the
 * workbench and the MCP server use, so a query finds the same members
 * everywhere. It matches a member's name, its summary, its props and its
 * variants.
 *
 * The cards draw no live specimen. A specimen per member needs the galleries
 * chunk on this page, which is larger than everything else the page loads. The
 * overlays' first entries open modally and make the whole page inert. The page archetypes'
 * first entries are 330 to 1500 pixels tall. About a dozen of the rest are too
 * tall for a card, draw nothing at rest (a Separator, a Progress at zero) or
 * break words at a card's width. A linked card also cannot hold controls, so a
 * specimen would cost the card its single large target. The detail page draws
 * every entry live, one click away.
 */
export function ComponentsPage() {
  const [query, setQuery] = useState('')
  // The list re-renders every member's card per keystroke. Deferring it keeps the
  // field responsive while the list catches up.
  const deferred = useDeferredValue(query)
  const tiers = useMemo(() => listTiers(deferred), [deferred])
  const total = REGISTRY.components.length
  const shown = tiers.reduce((count, group) => count + group.members.length, 0)
  useMeta({
    title: 'Components',
    description: `Browse all ${total} Polymorph components, from buttons and form fields to charts, chat and whole page layouts. Each one is shown live.`,
  })

  return (
    <Stack gap={8}>
      <Stack gap={6}>
        <PageHeader
          title="Components"
          description={`Every component in Polymorph, ${total} in all, grouped by what it’s for. Open one to try it live in every state and see exactly how to use it.`}
        />
        <FilterBar
          search={
            <SearchInput
              aria-label="Filter components"
              placeholder="Filter components"
              value={query}
              onChange={setQuery}
            />
          }
          isFiltered={query !== ''}
          onClear={() => setQuery('')}
          resultCount={{ shown, total }}
          messages={{
            clear: 'Clear',
            resultCount: (count) =>
              count.total === undefined || count.shown === count.total
                ? `${count.shown} components`
                : `${count.shown} of ${count.total} components`,
          }}
        />
        {/* One link per group still on the page, in a row that wraps. A row,
            not a list beside the header: the groups are few and short, and a
            row leaves the cards the page's whole width. */}
        {tiers.length === 0 ? null : (
          <Inline gap={5} wrap>
            {tiers.map((group) => (
              <Link key={group.tier} variant="standalone" href={`#${group.tier}`}>
                {TIER_COPY[group.tier].title}
              </Link>
            ))}
          </Inline>
        )}
      </Stack>

      {tiers.length === 0 ? (
        <EmptyState
          icon="search"
          title={`Nothing matches “${deferred.trim()}”`}
          description="Try a shorter word, or a prop name like placeholder. You can also clear the filter and browse everything."
          action={<Button variant="soft" label="Clear the filter" onClick={() => setQuery('')} />}
        />
      ) : (
        <Stack gap={9}>
          {tiers.map((group) => (
            <Stack key={group.tier} gap={5}>
              <Stack gap={1}>
                <Heading id={group.tier}>{TIER_COPY[group.tier].title}</Heading>
                <Text tone="secondary">{TIER_COPY[group.tier].lede}</Text>
              </Stack>
              <Grid columns={4} gap={4}>
                {group.members.map((member) => (
                  <MemberCard
                    key={member.component.name}
                    member={member}
                    query={deferred.trim().toLowerCase()}
                  />
                ))}
              </Grid>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

/**
 * Why a query found a member, when its name and summary do not show it. The
 * registry's search matches a prop by its name or its doc, and a variant cell
 * by its variant or one of its tones, so the line says which.
 */
function matchLine(matched: NonNullable<ListedMember['matched']>, query: string): string {
  if (matched.kind === 'prop') {
    return matched.name.toLowerCase().includes(query)
      ? `Has a prop called ${matched.name}`
      : `Its ${matched.name} prop mentions “${query}”`
  }
  return matched.name.toLowerCase() === query
    ? `Comes in a ${matched.name} variant`
    : `Comes in a ${query} tone`
}

function MemberCard({ member, query }: { member: ListedMember; query: string }) {
  const { component, matched } = member
  const note = reachNote(component)
  return (
    // The name is a Heading, not the card's `title`: the title is drawn as an
    // uppercase overline, and a member's name is an identifier a reader types.
    <Card href={`/components/${componentSlug(component.name)}`} label={component.name}>
      <Stack gap={2}>
        <Heading level={3}>{component.name}</Heading>
        <Text size="sm" tone="secondary">
          {BLURBS[component.name] ?? component.purpose}
        </Text>
        {matched === null ? null : (
          <Text size="sm" tone="secondary">
            {matchLine(matched, query)}
          </Text>
        )}
        {note === null ? null : (
          <Text size="sm" tone="secondary">
            {note}
          </Text>
        )}
      </Stack>
    </Card>
  )
}
