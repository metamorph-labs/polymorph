---
'@polymorph/engine': patch
'@polymorph/recipes': patch
'@polymorph/elements-ui': patch
'@polymorph/theme': patch
'@polymorph/registry': patch
'@polymorph/mcp': patch
'@polymorph/cli': patch
'@polymorph/tools': patch
'@polymorph/native': patch
---

`FONT_ROLES` lists a fourth role, `heading`, and `FontRole` includes it. Code that reads a slot
for every role, such as `FONT_ROLES.map((role) => system.fonts[role].family)`, no longer
type-checks, because `fonts.heading` is optional: read the slot with `fontSlot(fonts, role)`,
which gives the body slot for a heading the system leaves out. A `Record<FontRole, …>` of your
own needs a `heading` entry.

A system file may state `fonts.heading`, which takes what the other slots take
(`{ family, fallback?, style? }`). It is the face of the heading steps, `text.lg` to `text.3xl`:
every Heading level, the page, dialog and drawer titles, EmptyState's title and Stat's value.
`HEADING_TEXT_STEPS` lists those steps. `text.xs` to `text.md` stay in the body slot and the
display steps in the display slot. A system without it draws its headings in the body slot, so
every system file written before resolves to the same type, and no house system states one.
`fonts.heading` with an unknown field is refused, and so is a slot the schema does not name.

- The stylesheet declares `--pm-font-heading` in every pairing, written as
  `var(--pm-font-body)` when the heading stack is the body stack, and the four heading steps'
  `--pm-text-<step>-family` reference it. Each pairing's sheet grows by about 50 bytes, the
  no-build theme sheets of the elements included.
- Heading's level 4, ArtifactPane's title and RichTextInput's level 3 heading draw at `text.md`
  in `text.xl`'s weight and now also its family, so every heading level is in one face. Hero's
  lede and Avatar's `lg` initials are at `text.lg` and are not headings: they take `text.md`'s
  family, the body slot. In a system without a heading slot nothing is drawn differently.
- `typePersonality` gives a heading slot that names no `fallback` the class it gives body and
  display: serif under `editorial`, sans under the others.
- A heading weight (`overrides.type.titleWeight`) is drawn in the heading family, so
  `pnpm registry` checks it against that family once a system states one.
- `admitTheme` lists the heading role with the family that draws it, the body family when the
  system has no heading slot, and `polymorph theme validate` prints it. The registry's system
  entries do the same, and `propose_theme` carries a heading face of its own into its proposal.
- The token document has `fonts.heading`, the body slot's values in a system that states none,
  and the heading steps' `family` names `font.heading`. On iOS `PMFonts.heading` is new, and
  `PMFonts(body:display:mono:)` without it takes the body slot. `PMTheme(tokenDocument:)` reads a
  document written before this release, which has no `fonts.heading`, with the body slot as its
  heading slot. In Kotlin `PMFonts.heading` defaults to `body`, and a step's `slot` is
  `"heading"` for the heading steps. In Dart `PMFonts` takes a required `heading`, so a Dart
  program that builds its own `PMFonts` passes one.
- A native app that bundles font files bundles `theme.fonts.heading.family` too when it differs
  from the body family. The SwiftUI and Compose Heading at level 4, ArtifactPane's title, Hero's
  lede and Avatar's `lg` initials follow the web.
