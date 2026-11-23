---
'@polymorph/elements': patch
---

A change to what an element's slot holds no longer renders the elements already in it again.
Before, adding a node to a rendered element (a page's `append`, an htmx `beforeend` swap) disposed
every `poly-*` element in the element's slots and rendered each again, so a field among them lost
its text and its focus. Now the member reads the slot again and each element still in it keeps its
rendering: only the nodes that arrived render, and only the ones that left are disposed.
`PolyElement.observe` reports exactly those. An element that leaves a slot is disposed at once
after a change the element makes itself (`removeChild`, `fillSlot`, a swap of its children), and a
microtask later when its member stops reading the slot by itself (an overlay that closes).

A slot that holds one element is now read by the member as a list of one, so a node added beside
it goes after it, where Solid before took the element out of the document and put it back. A slot
that holds one text is still read as the string. No member reads a slot's shape, so nothing it
draws changes.

`fillSlot(element, slot, nodes)` is new: it sets the nodes one slot holds, in order (`''` for the
children, `'footer'`, `'empty-state.action'`), before the member renders or while it renders, on
any element, a table's or a list's part included, in place of what the page wrote in that slot.
`restore` puts back only what the page wrote.

A member that throws no longer stops the elements around it. Before, an error a member threw as
it rendered left the element's rendering and stopped the render queue, so the elements after it
did not render. Now:

- A member that throws as it first renders renders nothing, and the members around it render.
- A member that throws as it updates (an effect that runs again when a prop changes) keeps what it
  had rendered, and the effect that threw stops updating.
- Either way the element dispatches `poly-error` (`ERROR_EVENT`, which does not bubble) with the
  error as `detail`. Unless a listener cancels it, the error is reported as an uncaught error is,
  with `reportError`: `window`'s `error` event, which error monitors read, and the console.
- An error a member's event handler throws (a click it handles) is unchanged: Solid calls the
  handler outside the member's rendering, so it is the browser's uncaught error, with no
  `poly-error`.

A `poly-*` event now carries `args`, every argument the member called its callback with, beside
`detail`, its first. A listener can tell a callback called with `null` (a Select cleared) from one
called with nothing: `detail` is `null` for both, and `args` is `[null]` or `[]`.
