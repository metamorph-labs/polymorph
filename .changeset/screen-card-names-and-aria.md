---
'@polymorph/screen': patch
---

The run-time card (`runtimeCard`) says two things a measured run showed a model needs. A member
that takes the four ARIA props lists them as `aria-*`, and the card says each is written under its
own name and that no member has a prop named `aria`: a model that read `aria` in a member's line
wrote a prop of that name, holding an object. The output contract says a control's name is used
once in a screen, because two forms on one screen each named a field `email` and `values` holds
one value for a name.
