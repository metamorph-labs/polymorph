import type { RegistryComponent } from '@polymorph/registry'
import { GALLERIES } from '@polymorph/react-ui/galleries'
import {
  Alert,
  Badge,
  Card,
  Code,
  CodeBlock,
  Collapsible,
  DescriptionList,
  DetailPage,
  Grid,
  Heading,
  Inline,
  Link,
  PageHeader,
  Stack,
  Table,
  TableOfContents,
  Text,
} from '@polymorph/react-ui'
import { Fragment, type ReactNode } from 'react'

import {
  FOUNDATION_PACKAGE,
  importLine,
  importNames,
  neighbours,
  ownProps,
  reachNote,
  repositoryFile,
  series,
} from '../components/catalogue'
import { Contract } from '../components/Contract'
import { useContainment, useFitsGrid } from '../components/fixtures'
import { BLURBS } from '../components/blurbs'
import { PropList } from '../components/PropList'
import { Reach } from '../components/Reach'
import { Section } from '../components/Section'
import { TIER_COPY } from '../components/tiers'
import { FixtureFrame } from '../FixtureFrame'
import { useMeta } from '../meta'
import { TOOLS } from '../reference/install'
import { componentBySlug, componentSlug, findComponent, type TIERS } from '../registry'
import { navigate } from '../router'

/** A slug as typed in the address. A malformed escape is shown as it is. */
function readable(slug: string): string {
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}

/** The tiers whose states are drawn one per row: overlays, charts and whole pages. */
const WIDE_TIERS: ReadonlySet<string> = new Set<(typeof TIERS)[number]>([
  'overlays',
  'charts',
  'archetypes',
])

/** The page above every component, for the title and the breadcrumbs (`meta.ts`). */
const COMPONENTS_TRAIL = [{ name: 'Components', path: '/components' }]

/** The ids of the page's sections, which its TableOfContents links to. */
const SECTION = {
  usage: 'usage',
  reach: 'renderers',
  props: 'props',
  states: 'states',
  anatomy: 'anatomy',
  tokens: 'tokens',
  selectors: 'selectors',
  behaviour: 'behaviour',
  agents: 'agents',
} as const

/**
 * One page per component, for the shell's `'full'` layout: a DetailPage whose
 * aside holds the page's TableOfContents and stays in view.
 *
 * The order is the order a reader needs it in. First what the member is and a
 * live example, then how to import it and where it runs, then its props, then
 * every other entry of its states fixture. The reference follows: anatomy, the
 * tokens it reads (collapsed), the selectors and attributes its styles key on,
 * the behaviour contract and the agent contract.
 *
 * The page still shows every field the registry publishes about the member. A
 * field nobody reads goes stale unnoticed, so the registry has no private
 * fields: the declared state list is checked against the rendered entries, and
 * a mismatch is shown rather than hidden.
 */
export function ComponentDetailPage({ slug }: { slug: string }) {
  const component = componentBySlug(slug)
  // An address with no component is marked, so a search engine does not keep
  // it and the site step reports the link that led to it.
  useMeta(
    component
      ? {
          title: component.name,
          description: BLURBS[component.name] ?? component.purpose,
          trail: COMPONENTS_TRAIL,
        }
      : { title: 'Component not found', noindex: true },
  )
  if (!component) {
    return (
      <Stack p={7}>
        <PageHeader
          title="We couldn’t find that component"
          description={`There’s no component called “${readable(slug)}”. Have a look through the full list instead.`}
          actions={
            <Link variant="button" buttonVariant="soft" href="/components">
              See all components
            </Link>
          }
        />
      </Stack>
    )
  }
  // Keyed, so each member starts with fresh containment and layout decisions.
  return <MemberPage key={component.name} component={component} />
}

function MemberPage({ component }: { component: RegistryComponent }) {
  const fixture = GALLERIES.find((states) => states.component === component.name)
  const entries = fixture?.entries ?? []
  const contained = useContainment(component.name, entries.length > 0)
  // Overlays staged in frames, charts and whole pages need the column's
  // width, so they are drawn one per row. Other entries share a grid while
  // they fit its cells.
  const wide = contained || WIDE_TIERS.has(component.tier)
  const { fits, cell } = useFitsGrid(!wide)

  /** One fixture entry, live in a box the grid measures, or in its own document. */
  const specimen = (index: number, measured: boolean): ReactNode => {
    const entry = entries[index]
    if (!entry) return null
    if (contained) {
      return <FixtureFrame component={component.name} index={index} name={entry.name} />
    }
    // Marked, so the site step can tell a fixture's sample link from a link of
    // the site's own (`scripts/site.mjs`).
    return (
      <div data-specimen="" ref={measured ? cell : undefined}>
        {entry.render()}
      </div>
    )
  }

  const first = entries[0]
  const rest = entries.slice(1)
  const rendered = new Set(entries.map((entry) => entry.name))
  const undrawn = component.states.filter((state) => !rendered.has(state))
  const props = ownProps(component)
  const { previous, next } = neighbours(component)
  const tier = TIER_COPY[component.tier as (typeof TIERS)[number]]

  const sections: { id: string; label: string; shown: boolean }[] = [
    { id: SECTION.usage, label: 'How to use it', shown: true },
    { id: SECTION.reach, label: 'Where it works', shown: true },
    {
      id: SECTION.props,
      label: 'Props',
      shown: props.length > 0 || component.parts.length > 0 || component.exports.length > 0,
    },
    { id: SECTION.states, label: 'States', shown: rest.length > 0 || undrawn.length > 0 },
    { id: SECTION.anatomy, label: 'Anatomy', shown: component.anatomy !== null },
    { id: SECTION.tokens, label: 'Theme tokens', shown: component.tokens.length > 0 },
    {
      id: SECTION.selectors,
      label: 'Styling hooks',
      shown: component.requiredSelectors.length > 0 || component.dataAttributes.length > 0,
    },
    {
      id: SECTION.behaviour,
      label: 'Keyboard and accessibility',
      shown: component.behaviour.length > 0,
    },
    { id: SECTION.agents, label: 'For AI agents', shown: component.agent !== null },
  ]
  const shown = (id: string) => sections.some((section) => section.id === id && section.shown)

  return (
    <DetailPage
      title={component.name}
      backLabel="All components"
      onBack={() => navigate('/components')}
      meta={
        <>
          {tier ? <Badge>{tier.title}</Badge> : null}
          <Text size="sm" tone="secondary">
            {reachNote(component) ?? 'Web, iOS and Android'}
          </Text>
        </>
      }
      actions={
        <>
          {component.spec === null ? null : (
            <Link
              variant="button"
              buttonVariant="outline"
              size="sm"
              external
              href={repositoryFile(component.spec)}
            >
              Read the spec
            </Link>
          )}
          <Link
            variant="button"
            buttonVariant="ghost"
            size="sm"
            external
            href={repositoryFile(component.files.source)}
          >
            View the source
          </Link>
        </>
      }
      aside={
        <TableOfContents
          label="On this page"
          items={sections
            .filter((section) => section.shown)
            .map(({ id, label }) => ({ id, label }))}
        />
      }
      stickyAside
    >
      <Stack gap={9}>
        <Stack gap={5}>
          <Text>{BLURBS[component.name] ?? component.purpose}</Text>
          {first === undefined ? null : (
            <Stack gap={2}>
              <Card>{specimen(0, false)}</Card>
              <Text size="sm" tone="secondary">
                {first.name}
              </Text>
            </Stack>
          )}
        </Stack>

        <Usage component={component} />

        <Section
          id={SECTION.reach}
          title="Where it works"
          lede={`Every place you can use ${component.name}, on the web and on phones.`}
        >
          <Reach component={component} />
        </Section>

        {shown(SECTION.props) ? <Props component={component} /> : null}

        {shown(SECTION.states) ? (
          <Section
            id={SECTION.states}
            title="States"
            lede={
              rest.length === 0
                ? undefined
                : `${component.name} comes with ${entries.length} states. You saw the first one above, and here are the rest, drawn live in the theme you’ve picked.`
            }
          >
            {undrawn.length === 0 ? null : (
              <Alert tone="warning" title="Some states aren’t drawn here">
                {`The spec lists ${series(undrawn.map((state) => `“${state}”`))}, and the page found no example for ${undrawn.length === 1 ? 'it' : 'them'}.`}
              </Alert>
            )}
            {rest.length === 0 ? null : wide || !fits ? (
              <Stack gap={6}>
                {rest.map((entry, offset) => (
                  <Specimen key={entry.name} name={entry.name}>
                    {specimen(offset + 1, false)}
                  </Specimen>
                ))}
              </Stack>
            ) : (
              <Grid columns={3} gap={4}>
                {rest.map((entry, offset) => (
                  <Specimen key={entry.name} name={entry.name}>
                    {specimen(offset + 1, true)}
                  </Specimen>
                ))}
              </Grid>
            )}
          </Section>
        ) : null}

        {component.anatomy === null ? null : (
          <Section
            id={SECTION.anatomy}
            title="Anatomy"
            lede={`How ${component.name} is put together, part by part.`}
          >
            <CodeBlock label={`${component.name} anatomy`}>{component.anatomy}</CodeBlock>
          </Section>
        )}

        {shown(SECTION.tokens) ? (
          <Section
            id={SECTION.tokens}
            title="Theme tokens"
            lede={`${component.name} takes its colours, spacing and type from ${component.tokens.length === 1 ? 'one token' : `${component.tokens.length} tokens`}. Change your theme and ${component.name} follows, with no CSS of your own.`}
          >
            <Collapsible
              label={
                component.tokens.length === 1
                  ? 'Show the token'
                  : `Show all ${component.tokens.length} tokens`
              }
            >
              <Inline gap={2} wrap>
                {component.tokens.map((token) => (
                  <Code key={token}>{token}</Code>
                ))}
              </Inline>
            </Collapsible>
          </Section>
        ) : null}

        {shown(SECTION.selectors) ? <Selectors component={component} /> : null}

        {shown(SECTION.behaviour) ? (
          <Section
            id={SECTION.behaviour}
            title="Keyboard and accessibility"
            lede={`What ${component.name} promises about roles, names, keys and focus. Every web version is tested against these lines.`}
          >
            <Contract component={component} />
          </Section>
        ) : null}

        {component.agent === null ? null : <Agents component={component} />}

        {previous === null && next === null ? null : (
          <Grid columns={2} gap={4}>
            {previous === null ? (
              <Stack />
            ) : (
              <Neighbour component={previous} direction="Previous" tier={tier?.title ?? null} />
            )}
            {next === null ? null : (
              <Neighbour component={next} direction="Next" tier={tier?.title ?? null} />
            )}
          </Grid>
        )}
      </Stack>
    </DetailPage>
  )
}

/** The words before the item at `index` of a spoken list: none, a comma, or "and". */
function separator(index: number, length: number): string {
  if (index === 0) return ''
  return index === length - 1 ? ' and ' : ', '
}

/** One entry of the states gallery: the live render with its name under it. */
function Specimen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Card>{children}</Card>
      <Text size="sm" tone="secondary">
        {name}
      </Text>
    </Stack>
  )
}

function Usage({ component }: { component: RegistryComponent }) {
  const names = importNames(component)
  const slug = componentSlug(component.name)
  const built = component.dependencies.components
    .map((dependency) => findComponent(dependency))
    .filter((dependency) => dependency !== undefined)

  return (
    <Section id={SECTION.usage} title="How to use it" lede="Import it from the React package:">
      {names.length === 0 ? null : (
        <CodeBlock copyable copyLabel="Copy the import" label="Import">
          {importLine(names)}
        </CodeBlock>
      )}
      {component.origin === 'vendored' ? (
        <Text>
          {'Want to own the code instead? In your app’s folder, run '}
          <Code>{`${TOOLS} add ${slug}`}</Code>
          {` and it copies ${component.name} into your project, ${component.dependencies.files.length} files in all, ready for you to change.`}
        </Text>
      ) : (
        <Text>
          {`${component.name} comes with `}
          <Code>{FOUNDATION_PACKAGE}</Code>
          {', the React foundation, so there’s nothing to copy.'}
        </Text>
      )}
      {built.length === 0 ? null : (
        <Text>
          {'It’s built with '}
          {built.map((dependency, index) => (
            <Fragment key={dependency.name}>
              {separator(index, built.length)}
              <Link href={`/components/${componentSlug(dependency.name)}`}>{dependency.name}</Link>
            </Fragment>
          ))}
          {built.length === 1 ? ', which comes along with it.' : ', which come along with it.'}
        </Text>
      )}
      <Text tone="secondary">
        {'New to Polymorph? '}
        <Link href="/install">Get started</Link>
        {' walks you through the setup.'}
      </Text>
    </Section>
  )
}

function Props({ component }: { component: RegistryComponent }) {
  const props = ownProps(component)
  return (
    <Section
      id={SECTION.props}
      title="Props"
      lede={`Everything you can pass to ${component.name}. This list is read from its TypeScript types, so it always matches the code.`}
    >
      {props.length === 0 ? null : <PropList props={props} />}

      {component.parts.map((part) => (
        <Stack key={part.name} gap={4}>
          <Heading level={3}>{`${component.name}.${part.name}`}</Heading>
          {part.props.length === 0 ? (
            <Text tone="secondary">It takes no props.</Text>
          ) : (
            <PropList props={part.props} />
          )}
        </Stack>
      ))}

      {component.exports.map((entry) => (
        <Stack key={entry.name} gap={4}>
          <Heading level={3}>{entry.kind === 'function' ? `${entry.name}()` : entry.name}</Heading>
          {entry.members.length === 0 ? null : (
            <Text tone="secondary">
              {'Also there as '}
              {entry.members.map((member, index) => (
                <Fragment key={member}>
                  {separator(index, entry.members.length)}
                  <Code>{`${entry.name}.${member}()`}</Code>
                </Fragment>
              ))}
              .
            </Text>
          )}
          {entry.props.length === 0 ? (
            <Text tone="secondary">
              {entry.kind === 'function' ? 'It takes no options.' : 'It takes no props.'}
            </Text>
          ) : (
            <PropList props={entry.props} />
          )}
        </Stack>
      ))}

      {component.grid === null ? null : (
        <Stack gap={4}>
          <Stack gap={2}>
            <Heading level={3}>Variant and tone pairs</Heading>
            <Text tone="secondary">
              Only these pairs compile. Any other pair is a type error, so you find out in your
              editor.
            </Text>
          </Stack>
          <Table caption={`${component.name} variant and tone pairs`}>
            <Table.Head>
              <Table.Row>
                <Table.Header>Variant</Table.Header>
                <Table.Header>Tones</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {Object.entries(component.grid).map(([variant, tones]) => (
                <Table.Row key={variant}>
                  <Table.Cell>
                    <Code>{variant}</Code>
                  </Table.Cell>
                  <Table.Cell>
                    <Inline gap={2} wrap>
                      {tones.map((tone) => (
                        <Code key={tone}>{tone}</Code>
                      ))}
                    </Inline>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Stack>
      )}
    </Section>
  )
}

function Selectors({ component }: { component: RegistryComponent }) {
  return (
    <Section
      id={SECTION.selectors}
      title="Styling hooks"
      lede="The states and attributes its styles respond to. Handy when you’re reading its CSS or writing a test."
    >
      {component.requiredSelectors.length === 0 ? null : (
        <Stack gap={3}>
          <Heading level={3}>States its styles cover</Heading>
          <Inline gap={2} wrap>
            {component.requiredSelectors.map((selector) => (
              <Code key={selector}>{selector}</Code>
            ))}
          </Inline>
        </Stack>
      )}
      {component.dataAttributes.length === 0 ? null : (
        <Stack gap={3}>
          <Heading level={3}>Data attributes</Heading>
          <Table caption={`${component.name} data attributes`}>
            <Table.Head>
              <Table.Row>
                <Table.Header>Attribute</Table.Header>
                <Table.Header>Values</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {component.dataAttributes.map((attribute) => (
                <Table.Row key={attribute.name}>
                  <Table.Cell>
                    <Code>{attribute.name}</Code>
                  </Table.Cell>
                  <Table.Cell>
                    {attribute.values && attribute.values.length > 0 ? (
                      <Inline gap={2} wrap>
                        {attribute.values.map((value) => (
                          <Code key={value}>{value}</Code>
                        ))}
                      </Inline>
                    ) : (
                      <Text size="sm" tone="secondary">
                        On or off
                      </Text>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Stack>
      )}
    </Section>
  )
}

function Agents({ component }: { component: RegistryComponent }) {
  const agent = component.agent
  if (agent === null) return null

  const lines = [
    ...agent.states,
    ...agent.actions,
    ...agent.destructive,
    ...agent.destructiveOptions,
  ].map((statement) => statement.text)
  if (agent.destructiveNever) lines.push('destructive never')
  if (agent.withholdsContents) lines.push('withholds contents')

  const asks: ReactNode[] = [
    ...agent.destructive.map((entry) => (
      <Text key={entry.text} size="sm">
        {'When '}
        <Code>{`${entry.prop}="${entry.value}"`}</Code>
      </Text>
    )),
    ...agent.destructiveOptions.map((entry) => (
      <Text key={entry.text} size="sm">
        {'For a choice whose '}
        <Code>{entry.field}</Code>
        {' is '}
        <Code>{entry.value}</Code>
      </Text>
    )),
  ]
  if (agent.destructiveNever) {
    asks.push(
      <Text key="never" size="sm">
        Never. Its danger colour is about what it says, not what it does.
      </Text>,
    )
  }

  const items: { term: string; detail: ReactNode }[] = [
    {
      term: 'It can',
      detail:
        agent.actions.length === 0 ? (
          <Text size="sm">Only look. It has nothing to press or fill.</Text>
        ) : (
          <Inline gap={2} wrap>
            {agent.actions.map((action) => (
              <Code key={action.text}>{action.name}</Code>
            ))}
          </Inline>
        ),
    },
  ]
  if (agent.states.length > 0) {
    items.push({
      term: 'It reads',
      detail: (
        <Inline gap={2} wrap>
          {agent.states.map((state) => (
            <Code key={state.text}>
              {state.secret ? `${state.name} (kept private)` : state.name}
            </Code>
          ))}
        </Inline>
      ),
    })
  }
  if (asks.length > 0) {
    items.push({ term: 'Asks you first', detail: <Stack gap={1}>{asks}</Stack> })
  }
  if (agent.withholdsContents) {
    items.push({
      term: 'Inside it',
      detail: <Text size="sm">Components inside it are kept out of an agent’s reach.</Text>,
    })
  }

  return (
    <Section
      id={SECTION.agents}
      title="For AI agents"
      lede={`What an AI agent on your page can see in ${component.name} and do with it.`}
    >
      <DescriptionList orientation="horizontal" items={items} />
      <Collapsible label="Show the full agent contract">
        <CodeBlock label={`${component.name} agent contract`}>{lines.join('\n')}</CodeBlock>
      </Collapsible>
      <Text tone="secondary">
        {
          'Agents reach it through the agent bridge, not by clicking around or reading screenshots. '
        }
        <Link href="/guides/agents">Read how the bridge works</Link>
      </Text>
    </Section>
  )
}

function Neighbour({
  component,
  direction,
  tier,
}: {
  component: RegistryComponent
  direction: 'Previous' | 'Next'
  tier: string | null
}) {
  return (
    <Card
      href={`/components/${componentSlug(component.name)}`}
      label={`${direction}: ${component.name}`}
    >
      <Stack gap={1}>
        <Text size="sm" tone="secondary">
          {tier === null ? direction : `${direction} in ${tier}`}
        </Text>
        <Text>{component.name}</Text>
      </Stack>
    </Card>
  )
}
