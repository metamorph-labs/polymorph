# AuthPage (archetype)

Sign-in, sign-up and reset: the one screen family that lives **outside AppShell**. It is a
centred card on the app background with nothing else around it: a heading, a short line of
context, the form, and one link to the neighbouring flow.

Two more kinds of page are the same anatomy, so they are this archetype and not members of
their own (§Status pages, §Steps of a flow): a page that only reports a status, and one step
of a flow that runs before the shell exists.

## Anatomy & API

```
[root — full viewport, bg.app, centers its child]
  [column: [brand slot] [Card: [heading] children [cardFooter slot?]] [footer slot]]
```

| Prop | Type | Notes |
| --- | --- | --- |
| `brand` | `ReactNode` | centred above the card (the product's Badge/wordmark) |
| `backAction` | `ReactNode` | optional accessible back control beside the heading; the host supplies the permitted action for the current step |
| `children` | FormFields + the action Stack | inside the Card; the form. Optional: a status page whose title and description say everything, and that leaves the reader nothing to do, has none |
| `cardFooter` | `ReactNode` | **inside** the Card, under the actions: "Don't have an account? Sign up", the closing line of the reference login block. It is a separate slot because it goes inside the card rather than under it. A sentence offering the *other* account action belongs to the form it is an alternative to. Below the card it would float on the background, attached to nothing |
| `footer` | `ReactNode` | Links row **below** the card for page-level links: legal, support, a locale switch. *("Forgot password?" is not one of these: it sits in the password field's own label row, FormField's `labelEnd`)* |
| `title` / `description` | `string` / `ReactNode?` | rendered inside the Card, above the fields: title `text.2xl` *(see "The title stays off the display scale")* / `text.md` `--pm-text-secondary` (a full PageHeader belongs to pages; auth is a single step). The node type lets localized prose isolate user-controlled bidi spans without accepting styling escape hatches. |
| `transitionKey` / `pending` | `string?` / `boolean?` | Opt into the shared page fade and report foreground loading. The column retains its form elements; `pending` also sets `aria-busy` on the page landmark. See [page transitions](../conventions/page-transitions.md). |
| `layout` / `illustration` | `'centered' \| 'illustrated'` / `ReactNode` | `'centered'` / — | the illustrated public-account composition below (§Illustrated public account layout): a masthead, the form frame, and the host's **decorative** artwork beside it. `illustration` is ignored by the centred card |

## Pattern tokens (declared on root)

| Token | Value | (std/compact/comfortable) |
| --- | --- | --- |
| `--pm-page-padding-x` | `var(--pm-space-5)` | 16 / 14 / 18. Viewport inset, so the card never touches the edge of a small screen |
| `--pm-page-max-width` | `calc(var(--pm-space-10) * 4 + var(--pm-space-6))` | 408 / 348 / 468. The card column: wide enough for the fields and the action pair, and 408 is close to the reference card |

## Recipe

| Part | Tokens |
| --- | --- |
| root | min-height `100dvh` *(with `100vh` as the fallback outside the `@supports` gate)* · bg `var(--pm-texture-page), var(--pm-bg-wash)` · grid, centred on both axes · padding `--pm-page-padding-x` |
| column | width `min(100%, var(--pm-page-max-width))` · Stack gap `--pm-space-6` · brand centred |
| title | `text.2xl` quartet · `--pm-text-primary` *(off the display scale; see below)* |
| card | Card verbatim; internal Stack gap `--pm-space-6` + own padding `--pm-space-3` on top of Card's *(an auth card is a focal surface, not a list row. The extra space belongs to the archetype, so Card stays tight for denser consumers)*; heading block **start-aligned**, gap `--pm-space-3`; then fields; then the action Stack; then `cardFooter`. Actions are `solid/accent` then `outline/neutral`, both full-width. This is the one place a Button stretches by design: the card sets the measure, and a narrow submit under stacked full-width fields looks orphaned. Implementation: the card's own column stretches them, with no Button API change *(as in the reference login block: a primary and its alternative are one decision shown twice, so they compose as a `Stack gap={3}` inside the card's `space-6` between-fields rhythm)* |
| cardFooter | centred `text.sm` · `--pm-text-secondary`. One short sentence closing the card, with nothing beside it to align to. **This** is where centring belongs in an auth card, not on the heading |
| footer | centred `text.sm` · `--pm-text-secondary` · Links inline |

### Theme-owned background

The theme supplies the texture and wash. With ornament disabled and no gradient seed, these
resolve to `none` and the solid `bg.app` colour. The archetype paints no accent overlays of
its own, because radial accents drawn by the archetype would paint gradients even for a
system that declines ornament. Themes that declare a wash or texture keep it through their
tokens.

### The heading's alignment

In the centred-card layout the title and description sit inside the card,
**start-aligned**, on the same edge as the labels beneath them, as in `login-01`. The card
already provides the centring. A centred title over a start-aligned label column would give
the card two left edges: the title's, which moves with its length, and the fields', which
does not. One edge makes the card read as a single object.

The spec rejects a centred heading. The argument for it is that auth is the one
screen that faces the user directly, so it should look like a moment rather than a form.
But the centred card on an empty background already does that. The text alignment inside
it does not need to.

### The title stays off the display scale

The title is `text.2xl`, not a display step, for arithmetic reasons rather than taste.

The card's content measure is **344px**: the 408px column less Card's own inset and the
archetype's. At the `plain` system's defaults `display.md` is 61px and `display.sm` is
49px, which fit about nine and twelve characters before wrapping. "Reset your password" is
nineteen. A title style that only works for unrealistically short copy is not usable, and
a start-aligned heading makes the two-line ragged result look worst. A display step
(`display.sm` as the product's one standing display moment, or `display.md` because `sm`
looks like a bold heading) is rejected on that arithmetic.

The reference decides: `login-01` sets its title at roughly twice the body step, on one
line, and the card reads as a named form rather than a hero with a form attached. `text.2xl`
gives that proportion here, and it is also PageHeader's title step. A card title and a page
title sharing a tier is intended.

**The display scale keeps its place.** `Hero` is the display scale's other consumer and
takes `md`/`lg`. A hero is full-width, so a display step there has room. The remaining
difference from the reference on this screen is that the vocabulary's modular ratio is
steeper above `text.md`, so `text.2xl` is 31.5px against the reference's 24px. That is a
scale difference, not a composition one, and it still fits every realistic auth title on
one line.

## Status pages

A page that only reports a status is an AuthPage: nothing is at this address, the workspace
could not be loaded, a link has expired, an email is on its way. The `title` names the status
and the `description` says what it means for the reader. The `children` are what the reader
can do: one action, or a primary and its alternative in a `Stack gap={3}`, as a sign-in's
are. A way on that navigates is a `Link variant="button"`, and it is `solid` when it is the
page's one action. A detail the reader may be asked for (a request's reference, a failure's
cause) is an `Alert` above the actions, in the tone of the status. A wait is a `Countdown`
there. A status that leaves nothing to do has no `children`.

The title carries the status. The page draws no status code, no icon and no tone of its own:
the heading says what happened, and an `Alert` in the card carries a tone where the status has
one. A page that repeats its own title in a toast says it twice.

It stays outside the shell, with its own `<main>`. A status inside the shell is not this
archetype: a record that does not exist is a `DetailPage` whose title says so, with its way
back, and a list or a region with nothing in it draws an `EmptyState`.

## Steps of a flow

A flow that runs before the shell exists (create an account, verify an address, name a
workspace) is one AuthPage per step. The `title` is the step's question and the `children`
are its fields and its one `solid` action. `backAction` is the way to the step before it: a
`ghost`/`neutral` `sm` icon Button beside the title. `transitionKey` replays the arrival
between steps without remounting the form, and `pending` holds the step still while it
commits. A choice to skip a step is the `outline` alternative under the primary.

The steps show no progress strip. Each asks one question, and the title changing is the
progress a reader of such a flow needs. A flow whose steps the reader can see ahead and
return to runs inside the shell, as a `FormPage` with a `Stepper` (`form-page.md`).

## States

Entries, composed as the reference login block: sign-in (email, password with a `labelEnd`
reset link, a `Stack` of primary + outline secondary, and the `cardFooter` sign-up line),
the same plus a below-card `footer` of page-level links, error state (FormField error),
brand-less. Then a step of a flow (a `backAction` beside the title, one field and one
action), and three statuses: one way on, a notice with a primary and its alternative, and
the heading alone. `requiredSelectors`: `[data-auth-enter]`, `[data-page-transition-state]`: the
illustrated layout's entrance marks and the shared page-transition state (below). Neither
is a prop, so the stylesheet is held to them.

## Illustrated public account layout

`layout="illustrated"` adds a masthead, a decorative `illustration` slot beside the form,
and centred headings. The frame's padding, the artwork's width and the gap between them are
built from spacing tokens (`auth-page.module.css`), so they scale with the system's
density. The frame inherits the page surface and theme border and adds no gradient. At
980px the art and gap shrink. At 680px the art and the frame border disappear, leaving a
full-width form with page gutters.

The default is the centred-card composition described above. The illustrated layout marks
entering fields with `data-auth-enter` and assigns their visual order without remounting
them. Theme-scaled entrances fade upward from 40px over about 300ms, staggered by about
100ms at the standard motion temperament. The shared ribbon lasts through the final field
entrance. Pending requests keep the current fields visible. Reduced motion and motion=none
remove movement and delays. All artwork is decorative, and the form semantics and
authority stay with the caller.

## Motion — page transitions, optional field entrances. Icons — composed only. A11y — `<main>`
landmark on root (no shell to provide one); the Card's title is the `<h1>`;
autocomplete attributes pass through Input untouched (`email`, `current-password`). The
spec mentions them because auth is where they matter.
