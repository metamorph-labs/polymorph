---
'@polymorph/spec': patch
---

`isActionType` reads a type written inside many pairs of parentheses in time linear in its length.
It removed one pair at a time before, so 20,000 nested pairs took seconds. Its answer for every type
is unchanged: a test holds it to the earlier reading for every type the registry prints and every
input type in `design/screens/`, and for random text of brackets and arrows.
