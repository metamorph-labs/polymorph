# Lightbox

A picture opened large over the page: fitted inside the window with nothing cropped, on the
scrim, with previous and next when there are several. Use it where a picture is drawn small in
the page, such as an attachment's preview or a screenshot in a list, and the reader opens it to
see it whole.

It is a positioned Dialog variant, as Drawer is (`drawer.md`). It uses Dialog's machinery:
Radix `@radix-ui/react-dialog` in React and Zag's dialog machine in the other web frameworks,
Dialog's scrim, Dialog's focus policy and focus return, Escape, the scroll lock and the hidden
page, and Dialog's presence motion. Its panel is its own: the panel fills the window and draws
no card.

It is **not Dialog**, which is a card that holds a task under a visible title. A picture placed
in a Dialog is drawn inside the card's width cap and its scrolling body: at `lg` a wide
screenshot is drawn about as wide as it was in the page, and a tall one is cut off by the body
and scrolls. It is **not Carousel**, which shows slides in place on the page and pages through
them by scroll. It is **not Image**, which it composes for each picture: Image draws one
picture, with its loading and failed states, and has no lightbox of its own (`image.md`).

## Anatomy

```
[trigger?]                 a governed control (Dialog's): cloned to receive onClick
[scrim]                    Dialog's
[positioner]
  [panel]                  role="dialog", aria-modal, named by `label`; fills the window, draws nothing
    [title]                `label`, visually hidden
    [stage]                the whole panel, under the controls
      [Image]              the current picture
    [previous]?            a backing with a ghost Button "previous"; several pictures only
    [next]?                a backing with a ghost Button "next"; several pictures only
    [position]?            role="status": "2 of 5"; several pictures only
    [close]                a backing with a ghost Button "close"
```

## API

```ts
interface LightboxImage {
  src: string // the picture's URL; an empty string is Image's failed state
  alt: string // the picture's accessible name, as Image's `alt`
}

interface LightboxProps {
  images: LightboxImage[]                    // in reading order; an empty list opens nothing
  label: string                              // the dialog's accessible name ("Attachment preview"); not drawn
  index?: number                             // the picture shown, from 0; controlled when given
  defaultIndex?: number                      // the picture shown first while the lightbox holds it; default 0
  onIndexChange?: (index: number) => void    // the picture the reader moved to
  open?: boolean                             // controlled open state, as Dialog's
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactElement                     // a governed control, usually a Button, as Dialog's
  messages?: {                               // the localization seam: every key, or none
    close: string                            // the close Button's name; default "Close"
    previous: string                         // default "Previous picture"
    next: string                             // default "Next picture"
    position: (position: number, count: number) => string // default "2 of 5"; counts from 1
  }
}
```

Attributes: the panel carries Dialog's `data-state="open|closed"` and `data-member`. The parts
carry `data-lightbox-part="previous|next"` and Dialog's `data-dialog-part="close"`, which are
the hooks the focus policy and the conformance locators read. The position is said through
`role="status"`, not through an attribute.

**One picture** draws no previous, no next and no position: there is nowhere to move.

**The position** is the index, clamped to the list, as Carousel's is. `index` controls it,
`defaultIndex` sets where an uncontrolled lightbox starts, and `onIndexChange` reports a move
whichever input made it. A controlled lightbox moves only when the app passes the new `index`.
The position is kept when the lightbox closes, so an uncontrolled lightbox opens again on the
picture the reader left. An app that opens it on a chosen picture (one thumbnail of several)
controls `index` and `open`.

**No wrap.** Previous on the first picture and next on the last are disabled, as Carousel's
ends are when it does not loop. No site needs a loop.

**What the app passes, and nothing more.** The member requests only the picture it draws, with
`loading="eager"`, because that picture is in view. It does not preload the next picture: the
member does not fetch, and an app that holds its pictures as object URLs has nothing to wait
for. A picture that is still arriving shows Image's loading state, and one that fails shows
Image's fallback, named by its `alt`.

**Detail.** The picture is drawn at most at its own size and is never enlarged past it, so a
small picture is not blurred. A reader who wants to see detail uses the browser's own zoom: a
pinch on a touch screen or a trackpad zooms the window over the picture. There is no zoom
control and no pan, because no site needs one, and a member gesture would fight the browser's.
A download or an "open the original" link stays in the page beside the trigger, where the app
already draws it.

**No caption.** A picture's words are its `alt`, which is its accessible name. No site has a
caption apart from that description, and a drawn caption that repeats the `alt` would be read
twice.

**No swipe.** Carousel's swipe is the browser's scroll of a strip that holds every slide. A
lightbox draws one picture, and a swipe on it would need a gesture model the motion system does
not have (`drawer.md` declines the same gesture). A swipe on a picture the reader has zoomed with
a pinch pans the zoomed window, and taking it as a move would fight that. The reader moves with
the two Buttons and the arrow keys.

## On iOS and Android

The panel is a full-screen cover in SwiftUI and a `Dialog` window that fills the screen in
Compose, whose dim is the platform's, as Dialog's is. The pictures are the platform's pager, one
picture a page, so a swipe moves to the next picture, as it does in each platform's photo viewer.
A pinch zooms the picture shown inside the panel, because an app's window does not zoom as a
browser's does: a drag pans it while it is zoomed, and a double tap returns it. The Buttons, the
keys and the position are the web's.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| scrim | Dialog's: bg `--pm-bg-scrim` · `--pm-z-overlay` · takes clicks (`pointer-events: auto`), because a modal substrate turns pointer events off on the body and a press beside the picture lands here. Zag's machine reads any press inside the panel's box as inside, and this panel's box is the window, so in the generated frameworks the scrim closes the lightbox on its own click |
| positioner | `position: fixed` · `inset: 0` · `--pm-z-overlay` · takes no clicks |
| panel | fills the window · padding `--pm-space-4` plus each safe-area inset · a grid of three rows (close; previous, next; position) · draws nothing and takes no clicks itself, so a press beside the picture and the controls lands on the scrim. The substrate writes `pointer-events: auto` inline on a modal panel, so the recipe's `none` is `!important` |
| title | visually hidden (`a11y.module.css`) |
| stage | the whole panel, the picture centred · the picture takes clicks |
| picture | Image, its frame unsized · `max-inline-size: calc(100vw - 2 × --pm-space-4 - the inline insets)` · `max-block-size: calc(100dvh - 2 × --pm-space-4 - the block insets)`, with a `100vh` base for engines without `dvh`, as Dialog's. Both are viewport lengths, because the overlay's container is the window (`dialog.md`) and Image's frame has no height for a percentage to resolve against |
| close, previous, next | a backing: bg `--pm-bg-overlay` · `1px solid --pm-border-subtle` · radius `--pm-radius-control` · shadow `--pm-shadow-transient` · positioned, so it paints over the picture · Button `ghost/neutral/sm iconOnly` inside. Close sits at the top end, previous and next at the start and end edges, centred on the block axis |
| position | the same backing · padding `--pm-space-1` `--pm-space-3` · `text.sm` quartet · `--pm-text-primary` · tabular figures · centred at the bottom |
| right to left | previous and next are mirrored (`scaleX(-1)`), because the icon set has no directional pairs. Each is a square on a symmetric backing, so only its arrow turns |
| glass | each backing is Dialog's glass pane: `--pm-material-surface` with the material's blur |

The controls float over the picture rather than beside it. A phone has no width to spare for
two columns of controls, and the backing keeps each control's contrast over any picture.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| one picture | one image, trigger only | opening focuses close; no previous, next or position |
| open | `defaultOpen`, three images, `defaultIndex={1}` | panel `role="dialog"`, `aria-modal`; the position says "2 of 3" |
| several pictures | three images, trigger only | — |
| a wide picture | a 2400 × 900 picture | fitted by its width: as wide as the panel allows |
| a tall picture | a 600 × 1600 picture | fitted by its height: as tall as the panel allows |
| a picture that fails | `src=""` | Image's fallback, named by `alt` |

The page's direction is the document's, so no entry is right to left. The lightbox law opens a
lightbox in a right-to-left document.

`requiredSelectors`: `[data-state="closed"]` (a leaving panel's parts stop taking clicks),
`:focus-visible` (the panel takes focus when a press lands on the picture, and draws no ring),
`[dir="rtl"]` (the mirrored arrows).

## Motion

Dialog's. The scrim fades. The panel scale-fades from the trigger's origin with the
`dialog.panel` binding, and exits toward it, under presence (`MotionPresence`), so the focus
trap and the scroll lock last through the exit. At `none` and under reduced motion the scrim
and the panel appear and leave in place.

A move to another picture is not animated: the new picture replaces the old in one frame. The
reader asked for the change, and the new picture is the feedback. A crossfade would draw two
pictures over each other while neither is whole.

## Icons

`close`, `previous`, `next` on the Buttons, decorative behind their names. Image's `error` in a
picture that fails.

## A11y

Dialog's modal semantics: `role="dialog"`, `aria-modal`, the focus trap, the scroll lock, and
the rest of the page hidden from assistive technology. The panel is named by `label` through a
visually hidden title. It has no description, because a picture's words are its `alt`.

Focus on open follows Dialog's policy. The panel has no body control and no footer, so focus
starts on close. Focus returns to the trigger when the panel closes, or to where it was before
it opened when the app opened it, and by Dialog's rule to the focusable element nearest where
it was when it has left the page.

Escape closes, and so does a press on the scrim beside the picture. A press on the picture or a
control does not.

ArrowLeft and ArrowRight move one picture from anywhere in the panel, by the page's direction,
and `onIndexChange` reports the move:
in a right-to-left page ArrowLeft moves to the next picture and ArrowRight to the previous one,
and the previous Button sits at the right edge. A key with a modifier is left to the browser. At
an end the key does nothing. There is no Home and no End, as Carousel has none.

A browser takes focus from a Button as it is disabled. So when previous or next reaches an end
while it holds focus, focus goes to the other one, which the move has enabled, and stays in the
panel.

The position line is a polite status, and says the new position when the picture changes. This
differs from Carousel, which announces nothing: Carousel keeps every slide in the page, named,
with the current dot marked, so a reader finds the position by reading. A lightbox draws one
picture, so a reader who pressed next learns that it moved from the status. The status has its
words at mount, so opening the lightbox announces the dialog's name and not the position.

The picture is Image's: its `alt` is its name, and a failed picture's fallback keeps the name.

```contract
role panel dialog when open
attr panel aria-modal=true when open
name panel from label when open
key Enter opens
focus on-open close when one picture
focus on-close trigger
focus on-close nearest
key Escape closes when open
key ArrowRight activates on close when open
key ArrowLeft activates on close when open
dismiss both
announces live:polite "2 of 3" when open
```

## Agent

An agent reads whether the lightbox is open, the picture it shows (`index`, from 0) and its
pictures by their `alt`, and moves to the next or the previous picture and closes it, as a person
does with its controls. A move goes through the member's own position, so `onIndexChange`
reports it as it reports a person's, whether or not the caller controls the position, and a close
reports through `onOpenChange`. A move is refused at an end, where its control is disabled. A
closed lightbox is not listed, because it has no panel. An agent does not open a lightbox: a
closed one has no panel to name it, and its trigger is a control of its own, usually a Button, which an
agent presses to open it. Previous, next and close are the lightbox's own Buttons, so it
withholds its panel and declares their actions as its own.

```agent
state open boolean as panel present when open
state index number when open
state images list when open
action close sets open calls onOpenChange when open
action next sets index calls onIndexChange when open
action previous sets index calls onIndexChange when open
withholds contents when open
```
