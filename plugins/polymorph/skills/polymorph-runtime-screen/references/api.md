# Reference: exports, props, attributes and events

## `@polymorph/screen`

No framework, no DOM and no dependency: it runs in a page, a worker and a server. Each subpath loads
only what it needs.

| Import | Exports | Loads |
| --- | --- | --- |
| `@polymorph/screen/partial` | `parsePartial`, `MAX_DEPTH`, the type `PartialDocument` | nothing else |
| `@polymorph/screen/check` | `checkAnswer`, `checkScreen` | the vocabulary table, the validator and the reader |
| `@polymorph/screen/card` | `runtimeCard`, `outputContract` | the table and the card |
| `@polymorph/screen/walk` | `createScreen`, `materialize`, the types `ScreenAction`, `ScreenFault`, `ScreenNode`, `ScreenOptions`, `ScreenUpdate` | no table: a renderer hands it one |
| `@polymorph/screen/vocabulary` | `VOCABULARY`, the table generated from the release's registry | the table |
| `@polymorph/screen` | all of the above, the limits and the helpers the renderers share | everything |

`checkAnswer(text, options)`, `checkScreen(document, options)`, `runtimeCard(options)` and
`outputContract(options)` take:

| Option | What it is |
| --- | --- |
| `framework` | `react` (the default), `vue`, `svelte`, `solid`, `angular` or `elements`: the default members and which are absent |
| `members` | the names the host allows; the framework's default when absent |
| `addresses` | `allowed` (the default) or `refused`: no address passes, and no member that needs one |

`checkScreen` returns `{ ok, faults }`, each fault `{ path, message }`. `checkAnswer` returns
those and `document`, `complete` and `prose`, with an answer cut short as a fault at `$`.
`outputContract` is the card's last part alone.

`parsePartial(text)` returns:

| Field | What it is |
| --- | --- |
| `document` | the document so far; `undefined` before its first brace, and for an answer that is prose only |
| `complete` | whether the document's outermost brace has closed; `false` for an answer that is prose only |
| `open` | the path of the string still being written, or `null` |
| `cut` | the path of the innermost value the text ends inside, or `null` |
| `error` | `{ at, message }` where the text stops being JSON, or `null` |
| `prose` | the text outside the block that holds the document: before it, and after it once it closes; all the text when there is no document |
| `fence` | `open` from the block's first backtick until its closing line, then `closed`; `null` with no fence |

It reads the first fence marked `json`, or unmarked, and the first brace that opens an object when
the text has no fence. A name, a number, `true`, `false`, `null` and a binding are left out until
whole; a string a person reads is kept while it is written.

`createScreen(options)` is for a renderer of your own: `document`, `vocabulary`, `framework`,
`members`, `data`, `fill` (`absent` or `sample`), `streaming`, `open`, `cut`, `onAction` and
`onFault`. It returns a `Screen`: `root`, `faults`, `values`, `changed`, `fills`,
`streaming`, `update(change)`, `subscribe(listener)` and `fail(fault)`.

## The model's prose

`parsePartial(answer).prose` is the text around the document, for the page to draw as text beside
the screen. A fenced block in another language is prose, as the reader skips it. A last line that
may still become the document's fence (one to three backticks) is left out until it is whole. Draw
the prose with `StreamingText`, with `streaming` on while `fence` is
not `open`. `Markdown` draws the links and pictures its text writes, so it is for a host
that allows them.

## `@polymorph/react/screen`

A subpath of `@polymorph/react`; the foundation's root loads none of it. It exports
`ScreenView`, `useScreen` (the screen `ScreenView` draws, to read its
`values`, `changed`, `faults` and `fills`), `ScreenDrawing` (draws a `Screen`),
`componentFor` (the component a name resolves to among the members), `parsePartial`, and
the types `ScreenAction`, `ScreenFault`, `ScreenViewProps` and `ScreenMembers`.

| `ScreenView` prop | What it is |
| --- | --- |
| `members` | required: the components by member name. A part is read as `members.Table.Row` or `members['Table.Row']` |
| `text` | a model's answer so far |
| `document` | the document as an object, read when `text` is absent |
| `cut`, `open` | `parsePartial`'s, beside `document` |
| `streaming` | whether more is to come. With `text`, whether its document has not closed, unless given. Off while chunks still arrive, each chunk is a new whole document whose faults are told again |
| `data` | the host's data by input name |
| `allow` | the members a document may use. Read when the screen is made. Absent, every member React draws but `ThirdParty` and `Toast` |
| `addresses` | `allowed` (the default) or `refused`. Read when the screen is made |
| `fill` | `absent` (the default) or `sample`, which fills an input with no data from its type |
| `onAction(action)` | told each action; a promise it returns is what a member waits on |
| `onFault(fault)` | told each fault once |
| `faults` | `hidden` (the default) or `inline` |
| `renderFault(fault, cause)` | draws a fault in place when `faults` is `inline`. `cause` is `unknown`, `refused`, `missing`, `threw` or `value` |
| `renderBinding(path, value)` | draws a binding where something is drawn |
| `decorate(drawn, node)` | wraps the drawing of every node |
| `fallback` | what shows while a member that is not lazy suspends |

No handler runs while React renders, so a server render and strict mode's second render tell the
host nothing. Each node draws inside its own error boundary.

### A host that parses the stream itself

A host that reads the answer itself, to log it or to show the prose before the fence, passes what
`parsePartial` returned. With `cut`, an element still being written waits as it does with
`text`; without it, every element that has arrived is drawn with the props it has so far.

```tsx
import * as members from '@polymorph/react-ui'
import { parsePartial, ScreenView } from '@polymorph/react/screen'

import { MEMBERS } from './screen-members'

export function ParsedScreen({ answer, ended }: { answer: string; ended: boolean }) {
  const read = parsePartial(answer)
  return (
    <ScreenView
      document={read.document}
      cut={read.cut}
      open={read.open}
      streaming={!ended && !read.complete}
      members={members}
      allow={MEMBERS}
    />
  )
}
```

`drawScreen` takes the same four fields in its options and in `update`. `<poly-screen>` takes the
document as `spec` and nothing else, so it draws each element as it arrives with the props it has
so far.

## `@polymorph/elements-ui/screen`

Importing it defines `<poly-screen>` and every element. It exports `drawScreen`,
`checkAnswer`, `checkScreen`, `runtimeCard`, `outputContract` and `parsePartial` bound to the elements,
`definePolyScreen`, `PolyScreen`, `SCREEN_TAG`,
`ACTION_EVENT` (`'poly-action'`) and `FAULT_EVENT` (`'poly-fault'`).

`drawScreen(container, options)` appends the drawing to a plain element. It takes `document`,
`data`, `streaming`, `open`, `cut`, `members`, `addresses`, `faults`, `onAction` and `onFault`, and no
`text`: a host that streams passes what `parsePartial` returned. It returns `values`, `changed`,
`faults`, `update(change)`, `check()` and `dispose()`.

## `<poly-screen>`

| Attribute or property | What it is |
| --- | --- |
| `spec` (property) | the document |
| `text` (property) | a model's answer so far |
| `data` (property) | the host's data by input name |
| `streaming` (attribute and property) | more of the document is to come |
| `members` (attribute and property) | the members the host allows: names separated by spaces, or a JSON array |
| `addresses` (attribute and property) | `allowed` (the default) or `refused` |
| `faults` (attribute and property) | `hidden` (the default) or `inline` |
| `values`, `changed` (properties, read only) | each named control's value, and the names the person changed |
| `check()` (method) | a promise of what the check says of the document it draws; for `text` once `streaming` is off, of the answer |

| Event | `detail` |
| --- | --- |
| `poly-action` | `{ name, args, values, changed }`; `event.waitUntil(promise)` hands the member a promise |
| `poly-fault` | `{ path, message, component? }` |

Both bubble and are composed.

## `loadScreen()`

`polymorph.js` and `polymorph-all.js` export `loadScreen`.
It resolves to `drawScreen`, `parsePartial`, `checkAnswer`, `checkScreen`, `runtimeCard` and
`outputContract`, bound to the elements.

## The tools while you build

Print the run-time card, or save an answer's document to a file to look at it:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --runtime --framework react --members Stack,Card,Text,Button --addresses refused
npx -y @metamorph-labs/polymorph@1.0.18 render answer.json --system plain --data data.json
npx -y @metamorph-labs/polymorph@1.0.18 validate answer.json --framework react
npx -y @metamorph-labs/polymorph@1.0.18 component FormField --framework react
```

- `card --runtime` prints the card `runtimeCard` builds for the same `--framework` (`react` or
  `elements`), `--members` and `--addresses`, and its length in characters on stderr.

- `render` draws it with the React members, every member allowed, and reports layout faults.
  `--data` takes a JSON file of the host's data by input name. It does not apply the host's list
  or report a run-time fault, such as a refused address.
- `validate` checks it as `emit` would: names, props, values, cells and usage rules. It does not
  apply the host's list or the run-time rules; only `checkScreen` does.
- `component` prints what a member takes.
