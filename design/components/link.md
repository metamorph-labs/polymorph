# Link

A navigation link. Anything that changes data is a command and uses Button, not Link.

`inline` sits inside sentences and is always underlined. `standalone` is for links that stand
alone as rows or titles, and is underlined on hover. `variant="button"` is for navigation in a row
of Buttons that must match their visual weight. It keeps Link's semantics and uses Button's whole
recipe.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `href` | `string` | required | real `<a>`, so a new tab, a copied link and the status bar work |
| `onNavigate` | `(href: string) => void` | — | the routing seam (§Routing): given, a click the browser would follow in this tab goes to the app's router instead. Not called for an `external` link or a click that opens elsewhere |
| `variant` | `'inline' \| 'standalone' \| 'button'` | `'inline'` | `button` uses Button's recipe; the element stays an `<a>` |
| `external` | `boolean` | `false` | appends `Icon "open-external"` (sm) + `target="_blank" rel="noreferrer"` |
| `buttonVariant` | `'solid' \| 'soft' \| 'outline' \| 'ghost'` | `'soft'` | `variant="button"` only. `soft` by default, because styling navigation as the page's primary action must be an explicit choice of `solid` |
| `tone` | `'accent' \| 'neutral'` | `'accent'` | `variant="button"` only. No `danger`, because a destructive action is not navigation: it is a Button routed through ConfirmDialog. Button's lawful grid applies unchanged: `neutral` only with `outline`/`ghost` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | `variant="button"` only; conventions §2 |

The button-variant props on a text variant are a type error, not a runtime warning, as with
Button's unlawful grid.

Attributes: `data-variant` (`inline|standalone`, or the `buttonVariant` value in the button
variant, which uses Button's attributes so that Button's stylesheet applies by reference),
`data-tone` / `data-size` (button variant only), `data-external?`.

## Routing

Link is a real `<a href>`. The browser follows it, opens it in a new tab and copies it, with no
router in the vocabulary. An app with its own router (TanStack Router, React Router, Vue Router,
Angular's router) takes the clicks it should route through `onNavigate`, and the browser keeps
the rest. `AppShell.NavItem`, `Breadcrumbs`, `SectionNav` and a linked `Card`, the other members
that draw an `<a>` for navigation, take the same prop with the same rule.

- **The clicks the app gets.** A click with the primary button and no modifier key, on a link
  that opens in this tab, that no other handler has taken (`defaultPrevented`). The member stops
  the browser's navigation (`preventDefault`) and calls `onNavigate(href)` with the `href` the app
  wrote. The app hands it to its router.
- **The clicks the browser keeps.** A click with Meta, Control, Shift or Alt held, a click with
  another button, and a click on an `external` link. These open a tab or a window, or save the
  link, and a router that also moved the current tab would do two things for one click. Router
  libraries leave the same clicks to the browser.
- **Without `onNavigate`**, the browser follows every click, so a link works in an app with no
  router.

The member stops the navigation itself. It does not hand the app the event to cancel, because
three renderers cannot hand it over: an Angular output emits one value and returns nothing
([frameworks.md](../../docs/frameworks.md)), and a SwiftUI or Compose member has no DOM event
([native.md](../../docs/native.md)). With the member doing it, `onNavigate(href)` means the same in
all seven renderers. On iOS and Android the member calls `onNavigate(href)` where it would open
the link through the environment's handler (`openURL`, `LocalUriHandler`), and so does a native
Card.

The seam is a prop on each member, not a router the app installs once in the shell. A context
set at AppShell would reach only the links inside a shell (not an AuthPage's), would add a
channel between members to every framework's foundation, and would route a link without its call
site saying so. A prop is written where the link is written. An app that routes every link
writes one function for its router and passes it to each
([consuming.md](../../docs/consuming.md#routing)).

## Recipe (exact tokens)

| Variant | Tokens |
| --- | --- |
| `inline` rest | color `--pm-accent-text` · `text-decoration: underline` · `text-decoration-thickness: 1px` · `text-underline-offset: 2px` · `text-decoration-color: --pm-accent-underline`, the link's own colour at the temperament's strength (soft 0.4 / standard 0.5 / stark full; `TEMPERAMENT_UNDERLINE_ALPHA`) · inherits surrounding text step |
| `inline` hover | `text-decoration-thickness: 2px` · `text-decoration-color: --pm-accent-text`; hover restores thickness *and* colour strength at once (there is deliberately no accent-hover text role) |
| `standalone` rest | color `--pm-accent-text` · no underline · `text.sm` quartet unless inheriting |
| `standalone` hover | underline per inline's metrics |
| `button` costume | Button's recipe cells by reference (`button.md`), never re-derived. `buttonVariant` × `tone` × `size` select the exact cells: rest/hover/active/focus, press feedback, §2 sizing, the lawful grid. Cells with no meaning for navigation are not used: no `loading`, no `disabled` (an `<a>` that cannot be followed is not rendered as a link), no underline (the frame already shows it is clickable). `external`'s glyph uses Button's trailing-icon slot |
| focus | ring per conventions §4, around the text box with a gap (`focusAround`): `outline-offset` `--pm-space-1`, or the system's own where it is larger. A line inside an inline box would cross the first and last letters, and a line on its edge would touch them. The `button` costume keeps Button's ring inside its edge |
| external icon | `sm`, `currentColor`, gap `--pm-space-1`, decorative (when the new-tab behaviour matters, `rel` or the surrounding text announces it) |

Visited links are unstyled. Product tools revisit pages constantly, and a purple visited state
belongs to web documents, not apps. A link is never marked by colour alone. Both variants carry a
non-colour signal: the underline or its hover appearance, plus an accent colour at or above the
`secondaryText` floor on every surface (already a law through the `accent.text` pairings).

**The muted rest decoration.** The rest underline stays, because in running prose it is the
non-colour signal the rule above requires. The rule does not require full-strength colour; that
is only the browser default. The underline uses `--pm-accent-underline`, the link's own colour at
a strength set by contrast temperament. It is faint on soft systems, half strength on standard and
full on stark, because stark is the precision temperament, which shows affordances at full strength.
A delineation pairing keeps the softened line visible on every surface of every pairing
(`pairings.ts`), so a system can soften the underline but never lose it. Only prose links are muted.
ErrorSummary's danger links keep full strength, because an error link is a signal.

## States

Entries: inline in a sentence, standalone, external, standalone hover-described via
selectors; the button variant: default (`soft`/`accent`/`md`), `solid` accent, `outline`
neutral, external in the button variant. `requiredSelectors`: `:hover`, `:focus-visible`,
`[data-external]`. The button variant adds none, because its cells are Button's stylesheet,
which `button.md`'s own selectors assert.

## Motion

`text-decoration-thickness` is not animatable, so hover changes are instant. This is intended:
text affordances change instantly, and only surfaces transition. The button variant moves as
Button does, because colour transitions and press feedback come with the borrowed cells.

## Icons — `open-external`. A11y — real `<a href>` semantics; never `onClick`-only.
AppShell.NavItem swaps its root on `href`: given an `href`, NavItem renders an `<a>` styled by
its own recipe. It has Link's semantics and NavItem's styling.

```contract
role root link
key Enter activates on root
```

## Agent

An agent reads whether the link opens a new tab and presses it. A press is the link's own click,
so it takes the routing path a person's click takes: with `onNavigate`, the member stops the
browser's navigation and calls `onNavigate(href)` in every renderer; without it, the browser
follows the link in this tab and the page an agent acts on is left, as it is for a person. A
press on an `external` link is refused: it opens a new tab, which a browser opens only during a
person's own gesture and blocks as a popup otherwise. The `href` is not read, because a link's
address can carry a signed token, such as a download link's, and the link's name says where it
goes.

```agent
state external boolean as root data-external
action press calls onNavigate when standalone
```
