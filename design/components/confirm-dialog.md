# ConfirmDialog

A Dialog preset that asks the user to confirm an action. It has no size choice, its
buttons cannot be put in the wrong order, and its body holds one thing it draws itself: the
field of a typed confirmation.

It has no body slot. A confirm states its question in `title` and its consequence in
`description`; a phrase the person must type is `confirmWith`. Any other content in the
body makes it a Dialog with a form, which has its own initial-focus rule (the first field)
and its own footer. A slot would also have no form on iOS, where a confirm without a phrase
is the platform's confirmation action sheet, which takes no views.

## Localization

Localized hosts supply `cancelLabel` and `closeLabel` alongside the translated title, description
and confirm label. `closeLabel` names the dialog's icon control and is forwarded to `Dialog`. A
typed confirmation adds `confirmWithLabel` and `confirmWithError`, the field's label and error.

## API

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | required | the question ("Discard this ticket?") |
| `description` | `string` | required | what happens, concretely. A confirm that states no consequence is only a nag |
| `confirmLabel` | `string` | required | **no default**, because "Confirm" hides the verb. The caller must write it, such as "Discard" or "Delete 3 tickets" |
| `tone` | `'danger' \| 'accent'` | `'danger'` | most confirms guard destructive actions. Use `accent` for consequential but safe ones ("Publish") |
| `cancelLabel` | `string` | `'Cancel'` | |
| `onConfirm` | `() => void \| Promise<void>` | required | a Promise puts the confirm Button into `loading` and makes the dialog non-dismissible until it settles |
| `trigger` / `open` / `onOpenChange` | as Dialog | — | |
| `presentation` | `'auto' \| 'sheet'` | `'auto'` | Dialog's cell verbatim (`dialog.md`, conventions §12). A confirm is the short dialog this option exists for. `'sheet'` keeps the sm card above `30rem` and shows a bottom sheet below it. Footer order, initial focus on cancel and the pending lock are the same in both forms |
| `closeLabel` | `string` | `'Close'` | forwarded to Dialog; see Localization above |
| `confirmWith` | `string` | — | a typed confirmation: the phrase the person types before the confirm enables, such as the name of the project being deleted. Set, the body draws a field for it and the confirm stays disabled until the field holds the phrase. See "The typed confirmation" |
| `confirmWithLabel` | `string` | `Type {confirmWith} to confirm` | the field's label, with the phrase in it; see Localization above |
| `confirmWithError` | `string` | `The text does not match` | the field's error while what is typed cannot become the phrase; see Localization above |

## Recipe

Dialog `size="sm"` verbatim, with a fixed footer: cancel = `outline/neutral`,
confirm = `solid/{tone}`, confirm rightmost. Initial focus is on **cancel** when
`tone="danger"`, so a stray Enter does not destroy anything. This is the only place that
overrides Dialog's default initial-focus rule; an `accent` confirm keeps it, so focus starts
on confirm. A typed confirmation keeps it in both tones, so focus starts on its field (below).

While pending: confirm Button `loading`, cancel disabled, Escape/outside-click
suppressed (`dismissible` false semantics), scrim unchanged. A typed confirmation's field is
disabled too, so the phrase cannot change under an action already running.

## The typed confirmation

`confirmWith` is for an action whose cost a click does not convey: deleting a project, a
workspace, a repository. The body draws one FormField with one Input: the label
(`confirmWithLabel`), the field, and the error (`confirmWithError`) when it shows. The Input
takes `autoComplete="off"`, because a browser's suggestion would type the phrase for the
person. It is `exact` (`input.md`) in every renderer, because a correction can change a phrase
such as `acme-billing` while the person types it: nothing corrects or capitalises the phrase or
checks its spelling, in a browser or on a phone's keyboard.

- **The comparison.** The field holds the phrase when its text, with the spaces around it
  removed and letter case ignored, is `confirmWith` compared the same way. Case is ignored
  because a phone capitalises the first letter of a field, and the pause comes from typing
  the words, not from their case.
- **The confirm** is disabled until the field holds the phrase, and disabled again when it
  stops holding it. It is the only way to confirm: Enter in the field confirms nothing, so a
  confirmation is always a press on the confirm.
- **The error** shows while the field's text, compared the same way, is not empty and is not
  the start of the phrase, so it shows at the first character that cannot lead to the phrase
  and never while the person is still typing it correctly. FormField draws it and marks the
  field invalid.
- **Initial focus** is on the field, in both tones. A stray Enter there confirms nothing,
  because the confirm is disabled, and typing is the next thing the person has to do.
- **The field is emptied** each time the dialog opens, so a phrase typed for one confirm is
  never there for the next.

## States

| Entry | Render | Expect |
| --- | --- | --- |
| closed — just the trigger | the trigger, `tone="danger"` | opening focuses cancel |
| closed, accent | the trigger, `tone="accent"` | opening focuses confirm |
| open, guarding a destruction | `open`, `tone="danger"` | `role="alertdialog"` |
| open, guarding something consequential but safe | `open`, `tone="accent"`, `cancelLabel` | `role="dialog"` |
| pending | an `onConfirm` that never settles, so the entry stays pending | confirm `loading`, cancel disabled |
| closed, with a phrase to type | the trigger, `confirmWith` | opening focuses the field |
| open, awaiting the phrase | `open`, `confirmWith` | the field labelled with the phrase; confirm disabled |
| open, the phrase mistyped | `open`, `confirmWith`, a text typed that cannot become the phrase | the field invalid, the error shown; confirm disabled |

`requiredSelectors`: none of its own; the composed Dialog and Button sets are checked by their
fixtures.

## Motion — Dialog's bindings verbatim. Icons — none of its own (`close` hidden:
`dismissible` renders as usual until pending). A11y — Dialog's, plus the
initial-focus-on-cancel rule above, and the typed confirmation's focus on its field. The
description is required so the alertdialog states the consequence (`role="alertdialog"` when
`tone="danger"`). The field is named by its label, and its error is FormField's. When the
confirmed action removes the trigger, as a delete removes its row, focus returns by Dialog's
rule to the focusable element nearest where the trigger was.

```contract
role panel alertdialog when open, guarding a destruction
role panel dialog when open, guarding something consequential but safe
name panel from title when open, guarding a destruction
key Enter opens
focus on-open cancel when closed — just the trigger
focus on-open confirm when closed, accent
focus on-open field when closed, with a phrase to type
name field from confirmWithLabel when open, awaiting the phrase
attr confirm data-disabled when open, awaiting the phrase
attr confirm data-disabled when open, the phrase mistyped
attr field aria-invalid=true when open, the phrase mistyped
attr field autocorrect=off when open, awaiting the phrase
focus on-close trigger
focus on-close nearest
dismiss both when closed — just the trigger
```

## Agent

An agent reads whether the dialog is open and whether the confirmed action is running, and
cancels the dialog, which calls `onOpenChange` as the person's Cancel does. A cancel is refused
while the action runs, as the person's Cancel is disabled then. An agent cannot confirm: the
question is the person's, so the fence declares no confirm, and the dialog withholds what its
panel holds. The confirm Button, the phrase field and the Dialog this member draws are not
members an agent lists, finds or runs; the bridge lists the ConfirmDialog in their place. The
trigger is the application's control and stays an agent's. The `danger` tone marks the action
the person confirms, not the cancel, so no action an agent runs needs a person.

```agent
state open boolean as panel present when open, guarding a destruction
state pending boolean as confirm aria-busy when open, guarding a destruction
action cancel calls onOpenChange when open, guarding a destruction
destructive never
withholds contents when open, guarding a destruction
```
