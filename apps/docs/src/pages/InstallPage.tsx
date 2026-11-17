import {
  Alert,
  Badge,
  Card,
  Code,
  CodeBlock,
  Heading,
  Inline,
  PageHeader,
  Stack,
  Text,
} from '@polymorph/react-ui'

import { REGISTRY } from '../registry'

/**
 * Quickstarts for the three interfaces to the registry: the CLI vendors source,
 * the MCP server answers agents, and the JSON is the registry itself. The
 * engine, the rules, the recipes and each web framework's foundation and
 * vocabulary are published to GitHub Packages (`docs/consuming.md`). The CLI,
 * the MCP server and the native packages are not, so their commands run
 * against a clone of this repository.
 */
export function InstallPage() {
  return (
    <Stack gap={7} p={7}>
      <PageHeader
        title="Install"
        description="Open code, closed usage: components arrive as source you own, and the red rules travel with them, so your lint corrects you (and your agents) the way it corrects this repository."
      />

      <Alert tone="info" title="Published packages">
        The engine, the rules, the recipes, and a foundation and a vocabulary for React, Vue,
        Svelte, Solid, Angular and the custom elements are published privately to GitHub Packages
        and installed under their @polymorph/* names with npm aliases, as docs/consuming.md
        describes. The CLI, the MCP server and the SwiftUI and Compose packages are not published,
        so they run from a clone of this repository.
      </Alert>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>The workspace</Heading>
          <Text size="sm" tone="secondary">
            Clone, install, and open the galleries and this site. From the same checkout, one
            command creates a new app outside it: the packages under their aliases, a theme, the red
            rules, the MCP server for an agent, and a first screen emitted from its spec.
          </Text>
        </Stack>
        <Card>
          <CodeBlock>{`pnpm install
pnpm dev            # workbench — galleries + the Relay demo
pnpm dev:docs       # this site
pnpm proof          # the churn proof: re-theme with zero app diffs

pnpm polymorph init ../my-app   # a new app beside the checkout (--system pastel, --no-install)
cd ../my-app && pnpm dev`}</CodeBlock>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>Other frameworks and platforms</Heading>
          <Text size="sm" tone="secondary">
            The same vocabulary renders in Vue, Svelte, Solid and Angular, generated from one
            description per member, as custom elements over the Solid members for a page written in
            HTML with no build, and natively in SwiftUI and Compose. A web app picks its framework
            when it is created; a page with no build gets the files it loads copied into its static
            directory, because no public URL serves them; a native app depends on the platform
            package in a checkout of this repository, pinned to a release tag. docs/consuming.md has
            a section for each.
          </Text>
        </Stack>
        <Card>
          <CodeBlock>{`pnpm polymorph init ../my-app --framework vue       # or svelte, solid, angular
pnpm polymorph init ../my-site --framework elements # a page with no build: <poly-button> and the rest
# In an app of that framework, vendor its members instead:
node ../polymorph/packages/cli/bin/polymorph.js add button --framework svelte

# iOS: platforms/ios as a Swift package path dependency (PolymorphTokens, PolymorphUI)
# Android: includeBuild("../polymorph/platforms/android"), then dev.polymorph:tokens and :ui
pnpm emit inbox.json InboxView.swift                # a spec whose platform is ios, as SwiftUI`}</CodeBlock>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>Vendor components</Heading>
          <Text size="sm" tone="secondary">
            The CLI resolves a component&rsquo;s closure from the registry, copies its source,
            states and styles into your repository, and extends your lint config so the laws apply
            there too. It runs from a checkout of this repository and writes into the directory it
            runs in, so run it in your app; it refuses to write into a checkout of polymorph.
          </Text>
        </Stack>
        <Card>
          <CodeBlock>{`# In your app, with this repository checked out beside it at ../polymorph:
node ../polymorph/packages/cli/bin/polymorph.js add button dialog   # components, with their closure
node ../polymorph/packages/cli/bin/polymorph.js add bespoke         # rung 4, the declared escape, as source
node ../polymorph/packages/cli/bin/polymorph.js add theme:terminal  # a pairing: system, palette, fonts, pre-paint
node ../polymorph/packages/cli/bin/polymorph.js add palette:orchid  # a palette on its own; any system can use it
node ../polymorph/packages/cli/bin/polymorph.js diff                # what you changed vs what the registry has
node ../polymorph/packages/cli/bin/polymorph.js update              # re-vendor what you have not touched`}</CodeBlock>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>Or install the packages</Heading>
          <Text size="sm" tone="secondary">
            Vendoring gives you the source to own. A product that must <em>not</em> own it, because
            its foundation must stay read-only and never be copied, forked or patched around,
            installs @polymorph/engine, @polymorph/rules and its framework&rsquo;s foundation and
            vocabulary (for React, @polymorph/react and @polymorph/react-ui) from GitHub Packages
            instead, under npm aliases so every import keeps its @polymorph/* name. The public
            surface is each package&rsquo;s <Code>exports</Code> map and nothing deeper. A change
            the product needs is a change to this repository, then a release. Linking a checkout, as
            below, is for trying an unreleased change; a product builds against a release.
          </Text>
        </Stack>
        <Card>
          <Stack gap={3}>
            <CodeBlock>{`// package.json: the releases, under their @polymorph/* names
// <version>: each package's release; polymorph init writes it for you
"dependencies": {
  "@polymorph/engine":   "npm:@metamorph-labs/polymorph-engine@^<version>",
  "@polymorph/react":    "npm:@metamorph-labs/polymorph-react@^<version>",
  "@polymorph/react-ui": "npm:@metamorph-labs/polymorph-react-ui@^<version>"
},
"devDependencies": {
  "@polymorph/rules":    "npm:@metamorph-labs/polymorph-rules@^<version>"
}
// .npmrc points the @metamorph-labs scope at GitHub Packages; docs/consuming.md has the two lines.`}</CodeBlock>
            <CodeBlock>{`// vite.config.ts
resolve: { dedupe: ['react', 'react-dom'] },              // one React, the app's`}</CodeBlock>
            <CodeBlock>{`# To try an unreleased change, link a checkout in place of the release. Never commit a link.
pnpm link ../polymorph/packages/engine ../polymorph/packages/react ../polymorph/packages/react-ui
# and let the Vite dev server read the checkout:
# server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../polymorph'] } }`}</CodeBlock>
            <CodeBlock>{`import { AppShell, DataTable } from '@polymorph/react-ui'       // the whole vocabulary
import { AuthPage, Button } from '@polymorph/react-ui/identity'  // or a focused entry, for a small bundle
// No stylesheet to import: these entries load their members' CSS and the base layer.`}</CodeBlock>
          </Stack>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>Bring your own system</Heading>
          <Text size="sm" tone="secondary">
            The catalogue belongs to this repository, but the engine accepts any theme. Two JSON
            documents, a system (eight axes, three font slots, defaults) and a palette (the colour
            seeds), go through the same law checks as a shipped pairing, and this repository never
            needs their names. <Code>admitTheme</Code> checks, resolves and emits them, and its
            report uses the laws&rsquo; own messages. The catalogue-management laws (axis
            divergence, the accent-hue band) do not apply to an external theme by design. The report
            says so, so that their absence is not mistaken for a pass.
          </Text>
        </Stack>
        <Card>
          <Stack gap={3}>
            <CodeBlock>{`# In your app, as above:
node ../polymorph/packages/cli/bin/polymorph.js theme schema system --out system.schema.json
node ../polymorph/packages/cli/bin/polymorph.js theme validate my-system.json my-palette.json
node ../polymorph/packages/cli/bin/polymorph.js theme emit my-system.json my-palette.json`}</CodeBlock>
            <CodeBlock>{`import { admitTheme, installThemeCSS, setSystem, setPalette } from '@polymorph/engine'
import system from './my-system.json'
import palette from './my-palette.json'

const admission = admitTheme({ system, palette })
if (!admission.lawful) throw new Error(admission.faults[0].message)
installThemeCSS(admission.css)               // the emitted block, on the page
setSystem(system.name); setPalette(palette.name)
// admission.fonts names the @fontsource packages to install — the app loads its own type.`}</CodeBlock>
          </Stack>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>For agents</Heading>
          <Text size="sm" tone="secondary">
            A stdio MCP server, a thin layer over the registry. The key tool is{' '}
            <Code>validate</Code>: it returns the red-rule violations in submitted code and the rung
            to climb for each. It only parses the code and never executes it. <Code>fix</Code> also
            rewrites the violations that have exactly one lawful answer. <Code>render_screen</Code>{' '}
            draws a screen spec in a browser at a phone and a desktop width and returns the pictures
            with the layout faults it measured. Four tools write into the agent’s project: a screen
            compiled from its spec, an install, a saved theme, and a file fixed in place. Each
            refuses anything unlawful.
          </Text>
        </Stack>
        <Card>
          <Stack gap={3}>
            <CodeBlock>{`node <checkout>/packages/mcp/bin/polymorph-mcp.js   # stdio — point your agent runtime at it`}</CodeBlock>
            <Inline gap={2} wrap>
              {[
                'search_components',
                'get_component',
                'get_install_plan',
                'get_system_card',
                'get_theme_axes',
                'propose_theme',
                'validate',
                'fix',
                'render_screen',
                'emit_screen',
                'install',
                'save_theme',
                'fix_file',
              ].map((tool) => (
                <Badge key={tool} variant="outline" tone="accent">
                  {tool}
                </Badge>
              ))}
            </Inline>
            <Text>
              The system card summarises the whole vocabulary (all{' '}
              <Code>{String(REGISTRY.components.length)}</Code> components, their prop grids, the
              token roles and the laws) in a few thousand tokens of context. It is generated from
              the same tree as everything else. An agent that reads it composes from the vocabulary
              and cannot express an inconsistency.
            </Text>
            <Text>
              An agent that starts from this site fetches <Code>/llms.txt</Code>. It links the card
              at <Code>/system-card.md</Code> and the card followed by the rules page at{' '}
              <Code>/llms-full.txt</Code>, and names the MCP server and <Code>init</Code> commands.
              The build generates all three, so they match the registry.
            </Text>
          </Stack>
        </Card>
      </Stack>

      <Stack gap={3}>
        <Stack gap={1}>
          <Heading>The registry itself</Heading>
          <Text size="sm" tone="secondary">
            Generated from source at publish time and never committed. Component schemas come from
            exported types, closures from the import graph, and the token catalogue from the theme
            engine.
          </Text>
        </Stack>
        <Card>
          <CodeBlock>{`pnpm registry     # writes registry/registry.json, registry.schema.json, system-card.md`}</CodeBlock>
        </Card>
      </Stack>
    </Stack>
  )
}
