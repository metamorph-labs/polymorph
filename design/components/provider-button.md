# ProviderButton

A Button preset for signing in with an external provider such as Google. It shows the
provider's mark beside the app's own sentence, with a fixed appearance.

It relates to Button as CopyButton does, applied to federated sign-in. It has no substrate.
Without it, an auth screen could offer "Continue with Google" only as plain text: `Button` takes
an `IconRole` and has no slot, the icon set has no brand roles (a brand is not a meaning, so it
is never a *role*), and application code may not draw an `<svg>`.

ProviderButton is **not a Button with an `icon`**. An icon is a meaning the theme draws in
`currentColor`. A provider's mark belongs to the provider, and its brand terms fix its geometry
and colours. So it comes through a different path, `BrandMark` (`icon.md` §Brand marks), and
cannot be recoloured, sized off the scale, or replaced with the app's own drawing. It is **not a
Link**: pressing it starts a sign-in flow that the app's controller owns, not navigation to a
destination. It is **not a provider list**. Which providers a tenant may use, in what order, and
what happens when there are none or exactly one, is policy that the backend decides and the
screen renders: one `ProviderButton` per offered provider, in a `Stack`.

## Anatomy

```
[root <button> — Button outline/neutral, by reference]
  [mark — BrandMark, decorative] | [spinner — while loading]
  [label]
```

## API

```ts
interface ProviderButtonProps {
  provider: 'google' | 'microsoft' | 'github' // BrandMark's closed set
  label: string                                // the whole sentence — "Continue with Google"
  size?: 'sm' | 'md' | 'lg'                    // conventions §2; default 'md'
  loading?: boolean                            // the ceremony has started and has not answered
  disabled?: boolean
  type?: 'button' | 'submit'                   // default 'button'
  onClick?: (event) => void
}
```

Attributes: all of Button's (`data-variant="outline"`, `data-tone="neutral"`, `data-size`,
`data-state="loading"?`, `data-disabled?`), plus `data-provider`.

**`label` is the whole sentence, required, and not assembled.** The vocabulary has no
`"Continue with {provider}"` template. The vocabulary writes no text, word order around a brand
name differs by language ("Mit Google fortfahren"), and the providers' terms constrain the
phrasing ("Sign in with Google", never "Google login"). The app's catalog owns the text; the
member owns the mark.

**No `variant`, no `tone`.** The cell is fixed at `outline`/`neutral`. A multi-colour mark is
legible, and within the providers' terms, only on a neutral surface. On `solid`/`accent`,
Google's "G" would sit on an arbitrary brand colour, which its guidelines specifically forbid. A
cell that must never be chosen is not offered (ConfirmDialog's law: make the wrong assembly
impossible to write).

**The set is closed, and BrandMark owns it.** Adding a provider means adding a mark to BrandMark
after reading the provider's terms, not passing a `src` prop. Enterprise SSO (a SAML or OIDC
connection with no public brand) is an ordinary `Button` with `icon="key"` or `icon="locked"`,
because it has a meaning, not a trademark.

## Recipes (exact tokens)

Button `outline`/`neutral` **by reference**, as Link's button variant and CopyButton do. The
element uses Button's attributes and `composes` its recipe, so the base, the §2 sizing,
rest/hover/press/disabled, the press feedback and the shared focus ring (conventions §4) all apply
without being restated. Button itself correctly has no slot for a mark.

| Part | Tokens |
| --- | --- |
| root | `composes: button`; every cell is Button's. In a column (`AuthPage`'s card, a `Stack`) it stretches to the column width, like that archetype's actions |
| mark | `BrandMark` at the button's `size` (Icon's three token sizes, the space a glyph would take) · `flex: none` · decorative |
| label | Button's label cell: ellipsis, no wrap |
| loading | Button's `button.spinner` binding (`spin`) in the mark's place; the mark is replaced, the label stays |
| disabled | Button's cell for text and border; the **mark** gets `filter: grayscale(1)` · `opacity: 0.5`. A mark has its own fills, so left unchanged it would be the only coloured part of a disabled button. It is desaturated as a whole, never repainted in a theme colour |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| google | `provider="google"` | `data-provider`, `outline`/`neutral`/`md` |
| microsoft | `provider="microsoft"` | `data-provider` |
| github | `provider="github"` | the mark takes the text colour |
| small / large | `size` | `data-size` |
| loading | `loading` | `data-state="loading"`, `aria-busy` |
| disabled | `disabled` | `data-disabled` |
| a chooser | three, in a `Stack gap={3}` | each stretches to the column |
| localized | a German sentence | — |

`requiredSelectors`: `:hover`, `:active`, `:focus-visible`, `[data-disabled]`,
`[data-state="loading"]`. These are Button's, reached through `composes`. They are listed
because a member that lost one would look like a Button but behave like a div.

## Motion

Button's bindings, unchanged: `stateFeedback` on colour, `button.press`, `button.spinner`
while loading. Nothing of its own.

## Icons

No icon role. `BrandMark` (`google`, `microsoft`, `github`), and `loading` (Button's spinner)
while sign-in is in progress.

## A11y

A real `<button>`; the accessible name is `label` and nothing else. The mark is `aria-hidden`,
because a named mark would read "Google, Continue with Google". `loading` sets `aria-busy`, keeps
the name and the focus, and ignores presses, so a repeated Enter cannot start sign-in twice.
`aria-describedby` passes through for supporting text ("Your organization requires single
sign-on").

```contract
role root button
name root from label
key Enter activates on root
announces busy when loading
name root from label when loading
key Enter nothing on root when loading
```

## Agent

An agent reads whether the button is disabled and whether its sign-in is under way, and presses
it. A press is the button's own click, so a disabled or loading button does nothing, and a submit
button submits its form, as for a person. The press starts the sign-in the application's
controller runs. The person completes it with the provider, on a page whose controls are the
provider's and not members an agent reaches.

```agent
state disabled boolean as root data-disabled
state loading boolean as root aria-busy
action press calls onClick
```
