import { SITE } from '../site'
import { REGISTRY } from '../registry'
import { PUBLISHED_NAMES, TOOLS_NAME } from './facts'

/**
 * The install page's content as data: one entry per framework and platform, each with how to
 * start a new app and how to add Polymorph to an app that exists.
 *
 * Every command, package name and file comes from `docs/consuming.md`, `docs/frameworks.md` and
 * the CLI's own templates (`packages/cli/src/init*.ts`). Versions and ranges come from the
 * registry, so the page names the release the registry was built from.
 */

/** The release the registry was built from. The release tag is `v` and this version. */
export const RELEASE = REGISTRY.version

/** The guide the page links for the full setup: `docs/consuming.md`, as the site publishes it. */
export const GUIDE = '/guides/consuming'

/** The system `polymorph init` themes a new app with (`packages/cli/src/plan.ts`). */
export const INIT_SYSTEM = 'plain'

/**
 * The CLI and the MCP server, the published package at this release, run with `npx` by its scoped
 * name. It needs no copy of the repository, and runs in the directory it is started in.
 */
export const TOOLS = `npx -y ${TOOLS_NAME}@${RELEASE}`

/** The one block that takes a reader from nothing to a running app. */
export const QUICK_START = [`${TOOLS} init my-app`, 'cd my-app && npm run dev'].join('\n')

/** What `polymorph init` writes for React, from the table in `docs/consuming.md`. */
export const INIT_WRITES: readonly { title: string; description: string; file: string }[] = [
  {
    title: 'The packages',
    description: `The engine, the React components and the lint rules, at release ${RELEASE}.`,
    file: 'package.json',
  },
  {
    title: 'A theme',
    description: `The ${INIT_SYSTEM} system and its palette, compiled by the Vite plugin. You can start from any other system instead.`,
    file: 'src/theme/',
  },
  {
    title: 'The lint rules',
    description: 'ESLint and Stylelint configs that keep styling out of your screens.',
    file: 'eslint.config.js',
  },
  {
    title: 'Your agent, connected',
    description:
      'The MCP server, the skills, the system card and an AGENTS.md for Claude Code, Codex and Cursor.',
    file: '.mcp.json',
  },
  {
    title: 'A first screen',
    description:
      'A screen written as a spec, the component made from it, and the app that shows it.',
    file: 'src/screens/',
  },
]

export interface Snippet {
  title: string
  help?: string
  code: string
}

export interface Target {
  value: string
  label: string
  /** One line on what the reader gets. */
  intro: string
  /** How to start a new app, when there is a command for it. */
  create?: Snippet
  /** How to add Polymorph to an app that exists, step by step. */
  add: readonly Snippet[]
  /** The heading over `add`, when it is not about an app that exists. */
  addTitle?: string
  /** The section of `docs/consuming.md` with the rest. */
  anchor: string
}

const theme = REGISTRY.theme.systems.find((system) => system.name === INIT_SYSTEM)
const PALETTE = theme?.defaultPalette ?? ''

const range = (name: string, framework?: string): string =>
  (framework === undefined
    ? REGISTRY.packages[name]
    : REGISTRY.vendor.frameworks[framework as keyof typeof REGISTRY.vendor.frameworks]?.packages[
        name
      ]) ?? `^${RELEASE}`

const alias = (name: string, framework?: string): string =>
  `"${name}": "npm:${PUBLISHED_NAMES[name]}@${range(name, framework)}"`

/** The dependencies an app with a build adds: the engine, its framework's two packages, the rules. */
function dependencies(foundation: string, vocabulary: string, framework?: string): string {
  return [
    '// package.json',
    '"dependencies": {',
    `  ${alias('@polymorph/engine')},`,
    `  ${alias(foundation, framework)},`,
    `  ${alias(vocabulary, framework)}`,
    '},',
    '"devDependencies": {',
    `  ${alias('@polymorph/rules')}`,
    '}',
  ].join('\n')
}

/**
 * How an app that already exists gets the packages. They are public on npmjs.com, so an install
 * needs no `.npmrc` and no token (`docs/consuming.md`, "Registry access").
 */
const PACKAGES_HELP =
  'They’re public on npm, so there’s nothing to set up first. Each one installs under its @polymorph name, so your imports match these docs.'

/** A file of the repository at this release, as a reader downloads it. */
const releaseFile = (path: string): string =>
  `${SITE.repository.replace('https://github.com/', 'https://raw.githubusercontent.com/')}/v${RELEASE}/${path}`

const themeStep: Snippet = {
  title: 'Copy a theme into your project',
  help: 'A theme is two small JSON files: a system and a palette. Start from a house one and change it later.',
  code: [
    'mkdir -p src/theme',
    `curl -fsSLo src/theme/${INIT_SYSTEM}.json ${releaseFile(`design/systems/${INIT_SYSTEM}.json`)}`,
    `curl -fsSLo src/theme/${PALETTE}.json ${releaseFile(`design/palettes/${PALETTE}.json`)}`,
  ].join('\n'),
}

/** The Vite config `polymorph init` writes, with the framework's own plugin first. */
function viteConfig(importLine: string, call: string, dedupe: readonly string[]): string {
  return `// vite.config.ts
import { polymorphTheme } from '@polymorph/engine/vite'
${importLine}
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    ${call},
    polymorphTheme({
      systems: ['src/theme/${INIT_SYSTEM}.json'],
      palettes: ['src/theme/${PALETTE}.json'],
    }),
  ],
  resolve: { dedupe: [${dedupe.map((name) => `'${name}'`).join(', ')}] },
})`
}

function entryStep(entry: string, extra = ''): Snippet {
  return {
    title: 'Load the theme before anything renders',
    help: 'One import at the top of your entry file, and one line so TypeScript knows about it.',
    code: `// ${entry}\nimport 'virtual:polymorph/theme'${extra}\n\n// src/vite-env.d.ts\n/// <reference types="@polymorph/engine/vite-env" />`,
  }
}

const lintStep: Snippet = {
  title: 'Turn on the lint rules',
  help: 'They keep styling out of your screens. The full guide has the ESLint and Stylelint config. To try them first, run this in your app. It needs no setup.',
  code: `${TOOLS} check src`,
}

const createStep = (framework: string | null, dir = 'my-app'): Snippet => ({
  title: 'Start a new app',
  help: 'Run this wherever you keep your projects. It makes the folder for you.',
  code: `${TOOLS} init ${dir}${framework === null ? '' : ` --framework ${framework}`}`,
})

/** Members each generated vocabulary ships, against the whole vocabulary. */
function shipped(framework: string): string {
  const native = REGISTRY.components.filter(
    (component) =>
      component.frameworks[framework as keyof typeof component.frameworks]?.status === 'native',
  ).length
  return `${native} of the ${REGISTRY.components.length} components`
}

const nativeClone = `git clone --branch v${RELEASE} ${SITE.repository}`

export const TARGETS: readonly Target[] = [
  {
    value: 'react',
    label: 'React',
    intro: `All ${REGISTRY.components.length} components, written by hand for React on React Aria and Radix.`,
    create: createStep(null),
    add: [
      {
        title: 'Add the packages',
        help: PACKAGES_HELP,
        code: dependencies('@polymorph/react', '@polymorph/react-ui'),
      },
      themeStep,
      {
        title: 'Add the theme plugin',
        code: viteConfig("import react from '@vitejs/plugin-react'", 'react()', [
          'react',
          'react-dom',
        ]),
      },
      entryStep('src/main.tsx'),
      {
        title: 'Use a component',
        code: `import { Button } from '@polymorph/react-ui'

<Button variant="solid" tone="accent" label="Save" onClick={save} />`,
      },
      lintStep,
    ],
    anchor: '#installing',
  },
  {
    value: 'vue',
    label: 'Vue',
    intro: `${shipped('vue')}, as Vue single-file components.`,
    create: createStep('vue'),
    add: [
      {
        title: 'Add the packages',
        help: PACKAGES_HELP,
        code: dependencies('@polymorph/vue', '@polymorph/vue-ui', 'vue'),
      },
      themeStep,
      {
        title: 'Add the theme plugin',
        code: viteConfig("import vue from '@vitejs/plugin-vue'", 'vue()', ['vue']),
      },
      entryStep('src/main.ts'),
      {
        title: 'Use a component',
        help: 'Props keep their names. An onClick prop is the click event.',
        code: `<script setup lang="ts">
import { Button } from '@polymorph/vue-ui'
</script>

<template>
  <Button variant="solid" tone="accent" label="Save" @click="save" />
</template>`,
      },
      lintStep,
    ],
    anchor: '#a-vue-app',
  },
  {
    value: 'svelte',
    label: 'Svelte',
    intro: `${shipped('svelte')}, as Svelte 5 components.`,
    create: createStep('svelte'),
    add: [
      {
        title: 'Add the packages',
        help: PACKAGES_HELP,
        code: dependencies('@polymorph/svelte', '@polymorph/svelte-ui', 'svelte'),
      },
      themeStep,
      {
        title: 'Add the theme plugin',
        code: viteConfig("import { svelte } from '@sveltejs/vite-plugin-svelte'", 'svelte()', [
          'svelte',
        ]),
      },
      entryStep('src/main.ts'),
      {
        title: 'Use a component',
        help: 'Props keep their React names, callbacks included.',
        code: `<script lang="ts">
  import { Button } from '@polymorph/svelte-ui'
</script>

<Button variant="solid" tone="accent" label="Save" onClick={save} />`,
      },
      lintStep,
    ],
    anchor: '#a-svelte-app',
  },
  {
    value: 'solid',
    label: 'Solid',
    intro: `${shipped('solid')}, as Solid components.`,
    create: createStep('solid'),
    add: [
      {
        title: 'Add the packages',
        help: PACKAGES_HELP,
        code: dependencies('@polymorph/solid', '@polymorph/solid-ui', 'solid'),
      },
      themeStep,
      {
        title: 'Add the theme plugin',
        code: viteConfig("import solid from 'vite-plugin-solid'", 'solid()', ['solid-js']),
      },
      entryStep('src/main.tsx'),
      {
        title: 'Use a component',
        code: `import { Button } from '@polymorph/solid-ui'

<Button variant="solid" tone="accent" label="Save" onClick={save} />`,
      },
      lintStep,
    ],
    anchor: '#a-solid-app',
  },
  {
    value: 'angular',
    label: 'Angular',
    intro: `${shipped('angular')}, as standalone Angular components.`,
    create: createStep('angular'),
    add: [
      {
        title: 'Add the packages',
        help: PACKAGES_HELP,
        code: dependencies('@polymorph/angular', '@polymorph/angular-ui', 'angular'),
      },
      themeStep,
      {
        title: 'Add the theme plugin',
        code: viteConfig(
          "import angular from '@analogjs/vite-plugin-angular'",
          "angular({ tsconfig: './tsconfig.json', jit: false })",
          ['@angular/core', '@angular/common', '@angular/platform-browser'],
        ),
      },
      entryStep('src/main.ts', "\nimport '@polymorph/angular-ui/base.css'"),
      {
        title: 'Use a component',
        help: 'List it in your component’s imports and write it by its selector.',
        code: `import { Button } from '@polymorph/angular-ui'

@Component({
  selector: 'app-root',
  imports: [Button],
  template: \`<pm-button variant="solid" tone="accent" label="Save" (click)="save()" />\`,
})`,
      },
      lintStep,
    ],
    anchor: '#an-angular-app',
  },
  {
    value: 'html',
    label: 'HTML',
    intro: `${shipped('elements')}, as custom elements like <poly-button>. For a static page, a server-rendered template, htmx or Turbo. Nothing to install and no build step.`,
    create: {
      title: 'Start a new site',
      help: 'This copies the files your page loads into the new site, ready to serve as they are.',
      code: `${TOOLS} init my-site --framework elements`,
    },
    addTitle: 'Then write your page',
    add: [
      {
        title: 'Use the elements like any other tag',
        help: 'init writes an example page. Link the two stylesheets and the script, and you can use every element.',
        code: `<!doctype html>
<html lang="en" data-system="${INIT_SYSTEM}" data-palette="${PALETTE}">
  <head>
    <script src="polymorph/prepaint.js"></script>
    <link rel="stylesheet" href="polymorph/polymorph.css" />
    <link rel="stylesheet" href="polymorph/theme.css" />
    <script type="module" src="polymorph/polymorph.js"></script>
  </head>
  <body>
    <poly-stack gap="5" p="6">
      <poly-heading>Orders</poly-heading>
      <poly-button variant="solid" tone="accent" label="New order"></poly-button>
    </poly-stack>
  </body>
</html>`,
      },
      {
        title: 'Already using a bundler?',
        help: 'Install the two elements packages from npm and import them once.',
        code: [
          '// package.json',
          '"dependencies": {',
          `  ${alias('@polymorph/elements', 'elements')},`,
          `  ${alias('@polymorph/elements-ui', 'elements')}`,
          '}',
          '',
          '// your entry',
          "import '@polymorph/elements-ui'",
        ].join('\n'),
      },
    ],
    anchor: '#a-page-with-no-build',
  },
  {
    value: 'ios',
    addTitle: 'Set it up',
    label: 'iOS',
    intro:
      'The components drawn in SwiftUI, for iOS 17 and macOS 14 or later. A few web-only ones, like Tooltip, have a native stand-in instead.',
    add: [
      {
        title: 'Add the Swift package',
        help: `Add it by the repository's URL, and Swift Package Manager picks up each release from its tag. In Xcode, use File › Add Package Dependencies… and paste the URL.`,
        code: `// Package.swift
dependencies: [.package(url: "${SITE.repository}", from: "${RELEASE}")],
targets: [
  .target(
    name: "App",
    dependencies: [
      .product(name: "PolymorphTokens", package: "polymorph"),
      .product(name: "PolymorphUI", package: "polymorph"),
    ]
  )
]`,
      },
      {
        title: 'Pick a theme at the root and use a component',
        code: `import PolymorphUI

PMBadge(props: .init(children: status, icon: .time))

// At the app's root:
RootView().pmTheme(.terminal_petrol)`,
      },
    ],
    anchor: '#an-ios-app',
  },
  {
    value: 'android',
    addTitle: 'Set it up',
    label: 'Android',
    intro:
      'The components drawn in Jetpack Compose. The charts and a few web-only components have a stand-in instead.',
    add: [
      {
        title: 'Add JitPack to your repositories',
        help: 'JitPack builds the library straight from our release tags. The first build of a release takes a few minutes.',
        code: `// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}`,
      },
      {
        title: 'Add the dependencies',
        help: 'Prefer a checkout? Clone the repository at the release tag and use includeBuild("../polymorph/platforms/android") with dev.polymorph:tokens and dev.polymorph:ui instead.',
        code: `// app/build.gradle.kts
dependencies {
    implementation("com.github.metamorph-labs.polymorph:tokens:v${RELEASE}")
    implementation("com.github.metamorph-labs.polymorph:ui:v${RELEASE}")
}`,
      },
      {
        title: 'Provide a theme and use a component',
        help: 'The theme reaches Material 3 too, so your own Material components match.',
        code: `import dev.polymorph.tokens.PMThemes
import dev.polymorph.ui.PMBadge
import dev.polymorph.ui.PMIconRole
import dev.polymorph.ui.ProvidePMTheme

ProvidePMTheme(PMThemes.terminal_petrol) {
    PMBadge(children = status, icon = PMIconRole.Time)
}`,
      },
    ],
    anchor: '#an-android-app',
  },
  {
    value: 'dart',
    addTitle: 'Set it up',
    label: 'Dart',
    intro:
      'The tokens only, as a Dart package with no dependencies. There are no Flutter components, but your Flutter app can use the same colours, type and spacing.',
    add: [
      {
        title: 'Get the package',
        code: nativeClone,
      },
      {
        title: 'Depend on it',
        code: `# pubspec.yaml
dependencies:
  polymorph_tokens:
    path: ../polymorph/platforms/dart`,
      },
    ],
    anchor: '#dart-tokens',
  },
]

/** Vendoring members instead of installing the vocabulary (`docs/tooling.md`). */
export const OWN_THE_CODE: Snippet = {
  title: 'Copy, compare, update',
  help: 'diff shows what you changed and what changed upstream. update brings in new releases for the files you left alone.',
  code: `${TOOLS} add button dialog\n${TOOLS} diff\n${TOOLS} update`,
}

/** Checking and compiling a theme of the reader's own (`docs/theming.md`, `docs/consuming.md`). */
export const THEME_STEPS: readonly Snippet[] = [
  {
    title: 'Check it',
    help: 'Your theme goes through the same checks as ours, contrast in light and dark included. The report also lists the fonts to install.',
    code: `${TOOLS} theme validate my-system.json my-palette.json`,
  },
  {
    title: 'Use it',
    help: 'Point the Vite plugin at your files. It compiles them when you build, and a theme that fails a check stops the build.',
    code: `polymorphTheme({\n  systems: ['design/my-system.json'],\n  palettes: ['design/my-palette.json'],\n})`,
  },
]

/**
 * Setting up a coding agent in an app that already uses Polymorph: the agent files `init` writes,
 * from `polymorph agents`, or the plugin from this repository's marketplace (`docs/harnesses.md`).
 */
export const AGENT_SETUP: readonly Snippet[] = [
  {
    title: 'Set up your agent’s files',
    help: 'Adds a short section to AGENTS.md, the skills and the MCP server for Claude Code, Codex and Cursor. Run it again after you upgrade: anything you’ve edited stays yours.',
    code: `${TOOLS} agents`,
  },
  {
    title: 'Or add the plugin',
    help: 'Claude Code installs the skills and the server in one go. In Codex, add the same repository with codex plugin marketplace add, then run codex plugin add polymorph@metamorph-labs.',
    code: 'claude plugin marketplace add metamorph-labs/polymorph\nclaude plugin install polymorph@metamorph-labs',
  },
]

/**
 * The mcpServers entry most clients read (`docs/tooling.md`), as `polymorph init` and
 * `polymorph agents` write it into `.mcp.json`. `install.test.ts` holds it to the CLI's own.
 */
export const MCP_CONFIG = `{
  "mcpServers": {
    "polymorph": {
      "command": "npx",
      "args": ["-y", "${TOOLS_NAME}@^${RELEASE}", "mcp", "--project", "."]
    }
  }
}`
