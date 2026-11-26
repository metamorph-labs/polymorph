import {
  FRAMEWORK_FOUNDATION,
  FRAMEWORK_VOCABULARY,
  FRAMEWORKS,
  PUBLISHED_NAMES,
  PUBLISHED_REGISTRY,
  type Registry,
} from '@polymorph/registry'

import { APP_TOOLING, REACT_RANGE } from '../init'
import { ANGULAR_TOOLING } from '../init-angular'
import { SVELTE_TOOLING } from '../init-svelte'
import { VUE_TOOLING } from '../init-vue'
import { DEFAULT_SYSTEM } from '../plan'
import { frameworkRanges } from '../vue'
import { commands, Facts, SkillFactError } from './facts'

/** The lowest major of `vite` the engine's plugin takes, which a law holds to the engine's peer range. */
export const VITE_FLOOR = 6

/**
 * The packages route of the setup skill, for a model adding polymorph to an app that already
 * exists: what to install and under which alias, the reference app `init` writes to copy exact
 * files from, the Vite theme plugin, the entry, the red rules, and how to check the result. Then
 * what differs for Next.js, which `pnpm gate:next` builds, and what no check covers.
 *
 * Every range is the release's, read from the registry, and every line is one `init` writes or the
 * Next.js fixture (`scripts/next-app/`) holds, so the text cannot name a release or a file the
 * tools do not write.
 */
export function packagesReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  // The engine's range, as `init` writes it. One install line serves every framework only while
  // each framework's foundation and vocabulary, and the rules, are at that range too.
  const range = registry.packages['@polymorph/engine']
  if (range === undefined) {
    throw new SkillFactError('the registry has no range for @polymorph/engine')
  }
  const published = (name: string): string => {
    const found = PUBLISHED_NAMES[name]
    if (found === undefined) throw new SkillFactError(`${name} is not published`)
    return found
  }
  for (const web of FRAMEWORKS.filter((name) => name !== 'elements')) {
    for (const name of [FRAMEWORK_FOUNDATION[web], FRAMEWORK_VOCABULARY[web]]) {
      if (frameworkRanges(registry, web)[name] !== range) {
        throw new SkillFactError(`${name} is not at ${range}`)
      }
    }
  }
  if (registry.packages['@polymorph/rules'] !== range) {
    throw new SkillFactError(`@polymorph/rules is not at ${range}`)
  }
  const alias = (name: string): string => `${name}@npm:${published(name)}@${range}`
  const scope = published('@polymorph/engine').split('/')[0] as string
  const framework = (name: string): string =>
    `${name.replace('@polymorph/react', '@polymorph/<framework>')}@npm:${published(name).replace('polymorph-react', 'polymorph-<framework>')}@${range}`
  const lintTools = (tooling: Readonly<Record<string, string>>): string =>
    Object.entries(tooling)
      .filter(([name]) => name.includes('eslint'))
      .map(([name, version]) => `\`${name}@${version}\``)
      .join(', ')
  const system = registry.theme.systems.find((entry) => entry.name === DEFAULT_SYSTEM)
  if (system === undefined) throw new SkillFactError(`no system called ${DEFAULT_SYSTEM}`)
  const palette = system.defaultPalette
  const fonts = system.fonts.map((font) => `\`${font.package}\``).join(' and ')
  const lint = ['eslint', 'stylelint']
    .map((name) => `\`${name}@${APP_TOOLING[name]}\``)
    .join(' and ')
  const themeModule = 'packages/cli/src/emit.ts'
  return `
# The packages route, step by step

The app installs the vocabulary as packages and owns no member source. Every \`@polymorph/<name>\`
package is installed under that name, as an npm alias of \`@metamorph-labs/polymorph-<name>\`, at
\`${range}\`: the release these skills come from. Every package carries the same version.

| The app builds with | Do |
| --- | --- |
| Vite (\`vite.config.*\`), in React, Vue, Svelte, Solid or Angular | Steps 1 to 9 |
| Next.js (\`next.config.*\`), in React | Step 2, then "Next.js" below, then steps 7 to 9 |
| Anything else | "Other builds" below |

\`<framework>\` is \`react\`, \`vue\`, \`svelte\`, \`solid\` or \`angular\`. A page with no build is not
this route: it is \`init\` with \`--framework elements\`.

## 1. Write a reference app to copy from

${commands(run, 'init ../polymorph-reference --framework <framework> --no-install')}

\`init\` writes a whole app, in the app's framework, into a new directory beside the project, and
\`--no-install\` installs nothing. Copy from it only \`src/theme/*.json\` (step 3) and
\`polymorph.eslint.js\` and \`polymorph.stylelint.js\` (step 6). Read its \`package.json\` and
\`vite.config.ts\` for the lines steps 2 and 4 name. Copy nothing else: the app keeps its own
\`tsconfig.json\`, \`.prettierrc.json\`, \`index.html\`, \`src/vite-env.d.ts\` and screens, and step 7
writes the agent files. \`--system <name>\` writes another catalogue system than
\`${DEFAULT_SYSTEM}\`, and \`${run} axes\` lists them. Delete \`../polymorph-reference\` when the app
is set up.

## 2. Install the packages

\`\`\`sh
npm install ${alias('@polymorph/engine')} \\
  ${framework('@polymorph/react')} \\
  ${framework('@polymorph/react-ui')}
npm install -D ${alias('@polymorph/rules')}
\`\`\`

\`pnpm add\`, \`yarn add\` and \`bun add\` take the same arguments. Install as well:

- the font packages the reference app's \`package.json\` lists, which its system names: ${fonts}
  for \`${DEFAULT_SYSTEM}\`;
- ${lint} as dev dependencies, if the app has neither;
- the parser the red rules read the framework's files with, as a dev dependency: ${lintTools(VUE_TOOLING)} for Vue,
  ${lintTools(SVELTE_TOOLING)} for Svelte, ${lintTools(ANGULAR_TOOLING)} for Angular, and none for
  React and Solid.

The install checks the packages' peer ranges: \`vite\` ${VITE_FLOOR} or later for the engine's plugin, and the
framework's own, \`react@${REACT_RANGE}\` for React. The app's \`vite\`, its framework and the
framework's Vite plugin (\`@vitejs/plugin-react\` for React) stay at the versions the app has when
the install reports no peer conflict. The reference app's versions are what a new app starts on, not
a requirement.

npmjs.com holds every release, with no configuration and no token. To install from GitHub Packages
instead, add these lines to the project's \`.npmrc\`, and set \`NODE_AUTH_TOKEN\` to a GitHub token
with \`read:packages\` (\`gh auth refresh -s read:packages\`, then
\`export NODE_AUTH_TOKEN=$(gh auth token)\`). Never write the token into the file.

\`\`\`ini
${scope}:registry=${PUBLISHED_REGISTRY}
${PUBLISHED_REGISTRY.replace(/^https?:/, '')}/:_authToken=\${NODE_AUTH_TOKEN}
\`\`\`

## 3. Copy the theme documents

\`\`\`sh
mkdir -p src/theme && cp ../polymorph-reference/src/theme/*.json src/theme/
\`\`\`

They are the app's system and palette (\`src/theme/${DEFAULT_SYSTEM}.json\` and
\`src/theme/${palette}.json\` for \`${DEFAULT_SYSTEM}\`), changed through the \`polymorph-theme\` skill.

## 4. Add the theme plugin to the Vite config

\`\`\`ts
import { polymorphTheme } from '@polymorph/engine/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    polymorphTheme({
      systems: ['src/theme/${DEFAULT_SYSTEM}.json'],
      palettes: ['src/theme/${palette}.json'],
    }),
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
})
\`\`\`

The framework's own plugin stays first, and the theme plugin follows it. \`dedupe\` names the
framework's packages, so the app has one copy of them: \`vue\`, \`svelte\`, \`solid-js\`, or Angular's
\`@angular/core\`, \`@angular/common\` and \`@angular/platform-browser\`. The reference app's
\`vite.config.ts\` has the lines for its framework.

${f.x('polymorphTheme', '@polymorph/engine/vite')} compiles the two documents when the app builds,
and again in dev when one changes. A pairing that breaks a theme law fails the build with the law's
message. It writes \`data-system\`, \`data-palette\` and the pre-paint script into \`index.html\`, so the
first paint wears the theme in the system's \`defaultMode\`. Do not write them by hand.

## 5. Import the theme first in the entry

\`\`\`ts
// The first line of src/main.ts or src/main.tsx, before the framework renders.
import 'virtual:polymorph/theme'
\`\`\`

An Angular entry imports \`@polymorph/angular-ui/base.css\` on the next line. Then add this line to
\`src/vite-env.d.ts\`, which types the module, and create the file if the app has none:

\`\`\`ts
/// <reference types="@polymorph/engine/vite-env" />
\`\`\`

Keep the app's \`vite/client\` reference, in that file or in its \`tsconfig\`'s \`types\`: the
reference app's file lacks it. \`tsconfig.json\` needs no change while each config the app has sets
\`moduleResolution\` to \`bundler\`, as Vite's templates do, or to \`node16\` or \`nodenext\`. The
packages declare their types only in \`exports\`, which \`node\` resolution does not read.

The root also mounts the toast viewport, and in React a ${f.x('TooltipProvider', '@polymorph/react-ui')}.
The \`polymorph-screen\` skill's \`references/app.md\` has those lines.

## 6. Link the red rules into the lint configs

\`\`\`sh
cp ../polymorph-reference/polymorph.eslint.js ../polymorph-reference/polymorph.stylelint.js .
\`\`\`

\`\`\`js
// eslint.config.js: the fragment first, the project's own blocks after it
import polymorph from './polymorph.eslint.js'

export default [...polymorph]
\`\`\`

\`\`\`js
// stylelint.config.js
export default { extends: ['./polymorph.stylelint.js'] }
\`\`\`

The fragments hold the rules, the parser for the framework's files and the theme's token values,
which a report names the nearest token by. They read every file the lint is given, so lint the
app's source: the reference app's \`lint\` script is \`eslint src && stylelint "src/**/*.css"
--allow-empty-input\`. Never turn a polymorph rule off in a config.

The token values in \`polymorph.eslint.js\` are those of \`${DEFAULT_SYSTEM}\` with \`${palette}\`, the
reference app's theme. They choose only which token a report names as nearest a raw value, never what a rule refuses. No
command rewrites them in this route, so after a rebrand a report can name a colour, radius, size or
duration token that is not the nearest in the app's theme.

## 7. Write the agent files

${commands(run, 'agents')}

## 8. Check the result

${commands(run, 'check src', 'card --framework <framework>')}

\`check\` runs the red rules with no lint config and exits 1 on any violation. The card lists the
framework's members. Then run the project's lint, typecheck and build, and start it: a member
renders in the theme's fonts and colours.

## 9. Brand it

The \`polymorph-theme\` skill changes the look. In this route:

- Replace the two copied documents in \`src/theme/\` with the app's own system and palette. The
  system's \`defaultPalette\` names the palette.
- Name both files in ${f.x('polymorphTheme', '@polymorph/engine/vite')} in \`vite.config\`, the
  system in \`systems\` and the palette in \`palettes\`. The build fails when a system's
  \`defaultPalette\` is not among \`palettes\`.
- \`${run} theme validate src/theme/<system>.json src/theme/<palette>.json\` names the font packages
  the system needs. Install them, and remove the font packages no document names any more.

In an app whose theme \`add\` compiled (Next.js, or React on another bundler), the documents are
under \`src/polymorph/themes/\`. Edit them in place and run \`${run} update\`, which compiles the sheet
again and rewrites the lint fragments' values from it.

## Next.js

Next.js runs the React packages in the App Router, with Turbopack or webpack. The Vite plugin does
not run there, so the theme is compiled into the repository when it is installed:

${commands(run, `add theme:${DEFAULT_SYSTEM} --framework react`)}

\`add\` writes the compiled theme, a theme module and the pre-paint script built for the installed
systems (\`prepaint.ts\`) under \`src/polymorph/themes/\`, adds the system's fonts to
\`package.json\`, and writes and links the lint fragments. It vendors no member
and keeps the aliases step 2 wrote. It reports that it found no entry and no \`index.html\`: the
root layout does those two jobs.

\`\`\`tsx
// app/layout.tsx
import type { ReactNode } from 'react'

import { TooltipProvider } from '@polymorph/react-ui'

import { PREPAINT_SCRIPT } from '../src/polymorph/themes/prepaint'
import { Theme } from './theme'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-system="${DEFAULT_SYSTEM}" data-palette="${palette}" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>
        <Theme />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
\`\`\`

\`\`\`tsx
// app/theme.tsx
'use client'

import { useEffect } from 'react'

import { installThemes } from '../src/polymorph/themes'

export function Theme() {
  useEffect(installThemes, [])
  return null
}
\`\`\`

- ${f.x('PREPAINT_SCRIPT', themeModule)}, from the \`prepaint.ts\` that \`add\` writes, applies the
  reader's stored choice before the first paint, and for a reader with no stored mode the system's
  \`defaultMode\`. \`<html>\` may therefore differ from the server's markup, which
  \`suppressHydrationWarning\` allows. It imports nothing, so the server layout can import it.
- ${f.x('installThemes', themeModule)} imports the compiled sheet, the base layer and the fonts. Never
  import a stylesheet in \`app/layout.tsx\`: \`polymorph/no-app-css\` reports it.
- A member that takes a function (a handler, \`onNavigate\`, a column's \`cell\`) is rendered from a
  \`'use client'\` component. A server component may pass text, data and elements.
- With webpack, list the vocabulary in \`next.config.ts\`, or every page loads all of it:
  \`experimental: { optimizePackageImports: ['@polymorph/react-ui'] }\`.
- Keep Next.js's output out of the lint:
  \`export default [...polymorph, { ignores: ['.next/', 'next-env.d.ts'] }]\`.

## Other builds

No check builds these. Tell the person so, and set them up only as far as below.

- **React on another bundler** (webpack, Rsbuild, Parcel): after step 2,
  \`${run} add theme:${DEFAULT_SYSTEM} --framework react\` compiles the theme, calls
  ${f.x('installThemes', themeModule)} from the entry it finds and puts the pre-paint script in a root \`index.html\`.
  It names each one it could not find: call \`installThemes()\` before the app mounts, and put the
  pre-paint script from \`prepaint.ts\` first in \`<head>\`, as the Next.js layout does.
- **Nuxt, SvelteKit, SolidStart, Astro** run Vite but write their own document, which the plugin's
  \`index.html\` step does not reach. Steps 1 to 6 apply, and the document takes the pairing's
  attributes and the pre-paint script first in \`<head>\`. Build the script with
  ${f.x('prepaintScript', '@polymorph/engine/runtime')} from \`@polymorph/engine/runtime\`, given each
  system's \`defaultMode\` as \`modes\` and the default system as \`system\`, so a system that opens
  dark does not paint light first. SvelteKit renders the routes that
  hold members in the browser alone (\`export const ssr = false\`): the Svelte members do not
  hydrate.
- **The Angular CLI** compiles no stylesheet a module imports, so its app lists
  \`@polymorph/angular-ui/base.css\` in \`angular.json\`'s \`styles\`. A check holds only the
  Vite build that \`init\` writes for Angular.
`.trimStart()
}
