---
'@polymorph/recipes': patch
---

Input's and NumberInput's value ends in an ellipsis when the field is too narrow to show it and
is not focused. The value was already the part that gives way in a narrow field, while the
leading icon, the affixes and the clear button keep their width and the field keeps its padding;
it was cut at the edge of the space left to it with no mark. While the field is focused the
browser scrolls the value to the caret, as before. SearchInput and PasswordInput render Input and
take the same rule.
