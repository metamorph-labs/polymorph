---
'@polymorph/engine': patch
'@polymorph/theme': patch
'@polymorph/recipes': patch
'@polymorph/native': patch
---

**A system file chooses which side of its column a numeric column's figures sit on.**
`overrides.numeric.align` takes `end`, the default, or `start`:

```json
{ "overrides": { "numeric": { "align": "start" } } }
```

It applies to every `numeric` header, body cell and total in Table, and to DataTable's `numeric`
columns, in every web framework and the elements, and in the SwiftUI and Compose Table and
DataTable. A Markdown table's column whose delimiter ends in `:` is drawn as a `numeric` column,
so it follows the choice too. Tabular figures stay in both. A system that does not set it renders
as before.

A new token carries it in every pairing: `--pm-numeric-align` (`end` or `start`), which
`table.module.css` sets as a numeric cell's `text-align`, and `numeric.align` in the token
document's `invariant` section (`NUMERIC_ALIGNS`, `NumericAlign`). The recipe reads the token,
so a stylesheet emitted by an older engine draws numeric cells at the start: install the engine
and the recipes at the same version, as every release asks. On native platforms SwiftUI reads
`theme.numeric.align` (`PMNumericAlign`, `.end` or `.start`; `PMNumeric`'s initialiser defaults it
to `.end`), and the Kotlin and Dart token packages add `numericAlign` (`"end"` or `"start"`) to
`PMTheme`, beside `numeric`.
