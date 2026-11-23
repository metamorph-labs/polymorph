---
'@polymorph/mcp': patch
---

**`render_screen` draws a spec as a product draws a model's screen at run time.** The screen page
draws with `@polymorph/react/screen` and the run-time core (`@polymorph/screen`), so the picture is
the one a product that draws the same spec shows. A FormField's control now gets the field's id and
label in the picture, as it does in JSX, so a Switch inside a FormField is named by the field's
label.

How each callback input was filled is reported in the core's words. One that returns nothing is
`an action; answers nothing` (`an action; answers a promise` when its type returns one). One that
returns a value says what its type answers: `answers the key of its first argument`.
