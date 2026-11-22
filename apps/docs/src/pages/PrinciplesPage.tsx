import type { RegistryLaw } from '@polymorph/registry'
import {
  Code,
  DescriptionList,
  Grid,
  Heading,
  Inline,
  List,
  PageHeader,
  Separator,
  Stack,
  Text,
} from '@polymorph/react-ui'
import type { ReactNode } from 'react'

import { Section } from '../reference/Section'
import { REGISTRY } from '../registry'
import { useMeta } from '../meta'

/**
 * The governance page: the exception ladder and the lint rules, read from the registry. Each
 * rung's name, summary and declaration come from the ladder in `docs/rules.md` as the registry
 * parsed it, the components that declare it from the registry's primitives and props, and the
 * rules it answers from each rule's `climb`. The page adds one line per rung on when to take it,
 * from the same section of `docs/rules.md`.
 */

const ladder = REGISTRY.exceptions.ladder
const laws = REGISTRY.laws

/** When a reader takes each rung, in their words, from `docs/rules.md`. Keyed by rung number. */
const WHEN: Readonly<Record<number, string>> = {
  1: 'Start here. Most needs are already a variant, size or tone away.',
  2: 'When a whole area should be more compact, or flip to the opposite mode. Every value still comes from the theme.',
  3: 'When one component needs a different spacing or corner step. You pick steps from the scale, never raw values.',
  4: "For a true one-off, like a campaign illustration, or to host another library's map, editor or grid. You give a reason, and accessibility still applies inside.",
  5: 'When the same patch or zone keeps coming back. Add what is missing to the components, or delete the exceptions.',
}

/** The components that take a `patch`, the instance patch's declaration. */
const PATCHABLE = REGISTRY.components
  .filter((component) => component.props.some((prop) => prop.name === 'patch'))
  .map((component) => component.name)

const list = (names: readonly string[]) =>
  names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** How a rung is written in code, from its declaration and the registry's primitives. */
function declaration(rung: (typeof ladder)[number]): ReactNode {
  if (rung.declaredAs === null) {
    return rung.rung === 1
      ? "Nothing extra. It's a prop the component already has."
      : 'A change to the components themselves.'
  }
  return (
    <Stack gap={2}>
      {rung.declaredAs.split('|').map((part) => {
        const name = part.trim()
        const primitive = REGISTRY.exceptions.primitives.find((entry) => entry.name === name)
        if (primitive === undefined) {
          return (
            <Text key={name} size="sm">
              <Code>{`${name}={{ … }}`}</Code>
              {PATCHABLE.length > 0 ? ` on ${list(PATCHABLE)}` : ''}
            </Text>
          )
        }
        const required = primitive.props
          .filter((prop) => !prop.optional && prop.name !== 'children')
          .map((prop) => `${prop.name}="…"`)
        return (
          <Text key={name} size="sm">
            <Code>{`<${[name, ...required].join(' ')}>`}</Code>
          </Text>
        )
      })}
    </Stack>
  )
}

const shortName = (law: RegistryLaw) => law.name.replace(/^polymorph\//, '')

/** The rules on application code whose reports name a rung. */
function answers(rung: number): ReactNode {
  const names = [
    ...new Set(
      laws
        .filter((law) => law.applies === 'application' && law.climb.includes(rung))
        .map(shortName),
    ),
  ]
  if (names.length === 0) return 'None directly.'
  return (
    <Inline gap={2} wrap>
      {names.map((name) => (
        <Code key={name}>{name}</Code>
      ))}
    </Inline>
  )
}

function Rung({ rung }: { rung: (typeof ladder)[number] }) {
  return (
    <Grid columns={2} gap={6}>
      <Stack gap={2}>
        <Text size="sm" tone="secondary">{`Step ${rung.rung} of ${ladder.length}`}</Text>
        <Heading level={3}>{rung.name}</Heading>
        <Text>{`${rung.summary}.`}</Text>
        {WHEN[rung.rung] === undefined ? null : (
          <Text size="sm" tone="secondary">
            {WHEN[rung.rung]}
          </Text>
        )}
      </Stack>
      <DescriptionList
        items={[
          { term: 'How you write it', detail: declaration(rung) },
          { term: 'Lint rules it answers', detail: answers(rung.rung) },
        ]}
      />
    </Grid>
  )
}

/** The rungs that answer a rule, in words. */
function climbOf(law: RegistryLaw): string {
  if (law.applies === 'vocabulary') return 'Fix the code'
  if (law.climb.length === 0) return 'Fix the code'
  return `${law.climb.length === 1 ? 'Step' : 'Steps'} ${list(law.climb.map(String))}`
}

/** A rule's summary as plain text: the registry writes code spans in Markdown. */
const plain = (summary: string) => summary.replace(/`/g, '')

/**
 * One group of rules as a list: the rule, what it checks, and the steps that answer it. A list
 * and not a table, so a phone reads each rule whole instead of scrolling a row sideways.
 */
function RuleList({ label, rules }: { label: string; rules: readonly RegistryLaw[] }) {
  return (
    <List label={label}>
      {rules.map((law) => (
        <List.Item
          key={`${law.name}-${law.language}`}
          title={shortName(law)}
          description={plain(law.summary)}
          meta={law.applies === 'application' ? climbOf(law) : undefined}
        />
      ))}
    </List>
  )
}

const RULE_GROUPS: readonly {
  id: string
  title: string
  lede: string
  rules: readonly RegistryLaw[]
}[] = [
  {
    id: 'rules-code',
    title: 'In your screens',
    lede: 'ESLint rules for your components and templates. Beside each one are the ladder steps you can take if you need an exception.',
    rules: laws.filter((law) => law.applies === 'application' && law.language === 'code'),
  },
  {
    id: 'rules-css',
    title: 'In your stylesheets',
    lede: 'Stylelint rules for any CSS your app still has.',
    rules: laws.filter((law) => law.applies === 'application' && law.language === 'css'),
  },
  {
    id: 'rules-vocabulary',
    title: 'Inside the components',
    lede: "These hold Polymorph's own components and their styles. You meet them only if you change a component you copied in.",
    rules: laws.filter((law) => law.applies === 'vocabulary'),
  },
]

export function PrinciplesPage() {
  useMeta({
    title: 'Principles',
    description:
      'How Polymorph keeps styling decisions in the theme, the lint rules that hold the line, and the five steps to take when a screen needs an exception.',
  })
  return (
    <Stack gap={8}>
      <PageHeader
        title="Principles"
        description="Your screens are built from components, and the theme makes every styling decision. When a screen really does need something different, you can still have it. You just say so, in a way your team can see."
      />

      <Section
        id="ladder"
        title="The exception ladder"
        lede="When the components don't quite cover what you need, climb this ladder. It goes from the gentlest change to the biggest. Take the first step that works, and the rest of your product stays consistent."
      >
        <Stack as="ol" gap={7}>
          {ladder.map((rung, index) => (
            <li key={rung.rung}>
              <Stack gap={7}>
                {index === 0 ? null : <Separator />}
                <Rung rung={rung} />
              </Stack>
            </li>
          ))}
        </Stack>
      </Section>

      <Separator />

      <Section
        id="rules"
        title="The lint rules"
        lede={`${laws.length} lint rules keep styling decisions out of your screens. Each one tells you what to write instead, and which step of the ladder to take if you really need an exception. People and coding agents get the same answer.`}
      >
        <Stack gap={8}>
          {RULE_GROUPS.filter((group) => group.rules.length > 0).map((group) => (
            <Stack key={group.id} gap={4}>
              <Stack gap={1}>
                <Heading level={3} id={group.id}>
                  {group.title}
                </Heading>
                <Text size="sm" tone="secondary">
                  {group.lede}
                </Text>
              </Stack>
              <RuleList label={group.title} rules={group.rules} />
            </Stack>
          ))}
          <Text tone="secondary">
            Beyond lint, tests check every theme for contrast, every component&rsquo;s states in
            every web framework, and that every spec matches its code.
          </Text>
        </Stack>
      </Section>
    </Stack>
  )
}
