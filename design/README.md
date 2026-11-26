# design/

The authored inputs to the system: design decisions as data, and the specifications members
are built and checked against. Nothing here is generated. Most of it is read by code, so edit
it like source.

| Path | What it is | Read by |
| --- | --- | --- |
| `systems/<name>.json` | A **system**: the eight axes, the font slots, presentation defaults and its default palette | the theme engine, both apps, the registry, the CLI, `pnpm size`, the native token emitters |
| `systems/<name>.md` | That system's rationale: the character it aims for and the reasons for its axis values | the registry, the workbench mood board |
| `palettes/<name>.json` | A **palette**: the colour seeds — accent and neutral hues, tint, chroma budget | the theme engine, both apps, the CLI, `pnpm size`, the native token emitters |
| `palettes/README.md` | An overview of the palettes | people |
| `defaults.json` | The pairing both apps boot into, and the native token packages' default | both apps, `pnpm proof`, `pnpm emit:native` |
| `components/<name>.md` | A member's **spec**: what it is and is not, anatomy, API, sizes, variant × tone recipes, exact tokens, states, accessibility | the registry (`vocabulary.ts`), the spec-staleness law (`spec-api.ts`) |
| `components/README.md` | Conventions every member spec shares | people; the stubs `pnpm new:member` writes cite it |
| `components/README-substrates.md` | Which behaviour library each heavy React member is built on (Combobox, Command, DatePicker/Calendar, Drawer, Slider, Accordion), the criteria for choosing one, and the chart engine's scale packages | people |
| `conventions/page-transitions.md` | The page-transition convention: `PageTransitions`, `transitionKey` and `pending` on `AppShell` / `AuthPage` | people |
| `archetypes/<name>.md` | An archetype's spec, including the pattern-scoped tokens it owns | the registry, the spec-staleness law |
| `motion/motion.json` | Motion values: durations, easings, springs, transition patterns, roles | `@polymorph/engine/motion`, the Stylelint rules |
| `motion/motion.md` | The motion spec those values implement | people |
| `platforms/<platform>.json` | The **platform map**: every member's status on web, iOS and Android (`native`, `adapted`, `absent` with a substitute) | the registry, the system card, the screen validator, the platform law |
| `frameworks/<framework>.json` | The **framework map**: every member's status in Vue, Svelte, Solid and Angular (`native`, or `absent` with a reason). React has no file, because it ships every member | the registry, the system card, the screen validator, the MCP tools, the framework law |
| `native/screen-contract.md` | How a screen spec emits to native code: the model, the actions record and the stateless view | people, `docs/native.md`, the SwiftUI and Compose screen emitters |
| `icons.json` | The icon **role** vocabulary: each role's glyph and group | `@polymorph/engine`'s role data, `@polymorph/react`'s icon gateway, `pnpm shells` (the other web foundations' glyph data), the native contracts, the registry |
| `icons.md` | Why roles rather than glyph names, and how the set is governed | people |
| `charts-wheel.json` | The chart palette: hue anchors and the categorical, sequential and diverging scales | the chart laws |
| `screens/*.json` | Screen documents (`polymorph-screen/1`) — saved from the composer, emitted by `pnpm emit` | `packages/spec`, the workbench composer |
| `screens/agent-loop/` | A brief and two attempts — the fixture for the agent-loop test | `packages/spec/agent-loop.test.ts` |

## Editing rules

- **Systems and palettes** are checked by the theme laws whenever the suite runs: schema,
  coherence, contrast for every lawful pairing, and the catalogue laws that keep the house
  systems distinct. See [docs/theming.md](../docs/theming.md).
- **Member specs are parsed.** Keep their props tables, fenced API blocks and States tables in
  shape. A prop the code ships and the spec lacks (or the reverse) fails the spec-staleness
  law. Change a spec in the same commit as the member.
- **New members** get their spec from `pnpm new:member`. See
  [CONTRIBUTING.md](../CONTRIBUTING.md).
- After changing a spec, `icons.json` or a system, run `pnpm registry` so the system card and
  the docs site reflect it.

The concepts behind these files are in [docs/](../docs): [theming](../docs/theming.md),
[motion](../docs/motion.md), [charts](../docs/charts.md), [layout](../docs/layout.md),
[frameworks](../docs/frameworks.md), [native](../docs/native.md).
