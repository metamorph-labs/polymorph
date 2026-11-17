# @polymorph/spec

Screens as composition, not as code. A **screen spec** is a JSON document that describes a screen:
which components, with which props, bound to which inputs. This package validates a spec against
the registry and emits it as a component in any web framework (React, Vue, Svelte, Solid or
Angular) or, for a spec whose `platform` is `ios` or `android`, as a SwiftUI or Jetpack Compose
screen.

A spec can express only what a screen is allowed to contain. It has no field for a style and no
expression language. A prop is a name and a value, and the name is checked against that
component's props in the registry. `className` fails for the same reason a typo does: no member of
the **vocabulary** (the closed set of polymorph components) has it. A deviation is written as a
declared exception at a rung of the exception ladder, with a reason.

Specs live in `design/screens/`. `inbox.json`, `new-ticket.json` and `settings.json` describe the
screens of Relay, the demo product in the workbench; the workbench composer saves the screens it
composes to the same directory.

## Command

```sh
pnpm emit design/screens/inbox.json                    # React TSX to stdout
pnpm emit design/screens/inbox.json src/Inbox.tsx      # or to a file
pnpm emit design/screens/inbox.json src/Inbox.vue      # Vue; .svelte for Svelte, .ts for Angular
pnpm emit design/screens/inbox.json --framework solid  # Solid TSX
pnpm emit:examples [--check]                           # the native examples' emitted screens
```

`pnpm emit` (bin `polymorph-emit`, `bin/emit.js`) takes the web framework from the output's
extension or from `--framework react|vue|svelte|solid|angular`: `.tsx` for React, or for Solid with
`--framework solid`, `.vue` for Vue, `.svelte` for Svelte, and `.ts` for an Angular standalone
component (`src/emit.ts`, `src/emit-vue.ts`, `src/emit-svelte.ts`, `src/emit-angular.ts`). The
framework is an option and never a field of the spec, so one spec emits for each framework.

The command validates first, checking every member against the framework's vocabulary. If the
spec is unlawful, it writes nothing and prints each fault with its JSON path. A lawful spec
becomes a presentational component. It takes the declared inputs as props, renders the tree, and
holds no state. A hand-written container supplies data and handlers. The output is formatted with
Prettier and then checked against the red rules, and a file that breaks one is not written. The
MCP server's `emit_screen` tool runs the same validation and the same emitter for an agent, and
writes the file into the agent's project.

A spec whose `platform` is `ios` emits SwiftUI (`src/emit-swift.ts`) and one whose `platform` is
`android` Jetpack Compose (`src/emit-kotlin.ts`), to the native screen contract
(`design/native/screen-contract.md`): a model, an actions record and a stateless view. The output
is checked against the native screen contract's law instead of the red rules, and `--framework`
is refused. What the
two share, the partition of inputs and the type table, is `src/emit-native.ts`. Both validate
against the platform's member package as it is in the checkout, so a member without a rendering
there is a fault. `pnpm emit:examples` (`scripts/emit-examples.mjs`) writes each native example's
screens from their specs: Relay's inbox and new-ticket form in `platforms/ios/Examples/Relay`,
which the iOS package builds and renders, and its inbox in `platforms/android/examples/relay`;
`--check` writes nothing and names a screen that differs.

## Entry points

| Import | What it is |
| --- | --- |
| `@polymorph/spec` | `validateSpec(registry, document, options)` → `{ ok, faults }`; `emitScreen(spec, options)` → a promise of the screen's source, in the web framework `options.framework` names (React when absent) or, for a native spec, in Swift or Kotlin against `options.native` (`readNativePackage`); `emitCheckedScreen(spec, options)` → the source plus its violations, for a caller that writes the file; `EMITTED_MARKER`, the text in an emitted file's header; `IMPORT_SOURCE`, `SOLID_IMPORT_SOURCE`, `VUE_IMPORT_SOURCE`, `SVELTE_IMPORT_SOURCE` and `ANGULAR_IMPORT_SOURCE`, the module each framework's screen imports members from; the schema (`SCREEN_SHAPE`, `SPEC_ID` = `polymorph-screen/1`) and the spec types |
| `@polymorph/spec/validate` | `validateSpec` without the emitter, Prettier or a compiler. It runs every check except the one on an input's `type`, which the caller supplies through a `judges` argument. Browser-safe. The composer validates documents in the page through it. |
| `@polymorph/spec/schema` | The schema and types alone. Browser-safe. |

Validation runs two passes. **Shape** checks whether the document is a screen spec at all.
**Meaning** checks it against the registry: every component exists, every prop exists on it with a
value of the right kind, required props are present, the variant × tone cell is lawful, every icon
role is in the closed set, every binding is a path of names whose head is a declared input, and
every exception is at the rung its component really is. Meaning also checks the fields the emitter
prints as code. A component's name must be exactly a member, a binding a path, the names in
`types` identifiers, and an input's `type` exactly one type. So none of them can carry an
expression or a second statement into the emitted file. The `type` check needs the TypeScript
parser, which the browser does not have. `validateSpec` from the root entry runs it, and the
`./validate` subpath skips it. The MCP server's `validate` tool runs the same check when it
receives a spec.

## Tests

In the `logic` vitest project:

```sh
pnpm exec vitest run packages/spec
```

- `src/spec.test.ts`: the format, the validator's faults, and the emitter's output under the
  real red rules.
- `roundtrip.test.ts`: every spec in `design/screens/` validates, emits and typechecks against
  the real `@polymorph/react-ui`, and Relay's specs describe the hand-written screens they
  mirror.
- `src/vue.test.ts`, `src/svelte.test.ts`, `src/solid.test.ts`, `src/angular.test.ts`: the same
  specs emitted for each framework compile with that framework's compiler (or, for Solid, typecheck
  with its JSX types) against its vocabulary, pass every red rule as that framework's file, and
  are the same bytes every time.
- `agent-loop.test.ts`: a scripted agent. A first attempt contains the mistakes agents make, and
  each is reported with a path. A corrected attempt passes every red rule using only what the
  system card names. The fixture is `design/screens/agent-loop/`.
- `src/browser-surface.test.ts`: the browser-safe subpaths import nothing node-only.
- `emit-bin.test.ts`: `pnpm emit` as a command. It checks what the command writes, and the two
  refusals that write nothing.
- `src/emit-swift.test.ts` and `src/emit-kotlin.test.ts`: the native emitters' laws (the names,
  the partition, the type table, no state, task or navigation in the view), the Relay screens'
  emissions pinned as snapshots, and each platform's example held to what `pnpm emit:examples`
  writes; with `xcrun swift`, the iOS example builds and renders.

## Read more

- [docs/tooling.md](../../docs/tooling.md) — the format field by field, validation, emitting,
  the agent loop
- [docs/rules.md](../../docs/rules.md) — the red rules the output passes, and the exception
  ladder a spec declares rungs of
- [docs/verification.md](../../docs/verification.md) — the guarantee that an agent can produce a
  lawful screen from the registry alone
