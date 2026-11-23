# scripts/size

Fixture applications for `pnpm size`. It builds each one as a consumer's Vite would: against the
published builds of `@polymorph/engine`, `@polymorph/react`, `@polymorph/react-ui`,
`@polymorph/vue`, `@polymorph/vue-ui`, `@polymorph/svelte`, `@polymorph/svelte-ui`,
`@polymorph/solid`, `@polymorph/solid-ui`, `@polymorph/angular` and `@polymorph/angular-ui`
(each package's `dist/`), with the theme compiled at
build time by `@polymorph/engine/vite`. The Svelte packages ship their components as source, so the
fixture's own Svelte compiler compiles them, as an application's does. The Solid fixture is built
the way a Vite application with Solid's plugin (`vite-plugin-solid`) is built: the Solid packages
resolve by their `solid` export condition to the source they ship in `dist/source/`, and the plugin
compiles it. The Angular fixture is linked as the Angular CLI links an application: Angular's
linker (`packages/angular-ui/scripts/linker.mjs`, the CLI's own transformer) turns the partial
declarations the Angular packages ship, one flat module per entry point (`dist/fesm2022/`), into
definitions. It fails when a fixture ships more than
its ceiling in `budgets.json`.

An elements fixture (`elements-*.html`) is a page with no build, so it is not built: `pnpm size`
reads the files `@polymorph/elements-ui`'s build writes to `dist/cdn/` and measures what a browser
fetches for the page, each file gzipped on its own because each is a request of its own: the
scripts the page names and every module they import, the chunk the loader imports for each
`poly-*` tag the page writes and what that imports, and the stylesheets it links.

| Fixture | What it measures |
| --- | --- |
| `react-floor` | React alone: the baseline every React application ships |
| `button` | one member from `@polymorph/react-ui`, with the icon gateway and the compiled theme |
| `list-page` | an archetype with a table: the motion engine, presence and the layout members |
| `dialog` | an overlay: the motion engine plus Radix's dialog behaviour |
| `runtime-engine` | `@polymorph/engine` admitting a theme in the browser, with no React. This is the cost of runtime theming, which an application pays only if it uses it |
| `vue-button` | Vue's runtime and one member from `@polymorph/vue-ui` (`vue-button.ts`, rendered with `h`), with the Vue foundation's icon gateway and the compiled theme |
| `svelte-button` | Svelte's runtime and one member from `@polymorph/svelte-ui` (`svelte-button.ts`, mounted with `mount`), with the Svelte foundation's icon gateway and the compiled theme |
| `solid-button` | Solid's runtime and one member from `@polymorph/solid-ui` (`solid-button.ts`, rendered with `render` and `createComponent`, which is what `<Button label="Save" />` compiles to), compiled from the source the `solid` condition resolves to, with the Solid foundation's icon gateway and the compiled theme |
| `elements-button` | a page with no build that writes one `<poly-button>` (`elements-button.html`): `prepaint.js`, `polymorph.js` and the modules it imports, Button's chunk and what Button composes, and the stylesheets the page links, `polymorph.css` and the plain theme sheet |
| `elements-all` | the same page loading `polymorph-all.js`, every element in one file, with the same stylesheets |
| `elements-agent` | the `elements-button` page with `<html data-agent="on-call">`: what it fetches before any tool is called, which is the `elements-button` page and the two chunks the setting fetches, its registration and the tools' definitions |
| `elements-screen` | a page with no build that writes one `<poly-screen>` holding a document in its `<script type="application/json">` (`elements-screen.html`): what `elements-button` fetches, the chunk the first `<poly-screen>` to connect imports and what that imports (the run-time renderer, the walk, `parsePartial` and the vocabulary table), and the chunk of each member the document names |
| `angular-button` | Angular's runtime, zoneless, and one member from `@polymorph/angular-ui` (`angular-button.ts`, created with `createComponent` in an application from `createApplication`, which is what `<pm-button label="Save" />` in a root component renders), linked from the partial declarations the packages ship, with the Angular foundation's icon gateway and the compiled theme |
| `agent-bridge` | a React page with a Checkbox and a Button that creates an agent bridge (`@polymorph/engine/agent`) and registers its tools with WebMCP: the bridge's runtime, its tools, the name computation, and the registry each member registers with |

A fixture fails, whatever its size, when it ships the agent bridge and its source does not import
`@polymorph/engine/agent`, and when it imports the bridge and the bridge's marker is missing from
its JavaScript, because the first check would then find nothing. A page with no build ships the
bridge exactly when it loads `polymorph-all.js`, which holds the bridge with every member, or
states `data-agent="eager"`. A page that loads `polymorph.js` with no setting, or with
`data-agent="on-call"`, does not: the bridge is a chunk it fetches when it calls `loadAgentBridge`
or a tool, and the measure counts what a page fetches without a call. The measure follows a
setting: with `on-call` it counts the chunks `polymorph.js` imports for it that hold no bridge,
and with `eager` the bridge's as well. The marker is the name of the event a
step dispatches (`polymorph:agentchange`), which a minifier keeps. A page without the bridge
carries the registry in the engine's root, which a member that registers imports, and nothing of
the bridge.

`pnpm size --why` attributes each fixture's JavaScript to the packages it came from. Naming
fixtures (`pnpm size vue-button dialog`) measures only those. A ceiling is raised only with the
reason in the same commit.

The ceilings of `vue-button`, `svelte-button`, `solid-button` and `angular-button` are each set
to a measurement of the fixture, rounded up to the next kilobyte, with ten percent added.

In `vue-button`, Vue's runtime is about three quarters of the JavaScript, and the glyph data of
every icon role, which the Vue gateway ships as data where the React `button` fixture carries
`lucide`, is most of the rest. A member's compound parts are attached with a pure call, so a
member the application does not import is dropped with its parts and its machine.

In `svelte-button`, Svelte's runtime is about four fifths of the JavaScript, and the glyph data of
every icon role, which the Svelte gateway ships as data as the Vue gateway does, is most of the
rest. The vocabulary's index imports
every member, and an application that imports one member carries only that member and what it
composes, because the package declares only its stylesheets and its index as side effects.

`solid-button`'s ceilings cover the path a Vite application with Solid's plugin takes, the
source under the `solid` condition. The browser build (`dist/index.js`, the `browser` and
`import` conditions), which a bundler without Solid's plugin takes, measures the same, because the package's own build compiles it with the same plugin and the
fixture's minifier writes both alike. Solid's runtime is about three fifths of the JavaScript, and
the foundation, most of it the glyph data of every icon role, which the Solid gateway ships as data
as the Vue gateway does, is most of the rest. The member itself is about four kilobytes before
compression, because Solid compiles its markup to templates and its bindings to direct DOM writes.

In `angular-button`, Angular's runtime is about five sixths of the JavaScript. The member, the
foundation it needs (the member context, the slot directives and the glyph data of every icon
role) and their recipe rules are the rest. The CSS is smaller than the other fixtures' because the members' recipes are in their
components' styles, which Angular adds to the page at run time, and the stylesheet carries only the
theme.

`agent-bridge`'s ceilings are its measurement rounded up to the next kilobyte, with about a
kilobyte added, as the other React fixtures' are. The bridge and its tools are about five
kilobytes of its JavaScript; the rest is what the `button` fixture ships, and Checkbox with its
Radix behaviour.

The ceilings of `elements-button` and `elements-all` are set the same way, from the measurement
of each. In `elements-button`, about four fifths of the JavaScript is what `polymorph.js` brings
before any member renders: Solid's runtime, the Solid foundation's slot conventions with the motion
values they read, the bridge and its codecs, and the definitions table, which names every tag's
attributes so the page can define every tag at once (`polymorph.js` itself, about a quarter of the
JavaScript). `@internationalized/date`, which the temporal codecs read ISO dates and times with, is
not on the page: the codecs are a module of their own, which only a member that takes a date or a
time imports, so the date library comes in the chunks of those members. Button's chunk and
Badge's, which Button composes, are under two kilobytes, and Icon's chunk is mostly the glyph data of every icon role. No other member reaches the page, because each element imports its Solid member by the
member's own module rather than by the Solid vocabulary's index, which attaches every compound's
parts. The CSS is `polymorph.css`, every recipe with the forms that reach through an element,
which a page loads whichever members it uses, and the theme sheet. `elements-all` is the Solid
vocabulary whole with Solid's runtime, the elements' bridge and the agent bridge; its largest third-party parts are Zod and
Culori, from the theme engine, and Zag's date picker (`pnpm size --why elements-all`).

`elements-screen`'s ceilings are set as `elements-button`'s are, from its measurement, 82.0 kB,
rounded up to the next kilobyte with a kilobyte added: 83 kB. About two fifths of its JavaScript is
the run-time screen: the vocabulary table with the core's shared modules, which name every member's
props, parts and lawful cells and hold the checks every document passes (addresses, the depth
limit, and which prop or field receives a callback; about 27 kB, the largest part), the walk with the renderer and `parsePartial` (about 8 kB),
and the chunk `<poly-screen>` imports (about 1 kB). The validator and the card are not on the page:
they are chunks of their own, which `polymorph.js` imports when a page calls `check()` on a
`<poly-screen>` or calls `loadScreen`. The rest is the `elements-button` page and the chunks of the
members the document draws. `polymorph.js` holds `<poly-screen>`'s element, about a kilobyte, and
imports nothing of the screen until a page writes one. The measure reads the document's members
from the page's JSON, and finds the chunk `<poly-screen>` imports by the event its renderer
dispatches (`poly-action`), as it finds the bridge by its marker; an agent setting's chunks are
counted without the screen's.

`elements-all`'s ceiling is its measurement, 452.9 kB, rounded up with a kilobyte added: 454 kB, up
from 412 kB (it measured 398.6 kB before the run-time screen). `polymorph-all.js` holds every
element and everything a page might load, and now holds the run-time screen as well: about 36 kB of
it draws (the vocabulary table, about 22 kB, the walk with the rule for what receives a callback,
the renderer and `parsePartial`), and about
11 kB checks a document and builds a prompt (the validator, about 7 kB, and the card, about 4 kB).
The validator and the card stay in the one file because the build that writes it cannot leave them
out alone: it inlines every dynamic import (`codeSplitting: false`), and with splitting turned on it
also splits the agent setting's two chunks and the bridge out of the file, and puts Solid's runtime
and the modules the drawing shares in a chunk the file imports at once, so the one file would no
longer be one request. Keeping those in would take static imports of modules the engine does not
publish. A page that wants the validator and the card as chunks of their own loads `polymorph.js`.

`elements-agent`'s ceilings are set as `elements-button`'s are, from its measurement. Its JavaScript is
`elements-button`'s and the two chunks its setting fetches: the registration, under a quarter of a
kilobyte, and the tools' definitions with the code that registers them, about two kilobytes, most
of it the three tools' descriptions. The bridge is not among them. `polymorph.js` holds the code
that reads the setting on every page, under half a kilobyte, which imports nothing until a page
states a setting the browser can use.
