import { GALLERIES } from '@polymorph/react-ui/galleries'
import {
  Badge,
  Breadcrumbs,
  Card,
  Code,
  CodeBlock,
  EmptyState,
  Heading,
  Inline,
  Kbd,
  PageHeader,
  Stack,
  Table,
  Text,
} from '@polymorph/react-ui'
import { useEffect, useState } from 'react'

import { FixtureFrame } from '../FixtureFrame'
import { componentBySlug } from '../registry'

/**
 * Fixture containment, on the page side.
 *
 * An entry whose overlay opens modally on mount (a `defaultOpen` Select, Menu,
 * or an open Drawer) makes Radix mark `#root` `aria-hidden` and turn off
 * `<body>` pointer-events. The whole docs page is then inert to assistive
 * technology while the gallery is on screen. The page keeps those entries,
 * because an overlay fixture must include its open state, and moves them into
 * their own documents: one `FixtureFrame` per entry, so the modality applies to
 * a frame instead of the page.
 *
 * Which pages get frames is decided by rendering, not by a list. Framing every
 * entry on every page is too heavy. Each frame is an extra document boot, and it
 * would give a screen reader a document boundary per entry on the sixty-odd
 * pages that do not need one. There is no declarative fact to key on instead
 * (Menu's and Drawer's open entries carry no `expect`, and the registry records
 * no modality). The defect itself is mechanical, though. Entries render live,
 * and if `#root` has Radix's marking once they are mounted, the page switches
 * every entry into frames. The result is cached per session, so a return visit
 * uses frames from the first paint.
 *
 * The observer stays on briefly after mount for overlays that arrive a chunk
 * late (the DatePicker pattern). The cost of that window is that a user opening
 * a modal by hand inside it also switches the page to frames. That is rare, a
 * new session detects again, and the framed page still works fully.
 */
const VERDICT_PREFIX = 'pm-docs:contained:'
const DETECT_WINDOW_MS = 1500

function readVerdict(name: string): boolean {
  try {
    return window.sessionStorage.getItem(VERDICT_PREFIX + name) === '1'
  } catch {
    // Storage denied: detection simply re-runs on the next visit.
    return false
  }
}

function writeVerdict(name: string): void {
  try {
    window.sessionStorage.setItem(VERDICT_PREFIX + name, '1')
  } catch {
    // Same degradation as above.
  }
}

/**
 * One page per component. It shows the registry's schema (anatomy, props, the
 * lawful grid, states, selectors, data attributes, dependencies) and the live
 * states fixture entries. These are the same fixtures the completeness law
 * renders, so the page shows what the tests test.
 *
 * The page renders the whole schema on purpose. A published field that the page
 * does not show would make it an incomplete view of the registry entry. The
 * fields easiest to leave out describe the API rather than the call site: the
 * tree a recipe styles, which prop pairings compile, what the fixture
 * enumerates, and the attributes the CSS keys on. A field nobody reads goes
 * stale unnoticed. So the rule is that the registry has no private fields:
 * whatever the registry publishes, this site shows.
 */
export function ComponentDetailPage({ slug }: { slug: string }) {
  const component = componentBySlug(slug)
  const name = component?.name ?? null

  // Every entry, never a subset. The paragraph below says these are the entries
  // the completeness and axe laws run. A subset would make that false for the
  // components with the most states, which are the ones readers open this page
  // for. A component with many states gets a long gallery.
  const fixture = name === null ? undefined : GALLERIES.find((states) => states.component === name)
  const entries = fixture?.entries ?? []

  // The entry names the gallery rendered. The declared-states table compares the
  // registry's published list against them. Entry names are unique within a
  // fixture, so a set loses nothing.
  const rendered = new Set(entries.map((entry) => entry.name))

  // Keyed by name rather than a boolean because the page is not remounted per
  // slug. A result for Select must not carry over to the next component visited.
  const [containedFor, setContainedFor] = useState<string | null>(null)
  const contained = name !== null && (containedFor === name || readVerdict(name))

  useEffect(() => {
    if (name === null || contained || entries.length === 0) return
    const root = document.getElementById('root')
    if (!root) return

    // Radix's modality marker, in both forms. The `aria-hidden` package writes
    // `aria-hidden="true"` and its own `data-aria-hidden` bookkeeping attribute.
    const marked = () =>
      root.getAttribute('aria-hidden') === 'true' || root.hasAttribute('data-aria-hidden')

    const flip = () => {
      writeVerdict(name)
      setContainedFor(name)
    }

    if (marked()) {
      flip()
      return
    }

    const observer = new MutationObserver(() => {
      if (marked()) {
        observer.disconnect()
        flip()
      }
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['aria-hidden', 'data-aria-hidden'],
    })
    const timer = window.setTimeout(() => observer.disconnect(), DETECT_WINDOW_MS)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [name, contained, entries.length])

  if (!component) {
    return (
      <Stack gap={7} p={7}>
        <EmptyState
          icon="search"
          title="No such component"
          description="The registry has no member by that name — the index on the Components page is the source of truth."
        />
      </Stack>
    )
  }

  return (
    <Stack gap={6} p={7}>
      <Breadcrumbs
        items={[{ label: 'Components', href: '/components' }, { label: component.name }]}
      />
      <PageHeader title={component.name} description={component.purpose} />

      <Inline gap={2} wrap>
        <Badge variant="outline" tone="accent">
          {component.tier}
        </Badge>
        <Badge>{component.origin}</Badge>
        {component.spec ? <Code>{component.spec}</Code> : null}
      </Inline>

      {/* Placed before the states because the rest of the page refers to this
          tree. A reader who sees it first knows what "trigger" and "viewport"
          mean when a selector or an attribute mentions them. A `CodeBlock`
          because the indentation shows the nesting, and it has its own scroll
          container for a tree wider than the column (`Text` would reflow it).
          Absent for the twelve members whose specs have no tree. */}
      {component.anatomy ? (
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading>Anatomy</Heading>
            <Text size="sm" tone="secondary">
              The spec&rsquo;s element tree, verbatim: the parts a recipe styles and the order they
              nest in.
            </Text>
          </Stack>
          <CodeBlock label={`${component.name} anatomy`}>{component.anatomy}</CodeBlock>
        </Stack>
      ) : null}

      {component.tokens.length > 0 ? (
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading>Tokens it reads</Heading>
            <Text size="sm" tone="secondary">
              Every token this component&rsquo;s stylesheet reads. Changing one of these in a system
              changes this component. Class tokens (<Code>--pm-radius-control</Code>,{' '}
              <Code>--pm-shadow-seat</Code>, <Code>--pm-inset-*</Code>) point to different values
              per system. The rest resolve from the axes and seeds.
            </Text>
          </Stack>
          <Inline gap={2} wrap>
            {component.tokens.map((token) => (
              <Code key={token}>{token}</Code>
            ))}
          </Inline>
        </Stack>
      ) : null}

      {entries.length > 0 ? (
        <Stack gap={4}>
          <Stack gap={1}>
            <Heading>States</Heading>
            <Text size="sm" tone="secondary">
              Live renders of all {entries.length} entries in the component&rsquo;s states fixture.
              These are the entries the completeness and axe laws run, shown in the theme and mode
              the toolbar has set.
            </Text>
          </Stack>
          {entries.map((entry, index) => (
            <Card key={entry.name}>
              <Stack gap={3}>
                <Text size="sm" tone="secondary">
                  {entry.name}
                </Text>
                {/* A contained page renders every entry in its own document,
                    not only the modal ones, so the gallery is consistent
                    within a page. See the containment note above. */}
                {contained ? (
                  <FixtureFrame component={component.name} index={index} name={entry.name} />
                ) : (
                  <div>{entry.render()}</div>
                )}
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : null}

      {/* The registry's own state list. It is separate from the gallery above
          even when the two match.

          Both come from the states fixture, so on a healthy member the names
          match entry for entry. They are still two different facts. The gallery
          is what this app imported and rendered. This list is what the
          published registry gives an installer or the MCP server. Rendering
          only the gallery would hide the published list on every page, and if
          the two ever differ, showing both is what reveals it. Every member
          declares states, so this section appears on every member's page. The
          gallery above is conditional, so a member with no live entries still
          shows this. */}
      {component.states.length > 0 ? (
        <Stack gap={4}>
          <Stack gap={1}>
            <Heading>Declared states</Heading>
            <Text size="sm" tone="secondary">
              Every state the spec enumerates, read from the states fixture at publish time and
              checked against what this page rendered above.
            </Text>
          </Stack>
          {/* A table rather than a row of chips, for two reasons. The names are
              prose ("grouped, open — group labels present, options selectable"
              is a sentence), and Badge is a small label that uppercases its
              text, so long names would render in capitals. The second column is
              the point of the section: printing the published list beside the
              rendered one makes a mismatch visible. */}
          <Table caption={`${component.name} declared states`}>
            <Table.Head>
              <Table.Row>
                <Table.Header>State</Table.Header>
                <Table.Header>Rendered above</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {component.states.map((state) => (
                <Table.Row key={state}>
                  <Table.Cell>{state}</Table.Cell>
                  <Table.Cell>
                    {rendered.has(state) ? (
                      <Badge tone="success">yes</Badge>
                    ) : (
                      <Badge tone="warning">no fixture entry</Badge>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Stack>
      ) : null}

      <Stack gap={4}>
        <Stack gap={1}>
          <Heading>Props</Heading>
          <Text size="sm" tone="secondary">
            Extracted from the exported types at publish time. The spec-staleness law keeps them in
            agreement with the design spec.
          </Text>
        </Stack>
        {/* Captioned with the component name, not the heading above it. A
            reader listing this page's tables hears "Button props", which
            identifies the table. "Props" alone would not. */}
        <Table caption={`${component.name} props`}>
          {/* `Table.Head` is the `<thead>` section and `Table.Header` is the
              `<th>` cell. */}
          <Table.Head>
            <Table.Row>
              <Table.Header>Prop</Table.Header>
              <Table.Header>Type</Table.Header>
              <Table.Header>Notes</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            {component.props.map((prop) => (
              <Table.Row key={prop.name}>
                <Table.Cell>
                  <Code>{`${prop.name}${prop.optional ? '?' : ''}`}</Code>
                </Table.Cell>
                <Table.Cell>
                  <Code>{prop.type}</Code>
                </Table.Cell>
                <Table.Cell>{prop.doc ?? ''}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Stack>

      {/* Directly under the props table, because it completes it. The props
          table lists the values of `variant` and `tone`, and this table says
          which pairings exist. A cell missing from this table is a type error
          at the call site, not a runtime warning, so this is part of the
          published API, not a style note.

          One member has a grid (Button, whose neutral fills are unlawful). The
          section is written for the field, not for that case. Nothing here
          names a variant or a tone, so a second member with a grid renders
          correctly with no edit. */}
      {component.grid ? (
        <Stack gap={4}>
          <Stack gap={1}>
            <Heading>Lawful combinations</Heading>
            <Text size="sm" tone="secondary">
              The variant × tone cells the types allow. A pairing absent from this table does not
              compile.
            </Text>
          </Stack>
          <Table caption={`${component.name} lawful variant and tone combinations`}>
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
      ) : null}

      {component.requiredSelectors.length > 0 ? (
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading>Required selectors</Heading>
            <Text size="sm" tone="secondary">
              States no prop can reach. The law checks the component&rsquo;s CSS source for each
              one.
            </Text>
          </Stack>
          <Inline gap={2} wrap>
            {component.requiredSelectors.map((selector) => (
              <Kbd key={selector}>{selector}</Kbd>
            ))}
          </Inline>
        </Stack>
      ) : null}

      {/* Placed next to the selectors because the schema describes the two
          together, and a reader needs to see both to tell them apart.
          `requiredSelectors` is the short list of states no prop can reach.
          This table covers the whole styled surface: the stylesheet plus every
          convention it composes. It is a superset, and a reader who saw only
          the first list would think the styled surface was three selectors
          wide.

          Absent values are a fact, not a gap. `[data-icon-only]` is matched on
          presence, so the cell says so instead of showing an empty list that
          would look incomplete. */}
      {component.dataAttributes.length > 0 ? (
        <Stack gap={4}>
          <Stack gap={1}>
            <Heading>Data attributes</Heading>
            <Text size="sm" tone="secondary">
              The <Code>data-*</Code> attributes the styling keys on, derived from the stylesheet
              and the conventions it composes. This is the whole styled surface, which is wider than
              what the props can reach.
            </Text>
          </Stack>
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
                        matched on presence
                      </Text>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Stack>
      ) : null}

      {component.dependencies.components.length > 0 ? (
        <Stack gap={3}>
          <Stack gap={1}>
            <Heading>Composition</Heading>
            <Text size="sm" tone="secondary">
              What an install brings with it, resolved from the import graph, not from
              documentation.
            </Text>
          </Stack>
          <Inline gap={2} wrap>
            {component.dependencies.components.map((name) => (
              <Badge key={name} tone="accent">
                {name}
              </Badge>
            ))}
          </Inline>
        </Stack>
      ) : null}
    </Stack>
  )
}
