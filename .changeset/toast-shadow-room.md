---
'@polymorph/recipes': patch
---

Toast's viewport draws each card's whole shadow. The viewport scrolls, and a scroll container cuts
what it holds at its padding edge, so it cut the shadows at the cards' sides and below the last
card, and the cut shadows read as a grey rectangle behind the stack: in the gaps between the cards
and behind their rounded corners. The viewport now reaches the window's end and bottom edges with
the cards' `--pm-space-6` inset as its padding there, and has `--pm-space-9` of padding on its
start side and top. The cards stay where they were, at the same width. The viewport takes no
pointer events and an open card does, so the padding and the gaps between the cards pass a click
to the page under them; the gaps took it before. F8 still focuses the viewport, and the browser's
own focus ring is drawn around the viewport's larger box.
