---
'@polymorph/registry': patch
---

`PUBLISHED_NAMES` names the tools (`@polymorph/tools`, published as `@metamorph-labs/polymorph`),
and `TOOLS_PACKAGE` is that workspace name. No app imports the tools, so they are not among the
packages an install names. `namedFiles(registry)` lists every file of the source tree a registry
names: the files an install can copy, which the published tools ship.
