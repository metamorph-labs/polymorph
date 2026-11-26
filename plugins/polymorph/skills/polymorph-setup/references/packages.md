# The packages route, step by step

The app installs the vocabulary as packages and owns no member source. Every `@polymorph/<name>`
package is installed under that name, as an npm alias of `@metamorph-labs/polymorph-<name>`, at
`^1.0.18`: the release these skills come from. Every package carries the same version.

| The app builds with | Do |
| --- | --- |
| Vite (`vite.config.*`), in React, Vue, Svelte, Solid or Angular | Steps 1 to 8 |
| Next.js (`next.config.*`), in React | Step 2, then "Next.js" below, then steps 7 and 8 |
| Anything else | "Other builds" below |

`<framework>` is `react`, `vue`, `svelte`, `solid` or `angular`. A page with no build is not
this route: it is `init` with `--framework elements`.

## 1. Write a reference app to copy from

```sh
npx -y @metamorph-labs/polymorph@1.0.18 init ../polymorph-reference --framework <framework> --no-install
```

`init` writes a whole app, in the app's framework, into a new directory beside the project, and
`--no-install` installs nothing. Its files hold the exact lines the steps below copy.
`--system <name>` writes another catalogue system than `plain`, and `npx -y @metamorph-labs/polymorph@1.0.18 axes` lists
them. Delete `../polymorph-reference` when the app is set up.

## 2. Install the packages

```sh
npm install @polymorph/engine@npm:@metamorph-labs/polymorph-engine@^1.0.18 \
  @polymorph/<framework>@npm:@metamorph-labs/polymorph-<framework>@^1.0.18 \
  @polymorph/<framework>-ui@npm:@metamorph-labs/polymorph-<framework>-ui@^1.0.18
npm install -D @polymorph/rules@npm:@metamorph-labs/polymorph-rules@^1.0.18
```

`pnpm add`, `yarn add` and `bun add` take the same arguments. Install as well:

- the font packages the reference app's `package.json` lists, which its system names: `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`
  for `plain`;
- `eslint@^10.8.0` and `stylelint@^17.14.1` as dev dependencies, if the app has neither;
- the parser the red rules read the framework's files with, as a dev dependency: `vue-eslint-parser@^10.4.1` for Vue,
  `svelte-eslint-parser@^1.9.0` for Svelte, `@angular-eslint/eslint-plugin-template@^22.6.0`, `@angular-eslint/template-parser@^22.6.0` for Angular, and none for
  React and Solid.

npmjs.com holds every release, with no configuration and no token. To install from GitHub Packages
instead, add these lines to the project's `.npmrc`, and set `NODE_AUTH_TOKEN` to a GitHub token
with `read:packages` (`gh auth refresh -s read:packages`, then
`export NODE_AUTH_TOKEN=$(gh auth token)`). Never write the token into the file.

```ini
@metamorph-labs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## 3. Copy the theme documents

```sh
mkdir -p src/theme && cp ../polymorph-reference/src/theme/*.json src/theme/
```

They are the app's system and palette (`src/theme/plain.json` and
`src/theme/neutral.json` for `plain`), changed through the `polymorph-theme` skill.

## 4. Add the theme plugin to the Vite config

```ts
import { polymorphTheme } from '@polymorph/engine/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    polymorphTheme({
      systems: ['src/theme/plain.json'],
      palettes: ['src/theme/neutral.json'],
    }),
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
})
```

The framework's own plugin stays first, and the theme plugin follows it. `dedupe` names the
framework's packages, so the app has one copy of them: `vue`, `svelte`, `solid-js`, or Angular's
`@angular/core`, `@angular/common` and `@angular/platform-browser`. The reference app's
`vite.config.ts` has the lines for its framework.

`polymorphTheme` compiles the two documents when the app builds,
and again in dev when one changes. A pairing that breaks a theme law fails the build with the law's
message. It writes `data-system`, `data-palette` and the pre-paint script into `index.html`, so the
first paint wears the theme. Do not write them by hand.

## 5. Import the theme first in the entry

```ts
// The first line of src/main.ts or src/main.tsx, before the framework renders.
import 'virtual:polymorph/theme'
```

An Angular entry imports `@polymorph/angular-ui/base.css` on the next line. Then add
`src/vite-env.d.ts`, which types the module:

```ts
/// <reference types="@polymorph/engine/vite-env" />
```

The root also mounts the toast viewport, and in React a `TooltipProvider`.
The `polymorph-screen` skill's `references/app.md` has those lines.

## 6. Link the red rules into the lint configs

```sh
cp ../polymorph-reference/polymorph.eslint.js ../polymorph-reference/polymorph.stylelint.js .
```

```js
// eslint.config.js: the fragment first, the project's own blocks after it
import polymorph from './polymorph.eslint.js'

export default [...polymorph]
```

```js
// stylelint.config.js
export default { extends: ['./polymorph.stylelint.js'] }
```

The fragments hold the rules, the parser for the framework's files and the theme's token values,
which a report names the nearest token by. They read every file the lint is given, so lint the
app's source: the reference app's `lint` script is `eslint src && stylelint "src/**/*.css"
--allow-empty-input`. Never turn a polymorph rule off in a config.

## 7. Write the agent files

```sh
npx -y @metamorph-labs/polymorph@1.0.18 agents
```

## 8. Check the result

```sh
npx -y @metamorph-labs/polymorph@1.0.18 check src
npx -y @metamorph-labs/polymorph@1.0.18 card --framework <framework>
```

`check` runs the red rules with no lint config and exits 1 on any violation. The card lists the
framework's members. Then run the project's lint, typecheck and build, and start it: a member
renders in the theme's fonts and colours.

## Next.js

Next.js runs the React packages in the App Router, with Turbopack or webpack. The Vite plugin does
not run there, so the theme is compiled into the repository when it is installed:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 add theme:plain --framework react
```

`add` writes the compiled theme and a theme module under `src/polymorph/themes/`, adds the
system's fonts to `package.json`, and writes and links the lint fragments. It vendors no member
and keeps the aliases step 2 wrote. It reports that it found no entry and no `index.html`: the
root layout does those two jobs.

```tsx
// app/layout.tsx
import type { ReactNode } from 'react'

import { PREPAINT_SCRIPT } from '@polymorph/engine/runtime'
import { TooltipProvider } from '@polymorph/react-ui'

import { Theme } from './theme'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-system="plain" data-palette="neutral" suppressHydrationWarning>
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
```

```tsx
// app/theme.tsx
'use client'

import { useEffect } from 'react'

import { installThemes } from '../src/polymorph/themes'

export function Theme() {
  useEffect(installThemes, [])
  return null
}
```

- `PREPAINT_SCRIPT` applies the reader's stored choice before
  the first paint, so `<html>` may differ from the server's markup, which
  `suppressHydrationWarning` allows.
- `installThemes` imports the compiled sheet, the base layer and the fonts. Never
  import a stylesheet in `app/layout.tsx`: `polymorph/no-app-css` reports it.
- A member that takes a function (a handler, `onNavigate`, a column's `cell`) is rendered from a
  `'use client'` component. A server component may pass text, data and elements.
- With webpack, list the vocabulary in `next.config.ts`, or every page loads all of it:
  `experimental: { optimizePackageImports: ['@polymorph/react-ui'] }`.
- Keep Next.js's output out of the lint:
  `export default [...polymorph, { ignores: ['.next/', 'next-env.d.ts'] }]`.

## Other builds

No check builds these. Tell the person so, and set them up only as far as below.

- **React on another bundler** (webpack, Rsbuild, Parcel): after step 2,
  `npx -y @metamorph-labs/polymorph@1.0.18 add theme:plain --framework react` compiles the theme, calls
  `installThemes` from the entry it finds and puts the pre-paint script in a root `index.html`.
  It names each one it could not find: call `installThemes()` before the app mounts, and put the
  pre-paint script first in `<head>`, as the Next.js layout does.
- **Nuxt, SvelteKit, SolidStart, Astro** run Vite but write their own document, which the plugin's
  `index.html` step does not reach. Steps 1 to 6 apply, and the document takes the pairing's
  attributes and the pre-paint script as the Next.js layout does. SvelteKit renders the routes that
  hold members in the browser alone (`export const ssr = false`): the Svelte members do not
  hydrate.
- **The Angular CLI** compiles no stylesheet a module imports, so its app lists
  `@polymorph/angular-ui/base.css` in `angular.json`'s `styles`. A check holds only the
  Vite build that `init` writes for Angular.
