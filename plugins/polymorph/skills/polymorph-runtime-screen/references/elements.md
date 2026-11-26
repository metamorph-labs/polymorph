# Draw with `<poly-screen>`

`<poly-screen>` draws a document as `poly-*` elements, the elements that render each member, in
the light DOM. It draws no box of its own, so the screen lays out as content of the element's
parent. Vue, Svelte, Solid and Angular have no run-time renderer of their own, so an app in any of
them uses it, as a page with no build does. The elements read the theme the page carries, as every
member does.

Like `ScreenView`, it applies its `members` and the run-time rules as it draws, whatever the server
checked, and it draws only the document. Show the prose with `proseOf` (references/api.md) in an
element of the page's own, as text.

## In an app with a bundler

1. Add `@polymorph/elements` and `@polymorph/elements-ui` to `package.json` under the alias and
   version the other polymorph packages use (`npm:@metamorph-labs/polymorph-elements-ui@^<version>`),
   and `@polymorph/screen` on the server that builds the card. Run the project's install.
2. Import `@polymorph/elements-ui/screen` once. It defines `<poly-screen>` and every `poly-*`
   element; each member's code loads the first time one of its elements renders.
3. Write `<poly-screen></poly-screen>` in the template, as any custom element. In Vue, make
   `compilerOptions.isCustomElement` accept the `poly-` tags; in Angular, add
   `CUSTOM_ELEMENTS_SCHEMA` to the component's `schemas`.
4. Take the element through the framework's template ref, once it is mounted, and connect it:

```ts
import type { PolymorphEvent } from '@polymorph/elements'
import { ACTION_EVENT, FAULT_EVENT, type PolyScreen, type ScreenAction } from '@polymorph/elements-ui/screen'

import { MEMBERS } from './screen-members'
// Stand-in: posts the message to your server, which calls `answer` (the skill's step 6) and
// streams the answer back. It calls `onText` with the answer so far, and resolves when it ends.
import { streamTurn } from './server'

/** Draws the model's answers in a `<poly-screen>` the page or a template wrote, and sends each action back. */
export function connectScreen(screen: PolyScreen, data: Record<string, unknown>) {
  screen.members = MEMBERS
  screen.data = data

  const send = async (message: string) => {
    screen.streaming = true
    await streamTurn(message, (text) => {
      screen.text = text
    })
    screen.streaming = false
  }

  screen.addEventListener(ACTION_EVENT, (event) => {
    const action = (event as PolymorphEvent<ScreenAction>).detail
    void send(`An action from the screen: ${JSON.stringify(action)}`)
  })
  screen.addEventListener(FAULT_EVENT, (event) => console.warn((event as CustomEvent).detail))
  return send
}
```

On the server, `answer` from the skill's step 6 builds the card and checks for the elements:

```ts
const CARD = runtimeCard({ framework: 'elements', members: MEMBERS })
const { ok, faults } = checkScreen(read.document, { framework: 'elements', members: MEMBERS })
```

`@polymorph/elements-ui/screen` exports the same functions bound to the elements, for code in the
page: `drawScreen` draws into a plain element, and `PolyScreen`,
`ACTION_EVENT` and `FAULT_EVENT` are the element's class and its events.

## On a page with no build

A page with no build loads the elements from files the project copied into `public/polymorph/`
when it was set up (the `polymorph-setup` skill). The page links `polymorph.css` and its theme
sheet, then loads `polymorph.js` as a module script. `polymorph.js` defines `<poly-screen>`,
and the first one to connect fetches the renderer.

```html
<poly-screen id="assistant" members="Stack Heading Text Button FormField NumberInput Textarea"></poly-screen>

<script type="module">
  // Stand-in: posts the message to the page's server, which calls the model with the card for the
  // elements and checks the answer. It calls `onText` with the answer so far, and resolves when it ends.
  import { streamTurn } from './server.js'

  const screen = document.querySelector('#assistant')
  screen.data = { order: 'Order 1042' }

  async function send(message) {
    screen.streaming = true
    await streamTurn(message, (text) => {
      screen.text = text
    })
    screen.streaming = false
  }

  screen.addEventListener('poly-action', (event) => {
    send(`An action from the screen: ${JSON.stringify(event.detail)}`)
  })
  screen.addEventListener('poly-fault', (event) => console.warn(event.detail))

  send('I want a refund for order 1042.')
</script>
```

The page builds the card, or checks a document, with `loadScreen`.
It fetches the validator and the card only when called, and its functions are bound to the
elements, so they take no `framework`:

```html
<script type="module">
  import { loadScreen } from './polymorph/polymorph.js'

  const { runtimeCard, checkScreen } = await loadScreen()
  const card = runtimeCard({ members: ['Stack', 'Heading', 'Text', 'Button', 'FormField', 'NumberInput', 'Textarea'] })
</script>
```

## What the element does

- It draws the first of these that holds a document: the `spec` property, the `text` property
  (an answer so far), or a `<script type="application/json">` child, which a server that renders
  the page writes and the element draws with no script on the page.
- `streaming` is the page's to set: on while an answer arrives, off when it ends, so an answer cut
  short reports what it lacks. A page that never sets it gives each chunk of `text` as a new whole
  document, whose faults are told again and whose unfinished elements are not drawn.
- `members` is an attribute (names separated by spaces, or a JSON array) and a property. A value
  that is not a list of names allows no member, and is a fault at the path `members`.
- `poly-action` carries `{ name, args, values, changed }`, as an action does in React. A listener
  hands the member a promise with `event.waitUntil(promise)`, while the event is dispatched:
  `ConfirmDialog` stays open and busy until it settles.
- `poly-fault` carries `{ path, message, component? }`, once for each fault. `faults="inline"`
  draws each fault in its node's place, for a page under construction.
- `values`, `changed` and `check()` read the drawing. `check()` is a promise of what the check
  says of the document it draws, with its members.
- A property set before the element is defined is read when it is.
