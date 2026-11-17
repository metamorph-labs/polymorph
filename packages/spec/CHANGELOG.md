# @polymorph/spec

## 1.0.15

### Patch Changes

- @polymorph/registry@1.0.15
- @polymorph/rules@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [9b60a94]
  - @polymorph/registry@1.0.14
  - @polymorph/rules@1.0.14

## 1.0.13

### Patch Changes

- 56e7665: The tools know the elements. The registry lists `elements` among the `frameworks`, publishes each
  member's entry in `design/frameworks/elements.json` with a shell that copies nothing, and names in
  `vendor.frameworks.elements.noBuild` the files a page with no build loads and the command that
  builds them. `get_system_card` with `framework: "elements"` returns the elements card, which says
  how a prop reads as an element. A `.html` file is an elements page in a project that uses the
  elements and not Angular, read from `polymorph.json` where there is no `package.json`.

  `polymorph init <dir> --framework elements` writes a page with no build: the files the page loads
  copied into `public/polymorph/` (`--dir` names the static directory), `theme.css` compiled there,
  an example page, the card, the MCP config and `polymorph.json`. A checkout that has not built the
  files is told to run `pnpm build:packages`. `polymorph add <member>` installs nothing in an elements
  install and says why; `add theme:<system>` writes the theme sheet again with the system added, and
  `update` copies the files again where the build changed them and keeps a file you edited.
  `polymorph check` leaves an elements page unread and says so, because the red rules do not read
  HTML. `pnpm emit`, the emitter and the MCP tool `emit_screen` refuse the elements with the reason:
  HTML has no way to bind a screen's callbacks and node renderers. Every read tool takes
  `framework: "elements"`, and the MCP tools that write accept a project with a `polymorph.json` and
  no `package.json`.

- Updated dependencies [d84171d]
- Updated dependencies [73837b5]
- Updated dependencies [56e7665]
- Updated dependencies [2da1598]
- Updated dependencies [56e7665]
  - @polymorph/registry@1.0.13
  - @polymorph/rules@1.0.13

## 1.0.12

### Patch Changes

- Updated dependencies [9f8c97f]
- Updated dependencies [96daa65]
- Updated dependencies [6119b46]
  - @polymorph/rules@1.0.12
  - @polymorph/registry@1.0.12

## 1.0.10

### Patch Changes

- @polymorph/rules@1.0.10
- @polymorph/registry@1.0.10

## 1.0.9

### Patch Changes

- @polymorph/registry@1.0.9
- @polymorph/rules@1.0.9

## 1.0.8

### Patch Changes

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

- Updated dependencies [820c836]
  - @polymorph/rules@1.0.8
  - @polymorph/registry@1.0.8

## 1.0.4

### Patch Changes

- @polymorph/rules@1.0.3
- @polymorph/registry@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
- Updated dependencies [1b900d8]
  - @polymorph/rules@1.0.2
  - @polymorph/registry@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [192c31c]
  - @polymorph/registry@1.0.2

## 1.0.1

### Patch Changes

- 700e130: Screen specs emit for every web framework, for SwiftUI and for Compose, and their code fields are each held to what they claim to be.

  **Breaking.**

  - An emitted React screen imports its members from `@polymorph/react-ui`, which is the value of `IMPORT_SOURCE`, where it imported `@polymorph/ui`.
  - `validateSpec` rejects four things it used to accept. **A binding that is an expression**: `{ "$": "items.map(…)" }`, `{ "$": "onSave()" }` and `{ "$": "items[0]" }` are faults; a binding is a declared input or a dotted path of names into one (`draft.subject`), and the rule is also a `pattern` in the published JSON Schema. **A `component` with more than two segments**: the name is matched whole. **An input `type` that is not one TypeScript type**: it is parsed by the TypeScript parser and must be a single type made only of type syntax; the browser-safe `@polymorph/spec/validate` subpath takes this check as an optional `judges` argument. **A `types` entry that is not an importable name**, a module key that holds a quote, backslash or space, and a structured object (`$object`) among children. Compute a value in the container and hand it in as an input. Every spec in `design/screens/` is unaffected.

  **Every web framework.** `emitScreen(spec, { framework, registry })` writes a Vue single-file component (`framework: 'vue'`), a Svelte component (`'svelte'`: a node-typed prop is a snippet, a callback a prop), Solid TSX that reads its inputs from `props` (`'solid'`), or an Angular standalone component module (`'angular'`: selector `app-<name>`, an inline template, every input a signal input, a node-typed prop projected through `ngProjectAs="[slot=…]"`). Validation checks every member against that framework's vocabulary first, and `MissingRegistryError` names the framework that needs the registry. `pnpm emit` chooses the framework from the output's extension (`.vue`, `.svelte`, `.ts`) or `--framework`. Exports: `SVELTE_IMPORT_SOURCE`, `SOLID_IMPORT_SOURCE`, `ANGULAR_IMPORT_SOURCE`, `angularScreenSelector`.

  **Native screens.** A spec's `platform` field names where the screen runs. A spec whose `platform` is `ios` or `android` is never emitted as web code: it emits SwiftUI (`.swift`) or Jetpack Compose (`.kt`), held to the native screen contract (`design/native/screen-contract.md`): a model, a record of actions and a stateless view, against the platform's member package. Validation refuses a member absent on the spec's platform, and, for a native spec, everything the screen contract forbids, each at its path.

  **Emission is checked and exact.** `pnpm emit` lints the emitted screen and writes nothing if a red rule refuses it, and a native screen is held to the contract's law. The emitter prints text so it cannot mean something else: `*/` in `purpose`, a `doc` or an exception's `because` does not end its comment; a string with a line break or a character reference is written as an expression; a text child keeps its spacing. A declared exception on the root element, a list of plain values in a prop, and a string containing a line break each emit a file that parses. Exports: `EMITTED_MARKER` (the words an emitted file's header carries), `emitCheckedScreen`, `BINDING_PATH` and the `SpecJudges` type. The package depends on `typescript`.

- Updated dependencies [700e130]
- Updated dependencies [700e130]
  - @polymorph/registry@1.0.1
  - @polymorph/rules@1.0.1

## 1.0.0

The first versioned release. Earlier history is in git.
