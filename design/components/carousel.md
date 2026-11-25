# Carousel

Carousel shows a sequence of peer slides one at a time, which the reader moves
through, such as a product tour, a set of screenshots or testimonials. The
substrate is the browser's own scroll: a snap viewport, so touch swipes,
trackpads, momentum and RTL all work natively, and the buttons and dot rail are
wired to the same scroll position.

Carousel is a *sequence with a position*. Tabs are named peer views the reader
returns to, and Stepper is progress through work. The defining rule of this
member is **no autoplay.** Many carousels rotate on a timer, but an interface
that moves without being asked is motion that no temperament allows. WCAG
2.2.2's pause button only mitigates a decision that should not be made, and a
reader who wants the next slide has two buttons, a rail and a swipe. `perView`
is also out of scope: the form is one slide per view, and a row of N cards
belongs to Grid or ScrollArea.

## Anatomy

```
[root — <section role="group" aria-roledescription="carousel">, labelled]
  [viewport — scroll-snap x, a labelled region and a tab stop (ScrollArea's contract)]
    [slide — role="group" aria-roledescription="slide", labelled]*
  [controls row]
    [previous Button] [dot rail — one button per slide, aria-current] [next Button]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `slides` | `CarouselSlide[]` | required | in reading order; empty renders nothing (the page supplies any EmptyState sentence) |
| `label` | `string` | required | names the carousel — "Product tour", not "Carousel" |
| `previousLabel` / `nextLabel` | `string` | required | the travel buttons' names, in the app's language; never built in |
| `roleDescriptions` | `{ carousel: string; slide: string }` | `carousel` / `slide` | what a screen reader *calls* the region and each slide (the localization seam). `aria-roledescription` is spoken, so it is prose. The defaults are the APG's own words. Pass both or neither |
| `index` / `defaultIndex` / `onIndexChange(index)` | `number` | `0` | Slider's controlled trio. Swiping fires it too, because swipes and buttons move the same position |
| `loop` | `boolean` | `false` | previous from the first slide goes to the last, and next from the last to the first; when off, the end buttons are disabled |

```ts
interface CarouselSlide {
  id: string
  label: string // names the slide and its dot — "Dashboard", not "Slide 2"
  content: ReactNode
}
```

Attributes: root `data-member` only. Position is exposed through ARIA
(`aria-current` on the dot, the slide labels), not through a separate attribute.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| viewport | scroll-snap x mandatory · slides `100%` wide, snap-aligned start · `scrollbar-width: none`, because the rail and buttons act as the scrollbar · radius `--pm-radius-md` |
| slide | `min-inline-size: 100%` · snap `start` |
| controls row | margin-top `--pm-space-3` · gap `--pm-space-3` · centred |
| travel buttons | vocabulary Button — ghost · neutral · `iconOnly`, `previous` / `next` icons |
| dot rail | dots one `--pm-hit-target` apart, centre to centre: gap `--pm-hit-target` less the dot's `--pm-space-2`, and half that as padding. Each dot's hit area ends where its neighbour's begins. Dots closer together put one hit area over the next dot, and a press on a dot lands on the dot after it. A rail longer than its line wraps, its rows the same distance apart |
| dot | `--pm-space-2` square · radius `--pm-radius-pill` · bg `--pm-border-default` · hit area grown to the `--pm-hit-target` square by a centred pseudo-element (the 24px minimum, as everywhere) |
| dot hover | bg `--pm-border-strong` |
| dot current | bg `--pm-accent-bg` · width `--pm-space-4`, a lozenge that marks the current slide. It grows about its own centre, so the other dots keep their places |
| dot focus | the shared focus ring around the dot with a `--pm-space-1` gap, in `--pm-border-focus-solid`, current or not (conventions §4, the around placement) |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a tour | 3 slides | `aria-roledescription="carousel"` |
| second slide | `defaultIndex={1}` | — |
| looping | `loop` | — |
| at the end | `defaultIndex` last, no loop — next disabled | — |
| controlled | `index={2}` | — |
| empty | `slides={[]}` | renders nothing |

`requiredSelectors`: `:hover`, `:focus-visible`, `[aria-current="true"]`.

## Motion

Travel is a scroll. The scroll follows the motion tokens without owning any:
buttons and dots scroll smoothly only while the surface duration is non-zero, so
at `none` and under reduced motion travel is instant. The reader's own swipe is
never animated, because the reader is performing that scroll. The dot's width
change runs on `stateFeedback`. There is no autoplay (see the second paragraph;
it is part of the spec).

## Icons

`previous` / `next` on the travel buttons, decorative behind their labels.

## A11y

The WAI carousel grouping: a labelled
`role="group" aria-roledescription="carousel"` container. It is a group and not
a region, because the viewport inside is the labelled region, and two landmarks
with one name is a violation. Each slide is a
`role="group" aria-roledescription="slide"` named by its own label, so a reader
arriving anywhere knows what this is, which slide this is, and how many there
are. The dots are real buttons named by their slide's label, with `aria-current`
on the current one. The travel buttons are vocabulary Buttons named by required
props. Swipe, buttons, dots and keyboard scrolling all move one shared position,
and `onIndexChange` reports it whichever input moved it. The viewport is itself
a labelled `role="region"` tab stop (ScrollArea's own contract), so the
browser's native scroll keys page through the slides and snap exactly as a swipe
does. Off-screen slides stay in the DOM and are not hidden. Scroll reach is real
reach, and a tabbable control inside a neighbouring slide scrolls it into view
natively.

```contract
role root group
attr root aria-roledescription=carousel when a tour
attr slide aria-roledescription=slide when a tour
role viewport region when a tour
attr viewport tabindex=0 when a tour
attr dot aria-current=true when a tour
name next from nextLabel when a tour
key Enter activates on next when a tour
```

## Agent

An agent reads the index of the slide on show, 0-based as `index` is, and each slide's id and
label, and moves to a slide by its index, as a press on that slide's dot does. The move goes
through the member's own position, so `onIndexChange` reports it as it reports a person's,
whether or not the caller controls the index. An index outside the slides fails, and moving to
the slide on show changes nothing. The previous and next Buttons and the dots are the
Carousel's own parts, so it withholds them: an agent moves through the slides with `set`, and a
slide's content, which the application passes, stays an agent's, listed within the Carousel.

```agent
state index number
state slides list
action set number sets index calls onIndexChange
withholds contents
```
