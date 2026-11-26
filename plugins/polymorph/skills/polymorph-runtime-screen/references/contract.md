# The run-time contract

What a document does at run time is decided once, in the walk every renderer draws from, so a
document behaves the same in React and as elements.

## An action with consequences

An action is a name and the form's values. The model chose the name, and each value is what a
control holds, so neither is the person's decision. A host that moves money, deletes or sends on an
action does four things:

1. Maps the name to its own handler. The rules in its system prompt declare the names it handles.
2. Reads `values` as input from the page: checks each value's type and range against its own data.
3. Opens its own `ConfirmDialog`, outside the screen, controlled by
   `open` and `onOpenChange`. Its words come from
   the host's data and the values, never from the document. An agent on the page cannot confirm
   it: the confirm is the person's.
4. Sends the request to its server with an idempotency key made when the dialog opens. The server
   authorises the person, reads the order from its own records, checks the amount again, and acts
   at most once for each key, so a confirm pressed twice or a request sent again refunds once.

```tsx
import { useState } from 'react'
import * as members from '@polymorph/react-ui'
import { ScreenView, type ScreenAction } from '@polymorph/react/screen'

import { MEMBERS } from './screen-members'
// Stand-in: your server's refund endpoint, which authorises, checks again and acts once for each
// key. It resolves with what the server did, in the host's words.
import { refund } from './refunds'

const { ConfirmDialog, Stack } = members

interface Order {
  id: string
  number: string
  refundable: number
  currency: string
}

interface Asked {
  amount: number
  reason: string
  key: string
}

export function RefundScreen(props: {
  answer: string
  streaming: boolean
  order: Order
  send: (message: string) => void
}) {
  const { answer, streaming, order, send } = props
  const [asked, setAsked] = useState<Asked | null>(null)
  const money = (amount: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: order.currency }).format(amount)

  const onAction = (action: ScreenAction) => {
    if (action.name !== 'requestRefund') {
      send(`An action from the screen: ${JSON.stringify(action)}`)
      return
    }
    const { amount, reason } = action.values
    if (typeof amount !== 'number' || amount <= 0 || amount > order.refundable) {
      send(`The host refused the refund: the amount must be above 0 and at most ${order.refundable}.`)
      return
    }
    setAsked({ amount, reason: typeof reason === 'string' ? reason : '', key: crypto.randomUUID() })
  }

  return (
    <Stack gap={4}>
      <ScreenView
        text={answer}
        streaming={streaming}
        members={members}
        allow={MEMBERS}
        data={{ order: order.number }}
        onAction={onAction}
      />
      <ConfirmDialog
        open={asked !== null}
        onOpenChange={(open) => {
          if (!open) setAsked(null)
        }}
        title={`Refund order ${order.number}?`}
        description={asked === null ? '' : `${money(asked.amount)} goes back to the card that paid for this order.`}
        confirmLabel="Refund"
        onConfirm={async () => {
          if (asked === null) return
          const outcome = await refund({ order: order.id, ...asked })
          send(`The host's refund: ${outcome}`)
        }}
      />
    </Stack>
  )
}
```

- The promise `onConfirm` returns keeps the confirm busy and the dialog
  open until it settles. The dialog closes when it resolves, and stays open when it rejects.
- Sending the outcome to the model is a request; the model's next screen then reads what happened
  from the host.

## Data inputs

An input whose type is not a function is a data input, filled from the host's `data` by its name.
An input the host gives no value for is absent, never a placeholder: an optional prop bound to it
takes its default. A required prop bound to it is not passed, and once the document is whole it is
a fault (`` `Select` requires `options`, and the host's data holds nothing at `choices` ``). The
element is still drawn without it, so a screen keeps its shape while the host's data arrives.

A binding names a declared input, or a dotted path into one (`order.number`). Each name reads one
of the value's own properties, never one it inherits, so `order.constructor` reads nothing.

## Callback inputs

An input whose type is a function is a callback input. What a member is handed for it is decided by
the prop, list item or structured object field the document binds it to:

| Bound where | It is |
| --- | --- |
| A callback that returns nothing receives it (`Button`'s `onClick`, `Pagination`'s `onPageChange`) | an action: the host is told `{ name, args, values, changed }` |
| A callback that returns a value receives it (`DataTable`'s `getRowId`) | a question the member asks while it draws. Where the prop may be left out, nothing is passed and the member answers as it does by default; where it is required, a stub answers by the return type (a key, `false`, `0`, an empty list). The host is never told |
| No callback receives it (`Button`'s `label`, a child) | a fault, and nothing is passed |

A required callback the document leaves unbound gets the same stub, so a member that requires a
handler still draws.

## What an action carries

`args` is what the member passed, reduced to JSON: text, numbers and booleans as themselves; `NaN`
and infinities as `null`; a date or a time as ISO 8601 text; a `Set` as a list, a `Map` as an
object; a file as `{ size, name, type }`. An event, a DOM node, an element and a function are
dropped at the end of the list and `null` before a kept argument, so each kept argument keeps its
position.

`values` holds every control that has a `name` and a controlled value (`value`, or a checkbox's
`checked`), whether or not it is on screen: a closed dialog's field, an unselected tab panel. A
control's value is, in order: what the person chose, until the document or the host gives it
another value; else the value the document or the host gives it; else its default; else the empty
value of its type: `null` where the type admits it, `[]` for a list, `false` for a checkbox or a
switch, `""` for text. A value is what the member reports: `NumberInput` a number,
`Input` text for every `type`.

- Two controls with one name are a fault, and `values` holds the last in document order.
- A control named `__proto__`, `constructor` or `prototype` is a fault and is left out.
- When a document binds a change event to an action (`"onChange": { "$": "onEdit" }`), the
  screen holds the new value before it tells the host, so the action's `values` already has it.

## Controls follow the reader

A value the person chose stands until the document or the host gives that prop a different value,
so a document replaced with the same value does not undo the person's typing. A document's value is
compared by content, the host's data by identity. A control the document gives no value keeps its
own state. A control that takes another name, or moves because an element is inserted before it, is
a new control.

## Changing what is drawn

- **New data**: pass another `data` (`screen.data` on `<poly-screen>`). Only what is bound to a
  value that changed is drawn again. In React, a new object that holds the same values draws nothing
  again.
- **The same answer, growing**: each element stays drawn with its state, so a field the person is
  typing in keeps its text and its focus.
- **A new answer**: a new document from its first character. The screen is empty until its root is
  drawn, and the old screen's controls go with what was typed in them, which the action that led to
  the answer already carried in `values`.
- **A document replaced whole**: pass it as `document` in React, `spec` on `<poly-screen>`. An
  element at the same place with the same component, and for a named control the same name, keeps
  its rendering and its state. A control that an inserted element moves to another place is drawn
  as a new, empty control, and `values` no longer holds what was typed in it.

## An element a required prop is missing from

Once the document is whole, an element whose required text or data (a label, an `alt`, options)
was never written, or was refused by another fault, is drawn as nothing, with a fault that names the
prop, and its controls hold no value. While the document streams it waits, with no fault.

- A required prop that takes any node is a slot (`FormPage`'s `actions`).
  An empty slot does not take out its element: the page is drawn with the slot empty.
- A member that reads one element it requires, as its child (`FormField`'s control) or in a
  prop that takes exactly one element (`SettingsRow`'s `control`), is not
  drawn without it; the element that holds it is.
- Still drawn: a required prop bound to data the host has not given yet, a refused address (a
  `Link` without its `href` is not a link), and a required callback the document left
  unbound.

## Faults

Each fault is `{ path, message, component? }`, at the validator's paths (`$.root.children[2]`), told
once in a drawing when it first appears: to `onFault` in React, as `poly-fault` on
`<poly-screen>`. A drawing begins when the screen is made, when a stream begins, and when the host
gives a whole document that differs from the one drawn. While a document streams, nothing that has
not arrived is a fault.

| Fault | What it means for the host |
| --- | --- |
| `no component called …` | The vocabulary has no such member. The element is drawn as nothing. Ask again with the fault |
| `… is not one of the members this host draws` | A member outside the list. Drawn as nothing. Ask again, or widen the list and the card together |
| `… has no prop …` | The prop is not passed; the element is drawn without it |
| `… takes a function`, a callback input where no callback receives it | Not passed. If the prop was required text, the element is drawn as nothing |
| A function in the host's data bound by the document | Not passed. The document reached for something the host did not offer |
| `… is not an address a screen may hold` | The address is not passed. The element is drawn, inert |
| `… is missing its required prop …`, `… is not drawn …` | The element is drawn as nothing |
| A shared or inherited control name | `values` holds one control, or none |
| A member that threw as it rendered | Its node is drawn as nothing; the rest of the screen draws |
| Text that stops being JSON, at `$` | The answer broke off; the document holds what came before it |
| `the answer ends before its document does`, at `$` | `checkAnswer` only: the answer was cut off. Ask again with the fault |
| `… takes an address, and this host takes none` | Under `addresses: 'refused'`: not passed; the element is drawn without it |
| `… requires an address at …`, `… draws the links and pictures its text writes` | Under `addresses: 'refused'`: drawn as nothing |
| `the document has no root element`, at `$.root` | The answer ended with no document, or none that holds a root. Draw the renderer only for an answer that holds one |

A fault in the root element leaves nothing to draw. `faults="inline"` draws each fault in its
node's place, which helps while building a host.

## Addresses

A string at a prop or object key that takes an address (`avatar`, `href`, `nextHref`,
`previousHref`, `src`, `srcSet`) is relative (`/orders/1042`, `?page=2`), a fragment
(`#reason`), or has the scheme `http:`, `https:`, `mailto:` or `tel:`. Any other scheme is a
fault and is not passed. An address with a control character anywhere is refused whole, and spaces
at either end are stripped before the scheme is read. Each address in a `srcSet` is held to the
same rule. The rule covers the document's values and a value a binding puts directly at an address;
it does not reach into an object the host binds whole.

With `addresses: 'refused'` (the skill's step 3), any value the document writes or binds at those
keys is a fault and is not passed, whatever its scheme, and the element is drawn without it. A
member that requires an address, in a prop or in a required field of the data type a prop takes,
and `Markdown`, which draws the links and pictures its text writes, are left out of the card
and drawn as nothing. A host that names one in its list is refused it all the same.

## Limits

| Constant | Value | What is held to it |
| --- | --- | --- |
| `MAX_DEPTH` | 128 | objects and lists nested in one another. Deeper text stops being read |
| `MAX_TYPE_LENGTH` | 500 | characters of an input's type. A longer type is a fault, and the input has no value |
| `MAX_KEY_LENGTH` | 100 | characters of a prop name or a field. A longer key is a fault, and what it holds is not read |
| `MAX_JSON_VALUES` | 100,000 | values one action's `args` or one control's value reduces to. A cut is a fault |

No text and no value makes the reader, the check or the walk throw, and each takes time in
proportion to what it reads.

## What is not checked

- The host's data inside a bound value: a list of the host's objects is passed as the host gave it.
- Where a link leads, and where a picture or a recording loads from.
- What `Markdown` draws from its text: links and pictures at `http:`, `https:`, `mailto:`
  or no scheme. No other member draws Markdown, and a host that refuses addresses draws none.
- Ids and names, which can match the host's own. A control inside the host's `<form>` posts under
  the document's name.
- Who called an action (the skill's step 8).
- What `checkScreen` cannot see: it reads only the document, so what the walk refuses from the
  host's data (an address, a function) is reported by the renderer, not the check.

## A run-time document is not a spec to emit

The format and the validator are the same, so `emit` reads a document a model wrote. What happens
to it differs:

| | A spec `emit` compiles | A run-time document |
| --- | --- | --- |
| A data input | a prop the container passes | the host's `data` under its name, empty when absent |
| A callback input | a function the container passes | an action the host is told of |
| Members | every member the framework ships | the host's list |
| Checked by | `validate` | `checkScreen`: the validator, then the run-time rules |
| Becomes | a source file, reviewed and built | a drawing in the person's page |
| Platforms | web, iOS and Android | web |
