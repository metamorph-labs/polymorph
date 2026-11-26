import type { Registry } from '@polymorph/registry'
import { renderRuntimeCard } from '@polymorph/registry/runtime-card'

import { DEFAULT_SYSTEM } from '../plan'
import { all, commands, Facts, skill, type SkillFile } from './facts'

/**
 * The skill for a screen a model writes while the product runs: the run-time card in the
 * model's prompt, the check, the React renderer and `<poly-screen>`, what an action tells the
 * host, and what stays the host's job. Each example in it was compiled against the sources and
 * run in a browser, the no-build page against the built files.
 */

/** The members the examples allow. */
const EXAMPLE_MEMBERS = [
  'Stack',
  'Card',
  'Heading',
  'Text',
  'Button',
  'FormField',
  'Input',
  'Textarea',
]

/**
 * The props and data-type fields that take an address, as `ADDRESS_KEYS` in
 * `packages/screen/src/urls.ts` holds them. The CLI does not depend on `@polymorph/screen`, so
 * the set is written here, and `agents.test.ts` holds it to that file. A law in
 * `packages/screen/src/parity.test.ts` holds every prop the vocabulary types as an address to
 * one of these keys.
 */
export const ADDRESS_KEYS = new Set(['avatar', 'href', 'nextHref', 'previousHref', 'src', 'srcSet'])

/** The members whose props, or the data types their props take at any depth, hold an address. */
function addressMembers(registry: Registry): string[] {
  const types = new Map(registry.dataTypes.map((type) => [type.name, type]))
  const reaches = (printed: string, seen: Set<string>): boolean =>
    (printed.match(/\b[A-Z][A-Za-z0-9]*\b/g) ?? []).some((name) => {
      const type = types.get(name)
      if (type === undefined || seen.has(name)) return false
      seen.add(name)
      return type.fields.some((field) => ADDRESS_KEYS.has(field.name) || reaches(field.type, seen))
    })
  return [...registry.components, ...registry.exceptions.primitives]
    .filter((member) => {
      const parts = (member as { parts?: { props: { name: string; type: string }[] }[] }).parts
      const props = [...member.props, ...(parts ?? []).flatMap((part) => part.props)]
      return props.some((prop) => ADDRESS_KEYS.has(prop.name) || reaches(prop.type, new Set()))
    })
    .map((member) => member.name)
}

/**
 * The tokens the members section of a React card holds for `members`, at four characters to a
 * token as the card law counts them, floored to its leading digit: a bound the whole card is
 * over, which moves only when the vocabulary grows by a step of that size.
 */
function cardTokensOver(registry: Registry, members: readonly string[]): string {
  const section = renderRuntimeCard(registry, { framework: 'react', members: new Set(members) })
  const tokens = section.length / 4
  const step = 10 ** Math.floor(Math.log10(tokens))
  return (Math.floor(tokens / step) * step).toLocaleString('en-US')
}

/** Every member and primitive the web draws in React, but the one that hosts another library's code. */
function drawnInReact(registry: Registry): string[] {
  return [...registry.components, ...registry.exceptions.primitives]
    .filter(
      (member) =>
        member.platforms.web.status !== 'absent' &&
        member.frameworks.react.status !== 'absent' &&
        member.name !== 'ThirdParty',
    )
    .map((member) => member.name)
}

/** The example answer: the document a model writes for a refund. */
const REFUND = `{
  "spec": "polymorph-screen/1",
  "name": "RefundRequest",
  "purpose": "Asks the person how much of an order to refund, and why.",
  "inputs": [{ "name": "order", "type": "string" }, { "name": "onSubmit", "type": "() => void" }],
  "root": {
    "component": "Card",
    "props": { "title": "Refund an order" },
    "children": [
      {
        "component": "Stack",
        "props": { "gap": 4 },
        "children": [
          { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "order" }] },
          {
            "component": "FormField",
            "props": { "label": "Amount" },
            "children": [{ "component": "Input", "props": { "name": "amount", "type": "number" } }]
          },
          {
            "component": "FormField",
            "props": { "label": "Reason" },
            "children": [{ "component": "Textarea", "props": { "name": "reason" } }]
          },
          {
            "component": "Button",
            "props": { "label": "Request the refund", "variant": "solid", "tone": "accent", "onClick": { "$": "onSubmit" } }
          }
        ]
      }
    ]
  }
}`

export function runtimeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const card = (name: string) => f.x(name, '@polymorph/screen/card')
  const react = (name: string) => f.x(name, '@polymorph/react/screen')
  const elements = (name: string) => f.x(name, '@polymorph/elements-ui/screen')
  const quoted = EXAMPLE_MEMBERS.map((name) => `'${name}'`).join(', ')
  const check = f.x('checkScreen', '@polymorph/screen/check')
  const partial = f.x('parsePartial', '@polymorph/screen/partial')
  const overAll = cardTokensOver(registry, drawnInReact(registry))
  const overFew = cardTokensOver(registry, EXAMPLE_MEMBERS)
  const body = `
# Draw a screen a model writes while the product runs

A run-time screen is interface a model writes while the product runs. The model answers with a
\`polymorph-screen/1\` document in a fenced \`json\` block. The host checks it and draws it with the
members, in the app's theme, while it streams in. When a member calls one of the document's
actions, such as a press or a submit, the host is told as data and sends that to the model as the
next turn. Nothing is compiled. The host calls the model, keeps the conversation and decides what
each action means; polymorph gives the card the model writes from, the check and the renderer.

## 1. Check that this is the right tool

| The screen | Use |
| --- | --- |
| Is part of the product: known when it is built, reviewed and kept | A spec that \`emit\` compiles, or code: the \`polymorph-screen\` skill |
| Depends on what the person asked: a form the agent needs filled before it acts, a summary of what it found, a choice between options it computed | This skill |
| Already exists, and an agent fills and presses in it | The \`polymorph-agent-bridge\` skill |
| Is drawn by SwiftUI or Compose | Nothing draws a document at run time on iOS or Android: the \`polymorph-native\` skill emits it |

A document computes nothing: it has no condition, no loop and no expression. A total, a filtered
list or whether to show a warning is computed by the host and passed as data, or the model is asked
for a new document.

## 2. Install the renderer

| The app | Draws with | Builds the card and checks with |
| --- | --- | --- |
| React | ${react('ScreenView')} from \`@polymorph/react/screen\`, in \`@polymorph/react\` | ${card('runtimeCard')} from \`@polymorph/screen/card\`, ${check} from \`@polymorph/screen/check\` |
| Vue, Svelte, Solid, Angular, or elements with a bundler | \`<poly-screen>\`, defined by importing \`@polymorph/elements-ui/screen\` once | the same, given \`framework: 'elements'\` |
| A page with no build | \`<poly-screen>\`, defined by \`polymorph.js\` | \`${f.x('loadScreen', 'packages/elements-ui/src/cdn/polymorph.ts').slice(1, -1)}()\` from \`polymorph.js\`, or the same on a server |

React is the only framework with a renderer of its own. Vue, Svelte, Solid and Angular draw with
\`<poly-screen>\`, a custom element: [references/elements.md](references/elements.md) has that host
and the page with no build.

\`@polymorph/screen\` has no dependencies and runs in a server, a worker and a page. Add it where the
card is built or an answer checked, under the alias and at the version of the project's other
polymorph packages, so the card, the check and the renderer read one vocabulary:

\`\`\`json
{ "dependencies": { "@polymorph/screen": "npm:@metamorph-labs/polymorph-screen@^<version>" } }
\`\`\`

## 3. Choose the members a document may use

\`\`\`ts
// screen-members.ts: the members a document may use. The card, the renderer and the check read it.
export const MEMBERS = [${quoted}]
\`\`\`

The same list goes to the card and the check (\`members\`) and to the renderer (\`allow\` on
${react('ScreenView')}, \`members\` on \`<poly-screen>\`), so the model is never shown a member the
renderer refuses. A part comes with its member: ${f.m('Table')} allows ${f.part('Table', 'Row')}.

- A shorter list gives a shorter card, fewer choices and a check that refuses the rest.
- With no list, every member the framework draws is allowed but ${f.m('ThirdParty')}, which holds
  whatever the host puts in it, and, in React, ${f.m('Toast')}.
- A host that refuses links and remote pictures leaves out every member that takes an address:
  ${all(addressMembers(registry).map((name) => f.m(name)))}.

## 4. Put the run-time card in the system prompt

\`\`\`ts
import { runtimeCard } from '@polymorph/screen/card'

import { MEMBERS } from './screen-members'

// The same release, framework and members give the same text, so it is built once.
export const SYSTEM = runtimeCard({ members: MEMBERS })
\`\`\`

For \`<poly-screen>\`, pass \`framework: 'elements'\` too. The card lists each allowed member with its
props, parts and lawful variant and tone cells, then the data types and icon roles they take, and
ends with the output contract: one document in a fenced \`json\` block, and how to write it. It is
not the system card the \`card\` verb prints, which is for a coding agent and never goes in a
run-time prompt.

The card is the largest part of each request: over ${overAll} tokens with every member the framework
draws, over ${overFew} with the eight above, at four characters to a token. Measure yours from the
app's root:

\`\`\`sh
node --input-type=module -e "import { runtimeCard } from '@polymorph/screen/card'; console.log(runtimeCard({ members: [${quoted}] }).length)"
\`\`\`

Send it as the whole system prompt, before anything that changes between requests, and mark it for
the provider's prompt cache. A provider caches only above a minimum length, which a card for a few
members may not reach. The model needs no tool to write a lawful document.

## 5. Ask for a screen

The person's request is the message. When the screen should show the host's data, the message names
each key the host holds, with its type: a document binds a data input by the key's name.

\`\`\`ts
const message = [
  'I want a refund for order 1042.',
  'Data you can bind, by input name: order (string, the order number as the person reads it).',
].join('\\n\\n')
\`\`\`

The model answers with the document, sometimes after a sentence of prose:

\`\`\`json
${REFUND}
\`\`\`

## 6. Call the model, and check the whole answer

\`\`\`ts
import { checkScreen } from '@polymorph/screen/check'
import { parsePartial } from '@polymorph/screen/partial'

// Stand-in: your call to the model, with the card as the system prompt. It keeps the conversation,
// calls \`onText\` with the answer so far each time more arrives, and resolves with the whole answer.
import { askModel } from './model'
import { MEMBERS } from './screen-members'

/** Asks for a screen, and once more with the faults when the whole answer is not lawful. */
export async function askForScreen(message: string, onText: (text: string) => void) {
  const answer = await askModel(message, onText)
  const { document, complete } = parsePartial(answer)
  if (!complete) return
  const { ok, faults } = checkScreen(document, { members: MEMBERS })
  if (ok) return
  const lines = faults.map((fault) => \`\${fault.path}: \${fault.message}\`)
  await askModel(
    \`Your screen has these faults. Answer with the corrected document.\\n\${lines.join('\\n')}\`,
    onText,
  )
}
\`\`\`

${partial} reads the document out of the answer, prose and fence included. ${check} returns
\`{ ok, faults }\`, each fault \`{ path, message }\` in words a model corrects from
(\`\`no component called \`Modal\` — did you mean \`Dialog\`, …?\`\`). The renderer does not need
the check to be safe, as it applies the run-time rules as it draws. The check is for the screen the
model meant: a fault is a part missing from the drawing, which one more turn can supply. It also
reads what the renderer does not: variant and tone cells, icon roles and the usage rules.

## 7. Draw the answer while it streams

\`\`\`tsx
import { useState } from 'react'
import * as members from '@polymorph/react-ui'
import { ScreenView, type ScreenAction } from '@polymorph/react/screen'

import { askForScreen } from './ask'
import { MEMBERS } from './screen-members'

const { PromptInput, Stack } = members

export function Assistant({ data }: { data: Record<string, unknown> }) {
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(true)

  const send = async (message: string) => {
    setDone(false)
    await askForScreen(message, setAnswer)
    setDone(true)
  }

  const onAction = (action: ScreenAction) => {
    void send(\`An action from the screen: \${JSON.stringify(action)}\`)
  }

  return (
    <Stack gap={4}>
      <ScreenView
        text={answer}
        streaming={!done}
        members={members}
        allow={MEMBERS}
        data={data}
        onAction={onAction}
        onFault={(fault) => console.warn(fault.path, fault.message)}
      />
      <PromptInput label="Message" streaming={!done} onSubmit={(text) => void send(text)} />
    </Stack>
  )
}
\`\`\`

- \`members\` is the components to draw with. \`import * as members\` bundles every member; a map of
  the allowed ones (\`{ Stack, Card, … }\`) keeps the rest out.
- \`streaming\` is on while the answer arrives and off when it ends, so an answer cut short reports
  what it lacks. Left out, it is whether the document in \`text\` is still open, and an answer that
  stops early never reports. Off while chunks still arrive, each chunk is a new whole document whose
  faults are told again.
- An element is drawn once every prop it requires is written, and stays drawn, so a field keeps its
  text and focus while the answer grows. A child's text appears as it is written; a prop's value
  only once whole.
- [references/contract.md](references/contract.md) says what new \`data\`, a new answer and a
  replaced document keep. [references/api.md](references/api.md) has every prop, and a host that
  parses the stream itself.

## 8. Handle each action

The person types 40 and a reason and presses the button. \`onAction\` is called with a
${f.x('ScreenAction', '@polymorph/screen/walk')}:

\`\`\`json
{ "name": "onSubmit", "args": [], "values": { "amount": "40", "reason": "It arrived broken." }, "changed": ["amount", "reason"] }
\`\`\`

| Field | What it is |
| --- | --- |
| \`name\` | the callback input the document bound, which the member called |
| \`args\` | what the member passed, as JSON. An event is dropped: a ${f.m('Button')}'s ${f.p('Button', 'onClick')} gives \`[]\` |
| \`values\` | every control with a \`name\`, on screen or not: what the person chose, else the document's or host's value, else its default, else its type's empty value |
| \`changed\` | the names in \`values\` whose value the person chose |

- Send it to the model as the next turn, as step 7 does. The next answer is the next screen.
- An action is the document's word, not the person's: the document chose its \`name\` and each
  control's default. Confirm anything with consequences, such as a payment, a deletion or a message
  sent, with the person outside the screen, in the host's own words.
- An action does not prove that a person acted. ${f.m('Countdown')} calls ${f.p('Countdown', 'onEnd')}
  when its time is reached, a field drawn with ${f.p('Input', 'autoFocus')} calls
  ${f.p('Input', 'onFocus')}, and an agent on the page presses as a person does. Each such action has
  an empty \`changed\`, as a plain press does. Bound how many model turns actions may start in a
  row, so a screen that calls its own action as it is drawn cannot loop.
- A promise \`onAction\` returns is what a member that waits on its callback waits on:
  ${f.m('ConfirmDialog')} stays open and busy until it settles. A ${f.m('Button')} does not wait.

## 9. Use the tools while you build

Save an answer's document to a file to look at it:

${commands(run, `render answer.json --system ${DEFAULT_SYSTEM} --data data.json`, 'validate answer.json --framework react', 'component FormField --framework react')}

- \`render\` draws it with the React members, every member allowed, and reports layout faults.
  \`--data\` takes a JSON file of the host's data by input name. It does not apply the host's list
  or report a run-time fault, such as a refused address.
- \`validate\` checks it as \`emit\` would: names, props, values, cells and usage rules. It does not
  apply the host's list or the run-time rules; only ${check} does.
- \`component\` prints what a member takes. No verb prints the run-time card.

## What a document cannot do, and what stays the host's job

Whatever a model writes, the renderers and the check hold it to these rules:

- Nothing in it runs or is inserted as markup. A string is drawn as text in every member but
  ${f.m('Markdown')}, which draws the Markdown its text holds.
- A component is drawn only if the vocabulary has it, the host allows it and the framework draws
  it, and a prop is passed only if the member has it.
- A callback prop takes only a function the screen makes. A function in the host's \`data\` is never
  handed to a member through a binding.
- An address is relative, a fragment, or \`http:\`, \`https:\`, \`mailto:\` or \`tel:\`; any other
  scheme (\`javascript:\`, \`data:\`) is refused.
- Depth and the lengths of keys and types are bounded, no text makes the core throw, and a fault
  takes out only the element it is in.

These stay the host's job:

- What an action means, and confirming one with consequences.
- The host's own data inside a bound value, addresses included: it is passed as the host gave it.
- Where a link leads and where a picture loads from: an \`https:\` address can name any site.
- Ids and names: a document can set an \`id\` and a control's \`name\`, so draw the screen outside the
  host's own \`<form>\`.
- The words: a screen shows any text the model writes and asks for any field it names. Treat
  \`values\` as input from the page.

[references/contract.md](references/contract.md) has each rule, every fault and the limits.

## A run-time document is not a spec to emit

The format and the validator are the same, so \`emit\` reads a document a model wrote. What happens
to it differs:

| | A spec \`emit\` compiles | A run-time document |
| --- | --- | --- |
| A data input | a prop the container passes | the host's \`data\` under its name, empty when absent |
| A callback input | a function the container passes | an action the host is told of |
| Members | every member the framework ships | the host's list |
| Checked by | \`validate\` | ${check}: the validator, then the run-time rules |
| Becomes | a source file, reviewed and built | a drawing in the person's page |
| Platforms | web, iOS and Android | web |

## What it costs

- **Every request** carries the card; a shorter list costs less on each.
- **Every action** sent to the model is a turn, and the person sees the next screen's first
  elements before its last.
- **React**: \`@polymorph/react/screen\` adds the renderer and the vocabulary table to the bundle,
  and the members map adds its members. The card and the validator come only where imported.
- **\`<poly-screen>\`**: the first to connect fetches the renderer and the vocabulary table, each
  member's code loads when its element first renders, and the validator on the first check.
`
  return [
    {
      path: 'polymorph-runtime-screen/SKILL.md',
      contents: skill(
        'polymorph-runtime-screen',
        'Let a product answer with real interface while it runs. A model writes a ' +
          'polymorph-screen/1 document, the host checks it with checkScreen, draws it as it ' +
          'streams with ScreenView from @polymorph/react/screen or the <poly-screen> element from ' +
          '@polymorph/elements-ui/screen, and turns each press or submit into an action the ' +
          'product handles. Use when asked for generative UI, to render a model or agent response ' +
          'as components, to let an assistant show a form, a choice or a confirmation, or when ' +
          'code imports @polymorph/screen, runtimeCard, parsePartial, ScreenView or loadScreen. ' +
          'Covers choosing it over an emitted screen, installing, the run-time card in the system ' +
          'prompt, drawing while it streams, actions and values, checking an answer and asking ' +
          'again, what a document cannot do and what stays the host’s job, and what it costs.',
        body,
      ),
    },
    {
      path: 'polymorph-runtime-screen/references/elements.md',
      contents: elementsReference(registry, elements),
    },
    {
      path: 'polymorph-runtime-screen/references/contract.md',
      contents: contractReference(registry),
    },
    { path: 'polymorph-runtime-screen/references/api.md', contents: apiReference(registry) },
  ]
}

/** The host for Vue, Svelte, Solid, Angular, elements with a bundler, and a page with no build. */
function elementsReference(registry: Registry, elements: (name: string) => string): string {
  const f = new Facts(registry)
  const quoted = EXAMPLE_MEMBERS.map((name) => `'${name}'`).join(', ')
  return `# Draw with \`<poly-screen>\`

\`<poly-screen>\` draws a document as \`poly-*\` elements, the elements that render each member, in
the light DOM. It draws no box of its own, so the screen lays out as content of the element's
parent. Vue, Svelte, Solid and Angular have no run-time renderer of their own, so an app in any of
them uses it, as a page with no build does. The elements read the theme the page carries, as every
member does.

## In an app with a bundler

1. Add \`@polymorph/elements\` and \`@polymorph/elements-ui\` to \`package.json\` under the alias and
   version the other polymorph packages use (\`npm:@metamorph-labs/polymorph-elements-ui@^<version>\`),
   and \`@polymorph/screen\` where the card is built. Run the project's install.
2. Import \`@polymorph/elements-ui/screen\` once. It defines \`<poly-screen>\` and every \`poly-*\`
   element; each member's code loads the first time one of its elements renders.
3. Write \`<poly-screen></poly-screen>\` in the template, as any custom element. In Vue, make
   \`compilerOptions.isCustomElement\` accept the \`poly-\` tags; in Angular, add
   \`CUSTOM_ELEMENTS_SCHEMA\` to the component's \`schemas\`.
4. Take the element through the framework's template ref, once it is mounted, and connect it:

\`\`\`ts
import type { PolymorphEvent } from '@polymorph/elements'
import { ACTION_EVENT, FAULT_EVENT, type PolyScreen, type ScreenAction } from '@polymorph/elements-ui/screen'

import { askForScreen } from './ask'
import { MEMBERS } from './screen-members'

/** Draws the model's answers in a \`<poly-screen>\` the page or a template wrote, and sends each action back. */
export function connectScreen(screen: PolyScreen, data: Record<string, unknown>) {
  screen.members = MEMBERS
  screen.data = data

  const send = async (message: string) => {
    screen.streaming = true
    await askForScreen(message, (text) => {
      screen.text = text
    })
    screen.streaming = false
  }

  screen.addEventListener(ACTION_EVENT, (event) => {
    const action = (event as PolymorphEvent<ScreenAction>).detail
    void send(\`An action from the screen: \${JSON.stringify(action)}\`)
  })
  screen.addEventListener(FAULT_EVENT, (event) => console.warn((event as CustomEvent).detail))
  return send
}
\`\`\`

\`askForScreen\` is the one in the skill's step 6, with the card and the check for the elements:

\`\`\`ts
const SYSTEM = runtimeCard({ framework: 'elements', members: MEMBERS })
const { ok, faults } = checkScreen(document, { framework: 'elements', members: MEMBERS })
\`\`\`

Build the card and check on the server with \`@polymorph/screen/card\` and
\`@polymorph/screen/check\`. \`@polymorph/elements-ui/screen\` exports the same functions bound to
the elements, for code in the page: ${elements('drawScreen')} draws into a plain element, and
${elements('PolyScreen')}, ${elements('ACTION_EVENT')} and ${elements('FAULT_EVENT')} are the
element's class and its events.

## On a page with no build

A page with no build loads the elements from files the project copied into \`public/polymorph/\`
when it was set up (the \`polymorph-setup\` skill). The page links \`polymorph.css\` and its theme
sheet, then loads \`polymorph.js\` as a module script. \`polymorph.js\` defines \`<poly-screen>\`,
and the first one to connect fetches the renderer.

\`\`\`html
<poly-screen id="assistant" members="${EXAMPLE_MEMBERS.join(' ')}"></poly-screen>

<script type="module">
  // Stand-in: the page's call to the model, through its server, with the card for the elements
  // as the system prompt. It calls \`onText\` with the answer so far, and resolves when it ends.
  import { askModel } from './model.js'

  const screen = document.querySelector('#assistant')
  screen.data = { order: 'Order 1042' }

  async function send(message) {
    screen.streaming = true
    await askModel(message, (text) => {
      screen.text = text
    })
    screen.streaming = false
  }

  screen.addEventListener('poly-action', (event) => {
    send(\`An action from the screen: \${JSON.stringify(event.detail)}\`)
  })
  screen.addEventListener('poly-fault', (event) => console.warn(event.detail))

  send('I want a refund for order 1042.')
</script>
\`\`\`

The page builds the card, or checks a document, with ${f.x('loadScreen', 'packages/elements-ui/src/cdn/polymorph.ts')}.
It fetches the validator and the card only when called, and its functions are bound to the
elements, so they take no \`framework\`:

\`\`\`html
<script type="module">
  import { loadScreen } from './polymorph/polymorph.js'

  const { runtimeCard, checkScreen } = await loadScreen()
  const card = runtimeCard({ members: [${quoted}] })
</script>
\`\`\`

## What the element does

- It draws the first of these that holds a document: the \`spec\` property, the \`text\` property
  (an answer so far), or a \`<script type="application/json">\` child, which a server that renders
  the page writes and the element draws with no script on the page.
- \`streaming\` is the page's to set: on while an answer arrives, off when it ends, so an answer cut
  short reports what it lacks. A page that never sets it gives each chunk of \`text\` as a new whole
  document, whose faults are told again and whose unfinished elements are not drawn.
- \`members\` is an attribute (names separated by spaces, or a JSON array) and a property. A value
  that is not a list of names allows no member, and is a fault at the path \`members\`.
- \`poly-action\` carries \`{ name, args, values, changed }\`, as an action does in React. A listener
  hands the member a promise with \`event.waitUntil(promise)\`, while the event is dispatched:
  ${f.m('ConfirmDialog')} stays open and busy until it settles.
- \`poly-fault\` carries \`{ path, message, component? }\`, once for each fault. \`faults="inline"\`
  draws each fault in its node's place, for a page under construction.
- \`values\`, \`changed\` and \`check()\` read the drawing. \`check()\` is a promise of what the check
  says of the document it draws, with its members.
- A property set before the element is defined is read when it is.
`
}

/** The run-time contract: what a document does, what each fault means, and the limits. */
function contractReference(registry: Registry): string {
  const f = new Facts(registry)
  const screen = (name: string) => f.x(name, '@polymorph/screen')
  return `# The run-time contract

What a document does at run time is decided once, in the walk every renderer draws from, so a
document behaves the same in React and as elements.

## Data inputs

An input whose type is not a function is a data input, filled from the host's \`data\` by its name.
An input the host gives no value for is absent, never a placeholder: an optional prop bound to it
takes its default. A required prop bound to it is not passed, and once the document is whole it is
a fault (\`\` \`Select\` requires \`options\`, and the host's data holds nothing at \`choices\` \`\`). The
element is still drawn without it, so a screen keeps its shape while the host's data arrives.

A binding names a declared input, or a dotted path into one (\`order.number\`). Each name reads one
of the value's own properties, never one it inherits, so \`order.constructor\` reads nothing.

## Callback inputs

An input whose type is a function is a callback input. What a member is handed for it is decided by
the prop, list item or structured object field the document binds it to:

| Bound where | It is |
| --- | --- |
| A callback that returns nothing receives it (${f.m('Button')}'s ${f.p('Button', 'onClick')}, ${f.m('Pagination')}'s ${f.p('Pagination', 'onPageChange')}) | an action: the host is told \`{ name, args, values, changed }\` |
| A callback that returns a value receives it (${f.m('DataTable')}'s ${f.p('DataTable', 'getRowId')}) | a question the member asks while it draws. Where the prop may be left out, nothing is passed and the member answers as it does by default; where it is required, a stub answers by the return type (a key, \`false\`, \`0\`, an empty list). The host is never told |
| No callback receives it (${f.m('Button')}'s ${f.p('Button', 'label')}, a child) | a fault, and nothing is passed |

A required callback the document leaves unbound gets the same stub, so a member that requires a
handler still draws.

## What an action carries

\`args\` is what the member passed, reduced to JSON: text, numbers and booleans as themselves; \`NaN\`
and infinities as \`null\`; a date or a time as ISO 8601 text; a \`Set\` as a list, a \`Map\` as an
object; a file as \`{ size, name, type }\`. An event, a DOM node, an element and a function are
dropped at the end of the list and \`null\` before a kept argument, so each kept argument keeps its
position.

\`values\` holds every control that has a \`name\` and a controlled value (\`value\`, or a checkbox's
\`checked\`), whether or not it is on screen: a closed dialog's field, an unselected tab panel. A
control's value is, in order: what the person chose, until the document or the host gives it
another value; else the value the document or the host gives it; else its default; else the empty
value of its type: \`null\` where the type admits it, \`[]\` for a list, \`false\` for a checkbox or a
switch, \`""\` for text.

- Two controls with one name are a fault, and \`values\` holds the last in document order.
- A control named \`__proto__\`, \`constructor\` or \`prototype\` is a fault and is left out.
- When a document binds a change event to an action (\`"onChange": { "$": "onEdit" }\`), the
  screen holds the new value before it tells the host, so the action's \`values\` already has it.

## Controls follow the reader

A value the person chose stands until the document or the host gives that prop a different value,
so a document replaced with the same value does not undo the person's typing. A document's value is
compared by content, the host's data by identity. A control the document gives no value keeps its
own state. A control that takes another name, or moves because an element is inserted before it, is
a new control.

## Changing what is drawn

- **New data**: pass another \`data\` (\`screen.data\` on \`<poly-screen>\`). Only what is bound to a
  value that changed is drawn again. In React, a new object that holds the same values draws nothing
  again.
- **The same answer, growing**: each element stays drawn with its state, so a field the person is
  typing in keeps its text and its focus.
- **A new answer**: a new document from its first character. The screen is empty until its root is
  drawn, and the old screen's controls go with what was typed in them, which the action that led to
  the answer already carried in \`values\`.
- **A document replaced whole**: pass it as \`document\` in React, \`spec\` on \`<poly-screen>\`. An
  element at the same place with the same component, and for a named control the same name, keeps
  its rendering and its state. A control that an inserted element moves to another place is drawn
  as a new, empty control, and \`values\` no longer holds what was typed in it.

## An element a required prop is missing from

Once the document is whole, an element whose required text or data (a label, an \`alt\`, options)
was never written, or was refused by another fault, is drawn as nothing, with a fault that names the
prop, and its controls hold no value. While the document streams it waits, with no fault.

- A required prop that takes any node is a slot (${f.m('FormPage')}'s ${f.p('FormPage', 'actions')}).
  An empty slot does not take out its element: the page is drawn with the slot empty.
- A member that reads one element it requires, as its child (${f.m('FormField')}'s control) or in a
  prop that takes exactly one element (${f.m('SettingsRow')}'s ${f.p('SettingsRow', 'control')}), is not
  drawn without it; the element that holds it is.
- Still drawn: a required prop bound to data the host has not given yet, a refused address (a
  ${f.m('Link')} without its \`href\` is not a link), and a required callback the document left
  unbound.

## Faults

Each fault is \`{ path, message, component? }\`, at the validator's paths (\`$.root.children[2]\`), told
once in a drawing when it first appears: to \`onFault\` in React, as \`poly-fault\` on
\`<poly-screen>\`. A drawing begins when the screen is made, when a stream begins, and when the host
gives a whole document that differs from the one drawn. While a document streams, nothing that has
not arrived is a fault.

| Fault | What it means for the host |
| --- | --- |
| \`no component called …\` | The vocabulary has no such member. The element is drawn as nothing. Ask again with the fault |
| \`… is not one of the members this host draws\` | A member outside the list. Drawn as nothing. Ask again, or widen the list and the card together |
| \`… has no prop …\` | The prop is not passed; the element is drawn without it |
| \`… takes a function\`, a callback input where no callback receives it | Not passed. If the prop was required text, the element is drawn as nothing |
| A function in the host's data bound by the document | Not passed. The document reached for something the host did not offer |
| \`… is not an address a screen may hold\` | The address is not passed. The element is drawn, inert |
| \`… is missing its required prop …\`, \`… is not drawn …\` | The element is drawn as nothing |
| A shared or inherited control name | \`values\` holds one control, or none |
| A member that threw as it rendered | Its node is drawn as nothing; the rest of the screen draws |
| Text that stops being JSON, at \`$\` | The answer broke off; the document holds what came before it |

A fault in the root element leaves nothing to draw. \`faults="inline"\` draws each fault in its
node's place, which helps while building a host.

## Addresses

A string at a prop or object key that takes an address (\`avatar\`, \`href\`, \`nextHref\`,
\`previousHref\`, \`src\`, \`srcSet\`) is relative (\`/orders/1042\`, \`?page=2\`), a fragment
(\`#reason\`), or has the scheme \`http:\`, \`https:\`, \`mailto:\` or \`tel:\`. Any other scheme is a
fault and is not passed. An address with a control character anywhere is refused whole, and spaces
at either end are stripped before the scheme is read. Each address in a \`srcSet\` is held to the
same rule. The rule covers the document's values and a value a binding puts directly at an address;
it does not reach into an object the host binds whole.

## Limits

| Constant | Value | What is held to it |
| --- | --- | --- |
| ${f.x('MAX_DEPTH', '@polymorph/screen/partial')} | 128 | objects and lists nested in one another. Deeper text stops being read |
| ${screen('MAX_TYPE_LENGTH')} | 500 | characters of an input's type. A longer type is a fault, and the input has no value |
| ${screen('MAX_KEY_LENGTH')} | 100 | characters of a prop name or a field. A longer key is a fault, and what it holds is not read |
| ${screen('MAX_JSON_VALUES')} | 100,000 | values one action's \`args\` or one control's value reduces to. A cut is a fault |

No text and no value makes the reader, the check or the walk throw, and each takes time in
proportion to what it reads.

## What is not checked

- The host's data inside a bound value: a list of the host's objects is passed as the host gave it.
- Where a link leads, and where a picture or a recording loads from.
- What ${f.m('Markdown')} draws from its text: links and pictures at \`http:\`, \`https:\`, \`mailto:\`
  or no scheme. No other member draws Markdown.
- Ids and names, which can match the host's own. A control inside the host's \`<form>\` posts under
  the document's name.
- Who called an action (step 8 of the skill).
- What \`checkScreen\` cannot see: it reads only the document, so what the walk refuses from the
  host's data (an address, a function) is reported by the renderer, not the check.
`
}

/** Every export, prop, attribute and event, for a host that needs more than the procedure. */
function apiReference(registry: Registry): string {
  const f = new Facts(registry)
  const walk = (name: string) => f.x(name, '@polymorph/screen/walk')
  const react = (name: string) => f.x(name, '@polymorph/react/screen')
  const elements = (name: string) => f.x(name, '@polymorph/elements-ui/screen')
  return `# Reference: exports, props, attributes and events

## \`@polymorph/screen\`

No framework, no DOM and no dependency: it runs in a page, a worker and a server. Each subpath loads
only what it needs.

| Import | Exports | Loads |
| --- | --- | --- |
| \`@polymorph/screen/partial\` | ${f.x('parsePartial', '@polymorph/screen/partial')}, ${f.x('MAX_DEPTH', '@polymorph/screen/partial')}, the type ${f.x('PartialDocument', '@polymorph/screen/partial')} | nothing else |
| \`@polymorph/screen/check\` | ${f.x('checkScreen', '@polymorph/screen/check')} | the vocabulary table and the validator |
| \`@polymorph/screen/card\` | ${f.x('runtimeCard', '@polymorph/screen/card')}, ${f.x('outputContract', '@polymorph/screen/card')} | the table and the card |
| \`@polymorph/screen/walk\` | ${walk('createScreen')}, ${walk('materialize')}, the types ${walk('ScreenAction')}, ${walk('ScreenFault')}, ${walk('ScreenNode')}, ${walk('ScreenOptions')}, ${walk('ScreenUpdate')} | no table: a renderer hands it one |
| \`@polymorph/screen/vocabulary\` | ${f.x('VOCABULARY', '@polymorph/screen/vocabulary')}, the table generated from the release's registry | the table |
| \`@polymorph/screen\` | all of the above, the limits and the helpers the renderers share | everything |

\`checkScreen(document, options)\`, \`runtimeCard(options)\` and \`outputContract(options)\` take:

| Option | What it is |
| --- | --- |
| \`framework\` | \`react\` (the default), \`vue\`, \`svelte\`, \`solid\`, \`angular\` or \`elements\`: the default members and which are absent |
| \`members\` | the names the host allows; the framework's default when absent |

\`checkScreen\` returns \`{ ok, faults }\`, each fault \`{ path, message }\`. \`outputContract\` is the
card's last part alone.

\`parsePartial(text)\` returns:

| Field | What it is |
| --- | --- |
| \`document\` | the document so far; \`undefined\` before its first brace |
| \`complete\` | whether the document's outermost brace has closed |
| \`open\` | the path of the string still being written, or \`null\` |
| \`cut\` | the path of the innermost value the text ends inside, or \`null\` |
| \`error\` | \`{ at, message }\` where the text stops being JSON, or \`null\` |

It reads the first fence marked \`json\`, or unmarked, and the first brace when the text has no
fence. A name, a number, \`true\`, \`false\`, \`null\` and a binding are left out until whole; a
string a person reads is kept while it is written.

\`createScreen(options)\` is for a renderer of your own: \`document\`, \`vocabulary\`, \`framework\`,
\`members\`, \`data\`, \`fill\` (\`absent\` or \`sample\`), \`streaming\`, \`open\`, \`cut\`, \`onAction\` and
\`onFault\`. It returns a ${walk('Screen')}: \`root\`, \`faults\`, \`values\`, \`changed\`, \`fills\`,
\`streaming\`, \`update(change)\`, \`subscribe(listener)\` and \`fail(fault)\`.

## \`@polymorph/react/screen\`

A subpath of \`@polymorph/react\`; the foundation's root loads none of it. It exports
${react('ScreenView')}, ${react('useScreen')} (the screen \`ScreenView\` draws, to read its
\`values\`, \`changed\`, \`faults\` and \`fills\`), ${react('ScreenDrawing')} (draws a \`Screen\`),
${react('componentFor')} (the component a name resolves to among the members), \`parsePartial\`, and
the types \`ScreenAction\`, \`ScreenFault\`, ${react('ScreenViewProps')} and ${react('ScreenMembers')}.

| \`ScreenView\` prop | What it is |
| --- | --- |
| \`members\` | required: the components by member name. A part is read as \`members.Table.Row\` or \`members['Table.Row']\` |
| \`text\` | a model's answer so far |
| \`document\` | the document as an object, read when \`text\` is absent |
| \`cut\`, \`open\` | \`parsePartial\`'s, beside \`document\` |
| \`streaming\` | whether more is to come. With \`text\`, whether its document has not closed, unless given |
| \`data\` | the host's data by input name |
| \`allow\` | the members a document may use. Read when the screen is made |
| \`fill\` | \`absent\` (the default) or \`sample\`, which fills an input with no data from its type |
| \`onAction(action)\` | told each action; a promise it returns is what a member waits on |
| \`onFault(fault)\` | told each fault once |
| \`faults\` | \`hidden\` (the default) or \`inline\` |
| \`renderFault(fault, cause)\` | draws a fault in place when \`faults\` is \`inline\`. \`cause\` is \`unknown\`, \`refused\`, \`missing\`, \`threw\` or \`value\` |
| \`renderBinding(path, value)\` | draws a binding where something is drawn |
| \`decorate(drawn, node)\` | wraps the drawing of every node |
| \`fallback\` | what shows while a member that is not lazy suspends |

No handler runs while React renders, so a server render and strict mode's second render tell the
host nothing. Each node draws inside its own error boundary.

### A host that parses the stream itself

A host that reads the answer itself, to log it or to show the prose before the fence, passes what
\`parsePartial\` returned. With \`cut\`, an element still being written waits as it does with
\`text\`; without it, every element that has arrived is drawn with the props it has so far.

\`\`\`tsx
import * as members from '@polymorph/react-ui'
import { parsePartial, ScreenView } from '@polymorph/react/screen'

import { MEMBERS } from './screen-members'

export function ParsedScreen({ answer, ended }: { answer: string; ended: boolean }) {
  const read = parsePartial(answer)
  return (
    <ScreenView
      document={read.document}
      cut={read.cut}
      open={read.open}
      streaming={!ended && !read.complete}
      members={members}
      allow={MEMBERS}
    />
  )
}
\`\`\`

\`drawScreen\` takes the same four fields in its options and in \`update\`. \`<poly-screen>\` takes the
document as \`spec\` and nothing else, so it draws each element as it arrives with the props it has
so far.

## \`@polymorph/elements-ui/screen\`

Importing it defines \`<poly-screen>\` and every element. It exports ${elements('drawScreen')},
\`checkScreen\`, \`runtimeCard\`, \`outputContract\` and \`parsePartial\` bound to the elements,
${elements('definePolyScreen')}, ${elements('PolyScreen')}, ${elements('SCREEN_TAG')},
${elements('ACTION_EVENT')} (\`'poly-action'\`) and ${elements('FAULT_EVENT')} (\`'poly-fault'\`).

\`drawScreen(container, options)\` appends the drawing to a plain element. It takes \`document\`,
\`data\`, \`streaming\`, \`open\`, \`cut\`, \`members\`, \`faults\`, \`onAction\` and \`onFault\`, and no
\`text\`: a host that streams passes what \`parsePartial\` returned. It returns \`values\`, \`changed\`,
\`faults\`, \`update(change)\`, \`check()\` and \`dispose()\`.

## \`<poly-screen>\`

| Attribute or property | What it is |
| --- | --- |
| \`spec\` (property) | the document |
| \`text\` (property) | a model's answer so far |
| \`data\` (property) | the host's data by input name |
| \`streaming\` (attribute and property) | more of the document is to come |
| \`members\` (attribute and property) | the members the host allows: names separated by spaces, or a JSON array |
| \`faults\` (attribute and property) | \`hidden\` (the default) or \`inline\` |
| \`values\`, \`changed\` (properties, read only) | each named control's value, and the names the person changed |
| \`check()\` (method) | a promise of what the check says of the document it draws |

| Event | \`detail\` |
| --- | --- |
| \`poly-action\` | \`{ name, args, values, changed }\`; \`event.waitUntil(promise)\` hands the member a promise |
| \`poly-fault\` | \`{ path, message, component? }\` |

Both bubble and are composed.

## \`loadScreen()\`

\`polymorph.js\` and \`polymorph-all.js\` export ${f.x('loadScreen', 'packages/elements-ui/src/cdn/polymorph.ts')}.
It resolves to \`drawScreen\`, \`parsePartial\`, \`checkScreen\`, \`runtimeCard\` and \`outputContract\`,
bound to the elements.
`
}
