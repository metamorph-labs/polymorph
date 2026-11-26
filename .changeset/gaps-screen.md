---
'@polymorph/screen': patch
'@polymorph/react': patch
'@polymorph/elements-ui': patch
'@polymorph/registry': patch
'@polymorph/mcp': patch
'@polymorph/cli': patch
'@polymorph/tools': patch
---

Four additions to run-time screens, a screen a model writes and a host draws while it runs.

- **`checkAnswer(text, options)`** (`@polymorph/screen/check`, and bound to the elements in
  `@polymorph/elements-ui/screen` and `loadScreen()`) checks a model's whole answer as text. An
  answer that ended before its document did, most often at the model's output limit, is a fault
  at `$` whose words ask for the whole document again. Calling `parsePartial` and then
  `checkScreen` passed such an answer when what had arrived was lawful as far as it went, so a
  host that checked that way should call `checkAnswer` once the answer has ended. `checkScreen`
  is unchanged for a host that holds a parsed document. `<poly-screen>`'s `check()` gives
  `checkAnswer`'s faults for its `text` once `streaming` is off.
- **`parsePartial` returns the model's prose**: `prose`, the text outside the block that holds the
  document, found by the same reading, and `fence`, `open` or `closed`. A host that copied a
  helper to take the prose can use the field. A last line that begins with code (`` `name` is … ``)
  no longer holds back a document written with no fence.
- **`addresses: 'refused'`** refuses every address and keeps the members that do without one. The
  card (`runtimeCard`), the checks (`checkScreen`, `checkAnswer`) and the walk (`createScreen`)
  take it as an option, `ScreenView` as its `addresses` prop and `<poly-screen>` as its
  `addresses` attribute or property. The card lists no prop that takes an address, the check
  reports each one a document writes or binds, and the renderers pass none. A member that cannot
  be drawn without an address (`Link`, `Image`, `AudioPlayer`, `Lightbox`, `SectionNav`,
  `Citation`, `SourceList`) and `Markdown`, which draws the links its text writes, are left out.
  The default, `allowed`, is unchanged.
- **`polymorph card --runtime`** prints the run-time card for `--framework` (`react` or
  `elements`), `--members` and `--addresses`, the text `runtimeCard` returns, and its length in
  characters on stderr. The MCP tool `get_system_card` gives it with `runtime: true`.
