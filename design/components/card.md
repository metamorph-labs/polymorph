# Card

Card is a bounded surface, a region of `--pm-bg-surface` that groups related content.
It is structural: its one opinion about a header is an optional title, the same heading
Dashboard.Panel draws, and it has no footer opinion (compose with Stack/Inline inside). It
is one of the two components that accept an instance patch.

## Anatomy

```
[root <div>] — a single padded surface; children compose freely (vocabulary only)
  [title <h2|h3|h4>?] — only with title: the section-heading recipe, before the children
  [stretched <a>?] — only with href: covers the surface, named by label
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | vocabulary content | — | |
| `title` | `string` | — | the card's heading, drawn before the children in the section-heading recipe that Dashboard.Panel and SettingsRow.Group use. A titled card needs no Dashboard around it and no heading of its own inside it |
| `headingLevel` | `2 \| 3 \| 4` | `2` | the title's element: 2 renders `<h2>`, 3 `<h3>`, 4 `<h4>`. Never 1, because PageHeader owns the page's `<h1>`. The level follows the outline, not the look: every level draws the same recipe |
| `patch` | `{ p?, px?, py?, radius? }` | — | the instance patch, rung 3 of the exception ladder (`docs/rules.md`); token names only (SpaceStep / RadiusStep enums), recorded by the inventory |
| `as` | `'div' \| 'section' \| 'article'` | `'div'` | semantics passthrough |
| `href` | `string` | — | makes the card navigate, using the stretched-link contract below |
| `label` | `string` | required with `href` | the navigation's accessible name, required because the covering link has no text of its own. The types enforce the pair: `href` without `label` does not compile (as with Button's disallowed grid cells) |
| `onNavigate` | `(href: string) => void` | — | with `href` only: the routing seam (`link.md` §Routing). Given, a click on the card that the browser would follow in this tab goes to the app's router instead; a click with a modifier key or another button stays the browser's |

Attributes: no `data-bespoke`, like every other member. There are no variants: **depth
is the theme's axis, not the card's prop.** An "outlined vs elevated card" choice at
call sites would re-decide depth on every screen, which is the drift this system
exists to prevent. A linked card carries `data-interactive`, the name Table.Row uses
for the same fact.

## The interactive card

Navigation only. `href` renders a stretched `<a>` positioned over the whole surface
and named by `label`, so the card is one large target without becoming a button. The
contract rules out most other uses:

- **No `onClick`-only card.** A card that performs an action is really a different
  member. By decision, there is no button-card element here.
- **Nested interactive content is a dev-warning.** The stretched link covers the
  surface, so a control under it cannot be reached. A card that needs both navigation
  and inner controls is a composition problem, not a z-index problem.
- **Selection cards belong to ChoiceCard.** Choosing is not navigating, and ChoiceCard
  defines the whole selection treatment once: border weight + `confirm` glyph, never
  colour alone.

Text in a linked card cannot be drag-selected, because the link is on top. This is the
cost of the pattern, accepted here once so that screens do not re-argue it.

The stretched link routes as Link does (`link.md` §Routing). An app with a router passes
`onNavigate`, and the card hands it the clicks that would navigate this tab, with the browser's
navigation stopped. On iOS and Android a press on the card calls `onNavigate` with `href` in
place of the environment's link opener (`openURL`, `LocalUriHandler`); without it, the opener
opens `href`.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| surface | bg `--pm-bg-surface` · border `1px solid --pm-border-subtle` · radius `--pm-radius-lg` · shadow `var(--pm-shadow-raised), var(--pm-shadow-inset-top)` *(the lit fill's top-light, extended from controls to raised surfaces. It matters most in dark mode, where a black shadow cannot separate the panel from the background and a hairline of light along the top edge can. Flat resolves both halves to `none` together)* · padding `--pm-space-6` |
| title | `text.xs` quartet + uppercase · `--pm-text-secondary` · margin `0 0 --pm-space-4` *(the section-heading recipe, as Dashboard.Panel's title and SettingsRow.Group's draw it: a product has one style for section headings. The uppercase is drawn only; the heading is read as written)* |
| interactive hover | shadow steps one rung up the ladder to `var(--pm-shadow-overlay), var(--pm-shadow-inset-top)`, and the border to `--pm-border-default` (one step up, as Input's hover does; in flat systems, whose shadows resolve to `none`, this is the whole hover) · `cursor: pointer` · transitions per Button's shared state-feedback list, so `box-shadow` animates with the colours |
| interactive focus | the shared focus ring (conventions §4) drawn **on the card** via `:has(:focus-visible)`. The link takes focus, but the card is what the eye tracks |

Derived tokens do the theming. Elevated themes get the shadow from the token. Flat
themes get `none`, and the border does the work. `borders` depth gets hairline
emphasis. The border is present at **all** depths (1px, structural). On elevated
themes it defines the edge under the shadow and stays subtle by role.

Nesting rule: Cards do not nest. A grouped region inside a Card is a Stack with a gap,
or its own screen section, because nested surfaces of the same value break the
elevation grammar.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| default | content | — |
| patched padding | `patch={{ p: 4 }}` | inventory records rung 3 |
| patched radius | `patch={{ radius: 'sm' }}` | — |
| as section | `as="section"` | tag |
| titled | `title` | an `<h2>` in the section-heading recipe before the content |
| titled section, level 3 | `as="section"` + `title` + `headingLevel={3}` | an `<h3>`; the section is named by it |
| linked | `href` + `label` | `data-interactive`, stretched `<a>` named by `label` |

`requiredSelectors`: `[data-interactive]:hover`,
`[data-interactive]:has(:focus-visible)` *(the linked card's hover and focus; the
plain card is a static surface with neither)*.

## Motion

None at rest. The interactive card's hover animates on Button's shared state-feedback
list, where `box-shadow` moves with the colours (`button.md`'s recipes). Nothing else
moves.

## Icons

None.

## A11y

Semantics come from `as` when the region deserves a landmark; otherwise it is a plain
div. A titled card's title is a real heading at `headingLevel`, so it is in the page's
outline. A titled `section` or `article` is named by its title (`aria-labelledby`), which
makes a section a region landmark; a titled `div` is not named, because a generic element
takes no name. Card never traps or manages focus. The stretched link is a real `<a href>` named
by `label`: one tab stop and one announced name. The card's visible content reads
normally and is never the link's content, because reading a whole card out as one link
name is noise.

## Agent

A card with `href` is one link, and an agent presses it as Link's press does. The press is the
stretched link's own click, so it takes the routing path a person's click takes: with
`onNavigate`, the card stops the browser's navigation and calls `onNavigate(href)`; without it,
the browser follows the link in this tab and the page an agent acts on is left. The member's
element is the stretched link, named by `label`, so a card without `href` is not listed: a person
operates nothing in it, and its content is the application's, read as the page's text. The
`href` is not read, for Link's reason: an address can carry a signed token, and `label` says
where the card goes. A linked card holds no control of its own, so it withholds nothing.

```agent
action press calls onNavigate when linked
```
