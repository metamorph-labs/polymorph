---
'@polymorph/react': patch
---

`@polymorph/react/screen` is a new subpath: the React renderer of a screen a model writes, drawn at
run time with no build. Nothing changes for an application that does not import it; the root entry
loads none of it. `@polymorph/react` now depends on `@polymorph/screen`, the run-time core every
renderer shares.

```tsx
import * as members from '@polymorph/react-ui'
import { ScreenView } from '@polymorph/react/screen'

<ScreenView
  text={answer} // or document={spec}
  streaming={!done}
  members={members}
  data={{ tickets }}
  onAction={({ name, args, values }) => agent.send({ name, args, values })}
/>
```

- `ScreenView` draws a `polymorph-screen/1` document, or a model's answer as text while it
  streams, with the members you pass (the vocabulary, a vendored copy, or a map with lazy
  components). While it streams, an element is drawn once the props it requires are written, and
  then kept: a longer document, new `data` or the reader's input redraws only what changed, so a
  field keeps its text and its focus. If you read the stream yourself with `parsePartial`, pass
  `document` with its `cut` and `open`. `allow` narrows the
  members a document may use, as `runtimeCard({ members })` and `checkScreen(document, { members })`
  do. A node that cannot be drawn, or whose member throws, draws nothing and reaches `onFault`;
  `faults="inline"` shows it in place.
- `useScreen` and `ScreenDrawing` are its two halves, for reading the screen's `values` or drawing
  it somewhere of your own. `componentFor(members, name)` is the rule a name resolves by.
