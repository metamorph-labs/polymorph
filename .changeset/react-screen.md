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
  do. Without it, a document may use every member React draws except `ThirdParty`, which hosts
  another library's code, and `Toast`, which React raises with `toast()`. A node that cannot be
  drawn, or whose member throws, draws nothing and reaches `onFault`; `faults="inline"` shows it
  in place.
- `onAction` is told `{ name, args, values }` when a member calls a callback input that returns
  nothing, and a promise it returns is what the member waits on: a ConfirmDialog stays busy until
  it settles. A callback input that returns a value is answered by its type and never told.
- A screen renders on a server with no handler run. A member that throws there leaves the
  screen's place empty for the browser to draw, and the page around it is still served.
- `useScreen` and `ScreenDrawing` are its two halves, for reading the screen's `values` or drawing
  it somewhere of your own. `componentFor(members, name)` is the rule a name resolves by.
