import {
  Code,
  CodeBlock,
  Grid,
  Heading,
  Link,
  List,
  PageHeader,
  Separator,
  Stack,
  Tabs,
  Text,
} from '@polymorph/react-ui'

import { AGENT_FILES, MCP_READ_TOOLS, MCP_WRITE_TOOLS, REGISTRY_ACCESS } from '../reference/facts'
import {
  GUIDE,
  INIT_WRITES,
  MCP_CONFIG,
  OWN_THE_CODE,
  QUICK_START,
  RELEASE,
  TARGETS,
  THEME_STEPS,
  type Snippet,
} from '../reference/install'
import { Section, Step } from '../reference/Section'
import { useMeta } from '../meta'

/**
 * The get-started page, for a reader outside this repository: the quickest way to a running app,
 * then each framework and platform, then a theme of their own, then the tools for a coding agent.
 *
 * Every command, package name and file comes from `src/reference/install.ts` and
 * `src/reference/facts.ts`, which read the registry and are held to their sources by tests.
 */

type ReadTool = (typeof MCP_READ_TOOLS)[number]
type WriteTool = (typeof MCP_WRITE_TOOLS)[number]

/**
 * What each MCP tool does, in a reader's words, from `docs/tooling.md`. Keyed by the server's own
 * tool names, so a tool the server adds is a type error here until it has a line.
 */
const TOOL_HELP: Record<ReadTool | WriteTool, string> = {
  search_components: 'Finds components by name, purpose or prop.',
  get_component: 'Everything about one component: its props, variants and states.',
  get_install_plan: 'Shows what polymorph add would copy, before it copies anything.',
  get_system_card: 'Every component and rule in one read. Agents start here.',
  get_theme_axes: 'The axes, systems, palettes and token names a theme is made of.',
  validate: 'Checks code or a screen spec against the lint rules and says how to fix each problem.',
  fix: 'Rewrites the problems that have exactly one right answer.',
  propose_theme: 'Turns a few words about a feel into a theme, and checks it.',
  render_screen:
    'Draws a screen at phone and desktop width and sends back the pictures, with any layout problems it found.',
  emit_screen: 'Writes a screen from its spec, for your framework, SwiftUI or Compose.',
  install: 'Copies components into your project, the way polymorph add does.',
  save_theme: 'Saves a theme that passed its checks as two JSON files.',
  fix_file: 'Applies the one-answer fixes to a file where it stands.',
}

/** A numbered step: what to do on one side, what to copy on the other. */
function CopyStep({
  step,
  index,
  titled = true,
}: {
  step: Snippet
  index?: number
  /** False when a heading above already names the step, so only its help is drawn. */
  titled?: boolean
}) {
  return (
    <Grid columns={2} gap={5}>
      {titled ? (
        <Step
          title={index === undefined ? step.title : `${index + 1}. ${step.title}`}
          help={step.help}
        />
      ) : (
        <Text size="sm" tone="secondary">
          {step.help}
        </Text>
      )}
      <CodeBlock copyable label={step.title}>
        {step.code}
      </CodeBlock>
    </Grid>
  )
}

/** The tools as a list, so a phone reads each one whole. */
function ToolList({ label, tools }: { label: string; tools: readonly (ReadTool | WriteTool)[] }) {
  return (
    <List label={label}>
      {tools.map((tool) => (
        <List.Item key={tool} title={tool} description={TOOL_HELP[tool]} />
      ))}
    </List>
  )
}

export function InstallPage() {
  useMeta({
    title: 'Get started',
    description:
      'Start a new app with one command, or add Polymorph to the app you already have, in React, Vue, Svelte, Solid, Angular, plain HTML, iOS or Android.',
  })
  return (
    <Stack gap={8}>
      <PageHeader
        title="Get started"
        description={`Start a new app with one command, or add Polymorph to an app you already have. These steps install release ${RELEASE}.`}
        actions={
          <Link variant="button" buttonVariant="outline" tone="neutral" href={GUIDE}>
            Full setup guide
          </Link>
        }
      />

      <Section
        id="quick-start"
        title="The quickest way in"
        lede="One command sets up a new React app with the components, a theme, the lint rules and a first screen. It runs from a copy of the repository, so you clone that first."
      >
        <Grid columns={2} gap={6}>
          <Stack gap={3}>
            <CodeBlock copyable label="Quick start">
              {QUICK_START}
            </CodeBlock>
            <Text size="sm" tone="secondary">
              {`You'll need Node 24 or later, pnpm 11 and the GitHub CLI. The packages are on ${REGISTRY_ACCESS.host}, which asks for a token even to read them.`}
            </Text>
          </Stack>
          <Stack gap={3}>
            <Heading level={3}>What you get</Heading>
            <List label="What polymorph init writes">
              {INIT_WRITES.map((item) => (
                <List.Item
                  key={item.file}
                  title={item.title}
                  description={item.description}
                  meta={item.file}
                />
              ))}
            </List>
          </Stack>
        </Grid>
      </Section>

      <Separator />

      <Section
        id="frameworks"
        title="Pick your framework"
        lede="The same components and the same themes work in every one. Start fresh, or follow the steps to add Polymorph to what you have."
      >
        <Tabs tabs={TARGETS.map((target) => ({ value: target.value, label: target.label }))}>
          {TARGETS.map((target) => (
            <Tabs.Content key={target.value} value={target.value}>
              <Stack gap={7}>
                <Text>{target.intro}</Text>
                {target.create === undefined ? null : (
                  <Stack gap={5}>
                    <Heading level={3}>{target.create.title}</Heading>
                    <CopyStep step={target.create} titled={false} />
                  </Stack>
                )}
                <Stack gap={7}>
                  <Heading level={3}>
                    {target.addTitle ?? 'Add it to an app you already have'}
                  </Heading>
                  {target.add.map((step, index) => (
                    <CopyStep key={step.title} step={step} index={index} />
                  ))}
                </Stack>
                <Link variant="standalone" href={`${GUIDE}${target.anchor}`}>
                  {`Read the full ${target.label} guide`}
                </Link>
              </Stack>
            </Tabs.Content>
          ))}
        </Tabs>
      </Section>

      <Separator />

      <Section
        id="own-the-code"
        title="Own the code instead"
        lede="Prefer to keep the component source in your own repository? polymorph add copies the components you name, with their styles, and sets up the lint rules for them. You can change them however you like."
      >
        <CopyStep step={OWN_THE_CODE} />
      </Section>

      <Separator />

      <Section
        id="your-theme"
        title="Make it look like yours"
        lede="A theme is two small JSON files. The system sets the shape of things: corners, depth, spacing, type and motion. The palette sets the colours. Any palette works with any system."
      >
        <Stack gap={6}>
          <CopyStep index={0} step={THEME_STEPS[0]!} />
          <CopyStep index={1} step={THEME_STEPS[1]!} />
          <Text tone="secondary">
            Not sure where to start? Copy a system from the{' '}
            <Link href="/systems">systems page</Link> and change what you like. Or describe the feel
            you want, and your agent can draft a theme with <Code>propose_theme</Code>.
          </Text>
        </Stack>
      </Section>

      <Separator />

      <Section
        id="agents"
        title="Build with your coding agent"
        lede="Polymorph comes with an MCP server. Your agent can look up components, check its code against the lint rules, and see the screens it builds."
      >
        <Stack gap={7}>
          <Grid columns={2} gap={6}>
            <Step
              title="Connect it"
              help="polymorph init writes this for you as .mcp.json. Otherwise, add it to your client's config with the full path to your copy of the repository."
            >
              <CodeBlock copyable label="MCP server config">
                {MCP_CONFIG}
              </CodeBlock>
            </Step>
            <Step
              title="Point it at the docs"
              help="This site serves three plain-text files written for agents."
            >
              <Stack gap={4}>
                <Stack gap={1}>
                  <Link variant="standalone" href={AGENT_FILES.index} external>
                    {AGENT_FILES.index}
                  </Link>
                  <Text size="sm" tone="secondary">
                    A short introduction, the rules, and links to the two files below.
                  </Text>
                </Stack>
                <Stack gap={1}>
                  <Link variant="standalone" href={AGENT_FILES.card} external>
                    {AGENT_FILES.card}
                  </Link>
                  <Text size="sm" tone="secondary">
                    The system card: every component, its props and the token names in one read.
                  </Text>
                </Stack>
                <Stack gap={1}>
                  <Link variant="standalone" href={AGENT_FILES.full} external>
                    {AGENT_FILES.full}
                  </Link>
                  <Text size="sm" tone="secondary">
                    The system card followed by the full rules, with the exception ladder.
                  </Text>
                </Stack>
              </Stack>
            </Step>
          </Grid>
          <Grid columns={2} gap={6}>
            <Stack gap={3}>
              <Heading level={3}>What it can look up</Heading>
              <ToolList label="Tools that only read" tools={MCP_READ_TOOLS} />
            </Stack>
            <Stack gap={3}>
              <Heading level={3}>What it can write</Heading>
              <Text size="sm" tone="secondary">
                Each one checks first, and writes nothing if the check fails.
              </Text>
              <ToolList label="Tools that write to your project" tools={MCP_WRITE_TOOLS} />
            </Stack>
          </Grid>
        </Stack>
      </Section>
    </Stack>
  )
}
