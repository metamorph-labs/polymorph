# Icon

The only way to render an icon (conventions §8). Application code and vocabulary components
render glyphs only through this component; the role enum and the icon set's rules live in
[`../icons.md`](../icons.md) / [`../icons.json`](../icons.json).

## Anatomy

```
[<svg>] — the mapped lucide glyph's elements, drawn by GlyphSvg, normalized 24×24 viewBox
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | `IconRole` (closed enum from `icons.json`) | required | unknown name = type error |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `--pm-icon-size-*` |
| `label` | `string` | — | meaningful icons only; renders `role="img"` + `aria-label`. Absent ⇒ `aria-hidden="true"` |

No `className`/`style` and no `color` prop. **Icons never set their own colour**; they inherit
`currentColor` from the surrounding text role. No numeric sizes.

## Recipe (exact tokens)

| Aspect | Tokens |
| --- | --- |
| width/height | `--pm-icon-size-sm\|md\|lg` (14/16/20 base, aligned to text line boxes) |
| stroke | `stroke="currentColor"` · `stroke-width: var(--pm-icon-stroke-sm\|md\|lg, var(--pm-icon-stroke))`. Set per size and optically compensated, so every size looks as heavy as the md-tuned weight (pastel 1.25 · terminal 1.75, tuned in derivation; `icons.md` rule 4). The unsuffixed token is the md value and the fallback for a trailing theme sheet |
| fill | none (lucide stroke set) |
| alignment | `display: inline-block; vertical-align: text-bottom`, so it sits on the text baseline without extra wrappers |
| color | `currentColor`, always |

Implementation containment: `packages/react/src/icon/map.tsx` (with its test) is the only file
that may import the icon set, the data-only `lucide` package (lint-enforced by the
`no-external-icons` red rule). The map is the transcription of `icons.json` and holds
`GlyphSvg`, which draws a glyph's SVG elements; `Icon` names a role and renders `GlyphSvg`.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| default | `name="add"` | `aria-hidden="true"` |
| sizes | sm/md/lg | size attr/var applied |
| labeled | `name="warning" label="Warning"` | `role="img"`, `aria-label` |
| inherits color | inside `--pm-danger-text` context | computed color matches context |

`requiredSelectors`: — (static).

## Motion

None intrinsically. The `loading` role's `spin` binding is applied by the consuming
component (Button/Input), not by Icon.

## A11y

Per API: decorative by default, labeled when meaningful. Never both a `label` and
adjacent visible text naming the same thing (double announcement).

## Brand marks — the second gateway

`BrandMark` is `Icon`'s sibling for marks owned by third parties. It exists because a
provider's mark is the opposite of an icon role on every point this spec decides:

| | `Icon` | `BrandMark` |
| --- | --- | --- |
| names | a **meaning** (`delete`, `warning`); the theme decides the glyph | a **brand** (`google`, `microsoft`, `github`); the provider decides the mark |
| colour | `currentColor`, always | the provider's published colours, always; `github` alone is `currentColor`, because its mark is monochrome by GitHub's own terms |
| set | swappable whole (the map is a decision-layer file) | not swappable, because there is only one Google "G" |
| grows by | a role added to `icons.json`, with its sunset rule | a change that reads the provider's brand terms, then adds a drawing |

```ts
interface BrandMarkProps {
  name: 'google' | 'microsoft' | 'github'
  size?: 'sm' | 'md' | 'lg'   // Icon's three token sizes — the seat a glyph would take
  label?: string              // meaningful when supplied; decorative (aria-hidden) when omitted
}
```

No `src`, `children` or `color`. A mark the caller could supply could be supplied wrong, and
that is exactly what the providers' terms are about. It uses Icon's size recipe
(`--pm-icon-size-*`, `vertical-align: text-bottom`), so it sits on the same line box. Icon's
stroke width applies to filled paths with no stroke, so it has no effect.

**Containment.** `packages/react/src/icon/BrandMark.tsx` is the only file that draws them. It is
listed in `packages/rules/src/containment.ts` (`SYMBOL_DRAWERS`) next to the chart tier's
licence. Its own reason: its hex values are the providers' published colours, not design
values, so they appear only in the one file the law names. Application code names a brand and
never draws one. The rule that blocks an inline `<svg>` at a call site blocks this too.

**Who uses it.** `ProviderButton` (`provider-button.md`) is its consumer in the vocabulary. A
screen may place a bare, decorative `BrandMark` where it *reports* a provider, beside text that
names it, such as "Connected with Google" in an account's sign-in methods. It is not for
building a provider button by hand, because `ProviderButton` already exists.
