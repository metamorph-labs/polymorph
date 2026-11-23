---
'@polymorph/react-ui': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid-ui': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
'@polymorph/native': patch
---

Image takes three optional props that steer the browser's fetch, for a public page whose first
picture decides how fast it loads:

```tsx
<Image
  src="/harbour-800.jpg"
  srcSet="/harbour-400.jpg 400w, /harbour-800.jpg 800w, /harbour-1600.jpg 1600w"
  sizes="(max-width: 600px) 100vw, 800px"
  alt="A harbour at dusk"
  width={800}
  height={500}
  loading="eager"
  fetchPriority="high"
/>
```

- `srcSet` and `sizes` are the element's `srcset` and `sizes`, passed unchanged. The browser
  requests the file that suits the screen, so a phone does not download a desktop's file. `sizes`
  changes which file is requested and never the frame's box. `src` stays required.
- `fetchPriority` is the element's `fetchpriority`: `high` for the one picture that is the largest
  content of the first view, with `loading="eager"`.
- A change of `srcSet` is a new request, as a change of `src` is: the frame returns to loading,
  and a failure is forgotten.

An element takes them as `src-set`, `sizes` and `fetch-priority`. Without the props the markup is
what it was. On iOS and Android none of the three is honoured: the view requests the `src`.
