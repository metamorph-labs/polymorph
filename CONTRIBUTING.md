# Contributing

How changes are made here, and the steps for the most common one: adding a member to the
vocabulary. Setup and commands are in [README.md](README.md). The model is in
[docs/concepts.md](docs/concepts.md).

## Before you start

- **Licence.** Polymorph is MIT-licensed. By opening a pull request you agree that your
  contribution is licensed under the same terms ([LICENSE](LICENSE)). There is no separate CLA.
- **Conduct.** Everyone follows the [code of conduct](CODE_OF_CONDUCT.md).
- **Security issues** are reported privately ([SECURITY.md](SECURITY.md)), never as an issue.
- **Bugs** are issues with a reproduction. **New members, variants, tokens and rules** start as a
  proposal issue. The vocabulary is closed on purpose, and a member is added only when the need
  recurs, so the case for it is made before the code.

## How a change lands

1. **Plans live in GitHub issues.** Proposals, roadmaps and follow-ups are issues, not files in
   the repository. The repository documents only the current state.
2. **Change the decision where it is owned.** A colour is a palette seed, a radius is a system
   axis, a focus ring is a member convention. If you find yourself editing many call sites, the
   change belongs one layer down. [docs/concepts.md](docs/concepts.md#how-the-system-changes)
   describes the change classes.
3. **Write the law first.** Every claim the system makes has a test behind it, written to fail
   before the change that satisfies it. Seeing it fail first shows that the passing result comes
   from your change.
4. **Keep the gates green.** Each platform has a gate. `pnpm gate` is the web gate: typecheck,
   lint, inventory, the suite, coverage, both apps' builds, the layout scan of the workbench's
   pages (`pnpm layout`), the packages' builds, the size budgets (`pnpm size`) and the Next.js
   gate (`pnpm gate:next`), which builds a Next.js application from the published React builds.
   `pnpm gate:ios` checks the SwiftUI members and needs Xcode.
   `pnpm gate:android` checks the Compose members and needs a JDK: the wrapper fetches Gradle, and
   the Android library and its audit run only where an Android SDK is installed.
   `pnpm gate:engines` repeats the web gate's browser tests on Firefox and WebKit and needs
   Playwright's builds of both. There is no hosted CI, so run the gate for what your change
   touches before you merge. A change to a member, a recipe or a foundation runs
   `pnpm gate:engines` as well as `pnpm gate`
   ([docs/verification.md](docs/verification.md#the-engines-gate)). A
   size ceiling in `scripts/size/budgets.json` is raised only with its reason in the same
   commit. `pnpm size --why` shows which package the bytes came from
   ([docs/verification.md](docs/verification.md#size-budgets)).
5. **Record public changes.** If you change a package's public surface (its `exports`, a
   member's props, a token name), add a changeset with `pnpm changeset`. Choose major, minor or
   patch as [`.changeset/README.md`](.changeset/README.md) defines them. Prefer additive,
   optional changes, because a breaking change is a major release for every consumer.
6. **Write comments and docs for a reader with no context**: present tense, the reason the
   code is shaped this way, no plan identifiers or history. Link docs by file.

| You want to change… | Where it is owned | Read |
| --- | --- | --- |
| a colour, a font, density, geometry | `design/systems/*.json`, `design/palettes/*.json` | [docs/theming.md](docs/theming.md) |
| how motion feels | `design/motion/motion.json` | [docs/motion.md](docs/motion.md) |
| which glyph an icon role uses | `design/icons.json` | [`design/icons.md`](design/icons.md) |
| a member's look, states or API | its spec in `design/components/`, its recipe in `packages/recipes/src/<tier>/`, its React member in `packages/react-ui/src/<tier>/`, its description in `packages/shells/src/members/`, and its SwiftUI and Compose files | below |
| how a generated framework writes every member | the renderer in `packages/shells/src/{vue,svelte,solid,angular,elements}.ts` or the foundation in `packages/{vue,svelte,solid,angular,elements}` | [docs/shells.md](docs/shells.md) |
| which members a platform or framework renders | `design/platforms/*.json`, `design/frameworks/*.json` | [docs/concepts.md](docs/concepts.md#platforms) |
| what application code may do | `packages/rules` | [docs/rules.md](docs/rules.md) |
| a screen in the demo product | `apps/workbench/src/relay/` (composition only) | [docs/rules.md](docs/rules.md) |

## Adding a member

A member is specified once and rendered everywhere it ships: its spec in `design/`, its React
member and recipe, its description for the generated web frameworks, and its SwiftUI and Compose
renderings or their pending entries. `pnpm new:member` writes a stub of each and every entry the
member needs, and the laws refuse the member until each decision the stubs leave open is made.

### 1. Read the system before adding to it

```sh
pnpm registry      # writes registry/system-card.md — generated, never committed
```

The system card describes the whole system in one file: the rules that will stop you, the token
families, the members that already exist and the props they take, and what each framework and
platform renders. It is built from the tree you are working in, so it is never stale.

Then read **one member end to end**, because the card lists the API but not how a member is
written. `Timeline` is small and representative:

| File | What it is |
| --- | --- |
| `design/components/timeline.md` | the spec: what it is, what it is *not*, exact tokens, states, accessibility |
| `packages/react-ui/src/structure/Timeline.tsx` | the React member |
| `packages/recipes/src/structure/timeline.module.css` | the recipe, tokens only, imported as `@polymorph/recipes/structure/timeline.module.css` |
| `packages/react-ui/src/structure/timeline.states.tsx` | the states fixture the laws render |
| `packages/react-ui/src/structure/timeline.test.tsx` | the claims that need a real browser |
| `packages/shells/src/members/timeline.ts` | the description `pnpm shells` writes the Vue, Svelte, Solid and Angular members and the element from |
| `platforms/ios/Sources/PolymorphUI/Timeline.swift` | the SwiftUI rendering, with its states fixture |
| `platforms/android/ui/src/main/kotlin/dev/polymorph/ui/Timeline.kt` | the Compose rendering, with its states fixture |
| `design/platforms/*.json`, `design/frameworks/*.json` | its entry on each platform and in each framework |

Check first whether what you want already exists under another name. The vocabulary is closed
to prevent duplicate members, and a member is admitted on recurrence: the same need in more
than one place, on any platform. If what you need is a one-off, the
[exception ladder](docs/rules.md#the-exception-ladder) is the declared way to deviate.

### 2. Generate it

```sh
pnpm new:member Sparkline --tier charts        # structure | controls | overlays | layout | charts | ai | archetypes
pnpm new:member Sparkline --dry-run            # print the files and the wiring edits, write nothing
```

It writes six files: the React member, its recipe, its states fixture, its browser test, its spec
and its description (`packages/shells/src/members/<name>.ts`). It then writes every entry the
member needs elsewhere:

- the four hand-written lists: the export pair in `packages/react-ui/src/index.ts`, the import
  and array slot in `galleries.ts`, both arrays in `galleries.test.tsx`, and the stylesheet
  entries in `selectors.test.ts`;
- an entry in each platform file, `design/platforms/{web,ios,android}.json`;
- an entry in each framework map, `design/frameworks/{vue,svelte,solid,angular,elements}.json`;
- the member in each phone platform's pending list (`packages/native/src/pending.ts` for SwiftUI,
  `kotlin-pending.ts` for Compose), with the count its law pins (`PENDING_COUNT` in
  `packages/native/src/laws.test.ts`, `KOTLIN_PENDING_COUNT` in `kotlin-laws.test.ts`) raised by
  one.

It refuses a name that already exists; `--rewire` on an existing member fills in only the files
and entries it is missing, which is the repair when a law tells you one is gone. It adds no member
to a pending list that already has a rendering or is absent on that platform, and writes no
description for a member every framework map marks absent.
`packages/react-ui/new-member.test.ts` runs it against a copy of those files.

### 3. Decide

**The generator decides nothing.** Every `DECIDE` marker it leaves is a design decision, and the
laws refuse the member until each is made.

- **The spec.** What the member is and is not, the exact tokens, the states table, the motion,
  the accessibility reading, and whether it needs `'use client'`. The stubs provide the
  structure; making these decisions is the work. Where the member belongs in the gallery's
  reading order is a decision too.
- **A behaviour contract**, for a member with keyboard, focus, dismissal or announcement
  behaviour. End its spec's A11y or Behaviour section with a `contract` fence, one statement per
  line in the grammar [docs/conformance.md](docs/conformance.md) defines, and add locators for its
  parts in `packages/conformance/src/parts.ts`. The conformance law runs every statement against
  the member in every web renderer, in Chromium.
- **An agent section**, for a member an agent on a running page should read or operate (every
  control and overlay, and any other member a person acts on). End its spec with an `## Agent`
  section whose `agent` fence declares the states an agent reads and the actions it may run, in
  the grammar [docs/agents.md](docs/agents.md) defines; register the React member with
  `useAgentMember` and give the description an `agent` block that declares the same names. The
  conformance law runs every statement against the member in every web renderer, with an agent
  bridge installed. A member without the section is not visible to agents. A control or an overlay
  an agent has nothing to read or do with keeps the section, with the reason and no fence; the
  coverage law fails on one with no section.
- **The platform entries.** Every member is native on the web, and the web entry is final. The
  `ios` and `android` entries carry a `reason` that begins with `DECIDE`, and the platform law
  refuses it, so nothing builds until you decide from the spec whether the member renders
  natively, adapted (write how, in `as`: "a list on phones") or not at all (`absent`, with a
  `reason` and a `substitute`: the member to use instead, or `none`). A native member that
  composes one absent on that platform keeps a `reason` saying why native still holds. Keep each
  entry to a sentence or two. The statuses are explained in
  [docs/concepts.md](docs/concepts.md#platforms).
- **The framework entries and the description.** Each framework map's entry carries the same
  placeholder, which the framework law refuses. A member is `native` in a framework exactly when
  it has a description. The description's stub renders what the stub component renders: write
  its template to render the React member's DOM, part for part and class for class, take
  behaviour from a Zag machine where one fits, and give its fixture an entry for every React
  entry, with the same name ([docs/shells.md](docs/shells.md#describing-a-member)). Then, in this
  order, because `pnpm shells` builds the registry and the registry refuses a native member whose
  shell is not generated: set each framework entry to `absent` with a reason; run `pnpm shells`;
  set each entry to `native`, without a reason; run `pnpm registry`. The generated members are
  committed. A member no framework can ship stays `absent` in every map, with a `reason` that
  names what the description language cannot express, and has no description.
- **The native renderings.** A member native or adapted on iOS stays in `pending.ts` until its
  SwiftUI file lands, and on Android in `kotlin-pending.ts` until its Compose file lands. Writing
  a rendering ([docs/native.md](docs/native.md), and "Adding a member" in each native gate's
  section of [docs/verification.md](docs/verification.md#the-ios-gate)) removes the member from
  the list and lowers the pinned count in the same change. So does marking it `absent` on that
  platform. Run `pnpm native:contracts` after deciding the platform entries, so the contracts the
  renderings conform to include the member.

### 4. The laws that will judge it

| Law | What it will not let you ship |
| --- | --- |
| completeness + axe (`packages/react-ui/src/laws.test.tsx`) | a states-fixture entry that renders nothing it promised, or has an accessibility violation |
| required selectors (`packages/react-ui/src/selectors.test.ts`) | a state no prop can reach (hover, focus, a substrate's own attribute) that the stylesheet never styles; the fixture lists them in `requiredSelectors` |
| values (`polymorph/token-values-only`, Stylelint) | a colour, length, radius, shadow or duration written as a value instead of a `--pm-*` token |
| token existence (`packages/rules/src/token-references.test.ts`) | a `var()` or `style()` naming a token that does not exist, which makes CSS silently discard the whole declaration |
| spec staleness (`packages/rules/src/spec-api.test.ts`) | a prop the code ships and the spec does not declare, or the reverse |
| `'use client'` (`packages/rules/src/client-directive.test.ts`) | a module that needs the directive and lacks it, or has one it does not need |
| one opener (`polymorph/one-opener`) | a page composing both a `PageHeader` and a `Hero` |
| wiring (`packages/react-ui/src/wiring.test.ts`) | a member missing from any of the four lists, named with the list it is missing from |
| platforms (`packages/registry/src/platforms.test.ts`) | a member with no entry in a platform file, an entry that still has the scaffold's `DECIDE` placeholder, an adapted entry that does not say how it renders, an absent one without a reason or with a substitute that does not exist, a native one composing a member absent there without a reason, or an absent member on the web |
| frameworks (`packages/registry/src/frameworks.test.ts`) | a member with no entry in a framework map, a `DECIDE` placeholder, an absent entry without a reason, or a native entry that composes a member absent there |
| behaviour conformance (`packages/react-ui/src/conformance.test.tsx` and each generated vocabulary's `src/conformance.test.ts`) | a statement in the spec's `contract` fence that does not hold for the member in a web renderer, or a ledger entry that no longer diverges or diverges for another reason; an overlay, control or other member that takes keys or focus, dismisses or announces with no contract is caught by `packages/registry/src/registry.test.ts` |
| agent conformance (the same test files, through `agentConformanceLaw`), the agent grammar (`packages/registry/src/agent.test.ts`) and agent staleness (`packages/registry/src/agent-staleness.test.ts`) | an `agent` fence that does not parse or names what the member lacks, a state or action the fence declares that the React member or the description does not register or the reverse, and a statement that does not hold for the member in a web renderer |
| the generated vocabularies (`packages/shells/src/shells.test.ts`, `packages/{vue,svelte,solid,angular,elements}-ui/laws.test.ts` and `src/laws.test.ts`) | a generated member that is not what `pnpm shells` writes, a fixture missing a React entry, props that are not the registry's, a member native in a map without a description or the reverse, an entry that renders nothing it promised or fails axe |
| parity (`packages/elements-ui/src/parity/`) | an element whose document, with each element replaced by its children, is not its Solid member's, or a `[data-member]` box of another size |
| the native laws (`packages/native/src/laws.test.ts`, `kotlin-laws.test.ts`) | a native or adapted member with neither a rendering nor a pending entry, a pending list whose length is not its pinned count, and in a rendering a raw value, a literal string or an import outside containment |
| the native contracts (`packages/native/src/contracts.test.ts`, `kotlin.test.ts`) | contracts that are not what `pnpm native:contracts` writes |

```sh
pnpm typecheck && pnpm test && pnpm lint
pnpm registry      # so the system card and the docs site see the new member
pnpm gate:engines  # the member's tests again, on Firefox and WebKit
pnpm gate:ios      # when a SwiftUI rendering lands
pnpm gate:android  # when a Compose rendering lands
```

A law that stops you is a decision the system has already made, not an obstacle to work
around. Satisfy it, or declare the exception where the ladder says exceptions go.

### 5. The changeset

A new member is a minor change to each package that ships it: `@polymorph/react-ui`, and each
generated vocabulary whose map marks it native. Add a changeset with `pnpm changeset` that names
those packages and says what the member is for. A native rendering ships with the repository's
release tag, so it needs no changeset ([`.changeset/README.md`](.changeset/README.md)).

### Members an agent submits

A member written by an agent is admitted on the same terms as one written by a person, and only
on recurrence: the need appears in more than one place, and the proposal issue shows where. The
pull request carries at least a spec, a states fixture, an entry in every platform file and a
green gate for what it touches. Everything `pnpm new:member` writes is part of that, so an agent
starts there; the laws then hold its decisions to the same standard as anyone's. A member whose
need does not recur is answered by the exception ladder, not admitted.

### The four lists, if you ever wire one by hand

They are hand-written on purpose. Both arrays in `galleries.test.tsx` could be derived from
`galleries.ts` in one line, but they would then assert that a list equals itself. That is true
of every list, including one a bad rebase shortened. As an independent copy, they pin
membership, order and route. The generator writes them, and the wiring law fails when one is
missing an entry. The full reasoning is at the top of `packages/react-ui/src/galleries.test.tsx`.

## Adding a system or palette

Use the studio in the workbench (`pnpm dev`) to design one and save it to `design/`, or write
the JSON by hand. The theme laws check it when the suite runs: schema, coherence, contrast for
every lawful pairing, and the catalogue laws that keep the house systems distinct.
[docs/theming.md](docs/theming.md) explains each.

## Changing a red rule

Rules live in `packages/rules/src/rules/` (ESLint) and `packages/rules/src/stylelint/`
(Stylelint), each with a test next to it. Every rule also needs a row in
`packages/rules/src/ladder.ts` naming the ladder rungs that answer it (none, for a rule about
ownership rather than deviation), and `packages/rules/src/fixtures.test.ts` enforces that every
application rule has one. After changing a rule's implementation,
clear ESLint's cache (`rm -rf node_modules/.cache/eslint`) before trusting `pnpm lint`.

## Releasing

A release ships every package, each the way its kind is shipped:

| Packages | Versioned by | Shipped by |
| --- | --- | --- |
| The published web packages: `@polymorph/engine`, `@polymorph/rules`, `@polymorph/recipes`, and the foundation and vocabulary of each web framework (`@polymorph/react`, `@polymorph/react-ui`, `@polymorph/vue`, `@polymorph/vue-ui`, `@polymorph/svelte`, `@polymorph/svelte-ui`, `@polymorph/solid`, `@polymorph/solid-ui`, `@polymorph/angular`, `@polymorph/angular-ui`) | changesets: the release's version, in each `package.json` | `pnpm publish:packages`, to GitHub Packages, and with `--to npmjs` to npmjs.com, as `@metamorph-labs/polymorph-<name>` |
| The internal packages: `@polymorph/theme`, `@polymorph/registry`, `@polymorph/cli`, `@polymorph/mcp`, `@polymorph/spec`, `@polymorph/shells`, `@polymorph/conformance`, `@polymorph/native` | changesets: the same version, with their changelogs | nothing: they run from a checkout |
| The native packages: `platforms/ios`, `platforms/android`, `platforms/dart` | the repository's release tag | the tag: an app pins its checkout or submodule to it |

A release has one version. Changesets moves every package to it together (`fixed` in
`.changeset/config.json`), and the tag is `v` and that version, so a consumer pins the npm
packages and the native checkout at one number.

Releases are cut from a clean `main`, locally:

```sh
pnpm eval                                 # the owner's step, with ANTHROPIC_API_KEY set or with --runner cli and Claude Code signed in; commit eval/results and eval/README.md
pnpm changeset status --verbose           # the version the release gives every package
pnpm version-packages                     # apply pending changesets: the version and CHANGELOGs
git commit -am "Release <version>"        # the version bump is a commit like any other
pnpm gate:ios && pnpm gate:android        # the gates for the native packages, which ship at the tag
pnpm gate:engines                         # the browser tests on Firefox and WebKit, which pnpm gate runs on Chromium only
pnpm publish:packages                     # pnpm gate, then build, pack, rewrite, check, upload
git tag -a v<version> -m "Release <version>"   # the publish script prints this line with the version
git push origin main v<version>           # the tag by name: --follow-tags skips a lightweight tag
node scripts/publish-packages.mjs --to npmjs   # the same release to npmjs.com, as public packages
```

Each gate runs before what it covers ships. `pnpm publish:packages` runs `pnpm gate`, the gate for
everything it uploads, first, and stops if it is red, so an upload cannot skip the laws; there is
no hosted CI to run them otherwise. The native packages ship at the tag rather than through the
script, so `pnpm gate:ios` and `pnpm gate:android` run before it. `pnpm gate:engines` runs before
it too: the script's gate runs the browser tests on Chromium, and this one repeats them on Firefox
and WebKit. On a machine without an iOS
simulator runtime or an Android SDK, each native gate checks what it can and says what it
skipped.

The script then builds each package that has a build (`@polymorph/recipes` ships its source),
packs them, renames them for the registry (each `@polymorph/*` dependency between them, such as
`@polymorph/react` and `@polymorph/recipes` in `react-ui` or `@polymorph/engine` in `react` and
`rules`, becomes an `npm:` alias of its registry name), checks that each manifest names nothing
unpublished and every export target ships, refuses a version that is already published, and
uploads. Before any of that it reads the release's version from the packages. It stops if they
disagree, or if the tag for that version already exists. The registry names come from `PUBLISHED_NAMES` in `packages/registry/src/install.ts`,
and the script fails when that table and its own list disagree.
`node scripts/publish-packages.mjs --dry-run` does everything but the upload, the gate included,
and `--out <dir>` keeps the final tarballs. It authenticates with `NODE_AUTH_TOKEN`, or the GitHub
CLI's token, which needs `write:packages` (`gh auth refresh -s write:packages`). A published
version cannot be replaced: a mistake is fixed by the next patch release.

`--to npmjs` publishes the same packages to npmjs.com under the same names, as public packages.
Once the release is tagged, it publishes only from a commit that differs from the tag in the
publish script alone, so both registries hold what the tag holds. It authenticates with
npmjs.com's trusted publishing when it runs in a GitHub Actions job with `id-token: write`, else
with `NPM_TOKEN`, else with the login in your own `~/.npmrc`. A token has to bypass two-factor
authentication, or each upload stops for a one-time code.
