import {
  Card,
  CodeBlock,
  Grid,
  Heading,
  Hero,
  Inline,
  Link,
  List,
  Stack,
  Stat,
  Text,
} from '@polymorph/react-ui'

import { EmittedCode } from '../home/EmittedCode'
import { LookPicker } from '../home/LookPicker'
import { useMeta } from '../meta'
import { COUNTS, DESIGNED_SYSTEMS } from 'virtual:polymorph-docs/counts'

/**
 * The landing page. Its words are hand-written, and every number it shows comes
 * from the registry, so the numbers always match the tree that published them.
 */

/**
 * What the validator prints for a screen spec that names a prop the member
 * does not have. It is the validator's own wording, for a `ListPage` given
 * `onRetry`.
 */
const FAULT = `$.root.props.onRetry
  \`ListPage\` has no prop \`onRetry\``

function Section({
  title,
  lede,
  children,
}: {
  title: string
  lede: string
  children: React.ReactNode
}) {
  return (
    <Stack as="section" gap={5}>
      <Stack gap={2}>
        <Heading level={2}>{title}</Heading>
        <Text tone="secondary">{lede}</Text>
      </Stack>
      {children}
    </Stack>
  )
}

export function HomePage() {
  useMeta({})
  return (
    <Stack gap={9}>
      {/* A Hero rather than a PageHeader, because this page introduces the
          system and is not a working screen. */}
      <Hero
        align="center"
        title="One design system. Any look you want."
        lede={`Polymorph gives you ${COUNTS.components} components that behave the same in React, Vue, Svelte, Solid, Angular, plain HTML, SwiftUI and Jetpack Compose. Restyle all of them at once by changing a couple of small files.`}
        actions={
          <>
            <Link variant="button" buttonVariant="solid" size="lg" href="/install">
              Get started
            </Link>
            <Link
              variant="button"
              buttonVariant="outline"
              tone="neutral"
              size="lg"
              href="/components"
            >
              Browse components
            </Link>
          </>
        }
      />

      <Section
        title="Try on a different look"
        lede="This is one small app screen, and nobody restyled it by hand. Pick a look and watch everything follow: the type, the corners, the spacing, the colours, even how things move."
      >
        <LookPicker />
      </Section>

      <Section
        title="Why teams pick it"
        lede="Most design systems hand you components and hope for the best. This one is built so the right thing is the easy thing."
      >
        <Grid columns={3} gap={4}>
          <Card title="A redesign is a small edit" href="/guides/theming" label="How theming works">
            <Text>
              Your theme lives in two small files: one for how things are built, one for colour.
              Change them and the whole product follows. No hunting through screens.
            </Text>
          </Card>
          <Card
            title="It stays consistent on its own"
            href="/guides/rules"
            label="How the rules work"
          >
            <Text>
              Your app code picks components and fills in content. A one-off colour or a stray
              margin can’t sneak in, because a lint rule catches it before a reviewer has to.
            </Text>
          </Card>
          <Card
            title="It’s tested, not promised"
            href="/guides/verification"
            label="How it is tested"
          >
            <Text>
              Readable contrast, keyboard support, every state of every component: there’s a test
              for each, in every framework. If something slips, a test goes red.
            </Text>
          </Card>
        </Grid>
      </Section>

      <Section
        title="Write a screen once, use it in your framework"
        lede="Describe a screen in a short file and Polymorph writes the code for the framework you use. Here’s the same inbox in five of them. On iOS and Android, the same components are drawn with SwiftUI and Jetpack Compose."
      >
        <EmittedCode />
      </Section>

      <Section
        title="Good company for an AI agent"
        lede="Ask an agent to build a screen and it usually invents its own buttons and colours. Give it Polymorph and it picks from components that already exist, checks its work as it goes, and stays on brand."
      >
        <Grid columns={2} gap={4}>
          <Card title="What your agent gets">
            <List label="What an agent gets">
              <List.Item
                title="The whole system in one file"
                description="Every component, its options and the rules, short enough to read in one go."
                href="/system-card.md"
              />
              <List.Item
                title="Tools it can call"
                description="An MCP server for looking up components and checking a screen before it ships."
                href="/guides/tooling"
              />
              <List.Item
                title="A page it can find by itself"
                description="llms.txt points an agent at everything above."
                href="/llms.txt"
              />
            </List>
          </Card>
          <Card title="Mistakes come back fixable">
            <Stack gap={4}>
              <Text>
                When an agent reaches for something that isn’t there, it gets told exactly where and
                what, so the next try is right.
              </Text>
              <CodeBlock label="What the checker says">{FAULT}</CodeBlock>
            </Stack>
          </Card>
        </Grid>
      </Section>

      <Section
        title="What’s in the box"
        lede="Everything here is counted from the code, so it’s never out of date."
      >
        <Grid columns={4} gap={4}>
          <Card>
            <Stat label="Components" value={String(COUNTS.components)} />
          </Card>
          <Card>
            <Stat label="Frameworks and platforms" value={String(COUNTS.renderers)} />
          </Card>
          <Card>
            {/* Counted apart from palettes because they are different things: a
                system is how things are built and a palette is colour. Any
                palette works on any system. */}
            <Stat label="Ready-made looks" value={String(DESIGNED_SYSTEMS.length)} />
          </Card>
          <Card>
            <Stat label="Colour palettes" value={String(COUNTS.palettes)} />
          </Card>
        </Grid>
      </Section>

      <Stack gap={4} align="center">
        <Heading level={2}>Ready when you are</Heading>
        <Text tone="secondary">It’s free and open source. Start a new app in a minute.</Text>
        <Inline gap={3} wrap justify="center">
          <Link variant="button" buttonVariant="solid" size="lg" href="/install">
            Get started
          </Link>
          <Link variant="button" buttonVariant="ghost" tone="neutral" size="lg" href="/guides">
            Read the guides
          </Link>
        </Inline>
      </Stack>
    </Stack>
  )
}
