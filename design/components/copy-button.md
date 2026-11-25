# CopyButton

A Button preset that copies a value to the clipboard. It relates to Button as SearchInput
relates to Input: every copy control in the product uses it, so no screen re-decides the
confirmation.

CopyButton does *not* act on the product's data. Only the user's clipboard changes, so it may
sit beside destructive toolbars without extra treatment. The `duplicate` role (copying an
entity inside the app) is an ordinary Button. If the click changes state, it is not a
CopyButton. It has no variants: the anatomy is Button `ghost/neutral/iconOnly`, composed. A
copy control that needed `solid` would really be a primary action.

## Anatomy

```
[Button ghost · neutral · iconOnly — icon "copy" ⇄ "confirm"]
[status region (visually hidden): copiedLabel while copied]
```

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `value` | `string` | required | what is written to the clipboard, verbatim, including whitespace |
| `label` | `string` | required | the accessible name ("Copy install command"). No default, because naming is the caller's decision (Button's own law) |
| `copiedLabel` | `string` | required | the confirmation announced to assistive tech ("Copied"). Required, because a screen reader cannot perceive the icon swap, and the vocabulary writes no text of its own. The app supplies both of this member's strings |
| `size` | `'sm' \| 'md'` | `'md'` | Button's sizes. `lg` is excluded, because a copy control is secondary and must not appear at primary-action size |
| `disabled` | `boolean` | `false` | Button passthrough |

There is no `onCopy`. Writing the clipboard is the whole outcome, and a callback would let the
member become a general click handler. An app that must count copies builds its own Button.

Attributes: `data-state="copied"?` while confirmed, plus Button's `data-size`,
`data-disabled`, `data-icon-only`.

## Behavior

A click writes `value` through the async clipboard API, then sets `data-state="copied"` for
**2000ms**. During that time the glyph changes from `copy` to `confirm` and the status region
renders `copiedLabel`. Then both revert. A click within the 2000ms copies again and restarts
the timer. If the write is refused (permissions, insecure context), nothing changes and nothing
is announced, because a false confirmation is worse than none. The rejection appears as a dev
warning.

## Recipe (exact tokens)

Button `ghost`/`neutral` verbatim in every state (`button.md`: rest
`--pm-text-secondary`, hover `--pm-bg-subtle` + `--pm-text-primary`, press
ladder, focus ring per conventions §4, disabled `--pm-text-disabled`). One difference:

| State | Tokens |
| --- | --- |
| copied | glyph `confirm` in `--pm-success-text`, the only status colour this member uses. The pairing checks allow it on every `bg.*` surface |

## States

| Entry | Render | Expect |
| --- | --- | --- |
| rest | `value="pnpm add @polymorph/react-ui" label="Copy install command" copiedLabel="Copied"` | `aria-label`, icon `copy` |
| sm | `size="sm"` | `data-size="sm"` |
| disabled | `disabled` | `data-disabled` |

`requiredSelectors`: `[data-state="copied"]`, plus Button's set by composition
(`:hover`, `:active`, `:focus-visible`, `[data-disabled]`).

There is no `copied` entry, per the states fixture's rule (conventions §10). The confirmed
state follows an event and cannot be rendered from public props. So the attribute is in
`requiredSelectors`, and the member's unit test covers the swap, announce and revert sequence.

## Motion

The `confirm` glyph enters with `spring-pop` and exits with `fade` at
`--pm-motion-duration-control-exit`. This is the Checkbox indicator's binding, because both
show a small confirmation. Colour states follow Button. The 2000ms hold is a timer, not motion,
so it does not scale with temperament. At `none` the swap is instant and the hold stays.

## Icons

`copy` (rest), `confirm` (copied). Both are decorative. `label` names the button, and the
status region announces the state change; the glyph never does.

## A11y

The accessible name is `label` and **never changes**. A control renamed to "Copied" would be
announced as a different button mid-task. The confirmation goes through a visually hidden
`role="status"` region (Spinner's rule: one polite announcement from one source). No
`aria-pressed`, because copying is an action, not a toggle, and a pressed state would say the
button is still "on". Hit area per conventions §2 at both sizes.

The glyph is all it draws, so `label` shows as a name tip on hover and keyboard focus, as on an
icon-only Button (`button.md`, Name tip), and the tip is `aria-hidden`. While the confirmation
shows there is no tip: the press closed it, and a tip that named the copy beside the confirming
glyph would say two things at once. It is back when the confirmation reverts.

```contract
role root button
name root from label
key Enter activates on root
announces live:polite when rest
```

## Agent

An agent gets nothing from a CopyButton: it is not listed. A press writes the person's
clipboard, which Firefox and Safari let a page write only during a person's own gesture, and an
agent's press is not one, so a press would copy on one engine and do nothing on the others. The
value the button copies is not read either, because a CopyButton often copies a secret, such as
an API key or a recovery code.
