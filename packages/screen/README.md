# @polymorph/screen

Screens a model writes and a host draws at run time.

An agent inside a running product (a chat, a copilot panel, a tool result) writes a small
document, and the host draws it at once, as interactive UI in the host's own theme. The document is
a `polymorph-screen/1` screen spec: the same format `pnpm emit` turns into source for any framework
or platform, drawn here without a build. It names members of the vocabulary, their props and the
inputs they bind to. It has no field for a style and no expression language, so nothing in it runs.

This package is what every run-time renderer shares. It has no framework, no DOM and no
dependencies, and runs in a page, a worker and a server alike.

| Import                         | What it is                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@polymorph/screen/vocabulary` | `VOCABULARY`: the members, their props, parts and lawful cells, generated from the registry of the release you install.                                     |
| `@polymorph/screen/check`      | `checkScreen(document, { framework?, members? })`: the spec validator's faults, plus a member the host does not allow and an address a screen may not hold. |
| `@polymorph/screen/partial`    | `parsePartial(text)`: the document a model's answer holds so far, for drawing while it streams.                                                             |
| `@polymorph/screen/walk`       | `createScreen(options)`: the document, the host's data and the vocabulary, resolved into what a renderer draws, with actions, controlled values and faults. |
| `@polymorph/screen/card`       | `runtimeCard({ framework?, members? })`: the text a host puts in the model's system prompt.                                                                 |

The root re-exports all of it. Import a subpath to load only what it needs: `parsePartial` loads
no vocabulary, and the walk loads neither the vocabulary table nor the card.

## Drawing a screen

A host draws with a renderer, and every renderer draws from `createScreen`, so a document
behaves the same in each of them:

- a data input is filled from the host's `data` by name, and is empty when the host has no value;
- an input whose type is a function is an action: the host is told `{ name, args, values }` when
  a member calls it;
- a control keeps what the reader chose, and its value is in `values` under its `name`;
- a component is drawn only if the vocabulary has it and the host allows it (`members`), a prop
  only if the member takes it, and an address only if it is relative or `http:`, `https:`,
  `mailto:` or `tel:`;
- a member that hosts another library's code (`ThirdParty`) is drawn only where the host names it;
- a node that cannot be drawn is drawn as nothing and reported with its path.

## Asking a model for a screen

```ts
import { runtimeCard } from '@polymorph/screen/card'
import { checkScreen } from '@polymorph/screen/check'
import { parsePartial } from '@polymorph/screen/partial'

const members = ['Stack', 'Card', 'Text', 'Button', 'Input', 'FormField']
const system = runtimeCard({ members })
// … stream the model's answer into `text` …
const { document, complete } = parsePartial(text)
if (complete) console.log(checkScreen(document, { members }).faults)
```

The card lists only the members the host allows, each with its props and their types, and ends
with the output contract, so the model needs no tool call.
