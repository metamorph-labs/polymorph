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

A member that throws, as it renders or later, now renders nothing, and the members around it
render. Before, the error stopped the rendering of the element that held it and of every element
after it in the queue. The element dispatches `poly-error` (`ERROR_EVENT`), which does not bubble,
with the error as `detail`, and the console reports the error unless a listener cancels the event.
