# JsonTree

A collapsible view of an arbitrary JSON value, with leaves coloured by type. Use it for response
bodies in API products, and elsewhere for the payload beside an audit Timeline.

It has no substrate: it is nested lists, native disclosure buttons and a recursion, all small
enough to own. It is a tree rather than a table because a table viewer has to guess a table shape
from arbitrary data, and needs a transpose toggle to correct the guess. A tree matches the shape
of JSON, so it never guesses.

JsonTree shows one value. Table and DataTable show columns of records, whose shape the product
has already decided. It is not CodeBlock: text to copy goes through CodeBlock's `copyable`, so
this member has no copy control. It is not an editor: nothing mutates, so nothing is an input.
Selection, search and virtualization are out of scope. A payload past a few thousand nodes should
be shown raw in CodeBlock, or windowed by the app before it is passed in.

Depth is the only setting. `defaultDepth={1}` opens the first level, so the top-level shape shows
and details open on demand. `0` starts fully closed. `Infinity` is allowed for payloads the
product knows are small.

## Anatomy

```
[root — <ul>, labelled]
  [entry <li>]*
    leaf:   [key?] [value — toned by kind]
    branch: [toggle — <button aria-expanded>: chevron, key?, summary]
            [children <ul>]   (when open)
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `unknown` | required | any JSON value: object, array, string, number, boolean, null. `undefined` and other non-JSON values render as their `String()` form instead of throwing, since the caller already has a bug |
| `label` | `string` | required | names the tree: "Response body", not "JSON" |
| `defaultDepth` | `number` | `1` | levels open at mount: `0` all closed, `Infinity` all open. Uncontrolled after mount, because what the reader expands is not app state |

Attributes: each leaf value carries `data-kind="string" | "number" | "boolean" |
"null"`. Each branch toggle carries `aria-expanded`, set by the member itself with no
substrate, and the stylesheet keys the chevron on it. The rest state is a collapsed branch:
`aria-expanded="false"`, with no extra attribute.

## Recipes (exact tokens)

JSON is code, so the whole member uses `--pm-font-mono` at the `text.sm` scale. The kind colours
come from the text and accent roles, not the status family. A `false` in a payload is not a
warning, and status colour on every boolean would teach readers to ignore status colour.

| Part | Tokens |
| --- | --- |
| root | `text.sm` size/line-height · family `--pm-font-mono` · no list styling |
| row | padding-block `2px` · radius `--pm-radius-sm` on the toggle |
| toggle | ghost row: bg transparent · hover `--pm-bg-subtle` · cursor pointer · chevron Icon `sm` in `--pm-text-muted`, rotated 90° open, turning on `--pm-motion-duration-control` × `--pm-motion-easing-standard` |
| key | `--pm-text-primary` · the `:` in `--pm-text-muted` |
| summary | `--pm-text-muted`; `{…}` / `[…]` plus the count, e.g. `3 keys`, `12 items` |
| string value | `--pm-text-secondary`, quoted |
| number value | `--pm-accent-text` |
| boolean / null value | `--pm-text-muted`, italic |
| children | indented `--pm-space-5` · guide `1px` inline-start rule `--pm-border-subtle`, `--pm-space-2` clear of the toggle column |
| focus | the shared focus ring around the toggle with a `--pm-space-1` gap (conventions §4, around), because its text reaches its edge |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| a payload | mixed object: strings, numbers, booleans, null, nested object and array | `aria-label="Response body"` |
| closed fist | `defaultDepth={0}` | — |
| wide open | `defaultDepth={Infinity}` | — |
| every kind | one leaf per kind | — |
| empty containers | `{}` and `[]` — leaves, no toggle | — |
| primitive root | `data={42}` | — |

`requiredSelectors`: `:hover`, `:focus-visible`, `[aria-expanded="true"]`,
`[data-kind="string"]`, `[data-kind="number"]`, `[data-kind="boolean"]`,
`[data-kind="null"]`.

## Motion

The chevron rotates on the control tokens. The children do not animate: a payload is not a
drawer, a thousand-node subtree cannot animate in smoothly, and readers expect it to appear at
once in every temperament. At `none` the chevron is still too, because the tokens resolve to
zero.

## Icons

`next`, decorative, on every branch toggle. The toggle's name is its key and summary, and the
chevron only shows the state that `aria-expanded` already exposes.

## A11y

A labelled, nested `<ul>` of `<li>`. List semantics announce depth and count without extra
work. Branches toggle through real `<button aria-expanded>` elements named by the key and
summary ("user, 3 keys"), so Tab moves between branches and Enter works without custom script.
It is deliberately **not** `role="tree"`. The tree role requires roving focus and the full
arrow-key pattern, and a partial implementation is worse than a correct disclosure list. The full
pattern is worth its cost only for a keyboard-heavy consumer that needs it. A native renderer has
no `aria-expanded`, so a branch's toggle says its state in words, "expanded" or "collapsed". Leaves
are plain list items. The kind colours only add emphasis, because the text (`"…"`, `true`, `null`) already
carries the meaning.

```contract
role root list when a payload
name root from label when a payload
role toggle button when a payload
name toggle from children when a payload
attr toggle aria-expanded=false when closed fist
key Enter opens on toggle when closed fist
key Enter closes on toggle when a payload
key Tab moves-focus-next on toggle when a payload
```

## Agent

An agent reads which branches are open and which a reader can see, and opens and closes a
branch, as a press on its toggle does. Each branch holds whether it is open, so the tree reads
its branches from its toggles in the document. JsonTree calls no handler, because what a reader
opens is not the application's state.

A branch's id is the JSON Pointer of its value in the data (RFC 6901): the empty string for the
root, `/assignee` for a key of the root, `/labels/0` for an item of an array, with a `~` in a key
written `~0` and a `/` written `~1`. A pointer names a place in the data, so a branch keeps its id
while other branches open and close. A branch's label is its toggle's text: the key and the
summary a person reads.

`branches` lists the toggles a reader can see, in the order they are drawn: the root's, and those
of every open branch under it. A branch inside a closed one is not drawn, so it is not a choice,
and an agent opens the branch around it first, as a person does. A leaf and an empty container
have no toggle, so neither is a choice. `expanded` lists the ids of the open branches. `expand`
and `collapse` press the branch's toggle with its own click; opening a branch that is open, or
closing one that is closed, presses nothing. The values a reader sees are the tree's text, which
`query`'s `text` matches.

```agent
state expanded ids
state branches choices
action expand id presses toggle when closed fist
action collapse id presses toggle
```
