# Using polymorph from another repository

How an app in another repository uses polymorph, for each web framework and native platform.

| You build | Read | What the app gets |
| --- | --- | --- |
| a React app | [One command](#one-command), then [Installing](#installing) to do it by hand | `@polymorph/react-ui` on `@polymorph/react` |
| a Next.js app | [A Next.js app](#a-nextjs-app), after [Installing](#installing) | the same React packages, in the App Router |
| a Vue app | [A Vue app](#a-vue-app) | `@polymorph/vue-ui` on `@polymorph/vue` |
| a Svelte app | [A Svelte app](#a-svelte-app) | `@polymorph/svelte-ui` on `@polymorph/svelte` |
| a Solid app | [A Solid app](#a-solid-app) | `@polymorph/solid-ui` on `@polymorph/solid` |
| an Angular app | [An Angular app](#an-angular-app) | `@polymorph/angular-ui` on `@polymorph/angular` |
| a page written in HTML: no build, server-rendered, htmx or Turbo | [A page with no build](#a-page-with-no-build) | the `poly-*` elements of `@polymorph/elements-ui`, as files its static directory serves |
| an iOS app | [An iOS app](#an-ios-app) | `PolymorphUI` on `PolymorphTokens`, from `platforms/ios` |
| an Android app | [An Android app](#an-android-app) | `dev.polymorph:ui` on `dev.polymorph:tokens`, from `platforms/android` |
| a Flutter or Dart app | [Dart tokens](#dart-tokens) | `polymorph_tokens`, the tokens only |

Every web app with a build also installs `@polymorph/engine` (the theme engine, the runtime, the
Vite plugin) and `@polymorph/rules` (the red rules), and every member renders with the same
recipes. A page with no build installs nothing: it loads the elements from files in its static
directory. The
system card names what each framework and platform renders: `polymorph init` writes it into the
app for its framework, and the MCP tool `get_system_card` takes a `framework` or a `platform`.

A web app uses the vocabulary in one of two ways. Choose by answering one question: **does your
product want to own the component code, or treat it as a read-only foundation?**

| | **Install** — the packages, read-only | **Vendor** — `polymorph add` |
| --- | --- | --- |
| What lands in your repository | dependency entries and an `.npmrc` | member source, styles and states fixtures, hashed in `polymorph.json` |
| Who owns the components | this repository; your product never edits them | you: read them, change them, `polymorph diff` / `update` |
| A change your product needs | a change here, then a release | an edit to your copy |
| The public surface | each package's `exports` map, nothing deeper | the files that were copied |
| Installed as a package | `@polymorph/engine`, the framework's foundation and vocabulary (which brings `@polymorph/recipes`), `@polymorph/rules` | `@polymorph/engine`, the framework's foundation (which the members import) and `@polymorph/rules`. You install the code that makes design decisions and own the code that renders |

Both are supported in every web framework (`polymorph add --framework <name>` vendors that
framework's members). The red rules apply to your application code either way. The sections
from [One command](#one-command) to [The red rules](#6-the-red-rules) set up a React app; each
framework's own section says what differs.

## One command

For a new app that installs the packages, run `polymorph init` from a checkout of this repository:

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app   # --system pastel for another system
cd my-app && pnpm dev
```

`--framework vue`, `svelte`, `solid` or `angular` writes the app in that framework; the default is
`react`. The directory must be new or empty (a lone `.git` is allowed), and outside any checkout of
polymorph. For React, `init` writes:

| File | What it is |
| --- | --- |
| `package.json` | `@polymorph/engine`, `@polymorph/react` and `@polymorph/react-ui` as npm aliases, React and the system's fonts as dependencies; `@polymorph/rules`, Vite, TypeScript, ESLint and Stylelint as dev dependencies; `dev`, `build`, `lint` and `typecheck` scripts |
| `.npmrc` | the two lines from [Registry access](#1-registry-access). It names `NODE_AUTH_TOKEN` and never holds a token |
| `index.html`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/vite-env.d.ts` | a Vite React app with the theme plugin, as in [A theme](#4-a-theme) |
| `src/theme/<system>.json`, `src/theme/<palette>.json` | a catalogue system (`plain` unless `--system` names another) and the palette it declares |
| `polymorph.eslint.js`, `polymorph.stylelint.js`, `eslint.config.js`, `stylelint.config.js` | the red rules, as in [The red rules](#6-the-red-rules) |
| `.mcp.json` | the MCP server ([tooling.md](tooling.md)), run from the checkout against the app, by an absolute path that belongs to this machine: change it on each machine, or add `.mcp.json` to `.gitignore` |
| `polymorph/system-card.md`, `AGENTS.md`, `CLAUDE.md` | the system card, and what an agent working in the app needs to know: the card is the contract, the MCP tools, screens as specs, `render_screen` to see one drawn (and the one command that downloads its browser), no styles |
| `src/screens/welcome.json`, `src/screens/Welcome.tsx`, `src/App.tsx` | a first screen as a spec, the TSX emitted from it, and the container that renders it |
| `.gitignore`, `.prettierrc.json` | `node_modules` and `dist` ignored; the formatting every file above is written in |

Then it runs `pnpm install --ignore-workspace`, with `NODE_AUTH_TOKEN` from your environment or,
when that is unset, from `gh auth token`, and says when it used the GitHub CLI's token; a token with
only `read:packages` in `NODE_AUTH_TOKEN` is the recommended way. The token is passed in the
environment only. When the install fails, `init` keeps the app and exits 1: with no token, or a
token the registry refuses, it prints `gh auth refresh -s read:packages` and the install command;
when the packages are not published at the app's ranges, it names them and points at the release
steps in CONTRIBUTING.md.
`--no-install` writes the app and skips the install. `--dry-run` lists the files and writes
nothing.

The sections below are the same setup done by hand, for React. Follow them to add polymorph to an
app that already exists. Each framework's own section lists what its `init` writes instead.

## Installing

### 1. Registry access

The packages are published to npmjs.com, as public packages, and to GitHub Packages, under the
`metamorph-labs` org and the same names on both:

| Package | Published as | Installed as |
| --- | --- | --- |
| `@polymorph/engine` | `@metamorph-labs/polymorph-engine` | `@polymorph/engine`, in every web app |
| `@polymorph/rules` | `@metamorph-labs/polymorph-rules` | `@polymorph/rules`, a dev dependency in every web app |
| `@polymorph/recipes` | `@metamorph-labs/polymorph-recipes` | — a dependency of each vocabulary |
| `@polymorph/react` | `@metamorph-labs/polymorph-react` | `@polymorph/react` |
| `@polymorph/react-ui` | `@metamorph-labs/polymorph-react-ui` | `@polymorph/react-ui` |
| `@polymorph/vue` | `@metamorph-labs/polymorph-vue` | `@polymorph/vue` |
| `@polymorph/vue-ui` | `@metamorph-labs/polymorph-vue-ui` | `@polymorph/vue-ui` |
| `@polymorph/svelte` | `@metamorph-labs/polymorph-svelte` | `@polymorph/svelte` |
| `@polymorph/svelte-ui` | `@metamorph-labs/polymorph-svelte-ui` | `@polymorph/svelte-ui` |
| `@polymorph/solid` | `@metamorph-labs/polymorph-solid` | `@polymorph/solid` |
| `@polymorph/solid-ui` | `@metamorph-labs/polymorph-solid-ui` | `@polymorph/solid-ui` |
| `@polymorph/angular` | `@metamorph-labs/polymorph-angular` | `@polymorph/angular` |
| `@polymorph/angular-ui` | `@metamorph-labs/polymorph-angular-ui` | `@polymorph/angular-ui` |

The names come from `PUBLISHED_NAMES` in `packages/registry/src/install.ts`, which
`pnpm publish:packages` and `polymorph init` both read.

`@polymorph/engine` is what a product installs on any web framework: the theme engine and its
laws, the Vite plugin, the theme runtime, the framework-free conventions and, on a subpath, the
motion engine. It contains no React. `@polymorph/react` is the React foundation: it re-exports the
whole engine and adds the icon gateway, the motion presence components and the hooks members are
written with. `@polymorph/react-ui` is the vocabulary. `@polymorph/rules` is the red rules for
your lint configs. `@polymorph/recipes` is every member's styling as CSS Modules source, with no
framework in it. It arrives as the vocabulary's dependency, whose build already contains the
recipes compiled. Add it to your `package.json` only to import one of its files yourself
([Compose](#5-compose)).

GitHub Packages requires the scope to be the owning org, so the registry names differ. You
install the packages under their `@polymorph/*` names with an npm alias, so every import
stays the same.

From npmjs.com, which holds every release from 1.0.16, the aliases install with no
configuration and no token. To install from GitHub Packages instead, point the scope at it in
your repository's `.npmrc`:

```ini
@metamorph-labs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` is a GitHub token with `read:packages`:

- **Locally** — run `gh auth refresh -s read:packages` once, then
  `export NODE_AUTH_TOKEN=$(gh auth token)`.
- **In GitHub Actions** — give the job `permissions: { contents: read, packages: read }` and set
  `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. The workflow's repository must be allowed to
  read the package: on each package's page, *Package settings → Manage Actions access → Add
  repository*.

### 2. Dependencies

```jsonc
// package.json
"dependencies": {
  "@polymorph/engine":   "npm:@metamorph-labs/polymorph-engine@^<version>",
  "@polymorph/react":    "npm:@metamorph-labs/polymorph-react@^<version>",
  "@polymorph/react-ui": "npm:@metamorph-labs/polymorph-react-ui@^<version>",
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
},
"devDependencies": {
  "@polymorph/rules":    "npm:@metamorph-labs/polymorph-rules@^<version>"
}
```

`<version>` is the release's version. Every package carries it and the release tag is
`v<version>`, so the four lines name one number. `polymorph init` writes it for you from the
checkout it runs in. A caret range
takes every minor and patch release automatically. A major release is a breaking change, and the
package's `CHANGELOG.md` says so (what counts as breaking is in
[`.changeset/README.md`](../.changeset/README.md)). The theme engine's source package
(`@polymorph/theme`) is bundled into `@polymorph/engine` and is never installed: import its
exports from `@polymorph/engine`. Your application imports the engine's subpaths (`/vite`,
`/runtime`) by name, so `@polymorph/engine` is a direct dependency even though
`@polymorph/react` brings it too. `@polymorph/rules` is a dev dependency because only your lint
configs load it. `polymorph init` and `polymorph add` put it in `devDependencies` for the same
reason.

### 3. Bundler and styles

The packages ship compiled JavaScript, one module per component, and each component imports its
own stylesheet. Importing `Button` brings Button's CSS, and members you do not use bring none.
Each member's stylesheet module imports the base layer before its own rules: the reset and the
border-box baseline. `Icon`, in `@polymorph/react`, brings its stylesheet the same way. There is
no stylesheet to import by hand. An entry point only re-exports, so a bundler that follows a name
through `@polymorph/react-ui` to the member's module loads that member and nothing else.

Do not import `@polymorph/recipes/base.css` as well, and do not add `@polymorph/recipes` to your
dependencies for it. The vocabulary's build carries its own compiled copy of the base layer, so a
second import loads the reset twice. The copy in your own `@polymorph/recipes` can also be a
different version from the one the vocabulary was built with.

With Vite, make sure there is only one copy of React (step 4 adds the theme plugin to this
config):

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
})
```

`@polymorph/react/style.css` names Icon's stylesheet. No application needs to import it, because
`Icon` brings it, and an application that does import it loads the file once.

A vendored install ([Vendoring](#vendoring)) compiles the members' recipes with its own bundler,
and a recipe does not import the base layer, so the install imports its own copy,
`<dir>/base.css`. The theme module `polymorph add` generates for an install with a theme imports
`<dir>/base.css`. An app that does not import that module, because its theme comes from the Vite
plugin or from a module of its own, imports `<dir>/base.css` once from its entry.

Tests and server renders need no configuration. Node cannot import a `.css` file, so a built
module imports its stylesheet through the package's `imports` map
(`#stylesheet/controls/button.css`), which resolves by condition. A bundler gets the stylesheet.
Node gets an empty module, and Vitest and a server render hand `node_modules` to Node, so a
Vitest suite or a server render that imports `@polymorph/react-ui` needs no `server.deps.inline`
or `ssr.noExternal` entry. Each module is built once, whichever condition a toolchain resolves an
entry point by. The server and the browser therefore run the same modules and render the same
class names, and the page's stylesheets come from the browser bundle. In Node no member
stylesheet loads at all, so a test that reads computed styles runs in Vitest's browser mode
([Testing your screens](#testing-your-screens)).

Every state of every member renders on a server, with no browser global and no effect:
`packages/react-ui/server-render.test.ts` renders each states fixture from the published build
with `react-dom/server`, in plain Node. A framework that renders React Server Components resolves
the map by its `react-server` condition, which names the stylesheet, so a member that only a
server component imports brings its styles too. Such a framework bundles what it resolves. Plain
Node started with `--conditions react-server` is handed a stylesheet, which it cannot load.
Next.js's App Router is held by `pnpm gate:next` on Turbopack, on webpack and on the development
server ([A Next.js app](#a-nextjs-app)).

### 4. A theme

Members read `--pm-*` tokens, so a pairing must be installed before anything renders
correctly. Provide a system and a palette as JSON: your own, or a copy of one in
[`design/systems/`](../design/systems) and [`design/palettes/`](../design/palettes). Compile
them at build time with the Vite plugin from `@polymorph/engine/vite`. It admits them only if
they pass the same laws as the house pairings:

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { polymorphTheme } from '@polymorph/engine/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    polymorphTheme({
      systems: ['design/system.json'],
      palettes: ['design/palette.json', 'design/night.json'],
    }),
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
})
```

```ts
// src/main.tsx, before React renders: the stylesheet, the fonts, and the stored choice
import 'virtual:polymorph/theme'
```

```ts
// src/vite-env.d.ts, once: types for the virtual module
/// <reference types="@polymorph/engine/vite-env" />
```

What the plugin does:

- **Compiles at build time**, and again in dev whenever a listed system or palette file changes.
  A pairing that fails a law fails the build, with the law's own message.
- **One main stylesheet** holds every system paired with its own default palette.
  `virtual:polymorph/theme` imports it, imports the font packages the pairings name (install
  them; `polymorph theme validate` lists them, and `fonts: false` leaves the imports to you), and
  calls `hydrateTheme`, which applies a stored choice.
- **Every other pairing** compiles to its own small stylesheet, loaded the first time it is
  chosen by `ensurePairing(system, palette)`.
- **`index.html`** gets the default `data-system` and `data-palette` on `<html>` and the
  pre-paint script inlined at the top of `<head>`. A first visit therefore renders with the
  default theme from the first paint, and a returning visit renders with its stored choice.

| Option | Default | Meaning |
| --- | --- | --- |
| `systems` | required | paths to the system documents, relative to the Vite root |
| `palettes` | required | paths to the palette documents; each system's `defaultPalette` must be among them |
| `defaultSystem` | the first of `systems` | the system used on a first visit |
| `pairings` | `'all'` | which other pairings to compile: every system × palette, or a list of `{ system, palette }` |
| `fonts` | `true` | import each pairing's font packages from the theme module |

Switching changes attributes on `<html>`. `@polymorph/engine/runtime` contains the setters and
none of the theme engine's derivation code (no `zod`, no `culori`). Await `ensurePairing` before
changing either attribute:

```ts
import { setMode, setPalette, setSystem } from '@polymorph/engine/runtime'
import { ensurePairing } from 'virtual:polymorph/theme'

await ensurePairing('pastel', 'orchid') // loads the pairing's sheet unless the main one has it
setSystem('pastel')
setPalette('orchid')
setMode('dark')
```

A page that lets the reader choose the mode uses a `ModeSwitch`, or Menu and command entries that
read `useMode` from the foundation and call `setMode`
([theming.md](theming.md#offering-the-mode)).

`virtual:polymorph/theme` exports three names, typed by `@polymorph/engine/vite-env`:

| Export | What it is |
| --- | --- |
| `catalogue` | `{ systems, palettes }`: each listed system mapped to its default palette, and the name of every listed palette. A theme picker reads its choices from it instead of repeating the plugin's lists. The theme module checks a stored choice against it, so a stored name that was renamed or removed falls back to the default |
| `defaultSystem` | the system a first visit wears: the `defaultSystem` option, or the first of `systems` |
| `ensurePairing(system, palette)` | loads a pairing's stylesheet unless the main one has it, and resolves when it has loaded |

```ts
import { getSystem, setPalette } from '@polymorph/engine/runtime'
import { catalogue, defaultSystem, ensurePairing } from 'virtual:polymorph/theme'

export const paletteChoices = catalogue.palettes

export async function choosePalette(palette: string) {
  await ensurePairing(getSystem() ?? defaultSystem, palette)
  setPalette(palette)
}
```

`ensurePairing` also resolves at once for a pairing the build did not compile. The page then
matches no theme block, and no `--pm-*` token resolves. `catalogue.palettes` names every listed
palette even when `pairings` is a list, so with a list, offer a palette on a system only when the
list names that pairing or the palette is the system's default.

The application ships stylesheets and a few hundred bytes of runtime: no `zod`, no `culori`, no
derivation code. If you do not use Vite, `polymorph add theme:<system>` compiles the same sheets
into your repository at install time and works with any bundler ([Vendoring](#vendoring)).

**Themes known only at run time**, such as one per tenant fetched after load, are admitted in the
browser instead:

```ts
import { admitTheme, installThemeCSS, setPalette, setSystem } from '@polymorph/engine'

const admission = admitTheme({ system, palette }) // two parsed JSON documents
if (!admission.lawful) {
  throw new Error(admission.faults.map((fault) => `${fault.law}: ${fault.message}`).join('\n'))
}
installThemeCSS(admission.css)
setSystem(admission.system.name)
setPalette(admission.palette.name)
// admission.fonts names the @fontsource packages to install and import.
```

That path ships the theme engine to every visitor: `zod`, `culori` and the derivation code, which
`pnpm size` holds to the `runtime-engine` fixture's ceiling of 53 kB of gzipped JavaScript
(`scripts/size/budgets.json`). Use it for themes a build
cannot know, alongside compiled ones if you have both. On this path, inline `PREPAINT_SCRIPT` in
`<head>` yourself, so the theme and light/dark mode resolve before first paint.
[theming.md](theming.md) explains systems, palettes, modes and the laws.

**Values the theme does not derive.** Every `--pm-*` value comes from the system and palette
documents, and the admission laws check it there. Application CSS does not declare a `--pm-*`
property, select on `data-system`, `data-palette`, `data-mode`, `data-density`, `data-tone`,
`data-motion` or `data-member`, or set the root's font size. Such a rule applies after admission, so
no law checks it. A pinned fill can fail the contrast floor, and a focus style written there is held
to no visibility law. A root font size below 100% takes text entry below 16px, and iOS zooms the
page when a field under 16px takes focus. A decision the derivation does not make belongs in the
documents instead:

- exact accent fills, their label and the focus colours are the palette's `pins`
  ([theming.md](theming.md#pins));
- a scale step, a focus width, a field's focus drawn at its border, outline and ghost Buttons
  without a hover wash, and one member's exception go in the system's `overrides`
  ([theming.md](theming.md#scale-amendments-overrides));
- the palette a reader who asks for more contrast gets is the palette's `moreContrast`
  ([theming.md](theming.md#more-contrast)).

The base itself is the system's `overrides.type.base`, and the text-entry floor
(`--pm-text-entry-size`) stays at 16px or the base, whichever is larger, so a smaller base never
puts a field under it; only a root font size would. A decision neither document can hold is a gap
to report ([concepts.md](concepts.md#how-the-system-changes)), not a
stylesheet to write.

### 5. Compose

```tsx
import { Button, Stack, PageHeader } from '@polymorph/react-ui'
```

| Entry point | What it is |
| --- | --- |
| `@polymorph/react-ui` | the whole vocabulary |
| `@polymorph/recipes/base.css` | the reset and border-box baseline. Each member in `@polymorph/react-ui` imports the vocabulary's own compiled copy, so an app that installs the vocabulary never imports this file ([Bundler and styles](#3-bundler-and-styles)) |
| `@polymorph/recipes/<tier>/<file>.module.css` | one member's recipe as CSS Modules source, for a member you write for another framework. Your bundler compiles it. `@polymorph/react-ui` already contains every recipe, compiled |
| `@polymorph/react-ui/identity` | the subset for sign-in and sign-up surfaces, so an auth bundle carries no charts or tables |
| `@polymorph/react-ui/identity-signup` | the heavier controls a sign-up step loads only when it needs them |
| `@polymorph/react-ui/galleries` | every member's states fixture — for your own gallery or visual tests |
| `@polymorph/react` | the React foundation: everything `@polymorph/engine` exports, plus the icon gateway (`Icon`, `BrandMark`) and the conventions members are written with |
| `@polymorph/react/style.css` | Icon's stylesheet, which `Icon` imports itself. No application needs this entry |
| `@polymorph/engine` | the theme engine (including runtime admission) and runtime, the framework-free conventions, the icon role data — no React |
| `@polymorph/engine/runtime` | the theme runtime alone — `setSystem`, `setPalette`, `setMode`, `hydrateTheme`, `PREPAINT_SCRIPT`, `DATA_ATTRS` and the rest — with none of the theme engine's derivation code (no `zod`, no `culori`) |
| `@polymorph/engine/motion` | the motion engine, with no framework in it — for member internals, not application code ([motion.md](motion.md)) |
| `@polymorph/engine/qr`, `@polymorph/engine/charts`, `@polymorph/engine/markdown` | the helpers one member family draws with, with no framework in them: the QR encoder, the chart engine (the chart grammar, the scales and paths over `d3-scale`, `d3-array` and `d3-shape`, each chart member's model and the frame's state machines), and the Markdown parser. Off the root, so an application that imports the engine for its theme does not load them; every foundation re-exports them |
| `@polymorph/engine/agent` | the agent bridge: `createAgentBridge`, which reports the mounted members' declared states and runs their declared actions for an agent, `agentTools`, the same as three tools for an application's own agent, and `registerWebMCP`, which registers those tools with the browser's WebMCP API where it has one. Off the root, so a page that creates no bridge does not ship it; the root keeps only the list of mounted members it reads |
| `@polymorph/engine/webmcp` | the bridge's tools registered before the bridge is loaded: `registerWebMCPOnCall(load, options)`, which registers the three tools at once and calls `load` (`() => import('@polymorph/engine/agent')`) on the first call, and `applyAgentSetting`, which does what a page's `<html data-agent>` says. It holds none of the bridge ([agents.md](agents.md#tools-and-webmcp)) |
| `@polymorph/react/motion` | the React presence components and the motion bindings members are written with — for member internals, not application code ([motion.md](motion.md)) |
| `@polymorph/engine/vite` | `polymorphTheme`, the Vite plugin that compiles themes at build time (`vite` is an optional peer, `>=6`) |
| `@polymorph/engine/vite-env` | types only: `virtual:polymorph/theme` (`catalogue`, `defaultSystem`, `ensurePairing`), referenced once from a `.d.ts` |
| `@polymorph/engine/testing` | `installTestTheme`, `fixedWidthHost` — a real theme under a component test ([Testing your screens](#testing-your-screens)) |
| `@polymorph/rules/eslint`, `@polymorph/rules/stylelint` | the red rules, for your lint configs |

A focused entry point exports a **subset of the root's names and nothing else**, so moving an
import between them never changes what a name means. Deep imports
(`@polymorph/react-ui/src/…`) are not part of the public API and cannot be resolved.
`packages/react-ui/consumption.test.ts` checks both guarantees.

A timestamp in your own JSX is a `RelativeTime`, which writes the distance from now, the moment
itself or both (`mode`). Where a member takes text you format, such as Timeline's `time`, write
it with `relativeTimePhrase(value, { mode, format, locale })` from `@polymorph/engine`, which every
foundation re-exports: it returns RelativeTime's words for the same props
([relative-time.md](../design/components/relative-time.md)).

### 6. The red rules

Add the rules to your own lint config so your application code follows the same rules as
this repository's apps:

```js
// eslint.config.js
import polymorph, {
  fixableRawControls,
  parser,
  stageOneRules,
  stageTwoRules,
} from '@polymorph/rules/eslint'

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { polymorph },
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { ...stageOneRules, ...stageTwoRules, ...fixableRawControls },
  },
]
```

The Stylelint rules are in `@polymorph/rules/stylelint`. `applicationRules` is the half for your
own stylesheets: no motion, no `--pm-*` token declared, no selector on the theme's attributes
(`data-system`, `data-palette`, `data-mode`, `data-density`, `data-tone`, `data-motion`) or on
`data-member`, and no font size on the root. A value the theme does not give you belongs in your
system or palette document ([theming.md](theming.md)), not in a stylesheet that overrides it.

```js
// stylelint.config.js
import polymorph, { applicationRules } from '@polymorph/rules/stylelint'

export default {
  plugins: [...polymorph],
  rules: { ...applicationRules },
}
```

`polymorph init` writes this half as `polymorph.stylelint.js`, with `no-ghost-tokens` and the list
of tokens your theme emits. [rules.md](rules.md) lists every rule, what it forbids, and the
exception ladder that answers it.

`no-raw-styles` and `no-app-css` in ESLint and `token-values-only` in Stylelint report a raw value
with the token nearest it when the config gives them your theme's values. Each takes a `values`
option, which holds the value each token has in your theme's default mode at the system's own density, in
six families (`color`, `space`, `radius`, `text`, `size`, `duration`), each a map from a `--pm-*`
property to its value. With it, `padding: '12px'` is reported as `--pm-space-4` and `p={4}`, and
`#0089ea` as the colour role nearest it. Without it, the report names the token family (`p={…}`)
instead of the step.

```js
const values = {
  color: { '--pm-accent-bg': '#0089ea' /* , … */ },
  space: { '--pm-space-4': '12px' /* , … */ },
}

// the rules of the ESLint block above
const rules = {
  ...stageOneRules,
  ...stageTwoRules,
  ...fixableRawControls,
  'polymorph/no-raw-styles': ['error', { values }],
  'polymorph/no-app-css': ['error', { values }],
}
```

`token-values-only` takes the same object, as `[true, { values }]`. `polymorph add` and
`polymorph update` write the values into the config fragments they generate
([Vendoring](#vendoring)), read from the first pairing in the theme sheet they compile. An install
with no system has an empty sheet: an app that builds its theme at run time and vendors none, or
one that vendors a palette alone. Its fragments carry the registry's `tokenValues` for `plain`,
the system `polymorph init` defaults to, and their header says so. A report then names the token
nearest the raw value in `plain` with its own palette. That is the right space step for a theme
at standard density. For a colour, a radius, a size or a duration it can be a different token
than your own theme's nearest. `polymorph init` writes the registry's `tokenValues` for the system it
installs, because its theme is compiled by the Vite plugin at build time, after the fragments are
written. In a repository
laid out like this one, `tokenValues(root)` from `@polymorph/rules/stylelint/emitted` builds them
from the first system in `design/systems/` and its default palette, which needs
`@polymorph/engine`.

Three of the rules can fix a violation that has exactly one lawful rewrite: a `className` on a
member, a `lucide-react` glyph the icon map names, and a text-only `<button>`. Run
`eslint --fix` before reading the report. `fixableRawControls` turns on the `<button>` fix. It
tells the rule that members are imported from `@polymorph/react-ui`, which is true of a
repository that installs the packages and not of one that vendors them.
[rules.md](rules.md#what-the-rules-fix) says what each fix rewrites and what it leaves.

To run the rules without a lint config, or before you write one, run `polymorph check` from a
checkout of this repository, in your app's root:

```sh
node ../polymorph/packages/cli/bin/polymorph.js check src
```

It reads every `.ts`, `.tsx`, `.vue`, `.svelte`, `.html` and `.css` file below the directory as
application code, through the same `verify` that the MCP server's `validate` calls, and prints each
violation by file and rule with the rungs that answer it. It exits 1 on any violation, and
`--json` prints the report as data. [tooling.md](tooling.md#check) says what it reads.

### 7. A component from another library

The vocabulary draws no map, rich-text editor or data grid. Host one from the library you choose
inside the `ThirdParty` boundary, which names the package and gives a reason:

```tsx
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { useThemeValues } from '@polymorph/react'
import { ThirdParty } from '@polymorph/react-ui'

<ThirdParty library="leaflet" reason="Depot map: no member pans and zooms over places.">
  <div ref={host} style={{ height: '320px', background: 'var(--pm-bg-subtle)' }} />
</ThirdParty>
```

The boundary hosts the library because the file imports a binding from it (`L`). A boundary whose
library the file does not import lifts nothing, and lint reports it. The file may then import that
library's stylesheet, and the element inside the boundary takes a `style` written in place, as an
object or as text. Lint reads that `style` for colour, so one whose property names are not written
out (`style={styles}`) is refused there. A library styled by CSS reads the theme as `var(--pm-…)`. One that takes colours and sizes in JavaScript reads them from `useThemeValues()`,
which returns new values when the pairing, the mode or the density changes. Controls and icons
beside the hosted component are still members, and no colour is written.
[rules.md](rules.md#rung-4-another-librarys-component) says what the boundary lifts and keeps.
`collectExceptions` and `hostedLibraries` from `@polymorph/rules/inventory` list the libraries an
app hosts, as `pnpm inventory` does in this repository.

## Right-to-left

A product in a right-to-left language says so once, with `dir="rtl"` on `<html>` (or on
`<body>`). Every member in every web framework follows it, the elements included. A recipe mirrors because it is
written in logical properties. A member also hands the document's direction to the substrate it
is built on, so the arrow keys, a Slider's track, a submenu's side and a Tabs strip turn with
the page. A member already on the page follows a change to the attribute.

The direction is the document's. A member inside an element whose `dir` differs from the
document's follows the document, and a direction set only in CSS is not read. Each foundation
exports `useDirection`, which returns the direction and keeps it current. On iOS and Android
the members follow the platform's layout direction.

## Routing

The vocabulary has no router. Link, `AppShell.NavItem`, Breadcrumbs, SectionNav and `List.Item`
draw real `<a href>` elements, so in an app without a router each click loads a new page. An app with a client-side
router passes the same function as `onNavigate` to each of them. A click that would navigate the
current tab then calls `onNavigate(href)` instead, with the browser's navigation already stopped.
A click with a modifier key or another button, and a click on an `external` Link, stay the
browser's, so a reader can still open a link in a new tab
([link.md](../design/components/link.md#routing)). The root route renders one AppShell, which stays
mounted from page to page, and each route renders a page archetype inside it
([app-shell.md](../design/archetypes/app-shell.md#routing)).

The pagers take addresses too: Pagination's `getPageHref(page)`, and CursorPagination's
`previousHref` and `nextHref`. With them, each control that goes to another page is a real
`<a href>`, so a crawler reaches the list's later pages and a reader can open one in a new tab. A
click that would navigate the current tab calls the pager's own handler (`onPageChange`,
`onPrevious`, `onNext`) instead, with the browser's navigation already stopped, so the app changes
the page as it does without addresses. A click with a modifier key opens the address
([pagination.md](../design/components/pagination.md#behavior)).

With TanStack Router:

```tsx
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { AppShell } from '@polymorph/react-ui'

/** The app's router, as every member link takes it. */
export function useRoute(): (href: string) => void {
  const navigate = useNavigate()
  return (href) => void navigate({ href })
}

export function Root() {
  const route = useRoute()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pending = useRouterState({ select: (state) => state.status === 'pending' })

  return (
    <AppShell
      sidebar={
        <AppShell.NavItem
          icon="inbox"
          label="Tickets"
          href="/tickets"
          current={pathname.startsWith('/tickets')}
          onNavigate={route}
        />
      }
      transitionKey={pathname}
      pending={pending}
    >
      <Outlet />
    </AppShell>
  )
}
```

With React Router (`react-router` 7, or `react-router-dom` 6 with a data router):

```tsx
import { Outlet, useLocation, useNavigate, useNavigation } from 'react-router'
import { AppShell } from '@polymorph/react-ui'

export function useRoute(): (href: string) => void {
  const navigate = useNavigate()
  return (href) => void navigate(href)
}

export function Root() {
  const route = useRoute()
  const { pathname } = useLocation()
  const pending = useNavigation().state !== 'idle'

  return (
    <AppShell
      sidebar={
        <AppShell.NavItem
          icon="inbox"
          label="Tickets"
          href="/tickets"
          current={pathname.startsWith('/tickets')}
          onNavigate={route}
        />
      }
      transitionKey={pathname}
      pending={pending}
    >
      <Outlet />
    </AppShell>
  )
}
```

A page passes the same function to its own links: `<Link href={ticketHref} onNavigate={route}>`,
and `<Breadcrumbs items={trail} onNavigate={route} />` in the topbar or the page. The links between a
section's sibling pages are one member, which marks the page the reader is on:
`<SectionNav label="Identity sections" items={sections} current={sectionHref} onNavigate={route} />`.
The app passes `current`, because which paths belong to a section is the router's knowledge. In the other web frameworks the prop is that framework's event: `@navigate` in Vue (with
Vue Router's `router.push`), `onNavigate` in Svelte (SvelteKit's `goto`) and in Solid
(`@solidjs/router`'s `useNavigate()`), and `(navigate)` in Angular (`router.navigateByUrl`). The
SwiftUI and Compose members take `onNavigate` too, and call it where they would open the link.

## A Next.js app

The React packages run in Next.js's App Router, built by Turbopack or by webpack.
`pnpm gate:next` builds an App Router application (`scripts/next-app/`) from the published builds
and holds what this section says ([verification.md](verification.md#the-nextjs-gate)). The
application installs the packages in [Dependencies](#2-dependencies) and `next`. It differs from
a Vite application in where the theme is compiled, where it is installed, what a server
component may pass to a member, and one line of config for webpack.

**The theme is compiled at install time.** The engine's Vite plugin does not run in a Next.js
build, so `polymorph add` compiles the pairing into the repository:

```sh
node ../polymorph/packages/cli/bin/polymorph.js add theme:plain
```

It writes the compiled sheet, the base layer and a theme module under `src/polymorph/themes/`,
adds the system's font packages to `package.json`, and writes the lint fragments and links them
into the application's ESLint config ([Vendoring](#vendoring)). A Next.js application has no
`index.html` and no entry module, so the install leaves two steps to the root layout, and says
so:

```tsx
// app/layout.tsx, a server component
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

- `data-system` and `data-palette` name the pairing the install compiled, so the server's markup
  matches a theme block before any script runs.
- The pre-paint script is inline in `<head>`. It applies the reader's stored pairing, mode,
  density and motion before the first paint, and the system's light or dark setting when no mode
  is stored. It therefore writes attributes on `<html>` that the server did not render, and
  `suppressHydrationWarning` says so. The attribute covers that one element and nothing below it.
- The theme module is where the stylesheets enter the build: it imports the compiled sheet, the
  base layer and the fonts. A client component imports it, and Next.js links those stylesheets
  from every page under the layout. Do not import them in `app/layout.tsx` instead: a CSS import
  in application code is a `polymorph/no-app-css` report.
- `installThemes()` reads `document` and the stored choices, so it runs in an effect. It replaces
  a stored system or palette the install no longer has, and keeps the mode following the
  system's setting.
- A Tooltip needs a `TooltipProvider` above it, as in any React application. The provider is a
  client member, and a server layout renders it.

Each member in the installed vocabulary imports the vocabulary's copy of the base layer, and the
theme module imports the install's. The two hold the same rules, so the page reads the reset
twice and nothing changes.

**Server components and client components.** A member that holds state or reads the browser
carries `'use client'`, and the others (Stack, Heading, Text, Badge, Sparkline) do not. A server component imports either kind from `@polymorph/react-ui` and renders it, and the
member's stylesheet reaches the page in both cases. What a server component may pass is React's
rule, not polymorph's:

- Text, numbers, plain data and elements pass. An element may be another member: a FormField's
  control, a Dialog's or a Popover's `trigger`, a SettingsRow's `control`. The member reads the
  element it is passed, while the element's own module is still loading too.
- A compound member's parts (`Tabs.Content`, `Table.Row`, `Avatar.Group`, `AppShell.NavItem`) are
  readable in a server component.
- A function does not pass. A member that takes one is rendered from a client component of the
  application: a handler (`onClick`, `onValueChange`, `onNavigate`), a DataTable column's `cell`,
  a Menu item's `onSelect`. So is a member the application controls with its own state.

```tsx
// app/tickets/page.tsx, a server component: it loads the data
import { Tickets } from './tickets'

export default async function Page() {
  return <Tickets rows={await loadTickets()} />
}
```

```tsx
// app/tickets/tickets.tsx: the members that take functions
'use client'

import { Badge, DataTable, ListPage } from '@polymorph/react-ui'
import { useState } from 'react'

const none = { title: 'No tickets', description: 'Nothing is in the queue.' }

export function Tickets({ rows }: { rows: Ticket[] }) {
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  return (
    <ListPage title="Tickets" empty={rows.length === 0} emptyState={none}>
      <DataTable
        label="Tickets"
        data={rows}
        columns={[
          { key: 'subject', header: 'Subject' },
          { key: 'status', header: 'Status', cell: (row) => <Badge>{row.status}</Badge> },
        ]}
        getRowId={(row) => row.id}
        selection={selection}
        onSelectionChange={setSelection}
        emptyState={none}
      />
    </ListPage>
  )
}
```

**webpack needs one line.** Turbopack follows a name through `@polymorph/react-ui`'s entry point
to the member's own module. webpack does that for a Next.js build only when the package is
listed:

```ts
// next.config.ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: { optimizePackageImports: ['@polymorph/react-ui'] },
}

export default config
```

Without it a webpack build still renders correctly, and every page loads the JavaScript and the
CSS of the whole vocabulary.

**Routing.** `useRouter` from `next/navigation` gives the function the members' `onNavigate`
takes ([Routing](#routing)). It is a function, so the link is in a client component:

```tsx
'use client'

import { Link } from '@polymorph/react-ui'
import { useRouter } from 'next/navigation'

export function TicketLink({ href, subject }: { href: string; subject: string }) {
  const router = useRouter()
  return (
    <Link href={href} onNavigate={(to) => router.push(to)}>
      {subject}
    </Link>
  )
}
```

A Link without `onNavigate` is a plain `<a href>`, which a server component can render, and a
click on it loads a new document.

**The red rules.** `polymorph add` links `polymorph.eslint.js` into the flat config the
application has (`eslint.config.mjs` from `create-next-app`, or `eslint.config.js`), and its
application block reads every `.ts` and `.tsx` file, `app/` included. Keep Next.js's output out
of it:

```js
// eslint.config.js
import polymorph from './polymorph.eslint.js'

export default [...polymorph, { ignores: ['.next/', 'next-env.d.ts'] }]
```

## A Vue app

The members the Vue framework map (`design/frameworks/vue.json`) marks native ship for Vue as
`@polymorph/vue-ui`, single-file components generated from the member descriptions in
[shells.md](shells.md) and built on `@polymorph/vue` (the icon gateway, motion and the theme),
with the same engine, recipes and red rules; a member the map marks absent names there what it
lacks. [frameworks.md](frameworks.md) has the React-to-Vue mapping: a prop keeps its name, `onFoo`
is the event `@foo`, a node-typed prop is the slot `#foo`, and `children` is the default slot.

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework vue
```

`init --framework vue` writes the app above in Vue: `vue`, `@polymorph/engine`, `@polymorph/vue`
and `@polymorph/vue-ui` as dependencies, `@vitejs/plugin-vue` beside the engine's Vite plugin, a
`vue-tsc` typecheck, an `App.vue` container and the welcome screen emitted as `Welcome.vue`. Its
`package.json` installs `@polymorph/vue` and `@polymorph/vue-ui` as aliases of
`@metamorph-labs/polymorph-vue` and `@metamorph-labs/polymorph-vue-ui`, published beside the React
packages by `pnpm publish:packages`.

By hand, the Vite config adds the Vue plugin before the theme plugin:

```ts
import { polymorphTheme } from '@polymorph/engine/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    polymorphTheme({ systems: ['src/theme/plain.json'], palettes: ['src/theme/neutral.json'] }),
  ],
})
```

and the lint config reads `.vue` files with `vue-eslint-parser`, a dev dependency, so the red rules
govern templates too:

```js
// eslint.config.js
import polymorph, { allRules, parser } from '@polymorph/rules/eslint'
import vueParser from 'vue-eslint-parser'

export default [
  {
    files: ['src/**/*.vue'],
    plugins: { polymorph },
    languageOptions: { parser: vueParser, parserOptions: { parser, extraFileExtensions: ['.vue'] } },
    rules: allRules,
  },
]
```

`fixableRawControls` is left out: its fixes write TSX. The rule that removes a `class` or `style`
from a member works in a template without it. A screen emits as a single-file component with
`pnpm emit <spec.json> <out.vue>` or the MCP tool `emit_screen` with a `.vue` path, and
`polymorph add --framework vue` vendors members as single-file components
([frameworks.md](frameworks.md#vendoring-vue-members-polymorph-add---framework-vue)).

## A Svelte app

The members `design/frameworks/svelte.json` marks native ship for Svelte 5 as
`@polymorph/svelte-ui`, components generated from the same member descriptions and built on
`@polymorph/svelte`, with the same engine, recipes and red rules. A prop keeps its React name and
type: a callback is the prop `onFoo`, a node-typed prop is the snippet `foo`, and `children` is the
content between a member's tags ([frameworks.md](frameworks.md#from-react-to-svelte)).

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework svelte
```

`init --framework svelte` writes the app above in Svelte: `svelte`, `@polymorph/engine`,
`@polymorph/svelte` and `@polymorph/svelte-ui` (aliases of `@metamorph-labs/polymorph-svelte` and
`@metamorph-labs/polymorph-svelte-ui`) as dependencies, `@sveltejs/vite-plugin-svelte` beside the
engine's Vite plugin, a `svelte-check` typecheck, an `App.svelte` container and the welcome screen
emitted as `Welcome.svelte`.

By hand, the Vite config adds `svelte()` before the theme plugin, and the lint config reads
`.svelte` files with `svelte-eslint-parser`, a dev dependency, so the red rules govern the markup
too:

```js
// eslint.config.js
import polymorph, { allRules, parser } from '@polymorph/rules/eslint'
import svelteParser from 'svelte-eslint-parser'

export default [
  {
    files: ['src/**/*.svelte'],
    plugins: { polymorph },
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser, extraFileExtensions: ['.svelte'] },
    },
    rules: allRules,
  },
]
```

`fixableRawControls` is left out: its fixes write TSX. A screen emits as a Svelte component with
`pnpm emit <spec.json> <out.svelte>` or the MCP tool `emit_screen` with a `.svelte` path, and
`polymorph add --framework svelte` vendors members as Svelte components
([frameworks.md](frameworks.md#vendoring-svelte-and-solid-members)). The Svelte packages publish
their components as source under the `svelte` export condition, so the app's Svelte compiles them.

An app that renders on the server has two limits. A member that reads its slot as it is made mounts
the slot to read it (FormField, ChatThread and Avatar.Group read what it holds; CodeBlock, Markdown
and StreamingText read its text), and a mount inside a hydration reads the server's markup as its
own. So the app mounts its root in the browser instead of hydrating it. SvelteKit hydrates by
default, so a SvelteKit app sets `export const ssr = false` on the routes that render members. And
outside Vite, FormField, ChatThread, CodeBlock, Markdown and StreamingText render on the server as if
their slots were empty, and so do the members built on them; under Vite the server render reads
their slots first ([shells.md](shells.md#the-svelte-renderer)).

## A Solid app

The members `design/frameworks/solid.json` marks native ship for Solid as `@polymorph/solid-ui`,
built on `@polymorph/solid`, with the same engine, recipes and red rules. A prop keeps its React
name and type, a node-typed prop takes a `JSX.Element`, and a component reads its props as
`props.foo` without destructuring them ([frameworks.md](frameworks.md#from-react-to-solid)).

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework solid
```

`init --framework solid` writes the app above in Solid: `solid-js`, `@polymorph/engine`,
`@polymorph/solid` and `@polymorph/solid-ui` (aliases of `@metamorph-labs/polymorph-solid` and
`@metamorph-labs/polymorph-solid-ui`) as dependencies, `vite-plugin-solid` beside the engine's Vite
plugin, a `tsc` typecheck with Solid's JSX types (`"jsx": "preserve"`,
`"jsxImportSource": "solid-js"`), an `App.tsx` container and the welcome screen emitted as Solid's
`Welcome.tsx`. Both Solid packages publish a `solid` condition (JSX source, which the app's
compiler builds), a compiled DOM form for `browser` and `import`, and a server form for `node`.

By hand, the Vite config adds `solid()` before the theme plugin, and the lint config tells the
rules its TSX is Solid's, so `class` and `classList` read as class props, `onclick` and `on:click`
as handlers, and a raw `<button>` is fixed as `Button` from `@polymorph/solid-ui`:

```js
// eslint.config.js
import polymorph, {
  allRules,
  fixableSolidControls,
  parser,
  solidSettings,
} from '@polymorph/rules/eslint'

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { polymorph },
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: solidSettings,
    rules: { ...allRules, ...fixableSolidControls },
  },
]
```

A file that imports `solid-js` reads as Solid without the settings. A screen emits as Solid TSX
with `pnpm emit <spec.json> <out.tsx> --framework solid` or the MCP tool `emit_screen` with
`framework: "solid"`, and `polymorph add --framework solid` vendors the Solid members
([frameworks.md](frameworks.md#vendoring-svelte-and-solid-members)).

## An Angular app

The members `design/frameworks/angular.json` marks native ship for Angular 22 as
`@polymorph/angular-ui`, standalone components generated from the same member descriptions and
built on `@polymorph/angular`, with the same engine, recipes and red rules. A prop is an input of
its React name and type (`label="Save"`, `[gap]="4"`, and a boolean always bound,
`[iconOnly]="true"`). A callback `onFoo` is the output `foo` (`(click)="save()"`). A node-typed
prop is content marked `slot="foo"`, and `children` is the content between a member's tags. A
member is listed in the component's `imports` and written by its selector (`<pm-button>`)
([frameworks.md](frameworks.md#from-react-to-angular)).

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-app --framework angular
```

`init --framework angular` writes the app above in Angular. Its dependencies are `@angular/core`,
`@angular/common`, `@angular/compiler`, `@angular/platform-browser`, `rxjs`, `tslib`,
`@polymorph/engine`, and `@polymorph/angular` and `@polymorph/angular-ui` (aliases of
`@metamorph-labs/polymorph-angular` and `@metamorph-labs/polymorph-angular-ui`). It adds
`@analogjs/vite-plugin-angular` beside the engine's Vite plugin, compiling ahead of time, and
TypeScript 6.0, which Angular's compiler requires. The typecheck is
`ngc -p tsconfig.json --noEmit` with `strictTemplates`. The app also gets an `app-root` container
in `src/app.ts`, bootstrapped without zone.js, and the welcome screen emitted as the standalone
component `src/screens/welcome.ts`. Both Angular packages publish Angular Package Format flat
modules (`dist/fesm2022`) with partial declarations, which the build links as it links Angular's
own packages.

The vocabulary's base layer is a stylesheet of its own, `@polymorph/angular-ui/base.css`, because
the Angular CLI compiles no stylesheet a module imports. A Vite app imports it from the entry after
the theme module. An Angular CLI app lists it in `angular.json`'s `styles`. For the same reason an
Angular CLI app installs the package and vendors nothing: a vendored member imports its recipe as a
CSS Module, which only the Vite build compiles
([frameworks.md](frameworks.md#vendoring-angular-members)).

By hand, the Vite config adds `angular({ tsconfig: './tsconfig.json', jit: false })` before the
theme plugin. The lint config reads every module as Angular, extracts each component's inline
template with `@angular-eslint/eslint-plugin-template`, and reads templates with
`@angular-eslint/template-parser`. Both are dev dependencies, and with them the red rules govern
the templates too:

```js
// eslint.config.js
import polymorph, { allRules, angularSettings, parser } from '@polymorph/rules/eslint'
import angularTemplate from '@angular-eslint/eslint-plugin-template'
import templateParser from '@angular-eslint/template-parser'

export default [
  {
    files: ['src/**/*.ts'],
    plugins: { polymorph },
    languageOptions: { parser },
    processor: angularTemplate.processors['extract-inline-html'],
    settings: angularSettings,
    rules: allRules,
  },
  {
    files: ['src/**/*.html'],
    plugins: { polymorph },
    languageOptions: { parser: templateParser },
    settings: angularSettings,
    rules: allRules,
  },
]
```

`fixableRawControls` is left out: its fixes write TSX. A screen emits as a standalone component with
`pnpm emit <spec.json> <out.ts>` or the MCP tool `emit_screen` with a `.ts` path. Its inputs are
signal inputs, callbacks included, so a container passes a callback as a function that keeps `this`
(`[onStart]="start"`, with `start` an arrow function). `polymorph add --framework angular` vendors
the Angular members into a Vite app ([frameworks.md](frameworks.md#vendoring-angular-members)).

## A page with no build

The members `design/frameworks/elements.json` marks native ship as custom elements in
`@polymorph/elements-ui`, for a page written in HTML: a static page, a server-rendered template
(Rails, Django, Laravel, Astro), or a page htmx or Turbo swaps. Each element (`<poly-button>`)
renders the generated Solid member into itself, so the elements are a distribution of the Solid
rendering, with the same recipes and the same behaviour, and not a second set of decisions. A prop
is an attribute in kebab case, data a JSON attribute, a node-typed prop a child with `slot="foo"`,
and a callback the event `poly-foo` ([frameworks.md](frameworks.md#from-react-to-elements)). The
elements need Chrome 125, Safari 17.4 or Firefox 126, because each element is marked with a custom
state (`:state()`).

```sh
node ../polymorph/packages/cli/bin/polymorph.js init my-site --framework elements
```

`init --framework elements` copies the files the page loads into `public/polymorph/` (`--dir`
names another static directory), compiles the theme sheet, and writes an example page and
`polymorph.json` ([frameworks.md](frameworks.md#a-page-with-no-build-polymorph-init---framework-elements)).
The files are a build output of this repository, which `pnpm build:packages` writes into
`dist/cdn/` of `@polymorph/elements-ui`. No public URL serves them, because the packages are
published to a restricted registry, so `init` copies them and `polymorph update` copies them again.

### The page

```html
<!doctype html>
<html lang="en" data-system="plain" data-palette="neutral">
  <head>
    <script data-polymorph="prepaint">/* the prepaint script, inline */</script>
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
</html>
```

- **The stylesheets are linked by the page,** before the elements are defined. `polymorph.css`
  holds the base layer, every recipe and the elements' own rules; `theme.css` holds the pairing.
  A stylesheet a script inserted would arrive after the first paint.
- **The prepaint script runs first in `<head>`,** inline or as `<script src="polymorph/prepaint.js">`,
  so a stored mode, system or palette applies before the first paint. `<html data-system
  data-palette>` names the pairing the page wears.
- **`polymorph.js` is a module script.** It defines every `poly-*` tag at once and loads each
  member's code, a chunk of its own, the first time one of its elements renders, so a page loads
  the members it uses. `polymorph-all.js` loads every member in one file. A module script does not
  load from a `file://` URL, so the page is served.
- **The page's own module script imports from the same file.** Both scripts export `restore`,
  `toast` and `loadAgentBridge`, and nothing else a page needs:
  `import { restore, toast } from './polymorph/polymorph.js'`. A module script runs after the
  elements' script it follows, so the tags are defined when it runs.
- **An agent reads and operates the page through a bridge the page loads.** `<html
  data-agent="on-call">` registers the bridge's tools with the browser's WebMCP API at load and
  fetches the bridge on the first call; `data-agent="eager"` fetches it at load. Without the
  attribute nothing registers and nothing more is fetched, because exposing a page to an agent is
  the application's decision. A page that asks a person to confirm a destructive action creates
  its bridge itself: `loadAgentBridge()` resolves to the agent bridge, which lists the members the
  elements render and runs their actions, and a page that does not call it does not fetch the
  bridge ([agents.md](agents.md#a-page-with-no-build)).
- **The console reports what an element could not read.** An attribute whose text is not what
  its prop takes (`value="lots"` on a Progress) is reported as a warning that names the element
  and the attribute, and the prop is unset. The members' own warnings are reported the same way.
  The red rules do not read HTML, so these warnings are the check a page written in HTML has, and
  the files report them on every page.
- **A system names web fonts.** The page links their stylesheets itself; without them it uses the
  fallback fonts.

An app with a build installs `@polymorph/elements` and `@polymorph/elements-ui` from GitHub
Packages under the aliases in [Registry access](#1-registry-access) and imports the elements:

```js
import '@polymorph/elements-ui/controls/Button' // defines <poly-button>, with what Button composes
import '@polymorph/elements-ui'                 // or every element at once
```

An element's module brings its member's recipe, compiled with the reach-through forms an element
needs, and the base layer, the host rule and the rules for an element that has not rendered,
through `@polymorph/elements`; the app links a theme sheet as a page does. An app that would rather
load each member when it is first used imports the no-build files as modules
(`import '@polymorph/elements-ui/cdn/polymorph.js'`, with `@polymorph/elements-ui/cdn/polymorph.css`
linked), and its bundler keeps their chunks.

### Rendering in the client

An element renders its member in the browser, once its tag is defined and its member's code has
loaded. The page's markup is what the server sends, and nothing renders a member on the server.
Until an element renders, the page shows the content it wrote between the tags as plain HTML, and
an element with attributes only (`<poly-button label="Save">`) shows nothing. `polymorph.css` holds
rules for an element that has not rendered, defined or not: the content of a closed overlay stays
hidden, and a table's or a list's parts lay out as the elements they render. Nothing else is
hidden, so the text stays readable if the script fails. An element and the elements inside it wait
for each other's code, so the outer one renders first and holds the inner ones; one slow chunk
holds the elements around it.

A member that holds block content is not written inside a `<p>`: the parser closes the `<p>` at
the first block element and leaves the member empty. A table is written `<poly-table>` with its
part elements (`<poly-table-row>`, `<poly-table-cell>`), never `<table>`, because the parser moves
an unknown element inside `<table>` out of it; tabular data reads better as a `DataTable`'s
`columns` and `rows`.

### Events and listeners

A member's callback is a `poly-*` event on its element: `poly-click`, `poly-change`,
`poly-open-change`. Its `detail` is the callback's first argument. It bubbles, so a listener on the
document hears every element, and htmx's `hx-trigger="poly-change"` and Alpine's `@poly-change`
listen as they listen to any event. A native event keeps its meaning and bubbles as well: `click`
on `<poly-button>` is the native click, and `poly-click` is the member's.

```html
<poly-select name="priority" label="Priority" value="low"
  options='[{"value":"low","label":"Low"},{"value":"high","label":"High"}]'></poly-select>
<script type="module">
  const select = document.querySelector('poly-select')
  select.addEventListener('poly-change', (event) => console.log(event.detail, select.value))
</script>
```

A controlled prop follows the reader. After its change event the element sets its own property to
the new value, so `select.value` reads what the reader chose, unless a listener calls
`event.preventDefault()`, which keeps the value the page set.

Some members ask whether their caller handles an event: a Banner shows its dismiss button only
while `poly-dismiss` is heard, and a Link hands its navigation to the page while `poly-navigate`
is heard and follows its `href` otherwise. An element knows
of a listener added with its own `addEventListener`. A page that listens by delegation, or adds its
listener before the element is defined, names the events in `listens` instead:
`<poly-banner listens="dismiss">`.

A listener can hand the member a promise with `event.waitUntil(promise)`, while the event is
dispatched. The member waits for every promise its listeners handed it, so a ConfirmDialog stays
open and pending while the page saves:

```js
dialog.addEventListener('poly-confirm', (event) => event.waitUntil(save()))
```

### What is set from script only

A value with no text form is a property, set from a script once the element is defined: a render
prop (`table.rowDetail = ({ row }) => node`), a function (`field.validate`, `getRowId`,
`formatValue`, Pagination's `getPageHref`), a ref (`controlRef`), a node inside data, and data whose type holds a function,
such as a messages catalogue with plural functions (Pagination's, DataTable's, a chart's), whose
English defaults apply until a script sets one. A property is the prop's camel-case name
(`iconOnly`, `ariaLabel`), and it never writes its attribute back.

A JSON item that leaves out a callback its type requires is completed by the element: a Menu item
with no `onSelect` dispatches `poly-select` on the Menu when it is chosen, with `detail`
`{ item, index }` (and `value` where the member passes one, a checkbox entry's `checked`), so a
Menu written in HTML works with a listener and no script per item.

A node field of an object prop is a child with a dotted slot name: `slot="topbar.leading"` fills
AppShell's `topbar.leading`.

A prop named as a method every element inherits has no property, so the method keeps working on the
element and only its attribute sets the prop: Diff's `before` and `after` are attributes, and
`diff.before(node)` is still `ChildNode.before()`. A prop named as an accessor (`id`, `title`,
`ariaLabel`) keeps its property, which replaces the element's own.

A controlled prop the page never set leaves the member uncontrolled, as an absent prop leaves a
React member, and its property reads the value the member last reported. Once the page sets a
value, by attribute or property, the element follows the reader as above.

### Forms

A member renders its own form controls, which post as a native control posts: a text field is an
`<input>` or `<textarea>` with its `name`, and a Select, a Checkbox or a DatePicker writes a hidden
`<input>`. The elements are in the light DOM, so a `<form>` around them posts them. The elements are
not form-associated (`ElementInternals`), because each member's own input already posts and a
second value would post twice. An overlay's panel renders at the end of `<body>`, so a form that
belongs in a Dialog goes inside the Dialog's content.

### Content the page changes

An element observes its own children. A node the page adds before or after the member's rendering
(htmx's `beforeend`) joins the slot its `slot` attribute names. A swap that replaces the element's
children (htmx's `innerHTML` on the element) renders the member again from the new ones. An
`outerHTML` swap disconnects the old element, which disposes its member, and connects a new one.
Attributes the server sends again are read again, and a morphing swap keeps the element, because
its host marker is a custom state and not an attribute the swap would remove.

A page snapshot saves the rendered document: Turbo's cache and htmx's history store the page's
`innerHTML`, and an element restored from one would read its member's rendering as its children.
`restore()` puts back the children the page wrote and disposes the member, so a snapshot saves the
page's markup. Each element has the method, and `polymorph.js`, `polymorph-all.js` and
`@polymorph/elements-ui` export `restore(root)` for a whole tree:

```js
import { restore } from './polymorph/polymorph.js'

document.addEventListener('turbo:before-cache', () => restore(document))
document.addEventListener('htmx:beforeHistorySave', () => restore(document))
```

A snapshot saved without it renders each member inside its own rendering when it is written back.

The content of a closed overlay is not in the document, as in React: `getElementById` finds
nothing in a closed Dialog's body.

### The rules and the tools

The red rules do not read HTML, so no rule checks a page: `polymorph check` leaves it unread and
says so. A page writes no `class` or `style` on an element and no raw `<button>` or `<input>`; an
element draws no box, and an inherited property in its `style` reaches the member's content. The
MCP tools take `framework: "elements"`: `get_system_card` returns the elements card, and
`validate` checks a screen spec against the elements vocabulary. No screen is emitted for the
elements ([frameworks.md](frameworks.md#the-tools-in-elements)).

## An iOS app

The SwiftUI members ship in one Swift package, `platforms/ios`, with two libraries for iOS 17 and
macOS 14 or later: `PolymorphTokens`, every house pairing as a `PMTheme`, and `PolymorphUI`, the
members. The package is not published to a registry. An app depends on it by path, through a
checkout of this repository or a git submodule of it, pinned to a release tag. SwiftPM names a
path dependency after its directory, so the package is `ios`:

```swift
// Package.swift
dependencies: [.package(path: "../polymorph/platforms/ios")],
targets: [
  .target(
    name: "App",
    dependencies: [
      .product(name: "PolymorphTokens", package: "ios"),
      .product(name: "PolymorphUI", package: "ios"),
    ]
  )
]
```

In Xcode, choose **File › Add Package Dependencies…**, then **Add Local…**, and pick
`platforms/ios`. The app installs one pairing at its root and composes members, which read it from
the environment:

```swift
import PolymorphUI

PMBadge(props: .init(children: status, icon: .time))

// At the app's root:
RootView().pmTheme(.terminal_petrol)
```

A member keeps its web name with a `PM` prefix and takes its spec's props as one generated value
(`PMBadgeProps`). A member the iOS platform map marks absent (Command, HoverCard, Tooltip) has no
rendering; its entry names the substitute, and the system card for `ios` leaves it out. The
defaults a spec names for text (a dialog's "Close") are looked up in the app's own string
catalog, so the app translates them there.

A screen is written as a spec whose `platform` is `ios` and emitted as SwiftUI, from a checkout:
`pnpm emit <spec.json> InboxView.swift`, or the MCP tool `emit_screen` with a `.swift` path. The
file holds the screen's model, its actions and a stateless view; the app owns navigation, state
and asynchronous work ([native.md](native.md), `design/native/screen-contract.md`). A tenant's
theme known only at run time reaches the device as a token document, which
`PMTheme(tokenDocument:)` reads ([native.md](native.md#how-a-tenant-theme-reaches-a-device)).
[`platforms/ios/README.md`](../platforms/ios/README.md) has the rest.

## An Android app

The Compose members ship in one Gradle build, `platforms/android`: `:tokens`
(`dev.polymorph.tokens`, plain Kotlin, every house pairing as a `PMTheme`) and `:ui`
(`dev.polymorph.ui`, the members, on Compose Multiplatform with `jvm` and `android` targets). The
build is not published to a repository. An app reaches it through a checkout of this repository
or a git submodule of it, pinned to a release tag, and includes it whole:

```kotlin
// settings.gradle.kts
includeBuild("../polymorph/platforms/android")

// app/build.gradle.kts
dependencies {
    implementation("dev.polymorph:tokens")
    implementation("dev.polymorph:ui")
}
```

The app provides one pairing at its root and composes members, which read it from the
composition:

```kotlin
import dev.polymorph.tokens.PMThemes
import dev.polymorph.ui.PMBadge
import dev.polymorph.ui.PMIconRole
import dev.polymorph.ui.ProvidePMTheme

ProvidePMTheme(PMThemes.terminal_petrol) {
    PMBadge(children = status, icon = PMIconRole.Time)
}
```

`ProvidePMTheme` also gives Material 3 the pairing, so the app's own Material components match
the members. A member the Android platform map marks absent (the chart members, Command,
HoverCard, Tooltip) has no rendering; its entry names the substitute, and the system card for
`android` leaves it out. A member the map marks native that `packages/native/src/kotlin-pending.ts` lists
has its generated props and no composable, because no Compose rendering draws it. The app provides what belongs to it
through composition locals: its translations of the spec's default strings (`LocalPMStrings`), an
image loader (`LocalPMImageLoader`), a file picker (`LocalPMFilePicker`) and an image encoder
(`LocalPMImageEncoder`, which writes ImageEditor's framed image in its file type).

A screen is written as a spec whose `platform` is `android` and emitted as Compose, from a
checkout: `pnpm emit <spec.json> InboxScreen.kt`, or the MCP tool `emit_screen` with a `.kt` path.
[`platforms/android/README.md`](../platforms/android/README.md) has the rest, and
[native.md](native.md) has the members and the emitter.

## Dart tokens

Polymorph has no Flutter renderer. `platforms/dart` is the tokens as a Dart package,
`polymorph_tokens`, with no dependencies, for a Flutter app or any Dart program that reads the
same decisions:

```yaml
dependencies:
  polymorph_tokens:
    path: ../polymorph/platforms/dart
```

[`platforms/dart/README.md`](../platforms/dart/README.md) maps each value to Flutter's types and
shows the git dependency form.

## Developing polymorph and a product together

To try an unreleased change in a React product, link the packages in place of the release. Inside this
repository `exports` point at source, so your bundler compiles the checkout directly:

```sh
# all three, so there is one engine
pnpm link ../polymorph/packages/engine ../polymorph/packages/react ../polymorph/packages/react-ui
# back to the release
pnpm unlink @polymorph/engine @polymorph/react @polymorph/react-ui
```

Linking covers these three. A linked `packages/rules` resolves to TypeScript source, and Node,
which loads your `eslint.config.js`, cannot import it. To try an unreleased red rule, install a
packed build instead: in the checkout, `pnpm --filter @polymorph/rules build`, then `pnpm pack` in
`packages/rules` (it applies `publishConfig`, so the package points at `dist/`), then
`pnpm add -D <the .tgz>` in your app. Put the alias back afterwards.

With Vite, also allow the dev server to read the checkout:
`server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../polymorph'] } }`. Do not
commit a link. A product builds against releases.

A linked `@polymorph/react` resolves `react` from this repository's workspace, so TypeScript reads
its React types from this repository's `@types/react` and your code's from your app's copy. A
type from one copy is a different type from the same type in the other. A member compiled in your
app that passes its ref to a foundation hook then fails to typecheck, for example TS2345 on
`useControlRef`'s ref in a vendored `Input.tsx`. Map `react` to your app's copy in the tsconfig
that compiles your source, so a ref or an element type is one type on both sides:

```jsonc
// tsconfig.json (or tsconfig.app.json), in compilerOptions
"paths": {
  "react": ["./node_modules/@types/react"],
  "react/*": ["./node_modules/@types/react/*"]
}
```

A release brings one copy of the types, so the mapping is not needed once the link is removed.

## Vendoring

`polymorph add` copies members into your repository and sets up the rules for them:

```sh
node ../polymorph/packages/cli/bin/polymorph.js add button dialog theme:pastel
```

It writes the members' source under `src/polymorph/` (`--dir` to change), a shared
`base.css`, `polymorph.eslint.js` and `polymorph.stylelint.js` config fragments to spread into
your own configs (with the token list and the theme's [values](#6-the-red-rules) the rules check
against), and `polymorph.json`, the manifest that records what was installed and the hash of
every file. It adds the packages it needs to your `package.json`: `@polymorph/engine`
(the rules' peer, and the runtime a theme's `index.ts` imports) and whatever the members and the
theme's fonts need as dependencies, `@polymorph/react` as a dependency when it vendors members
(they import it), and `@polymorph/rules` (the config fragments load it) as a dev dependency. A
theme or palette on its own adds the engine and the rules and not `@polymorph/react`. Install them
as above. You do not install `@polymorph/react-ui`, because you own that code.

Each package is written at the range this repository's manifests declare for it. With
`--framework`, the framework's foundation takes the place of `@polymorph/react`, and the foundation
and the packages its members import are written at that framework's own ranges, read from its
foundation and vocabulary manifests (`vendor.frameworks.<framework>.packages` in the registry). A
Solid install writes each Zag machine at the exact version of the Solid foundation's
`@zag-js/core`, because the foundation runs every machine on that core. A Vue, Svelte or Angular
install writes a caret range.

Each member's recipe is copied beside it: `controls/button.module.css` next to
`controls/Button.tsx`. In this repository a member imports its recipe from the recipes package
(`@polymorph/recipes/controls/button.module.css`). The install rewrites that import to the
relative path (`./button.module.css`), so you do not install `@polymorph/recipes` either. The
rewrite is the only change an install makes to a vendored file, and `polymorph diff` compares
your copy with the rewritten file.

| Command | What it does |
| --- | --- |
| `polymorph add <item…>` | vendor members (`button`), ladder primitives (`bespoke`, `density-scope`, `tone-scope`), a theme (`theme:pastel` — a system, its default palette and its fonts) or a palette (`palette:orchid`) |
| `polymorph diff` | what you have changed in your copy, and what has changed here |
| `polymorph update` | re-vendor the files you have not touched and recompile the installed themes; `--force` overwrites ones you have. A vendored member your code imports, which no member the manifest lists brings any more, is kept and added to the manifest's `components`, and a renamed system or palette moves to its new name ([tooling.md](tooling.md)) |
| `polymorph theme validate\|emit\|schema` | admit your own system and palette from the terminal |

A theme install compiles every installed pairing to CSS at install time, so nothing derives a
theme in the browser and any bundler can serve the result. Under `<dir>/themes/`:

| File | What it is |
| --- | --- |
| `systems/<name>.json`, `palettes/<name>.json` | the vendored system and palette documents — yours to edit |
| `theme.css` | every installed system with its own default palette |
| `pairings/<system>--<palette>.css` | each other pairing's sheet, with a small loader module `pairings/<system>--<palette>.ts` beside it |
| `index.ts` | imports the base layer, the fonts and `theme.css`; uses only `@polymorph/engine/runtime`; exports `installThemes()` (the install patches your entry to call it) and `ensurePairing(system, palette)`, which returns a Promise to await before switching to a pairing |

The sheets are generated. After editing a vendored system or palette, run `polymorph update` to
recompile them. An edit that breaks a law fails the update with the law's own message.

An application that installs its themes from a module of its own, instead of calling
`installThemes()`, sets `"appInstallsThemes": true` in `polymorph.json`. `add` and `update` then
leave its entry as it is. Without the field, each install that has a system or palette adds the
import and the call to the entry again.

`update` keeps a vendored file whose bytes differ from what it installed, because that is how it
recognises your edit. A formatter run over the vendored copies therefore makes each file it
reformats read as yours, and `update` stops updating it. Keep your formatter off the vendored
directory, and off the generated lint fragments, which every install rewrites:

```gitignore
# .prettierignore
polymorph.*.js
src/polymorph/**
```

With another `--dir`, ignore that directory instead of `src/polymorph`.

Your vendored copy is yours to edit, but it must stay vendorable: the ESLint fragment lets it
import `@polymorph/react`, `@polymorph/engine` and its own siblings, and nothing else.
[tooling.md](tooling.md) covers the CLI in full.

## Testing your screens

A screen test renders the screen, finds its members by role and accessible name, and acts on them
the way a person does. A test that reads a screen's source text checks neither what renders nor
what a person can do with it, so it passes when the screen is broken.
`@polymorph/engine/testing` gives the test a real theme:

```ts
import { installTestTheme, fixedWidthHost } from '@polymorph/engine/testing'

installTestTheme()               // installs a real pairing (pastel × amethyst, light) on <html>
const host = fixedWidthHost(480) // a host of definite width, so 1fr tracks and 100% resolve
```

A member that lays itself out by its container's width, such as a Grid or an archetype, renders
into the host: `render(ui, { container: fixedWidthHost(480) })`.

### In Vitest's browser mode

Computed styles exist only where the members' stylesheets load, which is a browser. Vitest's
browser mode runs each test file in Chromium through Playwright. Add `vitest`,
`@vitest/browser-playwright` and `@testing-library/react` as dev dependencies, and install
Chromium once with `pnpm exec playwright install chromium`. Vitest reads `vitest.config.ts` in
place of `vite.config.ts`, so the file repeats the React plugin and the single copy of React. It
also needs `polymorphTheme(…)` when a module under test imports `virtual:polymorph/theme`. With
the plugin there, `import 'virtual:polymorph/theme'` in a test installs the app's own default
pairing, in place of `installTestTheme()`:

```ts
// vitest.config.ts
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
```

A test of the welcome screen `polymorph init` writes:

```tsx
// src/screens/Welcome.test.tsx
import { installTestTheme } from '@polymorph/engine/testing'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Welcome } from './Welcome'

beforeAll(() => {
  installTestTheme()
})
afterEach(cleanup)

it('hands Start to its container', async () => {
  const onStart = vi.fn()
  render(<Welcome status="Ready" onStart={onStart} />)

  expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Start' }))
  expect(onStart).toHaveBeenCalledOnce()
})

it('takes the button height from the theme', () => {
  render(<Welcome status="Ready" onStart={() => {}} />)
  const start = getComputedStyle(screen.getByRole('button', { name: 'Start' }))

  expect(start.blockSize).toBe(start.getPropertyValue('--pm-control-height-md').trim())
})
```

Assert a computed style against the token it comes from, not against a pixel value, because a
member's appearance comes from the pairing. The second test holds under any pairing and density.
`afterEach(cleanup)` unmounts each render. Testing Library cleans up by itself only when
`afterEach` is a global, which in Vitest takes `globals: true`.

### Under jsdom

A suite under jsdom needs no browser: add `jsdom` as a dev dependency and set
`test: { environment: 'jsdom' }` beside the React plugin. Vitest hands `@polymorph/react-ui` to
Node there (and under happy-dom), where a member's stylesheet import resolves to an empty module,
so every member computes as unstyled. The test above runs with two changes: `fireEvent.click` from
`@testing-library/react` in place of `userEvent`, which needs a browser, and no assertion on a
computed style. It still checks the structure, the roles and names, and what each action calls.
