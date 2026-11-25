---
'@polymorph/registry': patch
'@polymorph/mcp': patch
'@polymorph/cli': patch
---

A search of several words finds members. `search_components`, `polymorph search` and the
workbench's Components page read `date picker` or `date-picker` as the name `DatePicker`, then as
a phrase, then word by word: a member that answers some of the words is found, ranked below one
that answers all of them. Before, a query of several words matched only where a purpose or a
prop's doc held the phrase exactly, so `date picker` found nothing.
