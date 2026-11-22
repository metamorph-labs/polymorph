---
'@polymorph/recipes': patch
---

CodeBlock's copy control paints the block's surface from the button to the block's corner. A long
line that reaches the corner before it is scrolled is cut off at the control's edge, where it
showed through the copy glyph. The block reserves `--pm-space-2` more at its inline end for the
gap beside the button, and states its line height, `--pm-text-sm-line-height`, where it inherited
one. The copyable block's wrapper is a one-cell grid, so a
row that stretches the wrapper stretches the block with it, as it stretches a block with no
control.
