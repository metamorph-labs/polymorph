# Image

A read-only picture: a photograph, a brand mark, artwork or a preview of a file. It loads one
`src`, holds its box while the picture arrives, and draws a fallback of its own when the picture
cannot load. It has no substrate: it is the platform's image element inside a frame.

It is **not Avatar**, which is a round identity mark that falls back to a person's initials. It
is **not ImageEditor**, which pans, zooms and crops a picture and returns a file. It is **not
Icon**, which draws an icon role from the system's set and takes no URL. It presents and does
nothing else: it has no caption, no zoom, no lightbox and no gallery, it plays no video, and it
is not an attachment preview. A member that needs one of those composes this one.

## Anatomy

```
[frame <span>]
  [placeholder <span>]?   while the picture loads (aria-hidden)
  [image <img>]?          until the picture fails
  [fallback <span>]?      once it has failed: Icon "error"
```

## API

```ts
interface ImageProps {
  src: string // the picture's URL; an empty string is the failed state
  srcSet?: string // other files of the same picture, each with a width (`640w`) or a density (`2x`)
  alt: string // the accessible name; an empty string declares the picture decorative
  width?: number // the picture's width in CSS pixels, given together with `height`
  height?: number // the picture's height in CSS pixels
  aspectRatio?: number // width over height of a frame the picture sits in
  fit?: 'contain' | 'cover' // default 'contain'
  loading?: 'lazy' | 'eager' // default 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto' // how the browser ranks the fetch; absent, it decides
  crossOrigin?: 'anonymous' | 'use-credentials'
  referrerPolicy?:
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'origin'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url'
}
```

Attributes: frame `data-state="loading|failed"` (a loaded picture is the rest state and carries
none), `data-fit="contain|cover"`, and `data-sized` while the props give the frame a box.

**`alt` is required.** Every picture is either meaningful or decorative, and the caller is the
only one who knows which. A non-empty `alt` is the picture's accessible name. An empty `alt`
declares the picture decorative and hides it from assistive technology.

**No prop takes a CSS length.** `width` and `height` are the picture's own pixel size, as the
element's attributes of the same names are, and they are numbers. Application code writes no
lengths, so the frame's bounds come from its container and from the picture. The element's
`sizes` holds lengths, so it is not a prop: the member writes it (see `srcSet`).

**The box.** What the props say decides what the frame holds before the picture arrives:

| Given | The frame |
| --- | --- |
| `width` and `height` | `width` pixels wide and never wider than its container, at the ratio `width / height` |
| `aspectRatio` | as wide as its container, at that ratio |
| `aspectRatio` with `width` and `height` | `width` pixels wide and never wider than its container, at `aspectRatio` |
| none of them | no box: nothing is reserved while the picture loads, and then it is drawn at its natural size, never wider than its container |

`width` and `height` are read together. One without the other gives no ratio, so it is ignored,
with a development warning. A pair in which either value is not above zero is ignored too.

**`fit`** says how the picture sits in a frame whose ratio is not its own. `contain` shows the
whole picture and leaves the rest of the frame empty. `cover` fills the frame and crops what
does not fit. The default is `contain`, because cropping removes content and the caller decides
that. The picture is never stretched.

**`loading`** defaults to `lazy`: the browser fetches the picture when the reader nears it.
`eager` is for a picture known to be in the first view, such as a brand mark.

**`srcSet`** is the element's `srcset`, passed unchanged. It lists other files of the same
picture, each with a width (`640w`) or a density (`2x`), and the browser requests the one that
suits the screen, so a phone does not download a desktop's file. `src` stays required: it is what
a reader that does not pick from the set requests, and an empty `src` is the failed state with or
without a set.

**The member writes `sizes`.** A set that gives widths needs the element's `sizes`, which says
how wide the picture is drawn. The red rules refuse a length in application code, and the member
already knows the frame's box, so it writes the attribute:

| The frame | `sizes` |
| --- | --- |
| `width` and `height` given | `(max-width: <width>px) 100vw, <width>px`: the frame is `width` pixels and never wider than its container |
| `aspectRatio` alone | none, so the element assumes the viewport's width, which the container never exceeds |
| either of the two, with `loading="lazy"` | the same after `auto`, or `auto, 100vw` for `aspectRatio` alone: a lazy picture is laid out before it is requested, so a browser that reads `auto` asks for the frame's own width |
| no box | none |

The value is never narrower than the frame, so the browser never requests a file too small for
it. It can be wider, where a container is narrower than the viewport and the browser does not
read `auto`. `sizes` changes which file is requested and never the frame's box. A set that gives
densities needs no `sizes`, and the element carries none.

**`fetchPriority`** is the element's `fetchpriority`. `high` is for the one picture that is the
largest content of the first view, together with `loading="eager"`, so the browser requests it
ahead of the page's other pictures. Absent, the element carries no attribute and the browser
decides.

**`crossOrigin` and `referrerPolicy`** are passed to the element unchanged, with the platform's
own values. Absent, the element carries neither attribute.

**An empty `src` is the failed state.** There is nothing to request, so the frame draws its
fallback at once.

**A failure is about one request.** The request is the `src` and the `srcSet`. When either
changes, the failure is forgotten and the picture is loading again, so a member that is given
the same URL again later requests it again, as the element would.

**A picture can settle before the member listens.** The browser may have kept it, or the markup
may have come from a server and loaded before its script ran. The member then reads the element:
one that is complete and has a natural width has loaded. One that is complete without a natural
width is either broken or a picture with no size of its own, and the element does not say which,
so the member makes the request again and hears its `load` or `error`.

## Recipes (exact tokens)

| Part | Tokens |
| --- | --- |
| frame | `display: block` · `position: relative` · `max-inline-size: 100%` · `overflow: hidden` · no border, radius, shadow or fill of its own, because a brand mark's corners must not be clipped and a picture that needs a surface sits in a Card |
| frame, sized | `inline-size: 100%`, or `width` in pixels, set inline · `aspect-ratio`, set inline. Both are data from the props, which no token holds |
| frame, unsized | `inline-size: fit-content`, so the frame is the picture's own box |
| image, sized | fills the frame · `object-fit` from `data-fit` |
| image, unsized | `max-inline-size: 100%` · `block-size: auto` |
| placeholder | fills the frame, under the image · bg `--pm-bg-subtle` · the `shimmer` sweep, as Skeleton |
| fallback | bg `--pm-bg-subtle` · glyph `--pm-text-muted`, centred · fills a sized frame · `--pm-space-8` square in an unsized one |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a picture at its own size | `width` and `height` | `data-fit="contain"`, `data-sized` |
| a brand mark | a small mark, `loading="eager"` | named by `alt` |
| a set of files | `srcSet` by density | the element carries `srcset` |
| the first view's picture | `srcSet` by width, `loading="eager"`, `fetchPriority="high"` | the element carries `sizes` and `fetchpriority="high"` |
| decorative | `alt=""` | the image has no role and no name |
| contained | `aspectRatio` over `width` and `height` | the whole picture inside a square frame |
| cover | the same frame with `fit="cover"` | `data-fit="cover"` |
| frames that take their container | three in a Grid, `aspectRatio` alone | each as wide as its cell |
| no size given | `src` and `alt` alone | no `data-sized` |
| failed — a meaningful image | `src=""` | `data-state="failed"`; the fallback is an image named by `alt` |
| failed — a decorative image | `src=""`, `alt=""` | the fallback is hidden |
| failed with no size given | `src=""`, no box | the fallback at `--pm-space-8` |

No entry promises `data-state="loading"`. The state lasts from the element to its picture, and
a picture the browser has already decoded is complete at once, so what an entry shows when it
is read depends on what was drawn before it. The member's tests hold the loading state, and the
change to loaded and to failed, with real `load` and `error` events.

`requiredSelectors`: none. A picture has no hover, focus or active state, and every other state
is a prop or the outcome of the request.

## Motion

The placeholder sweeps with the ambient `shimmer` pattern while the picture loads, at the
period the temperament gives. At `none` and under reduced motion the fill stays still. Nothing
else moves: the picture is drawn as the browser decodes it, over the placeholder, and is never
hidden until a script hears `load`, because a page whose script has not run would then show no
picture.

## Icons

`error`, in the fallback only. It is decorative: the fallback's name is `alt`.

## On iOS and Android

SwiftUI draws the picture with `AsyncImage` and Compose with the app's image loader
(`PMRemoteImage`), as Avatar does. `width`, `height` and `aspectRatio` hold the same box, in
points and in dp, and a picture with no size given is drawn one point or dp to a pixel. The
placeholder is the `bg.subtle` fill without the sweep, as the platforms' own image views draw a
still placeholder.

`loading`, `fetchPriority`, `crossOrigin`, `referrerPolicy` and `srcSet` are not honoured. A
picture is requested when its view is drawn, a request from an app has no origin to cross, and it
carries no referrer. The view requests the `src` and picks no file from a set.

**On Android** the image gateway fades the picture in over the control duration, as it does for
Avatar. A Compose `Painter` reports a picture's size and nothing about a failure, so a URL that
fails stays in the loading state. The failed fallback is drawn for an empty `src` and where the
app provides no image loader.

## A11y

A meaningful picture is the image element with its `alt`. A decorative one is the element with
an empty `alt`, which assistive technology skips. The placeholder is hidden.

The loading frame carries no `aria-busy`. The conventions write it on a control whose action is
pending (`README.md`, "Disabled, loading, invalid"). A picture's name is its `alt`, which the
element carries from its first render, so a reader has nothing to wait for.

When the picture fails, the image element is removed, so the browser's broken-image glyph is
never drawn. The fallback takes its place: an image named by `alt` for a meaningful picture,
and hidden for a decorative one. The member writes no text of its own, so the name a reader
hears is the same before and after a failure.

The frame takes no focus and no keys.

```contract
role image img when a picture at its own size
name image from alt
role image presentation when decorative
attr root data-state=failed when failed — a meaningful image
role fallback img when failed — a meaningful image
name fallback from alt when failed — a meaningful image
attr fallback aria-hidden=true when failed — a decorative image
```
