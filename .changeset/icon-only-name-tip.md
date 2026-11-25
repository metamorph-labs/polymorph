---
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/react': patch
'@polymorph/react-ui': patch
'@polymorph/vue': patch
'@polymorph/vue-ui': patch
'@polymorph/svelte': patch
'@polymorph/svelte-ui': patch
'@polymorph/solid': patch
'@polymorph/solid-ui': patch
'@polymorph/angular': patch
'@polymorph/angular-ui': patch
'@polymorph/elements': patch
'@polymorph/elements-ui': patch
---

**Every icon-only Button shows its label on hover and keyboard focus.** A Button with `iconOnly`
shows its `label` in a bubble that looks like a Tooltip's: after the Tooltip's delay when the mouse
rests on it, at once on keyboard focus, and not for touch or pen. It is a name tip, not a Tooltip:
the bubble is hidden from assistive technology, adds no `aria-describedby`, and the button's name
is unchanged. It is drawn in the top layer, so it shows over a Dialog, Drawer, Popover or Menu,
takes no pointer events, and adds nothing inside or around the button. Escape closes it; on a tip
the pointer opened, the key goes no further, so a Dialog around the button stays open.

SplitButton's chevron, CopyButton, AvatarButton and Pagination's arrows drawn as links show their
names the same way. CopyButton shows none while its confirmation shows.

A Button already inside a `<Tooltip>` is unchanged: it shows the Tooltip and no tip. A Tooltip
around an icon-only Button that repeats only its label can be removed.

The engine exports `nameTip(control, label, className)`, and each foundation re-exports it, for
the members that call it. Button's recipe adds the `tip` class, which composes the Tooltip's
`bubble`, and the Tooltip's trigger anchor carries `data-tooltip-part="trigger"`.
