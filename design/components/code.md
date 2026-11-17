# Code

Code is inline code, such as a token name, a flag or a path, set in the mono face
inside running prose. It is a member because it recurs: the docs harness uses it,
and the install page cannot be written without it.

## Anatomy & API

```
<code> — inline, inside a Text or a table cell.
```

```ts
interface CodeProps {
  children: string
}
```

## Recipe (exact tokens)

| Part | Tokens |
| --- | --- |
| chip | `--pm-font-mono` · `--pm-text-sm-size` (fixed, not relative: code in sm and md prose is set at the sm step, so a page has one mono size) · `--pm-text-primary` · `--pm-bg-subtle` · radius `--pm-radius-sm` · padding-inline `--pm-space-1` |
| a long string | `overflow-wrap: anywhere` · `box-decoration-break: clone`. A string with no break in it (a URI, a key) breaks inside the chip where it would overflow, so it never widens the page. Each line's part keeps the padding and the radius where the engine supports the unprefixed declaration, and elsewhere the chip's ends are on its first and last lines. SwiftUI and Compose wrap the text the same way. |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| inline | `<Text>set <Code>pm-system</Code></Text>` | mono family, subtle bg |
| a long string | `<Text><Code>otpauth://totp/…</Code></Text>` in a narrow column | the chip breaks across lines; the column does not scroll sideways |

`requiredSelectors`: —.

## Motion — none. Icons — none. A11y — a real `<code>` element.
