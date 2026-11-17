# Concepts

What polymorph is, the model behind it, and the terms the other docs use. Read this page before you
change the code.

## The problem

UI inconsistency is a problem of managing decisions, not of styling. Each inconsistency is a design
decision that was already made being made again locally: a copied hex value, a hand-built dropdown,
a one-off spacing tweak. Systems drift for two reasons. Deviating is cheap when the code is written
and costs more only later. Redesigns are applied at call sites, and they never reach all of them.

Two things make this worse:

- **Products change their look often**: re-brands, density changes, re-skins. A system that needs
  application-code changes for a redesign is abandoned during the first redesign.
- **Agents increase drift.** Unconstrained UI generation makes every decision again on every screen
  and tends towards the average of its training data. With a closed vocabulary, building a screen
  means selecting from the vocabulary.

Consistency alone is not enough, because a system can be consistently poor. Polymorph also encodes
*good* design: hierarchy, spatial rhythm, typographic discipline, accessible contrast and complete
states. The default output is therefore good, not only uniform.

## A decision system

Polymorph is a design system built as a **decision system**. Every design decision is made once, in
the place that owns it, and referenced everywhere it applies. A machine verifies it. People and
agents can change it safely, because the system propagates the change instead of relying on
discipline.

Application code composes a closed vocabulary of components and binds content to it. It cannot
express a colour, a spacing value or an interaction mechanic, because those decisions are owned
elsewhere. A redesign is therefore an edit to the decision layer, not an edit to every screen.

What this gives you:

| Goal | What it means in practice |
| --- | --- |
| **Consistent by construction** | Application code chooses *what* to show and *which* variant. It cannot invent a visual primitive or an interaction. Consistency is checked by machine, not by review. |
| **Changeable at the decision layer** | Decisions are parameters. Changing one re-derives every consumer (CSS regeneration, re-emitted screens, codemods); no call site is edited by hand. |
| **Good design by default** | The system encodes judgment: lawful combinations of decisions, enforced hierarchy, typographic and spacing discipline, and an accessibility floor. A theme can be unfashionable, but it cannot be incoherent or inaccessible. |
| **Delivered as components** | Products get the guarantees through the vocabulary. Each component makes decisions so that the code using it does not have to. |

## Decision layers

| Layer | Examples | Owned by |
| --- | --- | --- |
| **Values** | colour ramps, type scale, spacing steps, radii, motion curves | the theme engine (`packages/theme`) |
| **Semantics** | `surface`, `text-primary`, `danger`, the control radius | the pairing (system × palette) — see [theming.md](theming.md) |
| **Composition** | form-row anatomy, page-header structure, density | members and archetypes: their specs in `design/`, drawn by each renderer |
| **Behaviour** | dismissal rules, validation surfacing, focus movement | members: each spec's behaviour contract, built on React Aria and Radix in React, Zag in the other web frameworks, and the platform's own controls in SwiftUI and Compose |

Application code contains none of these. It holds only content, data bindings and named variant
choices.

## Token scopes

Design values reach CSS as custom properties named `--pm-*` ("tokens"). A token's scope is the scope
of the decision it encodes:

- **Theme scope**: defined for every screen, such as surface colours and the control radius. These
  tokens make screens consistent with each other.
- **Pattern scope**: exists only inside the pattern that owns it, such as the app shell's top bar
  height or a page's padding. The token is declared at the pattern's root. Reading it outside its
  owner violates a red rule (`scoped-token-owners`). These tokens make the parts of one screen
  consistent with each other.
- **Contextual scope**: a subtree re-assigns a *named* decision, such as compact density inside a
  data table. Local variation is lawful only as a scoped re-assignment, never as a style override.

Application code declares none of these tokens. A value the derivation does not give belongs in
the system or palette document, where the laws check it ([theming.md](theming.md)). A `--pm-*`
declaration in application CSS takes effect after admission, so no law checks it: a colour pinned
there can fail the contrast floor without any law failing.

## What "good design" means operationally

- **Hierarchy**: archetypes enforce it. There is one primary action per view, a fixed heading scale
  with one page opener (`PageHeader` or `Hero`, never both), and dangerous actions are set apart.
- **Rhythm**: one spacing scale. Off-scale values cannot be expressed.
- **Typographic discipline**: a modular type scale, line-length limits, consistent line height.
- **Accessibility floor**: contrast verified for every pairing, visible focus, complete keyboard
  paths, minimum target sizes, axe-clean states. All of it is checked by machine and never
  suspended.
- **Completeness**: loading, empty, error and disabled states ship with every member, and the
  completeness law renders each one. Application code turns a state on through the member's prop
  (`loading`, `invalid`, an empty state) and does not draw it. A Button that changes its label to
  "Saving" instead of taking `loading` changes its accessible name, announces no busy state, and
  still runs its handler on a second press.
- **Restraint**: motion has a budget. State feedback appears everywhere but stays subtle, and
  nothing is decorative. See [motion.md](motion.md).
- **Coherence**: design decisions are correlated. Sharp geometry pairs with visible borders and flat
  depth. Soft elevation pairs with larger radii. A system is lawful only if its whole set of
  decisions satisfies the coherence constraints in `packages/theme`.

Whatever can be verified is verified, and the rest is curated. Contrast, rhythm, state completeness
and dependency closure are laws. Hierarchy across a whole screen, emotional character and content
clarity are still judgment: encoded where possible and reviewed where not. The system reduces the
places where taste can go wrong. It does not claim that CI proves taste.

## The vocabulary

The **vocabulary** is the closed set of components polymorph offers. One component is a
**member**. A member is specified once, in `design/components/` or `design/archetypes/`, and
drawn by a renderer for each framework and platform (see [Renderers](#renderers)). Members are
grouped into **tiers**:

| Tier | What lives there | Examples |
| --- | --- | --- |
| `structure` | display and content | `Card`, `Badge`, `Table`, `DataTable`, `PageHeader`, `EmptyState`, `Stat` |
| `controls` | inputs and actions | `Button`, `Input`, `Select`, `Combobox`, `DatePicker`, `FormField` |
| `overlays` | things that float or interrupt | `Dialog`, `Drawer`, `Menu`, `Popover`, `Tooltip`, `Toast`, `Tabs` |
| `layout` | spacing and arrangement | `Stack`, `Inline`, `Grid`, `SplitPane` |
| `charts` | data visualisation | `BarChart`, `LineChart`, `DonutChart`, `Sparkline` — see [charts.md](charts.md) |
| `ai` | the conversation: a model's turns, the composer, what it ran and what it cited | `ChatThread`, `ChatMessage`, `PromptInput`, `Markdown`, `ToolCall`, `ArtifactPane` — see [conversation.md](conversation.md) |
| `archetypes` | whole-page anatomies | `AppShell`, `ListPage`, `DetailPage`, `FormPage`, `SettingsPage`, `AuthPage`, `Dashboard` |

The full current list is generated. Run `pnpm registry` and read `registry/system-card.md` (see
[tooling.md](tooling.md)).

### The member contract

Every member, in every renderer:

- has **closed props**: variant, size, tone and content slots. There is no `className` or `style`
  passthrough, so it cannot express a style decision.
- ships **every state** (hover, focus, active, disabled, loading, error, empty), listed in its
  **states fixture**: `*.states.tsx` in React, the generated fixture in each other web
  framework, and `<Member>States` in a SwiftUI or Compose member's file. The completeness law
  renders each state, and on the web checks it with axe.
- ships its **transitions**. Micro-interactions are part of the member and bound to its states.
- has full **keyboard and ARIA** behaviour.
- is **responsive** to its container.
- declares any **pattern-scoped tokens** it owns.
- is styled by its **recipe**, a CSS Module in `packages/recipes` written in tokens only. The
  recipe has no framework code, so every web renderer's member imports the same file. A SwiftUI
  or Compose member applies the same tokens to the platform's own controls, and reads the few
  numbers a recipe writes (a measure, a breakpoint) from a generated table.
- has a **spec** in `design/components/` (or `design/archetypes/`) that the code is checked
  against, and, where it takes keys or focus, dismisses or announces, a **behaviour contract** in
  that spec that the conformance law runs against every web renderer
  ([conformance.md](conformance.md)).

Behaviour comes from a library in each renderer: React Aria and Radix in React, Zag state
machines in Vue, Svelte, Solid and Angular, and the platform's own controls in SwiftUI and
Compose. Everything perceivable (styling, motion and the API surface) is polymorph's own.

### Keep it small

The vocabulary must fit in working memory, whether a person's or a context window's. A new member
needs demonstrated recurrence: the same need in more than one place, on any platform. The
vocabulary is closed to prevent a member that duplicates another under a new name. A component
nobody can find gets rebuilt, and rebuilds are where drift starts.

### Renderers

A **renderer** draws the vocabulary in one framework or on one platform. Each web renderer is a
pair of packages: a **foundation**, which re-exports the engine and adds what that framework
needs (the icon gateway, motion, the conventions members are written with), and a
**vocabulary**, the members themselves, built on the foundation.

| Renderer | Foundation | Vocabulary | How the members are written |
| --- | --- | --- | --- |
| React | `@polymorph/react` | `@polymorph/react-ui` | by hand, on React Aria and Radix |
| Vue | `@polymorph/vue` | `@polymorph/vue-ui` | generated from the member's description, on Zag |
| Svelte | `@polymorph/svelte` | `@polymorph/svelte-ui` | generated from the member's description, on Zag |
| Solid | `@polymorph/solid` | `@polymorph/solid-ui` | generated from the member's description, on Zag |
| Angular | `@polymorph/angular` | `@polymorph/angular-ui` | generated from the member's description, on Zag through the foundation's adapter |
| elements | `@polymorph/elements` | `@polymorph/elements-ui` | generated as a custom element over the Solid member, which it renders in the light DOM |
| SwiftUI (iOS) | `PolymorphTokens` and the foundation file `PolymorphUI.swift` | `PolymorphUI` (`platforms/ios`) | by hand, against generated contracts |
| Compose (Android) | `dev.polymorph.tokens` and the foundation file `PolymorphUI.kt` | `dev.polymorph.ui` (`platforms/android`) | by hand, against generated contracts |

A **description** (`packages/shells/src/members/<member>.ts`) states a member once, without a
framework: its template, state, machine binding, effects and states fixture. `pnpm shells`
writes each generated framework's **shell** of the member from it: a Vue single-file component,
a Svelte component, a Solid component or an Angular standalone component, with its states
fixture. The shells render the React member's DOM with the same recipes, so the web looks the
same in every framework ([shells.md](shells.md)). It also writes each member's **element**
(`<poly-button>`), a custom element that renders the Solid member, for a page written in HTML:
the elements are a distribution of the Solid rendering, not a second set of decisions.

A **native member** is a SwiftUI view or a Compose object written by hand. It conforms to its
**contract**, a props type and a rendering protocol that `pnpm native:contracts` generates from
the registry, so a member that does not take its spec's props does not compile. It reads every
value from the pairing's tokens, which the engine emits as Swift and Kotlin
([native.md](native.md)).

The React vocabulary is the one the others are read against: the registry reads the props from
its source, and every other renderer is held to the same props, states and behaviour contract.

### Platforms

A **platform** is where a screen runs: `web`, `ios` or `android`. On a platform, a member has one
of three statuses:

| Status | Meaning | Example |
| --- | --- | --- |
| `native` | its own form, built from the platform's own primitives | `Button` everywhere; the charts on iOS, through Swift Charts |
| `adapted` | rendered another way; the entry's `as` says how | `Dialog` as a sheet; `Table` as a list on phones |
| `absent` | no sensible rendering; the entry gives a `reason` and a `substitute` (a member, or `none`) | `Tooltip` on iOS and Android, where touch has no hover; `Text` instead |

The **platform map** is data in `design/platforms/` (`web.json`, `ios.json`, `android.json`): one
entry per member, `Icon` and the exception primitives included, sorted by name. Every member is
native on the web. The registry publishes each member's entries, the system card can be rendered
for one platform, and a screen spec that names its platform cannot use a member that is absent
there. A member the iOS or Android map marks native or adapted has a SwiftUI or Compose
rendering, or is listed in that platform's pending list (`packages/native/src/pending.ts`,
`kotlin-pending.ts`), which a law pins.

The platform law (`packages/registry/src/platforms.test.ts`) holds every file to that: an entry for
every member and none for anything else, an `as` on every adapted entry, a reason and an existing
substitute on every absent one, no absent member on the web, and no native member that uses a
member absent on that platform unless its entry says why. `pnpm registry` refuses to build a map
that fails it. `pnpm new:member` writes a web entry and, for each phone platform, a `DECIDE`
placeholder the law refuses, so the author decides from the spec.

### Frameworks

A **framework** is how a web screen is written: `react`, `vue`, `svelte`, `solid`, `angular` or
`elements`. It differs from a platform: every framework renders the web platform, with the same
recipes, and the same screen spec emits for any framework the emitter writes, so a framework is an
option of the emitter and never a field of the spec. The emitter writes no elements page, because
HTML cannot bind a screen's callbacks.

The **framework map** is data in `design/frameworks/` (`vue.json`, `svelte.json`, `solid.json`,
`angular.json`, `elements.json`; React has none, because every member is native there). An entry is `native`,
when that framework's vocabulary ships the member, or `absent`, with a `reason`. A member is
native in a generated framework exactly when it has a description. The framework law
(`packages/registry/src/frameworks.test.ts`) holds every file to an entry for every member, a
reason for every absent one, and no native member that composes one absent there.
`pnpm new:member` writes a `DECIDE` placeholder into each map, which the law refuses until the
author decides.

## Screens

A screen is either hand-written code that obeys the [red rules](rules.md), or a **spec**. A spec is
a declarative JSON document that names an archetype, the members it composes, their variants and
their content bindings. It has no way to express style. Specs are validated against the registry and
emitted (`pnpm emit`) for any web framework, or, when the spec names `ios` or `android` as its
platform, as a SwiftUI or Compose screen held to the **screen contract**
(`design/native/screen-contract.md`): a stateless view of a model and a record of actions, with
navigation, state and asynchronous work left to the app. When the system changes, screens are
re-emitted instead of migrated by hand. See [tooling.md](tooling.md) and [native.md](native.md).

A page is one archetype. In an app framed by `AppShell`, each route renders one page archetype as
the shell's content: a ListPage, DetailPage, FormPage, SettingsPage, Dashboard, MasterDetailPage,
SearchPage or ConversationPage (`design/archetypes/app-shell.md`). The archetype brings the page's
one opener, its measure and its heading outline, so a route does not rebuild them from PageHeader
and Stack. A list whose selected item's detail is read beside it is a MasterDetailPage, not a
ListPage with the detail drawn under the table. A page whose subject is a query and what it found
is a SearchPage. A flow of steps inside the shell is a FormPage with a Stepper above the step's
card. Sign-in, sign-up and reset pages are an AuthPage, outside the shell. So is a page that is
only a status (nothing at this address, access refused, a failure) and a step that runs before the
shell. A compound part belongs to its member: `Dashboard.Panel` is a region of a Dashboard, and a
titled group on any other page is a Card with a `title`.

## How the system changes

Every change is made at the decision layer, never at call sites.

| Change | What you edit | What propagates |
| --- | --- | --- |
| **Re-theme** | a system's axes or a palette's seeds | CSS is re-derived; zero application-code changes |
| **Pattern amendment** | a member or archetype | every consumer picks it up; vendored copies via `polymorph update` |
| **Vocabulary change** | add, deprecate or delete a member | deprecation carries an owner and an end date; the old way is deleted, not left beside the new one |

"Two ways to do one thing" is a temporary state with an owner and an end date. If the old way is
still there, the migration is not done.

When a screen needs something the vocabulary cannot express, treat that as a gap to report, not
something to work around. Either propose a decision (a new variant, token or member, admitted on
recurrence) or take a declared exception from the [exception ladder](rules.md#the-exception-ladder).
There are no silent overrides.

## For agents

Agents use the system through the same surfaces as people:

- **The registry** describes the whole system (members and their props, tokens, rules, the ladder)
  in a form small enough to hold in context (`registry/system-card.md`).
- **Screens are built by selection.** An agent building a screen chooses from the vocabulary, so its
  output is consistent because of the vocabulary, not because of the prompt.
- **Red rules give feedback.** Each violation names the rule and what it forbids. The registry maps
  every rule to the ladder rungs that would allow the deviation. An agent can therefore correct
  itself without a person.
- **The MCP server** exposes all of this as tools, each taking the framework or platform the agent
  builds for. See [tooling.md](tooling.md).
- **The agent eval** (`pnpm eval`) measures how often a real model, given a brief and these tools,
  produces a lawful screen, and how often that screen has every part the brief requires
  ([verification.md](verification.md#the-agent-eval)).

## Non-goals

- **Not an application framework.** No routing, data fetching or state management. The app's
  router owns navigation: `Link`, AppShell's nav items, `Breadcrumbs`, `SectionNav` and
  `List.Item` take `onNavigate`, which hands the router the clicks it should route
  ([consuming.md](consuming.md#routing)).
- **Not a canvas or site builder.** There is no free-form drawing surface.
- **Not open-ended styling.** Members take no `className`/`style` passthrough in application code.
  One-offs go through the exception ladder. Recurring needs are promoted into the vocabulary.
- **Not a design-tool bridge.** Code is the source of truth.
- **Not pixel parity across platforms.** A native member wraps the platform's own control and
  applies the pairing's tokens to it. It makes the same decisions as the web member, in the
  platform's idiom.
- **Not for every product.** The model fits best where consistency at scale is the main problem:
  multi-team products, multi-brand and tenant platforms, internal tools, workflow-heavy apps, and UI
  that agents generate or modify. Marketing sites and products that compete on visual novelty will
  take more exceptions from the exception ladder.

## Known tensions

These are the parts of the model that are hardest to get right. Changes here need the most care:

1. **Coherence constraints** encode design judgment. They are the most valuable and the most fragile
   part of the system. They are generalised from the curated house systems, not invented in the
   abstract.
2. **Vocabulary selection.** With too few members, people turn to exceptions. With too many, members
   are hard to find and get rebuilt. Members are admitted on recurrence.
3. **Promotion speed.** If proposing a new variant is slow, people and agents work around the
   system. The exception ladder works only if promotion, its exit, is fast.
4. **Theme scope vs contextual scope.** Which decisions a subtree may re-assign (density yes,
   geometry no) shapes the theme schema. Reasonable designs disagree on it.
5. **Exception budget.** Patches and Bespoke zones are the most likely source of drift, even when
   declared. The inventory is public. A recurring exception is either promoted or deleted. A growing
   inventory is treated as a gap in the vocabulary.

## Glossary

| Term | Meaning |
| --- | --- |
| **Vocabulary** | The closed set of members, specified in `design/`. Also each renderer's package of them: `@polymorph/react-ui`, `@polymorph/vue-ui`, `@polymorph/svelte-ui`, `@polymorph/solid-ui`, `@polymorph/angular-ui`, `@polymorph/elements-ui`, `PolymorphUI` (iOS), `dev.polymorph.ui` (Android). |
| **Member** | One component in the vocabulary. |
| **Tier** | A group of members: `structure`, `controls`, `overlays`, `layout`, `charts`, `ai`, `archetypes`. |
| **Renderer** | What draws the vocabulary in one framework or on one platform: React, Vue, Svelte, Solid, Angular, the elements, SwiftUI or Compose. See [Renderers](#renderers). |
| **Foundation** | A web renderer's base package (`@polymorph/react`, `@polymorph/vue`, `@polymorph/svelte`, `@polymorph/solid`, `@polymorph/angular`, `@polymorph/elements`): the engine re-exported, the icon gateway, motion and the conventions its members are written with. A native renderer's foundation is the file its members share (`PolymorphUI.swift`, `PolymorphUI.kt`) with its topic files. |
| **Description** | A member stated once without a framework, in `packages/shells/src/members/`: template, state, machine binding, effects, states fixture. `pnpm shells` generates each framework's member from it. |
| **Shell** | A member as one generated framework writes it: a Vue, Svelte, Solid or Angular component, or an element, generated from its description. The behaviour conformance law calls the member under test in any renderer "the shell". |
| **Platform** | Where a screen runs: `web`, `ios` or `android`. |
| **Platform map** | `design/platforms/*.json`: each member's status on each platform, `native`, `adapted` (with how it renders) or `absent` (with a reason and a substitute). |
| **Framework** | How a web screen is written: `react`, `vue`, `svelte`, `solid`, `angular` or `elements`. An option of the emitter and the tools, never a field of a screen spec. |
| **Element** | A member as a custom element, `poly-` and its kebab name (`<poly-button>`), which renders the generated Solid member into itself in the light DOM and draws no box of its own. See [frameworks.md](frameworks.md#from-react-to-elements). |
| **Framework map** | `design/frameworks/*.json`: whether each generated web vocabulary ships each member, `native` or `absent` with a reason. React has no map: every member is native there. |
| **Native member** | A SwiftUI view in `platforms/ios/Sources/PolymorphUI` or a Compose object in `platforms/android/ui`, written by hand against its contract. |
| **Contract** | Three things, each named in full where it matters. A member's **behaviour contract** is the `contract` fence in its spec, run against every web renderer by the conformance law. A native member's **contract** is the props type and rendering protocol `pnpm native:contracts` generates for it. The **screen contract** (`design/native/screen-contract.md`) is what an emitted native screen is. |
| **Agent fence** | The `agent` fence at the end of a spec's `## Agent` section: the states an agent on a running page may read from the member and the actions it may run, which the conformance law runs against every web renderer. A member with none is not visible to agents. See [agents.md](agents.md). |
| **Agent bridge** | What `createAgentBridge` (`@polymorph/engine/agent`) returns: the API through which an agent reads and operates the mounted members that registered a **handle**, the states and actions their agent fences declare. See [agents.md](agents.md). |
| **Pending list** | `packages/native/src/pending.ts` (iOS) and `kotlin-pending.ts` (Android): the members a platform map marks native or adapted that have no rendering there. Its length is pinned by the native conformance law. |
| **Gate** | The check a change must pass on the machine where it is made, one per platform: `pnpm gate` (web), `pnpm gate:ios` and `pnpm gate:android`. The web has a second, `pnpm gate:engines`, which repeats its browser tests on Firefox and WebKit. See [verification.md](verification.md). |
| **Archetype** | A member that is a whole-page anatomy (`ListPage`, `FormPage`, …). |
| **System** | Every design decision other than the colour seeds: eight design axes, three font slots, defaults. A JSON document in `design/systems/`. |
| **Palette** | The colour seeds a product uses. A JSON document in `design/palettes/`. |
| **Pairing** | One system × one palette — the unit that resolves to tokens and is applied to the DOM (`data-system`, `data-palette`) or to a native app's root (`.pmTheme(_:)`, `ProvidePMTheme`). Informally, "a theme". |
| **Axes** | The eight parameters a system sets (geometry, depth, density, …). See [theming.md](theming.md). |
| **House system** | A system shipped in this repository's `design/systems/`. |
| **Token** | A `--pm-*` CSS custom property emitted by the theme engine; on a native platform, the same value as a Swift, Kotlin or Dart property of the pairing's `PMTheme`. |
| **Token document** | A resolved pairing as plain JSON, every value structured, for a runtime that is not CSS: how a tenant theme known only at run time reaches a native app. See [theming.md](theming.md). |
| **Recipe** | A member's `*.module.css` — its styling, written in tokens only. Recipes have no framework code and live in their own package, `packages/recipes` (`@polymorph/recipes`), so every web framework's members import the same file. |
| **Red rule** | A lint rule (ESLint or Stylelint) that fails the gate. See [rules.md](rules.md). |
| **Law** | A test that enforces a design claim — contrast, completeness, coherence, wiring, conformance. |
| **States fixture** | A member's list of every state it promises, which the completeness law renders: `*.states.tsx` in React, a generated fixture in each other web framework, `<Member>States` in a native member's file. |
| **Spec** | A member's design document in `design/components/` or `design/archetypes/`; also a screen document in `design/screens/`. |
| **Exception ladder** | The five declared ways to deviate, most-governed first. See [rules.md](rules.md#the-exception-ladder). |
| **Bespoke zone** | A declared `<Bespoke>` boundary where vocabulary rules are suspended for a genuine one-off. |
| **Third-party boundary** | A declared `<ThirdParty>` boundary around a component another library draws. It names the library and lifts only what hosting it needs. |
| **Instance patch** | A single member instance re-assigning semantic tokens through its `patch` prop. |
| **Contextual scope** | A subtree re-assigning a named decision (`DensityScope`, `ToneScope`). |
| **Inventory** | `pnpm inventory`: every declared exception in application code, and any undeclared one. |
| **Registry** | The machine-readable catalogue generated by `pnpm registry` into `registry/`. |
| **System card** | `registry/system-card.md` — the whole system in one read, for people and agents. |
| **Vendor / link** | The two ways another repository consumes the web packages. See [consuming.md](consuming.md). |
| **Workbench** | `apps/workbench` — the designer's app: studio, composer, galleries, mood board. |
| **Relay** | The demo product inside the workbench, built only from the vocabulary. Its screens' specs also emit for the native examples: the inbox and new-ticket form in SwiftUI (`platforms/ios/Examples/Relay`), the inbox in Compose (`platforms/android/examples/relay`). |
