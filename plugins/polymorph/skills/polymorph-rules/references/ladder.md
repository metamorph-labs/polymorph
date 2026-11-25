# The exception ladder, rung by rung

The examples are React. In Vue, Svelte and Solid the members have the same names and props. In
Angular a member is written by its selector (`<pm-bespoke>`, `<pm-third-party>`), and in a page
with no build as an element (`<poly-bespoke>`). A project that vendors members imports these from
its vendored directory and adds one with `add` (`add bespoke`, `add third-party`,
`add density-scope`, `add tone-scope`).

## Rung 1: variant selection

Every member exposes its range as typed props, such as a variant, a tone, a size and the spacing
steps. A value off the scale is a type error. Read the member first:

```sh
npx -y @metamorph-labs/polymorph@1.0.17 component Button --framework <framework>
```

The answer lists each prop's values and the variant and tone pairs that are lawful. Most needs end
here: a quieter button is `variant="ghost"`, a destructive one
`tone="danger"`, and more room is a larger `gap`.

## Rung 2: `DensityScope` and `ToneScope`

A subtree re-assigns a decision the theme already makes for the whole page. Every value still comes
from the theme.

```tsx
import { DensityScope, ToneScope } from '@polymorph/react-ui'

<DensityScope value="compact" as="section">
  <DataTable … />
</DensityScope>

<ToneScope value="inverse">
  …
</ToneScope>
```

- `DensityScope`'s `value` is `compact`, `standard` or `comfortable`.
  It changes space and the size of controls, never the type scale.
- `ToneScope`'s `value` is `inverse`: the
  surface, text and border roles of the opposite mode.
- `as` is `div`, `section` or `span`. A scope draws nothing of its own.

## Rung 3: an instance patch

One instance re-assigns token steps through its `patch` prop. Each value is a step
of a scale, never a length.

```tsx
<Stack gap={6} patch={{ gap: 2 }}>…</Stack>
<Card patch={{ p: 4, radius: 'sm' }}>…</Card>
```

`Stack`, `Inline` and `Grid` take `gap`, `p`, `px` and `py`. `Card` takes `p`, `px`, `py` and `radius`.

## Rung 4: a `Bespoke` zone or a `ThirdParty` boundary

`Bespoke` declares a one-off composition the vocabulary has no member for. Its
`reason` is required and is read by whoever reviews the code. Inside it the
application rules are lifted for plain elements: `style`, a `className`, raw values, raw controls
and inline `<svg>` are allowed there. A member inside it still takes no `className`. It draws
nothing itself, and the theme's tokens reach inside it, so write values as `var(--pm-…)`.

```tsx
import { Bespoke } from '@polymorph/react-ui'

<Bespoke reason="Promo illustration: overlapping discs the vocabulary has no shape for.">
  <div style={{ padding: 'var(--pm-space-4)', background: 'var(--pm-accent-subtle)' }}>…</div>
</Bespoke>
```

`ThirdParty` hosts a component another library draws, such as a map, a rich-text editor or
a data grid. It takes `library` and `reason`. The file
that declares it may import that library and its stylesheet, and what it holds may take a
`style`. Give the library the theme as `var(--pm-…)`, or as values from `useThemeValues()` in
the framework's foundation package. Controls and icons around it stay members.

```tsx
import { ThirdParty } from '@polymorph/react-ui'
import { MapView } from 'some-map-library'

<ThirdParty library="some-map-library" reason="Store finder map: no member draws a map.">
  <MapView center={center} />
</ThirdParty>
```

Accessibility is never suspended, in a zone or anywhere else: a control in a zone still needs a name,
a role and a keyboard path.

## Rung 5: promotion

A patch or a zone that recurs is promoted into the vocabulary as a variant or a member, or it is
deleted. A one-off occurs once. Promotion is the design system owner's decision. Report the
recurring exception with its reasons, and keep each instance declared until then.
