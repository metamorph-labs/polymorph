# @polymorph/theme

## 1.0.15

## 1.0.14

## 1.0.13

## 1.0.12

## 1.0.10

## 1.0.9

## 1.0.8

### Patch Changes

- 820c836: Every package now carries the release's version, and the release tag is `v` and that version.
  Until this release each package kept its own number, so one release installed the engine at one
  version, the foundations at another and the tag named a third. From this release on, pin every
  `@polymorph/*` package you install at the same version, and check the native packages out at the
  tag of that version.

  This package's version jumps to the release's number. The jump carries no change of its own: the
  versions it skips were never published.

## 1.0.1

### Patch Changes

- 22f607b: The base type size is a system decision. `overrides.type.base` sets the md step, the paragraph
  size, between 12 and 20px on the half-pixel grid; `overrides.type.sm` and `overrides.type.xs`
  set the two working steps under it (controls, table cells, menus and labels read `sm`; captions
  and badges read `xs`), so a product whose sizes are 12, 13 and 13 says so in three numbers. The
  steps above the base still derive from `type.ratio`, and the merged ladder stays in order with
  `xs` never under 10px.

  A base under 16px is lawful because the focus-zoom floor is now a token of its own. iOS Safari
  zooms the viewport when a focused field's font-size is under 16px, so below `30rem` every
  text-entry recipe (Input, Textarea, TagInput, Combobox, MultiSelect, NumberInput, OTPInput,
  Command and PromptInput) reads `--pm-text-entry-size` and `--pm-text-entry-line-height` instead
  of a type step. The engine derives the size as the md step or 16px, whichever is larger. No
  application needs a viewport `maximum-scale` or a CSS `zoom` to keep a small field from
  zooming. The recipes read the new tokens, so this release of `@polymorph/recipes` needs this release of the engine or later; a vendored member's recipe picks them up through `polymorph update`.

## 1.0.0

The first versioned release. Earlier history is in git.
