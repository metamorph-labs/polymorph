# QRCode

Draws a string as a QR Code symbol for a camera to read, such as an authenticator's
`otpauth://` URI, a pairing link or a ticket. It renders in the browser from `value`.

It has no substrate and no dependency; the encoder is the member's own
(`packages/react-ui/src/structure/qr-encode.ts`). It exists because some products must not let a
server render QR images (an enrolment URI *is* the secret), and they need a lawful place to draw
one. Application code cannot write an `<svg>` or choose a colour, and an `<img>` rendered
elsewhere guarantees neither a quiet zone nor contrast on a dark page.

QRCode is **not an image** and takes no `src`. A symbol rendered elsewhere is a picture, which
Image draws (`image.md`). It is **not a chart**: it has no scale, axis or data. It does share the
chart tier's one licence to draw its own SVG, for the same reason: every mark is geometry the
component computes, not a named glyph (`packages/rules/src/containment.ts`, `SYMBOL_DRAWERS`). It
is **not a scanner**: reading a symbol needs a camera, a permission and a product decision.

## Anatomy

```
[root <svg role="img" data-mode="light">]
  [paper <rect>]  — the field, quiet zone included
  [ink <path>]    — every dark module, as horizontal runs
```

## API

```ts
interface QRCodeProps {
  value: string                          // what the symbol says — encoded as UTF-8 bytes
  label: string                          // accessible name: what it is FOR, never its contents
  size?: 'sm' | 'md' | 'lg'              // default 'md'
  errorCorrection?: 'L' | 'M' | 'Q' | 'H' // default 'M'
}
```

Attributes: root `data-size`, and `data-mode="light"`, always (see Recipes).

**`label` is required, and it is not the payload.** A symbol is a meaningful image. A user who
cannot point a camera at it needs to know what it is for ("Authenticator setup code"), and the
app must give them the same secret another way, such as a manual key in a `Code` beside a
`CopyButton`. The payload never appears in the accessibility tree or as DOM text; it exists only
as geometry.

**`errorCorrection` defaults to `M`.** The levels recover 7 / 15 / 25 / 30 % of a damaged
symbol, at the cost of density: the same string at `H` needs a larger version in the same box,
so every module is smaller. A screen does not get scuffed, and a phone at arm's length reads
bigger modules more easily. Use `H` for a symbol that will be printed or photographed from a
projector.

**No colour props, no logo slot, no `quietZone` prop.** Each is a well-known way to make a symbol
that looks fine but does not scan, and a closed vocabulary should make that impossible to
write.

## Behavior

- **Byte mode, UTF-8, the smallest version that fits** at the chosen level, 1–40.
  The mask is chosen by the standard's penalty search. Numeric and alphanumeric modes are
  deliberately not implemented, because the payloads drawn here are mixed-case text, and a
  segment optimiser is the part of an encoder most likely to be wrong.
- **What cannot be encoded renders nothing**, with a dev warning: an empty `value`, or one
  beyond version 40 (2,953 bytes at `L`). This is RelativeTime's rule (something with no correct
  rendering renders nothing, not a placeholder), and it matters more here, because a truncated
  symbol scans as a *different string*.
- **Pure.** The symbol is a function of `value` and `errorCorrection`, memoised on
  both. No effect, no measurement, no state.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| root | `display: block` · `aspect-ratio: 1` · `max-inline-size: 100%` (a symbol wider than its container has a clipped finder pattern and does not scan, so it shrinks instead of overflowing) · radius `--pm-radius-sm` · `shape-rendering: crispEdges` (modules are pixels, and anti-aliased module edges are the one rendering choice that can make a scan fail) |
| size `sm` / `md` / `lg` | inline-size `calc(var(--pm-space-10) + var(--pm-space-8))` / `calc(var(--pm-space-10) * 2)` / `calc(var(--pm-space-10) * 2 + var(--pm-space-9))`: 144 / 192 / 256 at standard density. Built from space tokens, as in Dialog, so a roomier density gets a larger symbol |
| paper | fill `--pm-bg-surface` |
| ink | fill `--pm-text-primary` |
| quiet zone | four modules on every side, inside the `viewBox` and painted as paper (ISO/IEC 18004 §6.4.10). It is part of the symbol, so no surrounding layout can remove it |

**Always dark ink on light paper: `data-mode="light"`.** Scanners read dark modules on a light
field, and support for inverted symbols varies between readers. So the root re-scopes itself to
the pairing's **light** derivation, using theming's nested-scope mechanism (`docs/theming.md`)
through the attribute alone, and takes `text.primary` on `bg.surface` from there. That is the
theme's own law-checked text pair, so the pairing guarantees the contrast; this member chooses no
colour. It holds for a guest pairing admitted through `admitTheme` exactly as for a shipped one.
In dark mode the symbol is a light card on a dark page, which is how a QR code on a dark page
should look.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| an authenticator enrolment | an `otpauth://` URI | `data-size="md"`, `data-mode="light"` |
| small | `size="sm"` | `data-size="sm"` |
| large | `size="lg"` | `data-size="lg"` |
| high correction | `errorCorrection="H"` | a denser symbol, same box |
| an empty value | `value=""` | renders nothing |

`requiredSelectors`: none. A symbol has no hover, no focus and no substrate; every state is a
prop.

## Motion

None, because a camera may already be trying to read the symbol while it animates in.

## Icons

None.

## A11y

`role="img"` with `aria-label={label}`; the `<rect>` and `<path>` carry no semantics. The label
names the purpose, never the payload. Not focusable, because there is nothing to operate. The
screen must offer another way to get the same secret (manual entry). The spec states this
because no component can enforce it.
