# @polymorph/theme

The theme engine: **axes and seeds in, a resolved and law-checked token set out.** Every visual
value polymorph renders (colour, type, space, radius, shadow, motion) is derived here from a few
decisions, checked against the laws below, and emitted as `--pm-*` CSS custom properties for the
web, as Swift, Kotlin and Dart sources for the native token packages under `platforms/` (SwiftUI's
`PolymorphTokens`, Compose's `:tokens`, Dart's `polymorph_tokens`), and as a token document, the
same decisions as JSON. No token sheet is written by hand.

A **system** is a JSON document of eight design **axes** (geometry, depth, density, contrast
temperament, type personality, colour strategy, motion temperament, ornament) plus its font
slots. A **palette** sets the colour: accent hue, neutral tint, chroma budget. A **pairing** is
one system with one palette, resolved as one theme. Any palette is lawful on any system. The
house catalogue is in [`design/systems/`](../../design/systems) and
[`design/palettes/`](../../design/palettes), but the engine does not read the catalogue. It takes
the two documents from any author. [docs/theming.md](../../docs/theming.md) explains the axes,
the colour engine and the runtime in full.

```
system.json + palette.json
  → parseSystem / parsePalette → composeTheme → resolveTheme → emitThemeCSS → --pm-* CSS
                                                             → emitSwift / emitKotlin / emitDart → native tokens
                                                             → emitTokenDocument → JSON
```

## Entry points

The `exports` map points at TypeScript source; there is no build step for this package.

| Import | What it is |
| --- | --- |
| `@polymorph/theme` | Everything: the axes and their schemas, `parseSystem`, `parsePalette`, `composeTheme`, `resolveTheme`, `emitThemeCSS` / `emitThemesCSS`, `emitTokenDocument` / `emitTokenDocumentJSON` with `TOKEN_DOCUMENT_SCHEMA` and `PLATFORM_FLOORS`, the native emitters (`emitSwift` / `emitSwiftFiles`, `emitKotlin` / `emitKotlinFiles`, `emitDart` / `emitDartFiles`, with `nativeName` and `nativePairingNames`), the colour engine (ramps, roles, `auditPairings`), `deriveNonColorTokens`, `cssVar` / `cssVarName`, `auditCoherence`, the admission and runtime functions below, and the `example*` engine fixtures |
| `@polymorph/theme/admit` | `admitTheme`: takes two JSON documents and returns either a lawful pairing (resolved tokens, CSS, fonts to install) or a report of every law that failed. It never throws. Also `auditResolvedTheme`, `systemJsonSchema`, `paletteJsonSchema` and `ADMISSION_EXEMPTIONS` |
| `@polymorph/theme/runtime` | The only module that touches the DOM. It imports nothing from the theme engine: `installThemeCSS`, `appendThemeCSS`, `setSystem`, `setPalette`, `getSystem`, `getPalette`, `setMode`, `setDensityDefault`, `setMotionTemperament`, `hydrateTheme`, `PREPAINT_SCRIPT`, `prepaintScript`, `DATA_ATTRS`. A consumer imports it as `@polymorph/engine/runtime` |

Another repository imports all of this through `@polymorph/engine`, which bundles this package
and re-exports the whole root entry. [docs/consuming.md](../../docs/consuming.md) shows that
route: the Vite plugin from `@polymorph/engine/vite` compiles themes at build time, and
`admitTheme` from `@polymorph/engine` admits a theme known only at run time. The example below is
the in-repository route, which imports this package directly.

```ts
import { composeTheme, emitThemeCSS, parsePalette, parseSystem, resolveTheme } from '@polymorph/theme'
import { installThemeCSS, setPalette, setSystem } from '@polymorph/theme/runtime'

const resolved = resolveTheme(composeTheme(parseSystem(systemJson), parsePalette(paletteJson)))
installThemeCSS(emitThemeCSS(resolved)) // every density, temperament and mode in one block set
setSystem(resolved.system)
setPalette(resolved.palette)
```

`pnpm emit:theme <system> <palette> [out.css]` writes one pairing's sheet to a file, for review
or handoff.

## Where things live

| File | Holds |
| --- | --- |
| `src/axes.ts`, `src/seeds.ts`, `src/systems.ts` | The axes, the seeds, and the system and palette schemas (including a system's value-only `overrides`) |
| `src/color/` | The colour engine: OKLCH ramps, the role map, contrast measurement and enforcement, the chart wheel |
| `src/derive.ts`, `src/tokens.ts` | Everything that is not colour (type, space, radius, shadow, motion, icons), derived from the axes. Constants marked `TUNED-IN` are taste values set by inspection |
| `src/pairings.ts`, `src/coherence.ts` | The contrast law and the coherence constraints, as data |
| `src/emit.ts`, `src/css-vars.ts` | The CSS contract: token path → `--pm-*` name, and the emitted blocks |
| `src/emit-tokens.ts`, `src/platforms.ts` | The token document for non-CSS emitters, and each platform's control-height and hit-target floors |
| `src/emit-swift.ts`, `src/emit-kotlin.ts`, `src/emit-dart.ts`, `src/native-model.ts` | The native emitters, and the names and value tree they share. `pnpm emit:native` writes their output into `platforms/` |

## The laws

A **law** is a test that enforces a design claim. These laws run over every system × every
palette in the catalogue. The tests read the directories, so a new file is covered as soon as it
exists.

| Law | What it holds | Tested in |
| --- | --- | --- |
| Contrast | Every lawful text/surface pair clears its APCA floor in both modes; borders clear a ΔL floor instead. Enforced during resolution, re-measured on the emitted strings, and checked against WCAG 2.1 with the divergence declared | `src/laws.test.ts`, `src/pairings.test.ts`, `src/color/resolve.test.ts` (arbitrary seeds) |
| Gradient and glass | Text over a gradient clears its floor at the worst stop; text on a glass pane clears it over pure black and pure white | `src/laws.test.ts` |
| Coherence | Every axis combination derives tokens consistent with its axis values (flat casts no resting shadow, `ornament: none` has no glow, …). The test covers every combination | `src/laws.test.ts`, `src/coherence.ts` |
| Divergence and hue band | Designed systems differ on a minimum number of axes. Palettes keep their accent hues apart | `src/laws.test.ts` |
| Tenant | A tenant system copies its base's axes exactly and brings only its own palette and fonts | `src/laws.test.ts` |
| Size budget | Each system's default pairing emits a sheet within 28,000 bytes | `src/laws.test.ts` |
| Theme-neutral recipes | Only three axes are exposed to CSS as flags, and a flag never names a system or palette | `src/laws.test.ts` |
| Platform floors | On every platform and density, the token document's hit target is at least the platform's floor, and every control height is at least 24 and is the derivation's own value: a native minimum is a hit area, never a height. On the web nothing is raised | `src/laws.test.ts` |
| Document parity | The token document's paths and the stylesheet's property names are the same set, except a ledger of CSS-only names with reasons | `src/laws.test.ts` |
| Chart palette | The flagship pairing reproduces the reference's chart colours exactly. Every pairing's wheel stays separable under colour-vision deficiency | `src/chart-laws.test.ts`, `src/color/chart.test.ts` |
| Admission | A guest pairing is checked against the same pairing laws, and a refusal is returned as a report | `src/admit.test.ts` |
| Native freshness | Every generated file in the native token packages under `platforms/` is what `pnpm emit:native` writes from the catalogue's default pairings. With the Swift toolchain (`xcrun swift`), the Swift package also builds and its token tests pass | `src/native.test.ts`, `src/swift-build.test.ts` |

## Tests

Everything runs in the `logic` vitest project, in node (`src/runtime.test.ts` asks for jsdom by
docblock):

```sh
pnpm exec vitest run packages/theme
```

## Read more

- [docs/theming.md](../../docs/theming.md) — systems, palettes, the axes, the colour engine, runtime switching
- [docs/concepts.md](../../docs/concepts.md) — decision layers, token scopes, coherence
- [docs/charts.md](../../docs/charts.md) — the chart palette and its laws
- [docs/verification.md](../../docs/verification.md) — how the laws fit the rest of the gates
