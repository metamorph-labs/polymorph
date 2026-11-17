# Separator

A drawn line between content that spacing alone cannot separate. Use it last: try gap
spacing first, then Card.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | vertical requires a sized flex row (self-stretch) |
| `label` | `string` | — | a divider with a word, such as "OR" between an auth form and its providers (used by AuthPage). Horizontal only: there is no labelled vertical rule, and the type enforces it |

Attributes: `data-orientation`.

## Recipe

Horizontal: `border-top: 1px solid var(--pm-border-subtle)`, full width, no margins.
Spacing comes from the parent Stack/Inline gap, because a separator with its own margins
would conflict with the spacing of every layout it is placed in. Vertical: `border-left`,
self-stretch, same rule.

Labelled: the label in `text.xs` quartet · `--pm-text-muted`, with a `--pm-border-subtle`
rule on each side. The two rules grow equally, and each sits `--pm-space-3` from the text
(conventions §2's icon–label gap at `md`). The string renders as given: the caller
decides the letter case of "OR", not the recipe.

## States

Entries: horizontal between two paragraphs, vertical in an Inline toolbar,
labelled (`label="OR"`: muted text, a rule on each side).
`requiredSelectors`: `[data-orientation="vertical"]`.

## Motion — none. Icons — none. A11y — decorative by default (`aria-hidden`); Menu's
internal separators are separate and carry the semantic `separator` role through Radix.
A labelled Separator is not decorative: the word is content and is read out, while the
rules on each side stay hidden.
