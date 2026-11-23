---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/native': patch
---

Image takes two optional props that steer the browser's fetch, for a public page whose first
picture decides how fast it loads:

```tsx
<Image
  src="/harbour-800.jpg"
  srcSet="/harbour-400.jpg 400w, /harbour-800.jpg 800w, /harbour-1600.jpg 1600w"
  alt="A harbour at dusk"
  width={800}
  height={500}
  loading="eager"
  fetchPriority="high"
/>
```

- `srcSet` is the element's `srcset`, passed unchanged. The browser requests the file that suits
  the screen, so a phone does not download a desktop's file. `src` stays required.
- The element's `sizes` is not a prop, because the red rules refuse a length in application
  code. The member writes it for a set that gives widths, from the frame's box: `width` pixels
  and never more than the viewport's width for a frame with `width` and `height`, wider by the
  crop for a picture that covers a frame of a narrower ratio, and the element's own laid-out
  width first (`auto`) for a lazy picture drawn as wide as its frame. A set that gives widths
  needs a box, from `width` and `height` or from `aspectRatio`: without one the set is ignored,
  with a development warning, because it would stretch the frame to its container.
- `fetchPriority` is the element's `fetchpriority`: `high` for the one picture that is the largest
  content of the first view, with `loading="eager"`.
- A change of `srcSet` is a new request, as a change of `src` is: the frame returns to loading,
  and a failure is forgotten.

An element takes them as `src-set` and `fetch-priority`. Without the props the markup is what it
was. On iOS and Android neither is honoured: the view requests the `src`.
