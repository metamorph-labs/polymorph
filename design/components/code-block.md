# CodeBlock

CodeBlock shows block code, such as an install command or a config sample, in full,
and scrolls it when it is wide.

## Anatomy & API

```
<pre><code> — the block; its own scroll container (wide content
scrolls inside itself, the page never scrolls sideways for it).
```

```ts
interface CodeBlockProps {
  /** The code, verbatim. Whitespace is content here. */
  children: string
  /** The scroll region's accessible name once it overflows. Default 'Code block'. */
  label?: string
  /** Draws the copy control — the block's one affordance. */
  copyable?: boolean
  /** The copy control's accessible name. Default 'Copy'. */
  copyLabel?: string
}
```

`label` exists so the region's name is not a hard-coded English sentence. The
content identifies the region, but not the language to announce it in, and every
other string this vocabulary announces belongs to the app (Button's `label`,
FileUpload's `title`, the error copy the system does not write). The default stays,
because a `region` must have a name even when the app gives none.

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| block | `--pm-font-mono` · `--pm-text-sm-size` · `--pm-text-sm-line-height`, stated so the copy control can be sized in lines · `--pm-text-primary` · `--pm-bg-subtle` · border `1px solid --pm-border-subtle` · radius `--pm-radius-md` · padding `--pm-space-4` · `overflow-x: auto` · `white-space: pre` |
| copy control | Button `ghost/neutral/sm iconOnly icon="copy" label={copyLabel}`, using the corner-control grammar of Dialog's close (`dialog.md`): absolute, the button inset `--pm-space-4` from the top and the inline end. The control reaches the block's corner inside its border and paints the block's surface, `--pm-bg-subtle`, with `--pm-space-2` between the button and the code. It ends where the second line of code ends, so it covers whole lines only, and on a one-line block it stops at the bottom padding. The wrapper is a one-cell grid (`minmax(0, 1fr)`), so the block fills it and the control is measured against the block when a row stretches the wrapper. While `copyable`, the block reserves `padding-inline-end: calc(var(--pm-space-2) + var(--pm-control-height-sm) + var(--pm-space-4))`, so the longest line scrolls clear of the control (container-first rule: content pans and is never covered at rest), and a line that reaches the corner before it is scrolled is cut off at the control's edge and never shows through the glyph |
| copied | icon swaps `copy` → `confirm`; the root carries `data-state="copied"` while the confirmation shows, then reverts after **2000ms**. This is the same duration as `copy-button.md`, so both members give the same feedback. It is long enough to be seen after the eye returns from the click, and short enough that the control never looks stuck. It is a raw number on purpose: two consumers share it by citation, and a third consumer would make it a motion token (the rule of three) |

Syntax highlighting is a **non-goal**. A highlighter is a dependency decision with
theme implications (token-coloured grammars), not a recipe cell to add here.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| command | `<CodeBlock>pnpm add …</CodeBlock>` | pre whitespace, mono, subtle bg, own scroll |
| wide line | a long single line | scrollWidth > clientWidth on the block, not the page |
| copyable | `copyable` | the control present, named "Copy" |

`requiredSelectors`: `[data-state="copied"]` *(a post-interaction state. It cannot
be rendered from public props, so per the states-fixture rule (conventions §10) the
selector covers it and the browser test performs the actual press)*.

## Motion — the `copy`→`confirm` swap is a `fade` at
`--pm-motion-duration-control` (Table's sort-swap precedent); nothing else moves.
Icons: `copy` and `confirm`, both decorative, because `copyLabel` names the button
and the live region announces the outcome. A11y: `<pre><code>`. The scroll container
is keyboard-reachable (`tabindex=0` when overflowing, with a label), because a
keyboard reader cannot see the overflow of a pannable region that a keyboard cannot
reach. The copy control is a real Button outside the scroll region, so it is
reachable whether or not the block pans. The confirmation is announced politely
("Copied") from a visually hidden live region. It is fixed English, for the same
reason `label` has a default: an outcome must be announced even when the app
supplies no text. CopyButton provides the localization point for a copy confirmation
(`copiedLabel`, `copy-button.md`); this control does not expose one.
