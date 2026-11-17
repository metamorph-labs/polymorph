import { gallerySlug } from '@polymorph/react'
import type { RegistryComponent } from '@polymorph/registry'
import { Badge, Button, Code, Heading, Inline, Table, Text } from '@polymorph/react-ui'
import { useEffect, useState } from 'react'

import { componentBySlug } from '../registry'
import { findGallery } from './gallery'
import { HarnessLink } from './HarnessLink'
import { navigate } from './router'
import { StatesGrid } from './StatesGrid'
import styles from './TokensPage.module.css'
import { useThemeAttributes } from './useThemeAttributes'

/**
 * One member in full: its purpose, the class tokens it reads under the current pairing, every
 * token its own stylesheet reads, its props, and its states fixture rendered live. The docs app
 * documents the published member. This page inspects it under the current theme, so a toolbar
 * change or a draft re-derives everything below.
 */

/**
 * The nine class tokens, grouped as in the studio's Application row. The class tokens a member
 * reads are the intersection of this table with the registry's per-member token list.
 */
const CLASS_TOKENS: { token: string; family: string; group: string }[] = [
  { token: '--pm-radius-control', family: 'Corners', group: 'Buttons & inputs' },
  { token: '--pm-radius-detail', family: 'Corners', group: 'Small details' },
  { token: '--pm-radius-surface', family: 'Corners', group: 'Panels & cards' },
  { token: '--pm-shadow-seat', family: 'Shadow', group: 'Buttons & inputs' },
  { token: '--pm-shadow-resting', family: 'Shadow', group: 'Cards' },
  { token: '--pm-shadow-transient', family: 'Shadow', group: 'Floating panels' },
  { token: '--pm-inset-surface', family: 'Padding', group: 'Cards & dialogs' },
  { token: '--pm-inset-pane', family: 'Padding', group: 'Small panels' },
  { token: '--pm-inset-list', family: 'Padding', group: 'Menus & lists' },
]

function WearsSection({ component }: { component: RegistryComponent }) {
  // Subscribes to <html> so a toolbar change re-reads the resolved values.
  useThemeAttributes()
  // Measures once more after first paint. The initial render runs before the states below are in
  // the DOM, and an exception applies on the member element. It uses rAF so the pass reads a
  // painted document and the effect never sets state synchronously.
  const [, remeasure] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => remeasure((pass) => pass + 1))
    return () => cancelAnimationFrame(frame)
  }, [])
  const worn = CLASS_TOKENS.filter((entry) => component.tokens.includes(entry.token))
  if (worn.length === 0) return null

  // Reads from the member's own rendered element when one is on the page (the states below render
  // many), and falls back to the root. An exception applies on the member, so reading the root
  // would show the class value that a declared exception overrides.
  const resolved = (token: string) => {
    const element =
      document.querySelector(`[data-member="${gallerySlug(component.name)}"]`) ??
      document.documentElement
    return getComputedStyle(element).getPropertyValue(token).trim() || '—'
  }

  return (
    <section className={styles.section}>
      <Heading>Decisions it wears</Heading>
      <p className={styles.sectionNote}>
        Class tokens re-point per system (the studio&rsquo;s Application row); the values below are
        what the pairing this page is wearing resolves them to, right now. When this one member must
        differ from its group, that is a declared exception — one decision, one step, one reason, in
        the system&rsquo;s own file.
      </p>
      <Inline gap={3}>
        <Button
          variant="outline"
          tone="accent"
          size="sm"
          label="Make an exception for this member"
          onClick={() => navigate(`/studio?member=${gallerySlug(component.name)}`)}
        />
      </Inline>
      <Table label={`Class tokens ${component.name} wears`}>
        <Table.Head>
          <Table.Row>
            <Table.Header>Family</Table.Header>
            <Table.Header>Class</Table.Header>
            <Table.Header>Token</Table.Header>
            <Table.Header>Resolves to</Table.Header>
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {worn.map((entry) => (
            <Table.Row key={entry.token}>
              <Table.Cell>{entry.family}</Table.Cell>
              <Table.Cell>{entry.group}</Table.Cell>
              <Table.Cell>
                <Code>{entry.token}</Code>
              </Table.Cell>
              <Table.Cell>
                <Code>{resolved(entry.token)}</Code>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </section>
  )
}

export function ComponentDetailPage({ slug }: { slug: string }) {
  const component = componentBySlug(slug)
  const states = findGallery(slug)

  if (!component) {
    return (
      <div className={styles.page}>
        <section className={styles.summary}>
          <h1 className={styles.title}>No member called “{slug}”</h1>
          <p className={styles.scope}>
            The registry is generated from the tree — if it should exist, it will, the moment it
            ships a component and a states fixture.
          </p>
          <HarnessLink to="/components">Back to components</HarnessLink>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <section className={styles.summary}>
        <h1 className={styles.title}>{component.name}</h1>
        <p className={styles.scope}>{component.purpose}</p>
        <Inline gap={2} wrap>
          <Badge tone="neutral">{component.tier}</Badge>
          <Badge tone="neutral">{component.origin}</Badge>
          <HarnessLink to="/components">All components</HarnessLink>
          <HarnessLink to={`/gallery/${slug}`}>Bare gallery</HarnessLink>
        </Inline>
      </section>

      <WearsSection component={component} />

      <section className={styles.section}>
        <Heading>Tokens it reads</Heading>
        <p className={styles.sectionNote}>
          Every decision this member consumes, off its own stylesheet — change one of these in a
          system and this member moves.
        </p>
        <div className={styles.inlineValues}>
          {component.tokens.length === 0 ? (
            <Text size="sm" tone="secondary">
              None directly — this member composes others and inherits every decision through them.
            </Text>
          ) : (
            component.tokens.map((token) => (
              <span key={token} className={styles.tokenValue}>
                {token}
              </span>
            ))
          )}
        </div>
      </section>

      {component.props.length > 0 ? (
        <section className={styles.section}>
          <Heading>Props</Heading>
          <p className={styles.sectionNote}>
            The governed surface — there is no `className` and no `style`, here or anywhere.
          </p>
          <Table label={`Props of ${component.name}`}>
            <Table.Head>
              <Table.Row>
                <Table.Header>Name</Table.Header>
                <Table.Header>Type</Table.Header>
                <Table.Header>Doc</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {component.props.map((prop) => (
                <Table.Row key={prop.name}>
                  <Table.Cell>
                    <Code>{prop.optional ? `${prop.name}?` : prop.name}</Code>
                  </Table.Cell>
                  <Table.Cell>
                    <Code>{prop.type}</Code>
                  </Table.Cell>
                  <Table.Cell>{prop.doc ?? ''}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </section>
      ) : null}

      {states && states.requiredSelectors.length > 0 ? (
        <section className={styles.section}>
          <Heading>Required selectors</Heading>
          <p className={styles.sectionNote}>
            Unreachable from props — the required-selectors law source-asserts each against the
            component&rsquo;s CSS.
          </p>
          <div className={styles.inlineValues}>
            {states.requiredSelectors.map((selector) => (
              <span key={selector} className={styles.tokenValue}>
                {selector}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {states ? (
        <StatesGrid states={states} />
      ) : (
        <section className={styles.section}>
          <Heading>States</Heading>
          <p className={styles.sectionNote}>No states fixture registered for this member.</p>
        </section>
      )}
    </div>
  )
}
