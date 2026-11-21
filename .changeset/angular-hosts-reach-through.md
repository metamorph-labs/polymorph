---
'@polymorph/angular': patch
'@polymorph/angular-ui': patch
'@polymorph/elements-ui': patch
---

**The Angular members lay out as the other renderers' do.** Every Angular member renders inside a
host element (`<pm-card>`) that draws no box, and a recipe selector that reads a parent or a
sibling matched the host instead of the member inside it. A `Grid` drew each cell one column wide
whatever `columns` said, a `SettingsRow` after the first drew no rule above it, a
`TableOfContents` column was half its width, and a nested list in `Markdown` lost its spacing.
The Angular build now compiles each recipe with forms that also match through a host, and each
host carries `data-pm-host`, the attribute those forms read. A new law holds every Angular member
to the box it has with the hosts removed. An Angular screen that uses these members changes its
layout to the one the specs describe.

The elements' recipes gain one form of the same transform: siblings that one host holds together
after a child step (`.item > * + *`) now match through it.
