import type { Registry } from '@polymorph/registry'
import { renderRuntimeCard } from '@polymorph/registry/runtime-card'
import { ADDRESS_KEYS } from '@polymorph/registry/runtime-members'

import { DEFAULT_SYSTEM } from '../plan'
import { all, commands, Facts, skill, SkillFactError, type SkillFile } from './facts'

/**
 * The skill for a screen a model writes while the product runs: the run-time card and the host's
 * rules in the model's prompt, the check and the retry on the server, the React renderer and
 * `<poly-screen>` on the page, the model's prose, what an action tells the host, an action with
 * consequences, and what a request costs. Each example in it was compiled against the sources or
 * run against them, the no-build page against the built files.
 */

/**
 * The members the examples allow. None takes an address, so the examples obey the rule the text
 * states for a host that refuses links and pictures; `runtimeSkill` throws when one does.
 */
const EXAMPLE_MEMBERS = [
  'Stack',
  'Heading',
  'Text',
  'Button',
  'FormField',
  'NumberInput',
  'Textarea',
]

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
 * over, which moves only when the vocabulary grows by a step of that size. The CLI does not
 * depend on `@polymorph/screen`, so the card's opening and output contract are not counted.
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

/** The example answer: the document a model writes for a refund, from the members above only. */
const REFUND = `{
  "spec": "polymorph-screen/1",
  "name": "RefundRequest",
  "purpose": "Asks the person how much of an order to refund, and why.",
  "inputs": [{ "name": "order", "type": "string" }, { "name": "requestRefund", "type": "() => void" }],
  "root": {
    "component": "Stack",
    "props": { "gap": 4 },
    "children": [
      { "component": "Heading", "children": ["Refund an order"] },
      { "component": "Text", "props": { "tone": "secondary" }, "children": [{ "$": "order" }] },
      {
        "component": "FormField",
        "props": { "label": "Amount" },
        "children": [{ "component": "NumberInput", "props": { "name": "amount", "min": 0 } }]
      },
      {
        "component": "FormField",
        "props": { "label": "Reason" },
        "children": [{ "component": "Textarea", "props": { "name": "reason" } }]
      },
      {
        "component": "Button",
        "props": { "label": "Request the refund", "variant": "solid", "tone": "accent", "onClick": { "$": "requestRefund" } }
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
  const addressed = addressMembers(registry)
  const leaks = EXAMPLE_MEMBERS.filter((name) => addressed.includes(name))
  if (leaks.length > 0) {
    throw new SkillFactError(
      `the run-time examples allow ${leaks.join(', ')}, which take an address`,
    )
  }
  const refused = addressed.filter((name) => name !== 'Markdown').map((name) => f.m(name))
  const body = `
# Draw a screen a model writes while the product runs

A run-time screen is interface a model writes while the product runs. The model answers with a
\`polymorph-screen/1\` document in a fenced \`json\` block, sometimes with prose around it. The host
draws the document with the members, in the app's theme, while it streams in. When a member calls
one of the document's actions, such as a press or a submit, the host is told the action's name and
the form's values as data. Nothing is compiled.

The work is in two places, and both are given the same list of members:

- **The server that calls the model** builds the run-time card, sends it with the host's own
  rules, checks each whole answer with ${check} and asks once more when it has faults.
- **The page** draws the answer while it streams, with ${react('ScreenView')} or \`<poly-screen>\`.
  The renderer applies the member list and the run-time rules itself, so the page treats the
  document as untrusted whatever the server checked.

Polymorph gives the card, the check and the renderers. The host calls the model, keeps the
conversation and decides what each action means.

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

React is the only framework with a renderer of its own.
[references/elements.md](references/elements.md) has the \`<poly-screen>\` host for the others and
for a page with no build.

\`@polymorph/screen\` has no dependencies and runs in a server, a worker and a page. Add it where the
card is built or an answer checked, under the alias and at the version of the project's other
polymorph packages, so the card, the check and the renderer read one vocabulary:

\`\`\`json
{ "dependencies": { "@polymorph/screen": "npm:@metamorph-labs/polymorph-screen@^<version>" } }
\`\`\`

## 3. Choose the members a document may use

\`\`\`ts
// screen-members.ts: the members a document may use. The server and the page both import it.
export const MEMBERS = [${quoted}]
\`\`\`

The list is what the model may write. It goes to the card and the check (\`members\`) and to the
renderer (\`allow\` on ${react('ScreenView')}, \`members\` on \`<poly-screen>\`), so the model is never
shown a member the renderer refuses. The host's own code composes any member, in the list or not:
the ${f.m('ChatThread')} around the screen, the ${f.m('ConfirmDialog')} that confirms an action.

- A part comes with its member: ${f.m('Table')} allows ${f.part('Table', 'Row')}.
- A shorter list gives a shorter card, fewer choices and a check that refuses the rest.
- With no list, every member the framework draws is allowed but ${f.m('ThirdParty')}, which holds
  whatever the host puts in it, and, in React, ${f.m('Toast')}.

To refuse links and remote pictures, leave out every member that takes an address. No option of
the card, the check or the renderers refuses an address and keeps its member. The members are
${all(refused)}, and ${f.m('Markdown')}, which draws the links and pictures its text writes and has
no prop that refuses them. ${f.m('Card')} is one for its ${f.p('Card', 'href')}: group content
under a title with ${f.m('Stack')} and ${f.m('Heading')}, as the list above does.

## 4. Build the system prompt: the card, then the host's rules

\`\`\`ts
// prompt.ts, on the server.
import { runtimeCard } from '@polymorph/screen/card'

import { MEMBERS } from './screen-members'

// The same release, framework and members give the same text, so it is built once.
export const CARD = runtimeCard({ members: MEMBERS })

// What only this host knows. A document's action is a name the host maps to its own handler,
// so the rules name each action the host handles and the fields it reads.
export const RULES = [
  'Actions this host handles:',
  '- requestRefund, of type () => void, bound to the Button that asks for a refund. It reads the fields amount (a NumberInput) and reason (a Textarea).',
  'Any other action you declare is sent back to you as the next turn.',
  'Never say that a refund is made or approved. The host asks the person to confirm it, and tells you what happened.',
].join('\\n')
\`\`\`

Send the card first and unchanged, then the rules, as the system prompt, and mark the end of the
two for the provider's prompt cache. The card says what the check and the renderer hold a document
to, so the host adds to it after it and never edits it. The card names no action: the model names
each callback input itself, so the rules declare the names the host handles. A cache holds the longest prefix that is
the same in every request, so what differs between requests, such as the host's data and the
person's words, goes after both, in the messages. A provider caches only above a minimum length,
which a card for a few members may not reach. The model needs no tool to write a lawful document.

For \`<poly-screen>\`, pass \`framework: 'elements'\` too. The card lists each allowed member with its
props, parts and lawful cells, the data types and icon roles they take, and the output contract:
one document in a fenced \`json\` block. The system card the \`card\` verb prints is for a coding
agent and never goes in a run-time prompt.

## 5. Ask for a screen

The person's request is the message. When the screen should show the host's data, the message names
each key the host holds, with its type: a document binds a data input by the key's name.

\`\`\`ts
const message = [
  'I want a refund for order 1042.',
  'Data you can bind, by input name: order (string, the order number as the person reads it).',
].join('\\n\\n')
\`\`\`

The model answers with prose, a document, or both:

\`\`\`json
${REFUND}
\`\`\`

## 6. On the server: call the model, check the whole answer, ask once more

\`\`\`ts
// ask.ts, on the server that calls the model.
import { checkScreen } from '@polymorph/screen/check'
import { parsePartial } from '@polymorph/screen/partial'

// Stand-in: your call to the model. It sends CARD and RULES as the system prompt and \`turns\` as
// the conversation, calls \`onText\` with the answer so far each time more arrives, and resolves
// with the whole answer. A Turn is { role: 'user' | 'assistant', content: string }.
import { askModel, type Turn } from './model'
import { MEMBERS } from './screen-members'

/** Answers the conversation, and asks once more, with the faults, when its document is not lawful. */
export async function answer(turns: Turn[], onText: (text: string) => void): Promise<Turn[]> {
  const first = await askModel(turns, onText)
  const answered: Turn[] = [...turns, { role: 'assistant', content: first }]
  const read = parsePartial(first)
  // No fence and no object: the answer is prose only. It is lawful, and there is no screen.
  if (read.document === undefined) return answered
  const { ok, faults } = checkScreen(read.document, { members: MEMBERS })
  if (ok && read.complete) return answered
  const lines = faults.map((fault) => \`\${fault.path}: \${fault.message}\`)
  if (!read.complete) lines.push('$: the answer ended before the document closed')
  const retry: Turn[] = [
    ...answered,
    { role: 'user', content: \`Your screen has these faults. Answer with the corrected document.\\n\${lines.join('\\n')}\` },
  ]
  // Once: a second answer is drawn as it is, and the renderer leaves out what it refuses.
  return [...retry, { role: 'assistant', content: await askModel(retry, onText) }]
}
\`\`\`

- ${partial} reads the document from the first fence marked \`json\` or unmarked, or from the
  first brace that opens an object when the answer has no fence. For an answer with neither,
  \`document\` is \`undefined\`: the answer is prose, which is lawful and needs no retry.
- \`complete\` is whether the document's outermost brace has closed. An answer that ends inside the
  document, at a token limit or a dropped stream, is cut short. The check reads only what arrived,
  which can be lawful as far as it goes, so the host names the cut itself.
- ${check} returns \`{ ok, faults }\`, each fault \`{ path, message }\` in words a model corrects from
  (\`\`no component called \`Modal\` — did you mean \`Dialog\`, …?\`\`). It reads what the renderer
  does not: variant and tone cells, icon roles and the usage rules.

## 7. On the page: draw the prose and the screen while they stream

\`\`\`tsx
import { useState } from 'react'
import * as members from '@polymorph/react-ui'
import { parsePartial, ScreenView, type ScreenAction } from '@polymorph/react/screen'

import { proseOf } from './prose'
import { MEMBERS } from './screen-members'
// Stand-in: posts the person's message, or an action, to your server, which adds it to the
// conversation and calls \`answer\` (step 6). It calls \`onText\` with the answer so far as it
// streams back, and resolves when the answer ends.
import { streamTurn } from './server'

const { PromptInput, Stack, StreamingText } = members

export function Assistant({ data }: { data: Record<string, unknown> }) {
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(true)

  const send = async (message: string) => {
    setDone(false)
    await streamTurn(message, setAnswer)
    setDone(true)
  }

  const onAction = (action: ScreenAction) => {
    void send(\`An action from the screen: \${JSON.stringify(action)}\`)
  }

  const { document } = parsePartial(answer)
  const prose = proseOf(answer, document)

  return (
    <Stack gap={4}>
      {prose !== '' && (
        <StreamingText streaming={!done && document === undefined}>{prose}</StreamingText>
      )}
      {document !== undefined && (
        <ScreenView
          text={answer}
          streaming={!done}
          members={members}
          allow={MEMBERS}
          data={data}
          onAction={onAction}
          onFault={(fault) => console.warn(fault.path, fault.message)}
        />
      )}
      <PromptInput label="Message" streaming={!done} onSubmit={(text) => void send(text)} />
    </Stack>
  )
}
\`\`\`

- ${react('ScreenView')} applies \`allow\` and the run-time rules as it draws: a member outside the
  list, a prop the member lacks, a refused address and a value where a function goes are left out
  and reported. Without \`allow\` it draws every member React draws but ${f.m('ThirdParty')} and
  ${f.m('Toast')}, so the page gets the server's list.
- No export returns the prose. \`proseOf\` in [references/api.md](references/api.md) takes the
  text outside the fence. ${f.m('StreamingText')} draws it as it is. ${f.m('Markdown')} draws the
  links its text writes, so it is for a host that allows links.
- Draw ${react('ScreenView')} only when the answer holds a document. Given none, with \`streaming\`
  off, it reports \`the document has no root element\` at \`$.root\`.
- \`streaming\` is on while the answer arrives and off when it ends, so an answer cut short reports
  what it lacks. Left out, an answer that stops early never reports.
- An element is drawn once every prop it requires is written, and stays drawn, so a field keeps its
  text and focus while the answer grows. A new answer replaces the screen from its first element.
  [references/contract.md](references/contract.md) says what new \`data\` and a replaced document
  keep.

## 8. Handle each action

The person types 40 and a reason and presses the button. \`onAction\` is called with a
${f.x('ScreenAction', '@polymorph/screen/walk')}:

\`\`\`json
{ "name": "requestRefund", "args": [], "values": { "amount": 40, "reason": "It arrived broken." }, "changed": ["amount", "reason"] }
\`\`\`

| Field | What it is |
| --- | --- |
| \`name\` | the callback input the document bound, which the member called |
| \`args\` | what the member passed, as JSON. An event is dropped: a ${f.m('Button')}'s ${f.p('Button', 'onClick')} gives \`[]\` |
| \`values\` | every control with a \`name\`, on screen or not: what the person chose, else the document's or host's value, else its default, else its type's empty value |
| \`changed\` | the names in \`values\` whose value the person chose |

- \`values\` is JSON. ${f.m('NumberInput')} gives a number, or \`null\` while empty. ${f.m('Input')}
  gives text for every \`type\`, ${f.v('Input', 'type', 'number')} included.
- Map each name the rules declared to the host's own handler. Send any other action to the model as
  the next turn, as step 7 does; the next answer is the next screen.
- An action is the document's word, not the person's: the model chose its \`name\`, and each value
  is what a control holds. An action with consequences, such as a refund, a deletion or a message
  sent, opens the host's own ${f.m('ConfirmDialog')}, written from the host's data, and the server
  authorises and checks again before it acts, once for each idempotency key.
  [references/contract.md](references/contract.md) has the pattern.
- An action does not prove that a person acted: ${f.m('Countdown')} calls
  ${f.p('Countdown', 'onEnd')} when its time is reached, and an agent on the page presses as a person
  does, each with an empty \`changed\`. Bound how many model turns actions may start in a row, so a
  screen that calls its own action as it is drawn cannot loop.
- A promise \`onAction\` returns is what a member that waits on its callback waits on: a
  ${f.m('ConfirmDialog')} in the document stays open and busy until it settles. A ${f.m('Button')}
  does not wait.

## 9. Look at an answer while you build

Save an answer's document to a file, and draw it, validate it or read a member with the CLI:
[references/api.md](references/api.md) has the commands and what each does not apply.

## What a document cannot do, and what stays the host's job

Nothing a document holds runs or is inserted as markup, a callback prop takes only a function the
screen makes, an address is relative, a fragment, or \`http:\`, \`https:\`, \`mailto:\` or \`tel:\`, and a
fault takes out only the element it is in. These stay the host's job:

- What an action means, and confirming one with consequences.
- The host's own data inside a bound value, addresses included: it is passed as the host gave it.
- Where an allowed link leads and where a picture loads from: an \`https:\` address can name any
  site.
- Ids and names: a document can set an \`id\` and a control's \`name\`, so draw the screen outside the
  host's own \`<form>\`.
- The words: a screen shows any text the model writes and asks for any field it names. Treat
  \`values\` as input from the page.

[references/contract.md](references/contract.md) has each rule, every fault, the limits, and how a
run-time document differs from a spec \`emit\` compiles.

## What a request costs

| Part | What it costs |
| --- | --- |
| The card | input on every request: over ${overFew} tokens for the list in step 3, over ${overAll} with every member React draws, at four characters to a token. After the first request a prompt cache holds it (step 4) |
| The host's rules | input on every request, held in the cache with the card |
| The conversation | input on every request: each earlier message and answer, documents included |
| The answer | output: the prose and the document the model writes |
| A retry | one more request: the same prefix, the conversation with the first answer and the fault list, and a second answer |
| An action | nothing, unless the host sends it to the model. One the host handles itself, such as \`requestRefund\`, costs no model call; telling the model the outcome is one request |

A request's price is these counts at the provider's rates for input, cached input and output; the
provider's response reports each count. Measure the card for your list from a directory where
\`@polymorph/screen\` is installed (step 2), as the import fails anywhere else:

\`\`\`sh
node --input-type=module -e "import { runtimeCard } from '@polymorph/screen/card'; console.log(runtimeCard({ members: [${quoted}] }).length)"
\`\`\`

The page pays once, in what it loads:

- **React**: \`@polymorph/react/screen\` adds the renderer and the vocabulary table to the bundle.
  \`import * as members\` adds every member; a map of the allowed ones (\`{ Stack, Heading, … }\`)
  adds only those. The card and the validator come only where imported.
- **\`<poly-screen>\`**: the first to connect fetches the renderer and the vocabulary table, each
  member's code loads when its element first renders, and the validator on the first check.
`
  return [
    {
      path: 'polymorph-runtime-screen/SKILL.md',
      contents: skill(
        'polymorph-runtime-screen',
        'Let a product answer with real interface while it runs. A model writes a ' +
          'polymorph-screen/1 document, the server checks it with checkScreen, the page draws it ' +
          'as it streams with ScreenView from @polymorph/react/screen or the <poly-screen> ' +
          'element from @polymorph/elements-ui/screen, and each press or submit becomes an ' +
          'action the product handles. Use when asked for generative UI, to render a model or ' +
          'agent response as components, to let an assistant show a form, a choice or a ' +
          'confirmation, or when code imports @polymorph/screen, runtimeCard, parsePartial, ' +
          'ScreenView or loadScreen. Covers the members a model may use and refusing links and ' +
          'images, the card and the host’s rules in the system prompt, checking and asking ' +
          'again, drawing the prose and the screen while they stream, actions and values, ' +
          'confirming an action with consequences, and what a request costs.',
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
    {
      path: 'polymorph-runtime-screen/references/api.md',
      contents: apiReference(registry, run),
    },
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

Like \`ScreenView\`, it applies its \`members\` and the run-time rules as it draws, whatever the server
checked, and it draws only the document. Show the prose with \`proseOf\` (references/api.md) in an
element of the page's own, as text.

## In an app with a bundler

1. Add \`@polymorph/elements\` and \`@polymorph/elements-ui\` to \`package.json\` under the alias and
   version the other polymorph packages use (\`npm:@metamorph-labs/polymorph-elements-ui@^<version>\`),
   and \`@polymorph/screen\` on the server that builds the card. Run the project's install.
2. Import \`@polymorph/elements-ui/screen\` once. It defines \`<poly-screen>\` and every \`poly-*\`
   element; each member's code loads the first time one of its elements renders.
3. Write \`<poly-screen></poly-screen>\` in the template, as any custom element. In Vue, make
   \`compilerOptions.isCustomElement\` accept the \`poly-\` tags; in Angular, add
   \`CUSTOM_ELEMENTS_SCHEMA\` to the component's \`schemas\`.
4. Take the element through the framework's template ref, once it is mounted, and connect it:

\`\`\`ts
import type { PolymorphEvent } from '@polymorph/elements'
import { ACTION_EVENT, FAULT_EVENT, type PolyScreen, type ScreenAction } from '@polymorph/elements-ui/screen'

import { MEMBERS } from './screen-members'
// Stand-in: posts the message to your server, which calls \`answer\` (the skill's step 6) and
// streams the answer back. It calls \`onText\` with the answer so far, and resolves when it ends.
import { streamTurn } from './server'

/** Draws the model's answers in a \`<poly-screen>\` the page or a template wrote, and sends each action back. */
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
    void send(\`An action from the screen: \${JSON.stringify(action)}\`)
  })
  screen.addEventListener(FAULT_EVENT, (event) => console.warn((event as CustomEvent).detail))
  return send
}
\`\`\`

On the server, \`answer\` from the skill's step 6 builds the card and checks for the elements:

\`\`\`ts
const CARD = runtimeCard({ framework: 'elements', members: MEMBERS })
const { ok, faults } = checkScreen(read.document, { framework: 'elements', members: MEMBERS })
\`\`\`

\`@polymorph/elements-ui/screen\` exports the same functions bound to the elements, for code in the
page: ${elements('drawScreen')} draws into a plain element, and ${elements('PolyScreen')},
${elements('ACTION_EVENT')} and ${elements('FAULT_EVENT')} are the element's class and its events.

## On a page with no build

A page with no build loads the elements from files the project copied into \`public/polymorph/\`
when it was set up (the \`polymorph-setup\` skill). The page links \`polymorph.css\` and its theme
sheet, then loads \`polymorph.js\` as a module script. \`polymorph.js\` defines \`<poly-screen>\`,
and the first one to connect fetches the renderer.

\`\`\`html
<poly-screen id="assistant" members="${EXAMPLE_MEMBERS.join(' ')}"></poly-screen>

<script type="module">
  // Stand-in: posts the message to the page's server, which calls the model with the card for the
  // elements and checks the answer. It calls \`onText\` with the answer so far, and resolves when it ends.
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
  const check = f.x('checkScreen', '@polymorph/screen/check')
  return `# The run-time contract

What a document does at run time is decided once, in the walk every renderer draws from, so a
document behaves the same in React and as elements.

## An action with consequences

An action is a name and the form's values. The model chose the name, and each value is what a
control holds, so neither is the person's decision. A host that moves money, deletes or sends on an
action does four things:

1. Maps the name to its own handler. The rules in its system prompt declare the names it handles.
2. Reads \`values\` as input from the page: checks each value's type and range against its own data.
3. Opens its own ${f.m('ConfirmDialog')}, outside the screen, controlled by
   ${f.p('ConfirmDialog', 'open')} and ${f.p('ConfirmDialog', 'onOpenChange')}. Its words come from
   the host's data and the values, never from the document. An agent on the page cannot confirm
   it: the confirm is the person's.
4. Sends the request to its server with an idempotency key made when the dialog opens. The server
   authorises the person, reads the order from its own records, checks the amount again, and acts
   at most once for each key, so a confirm pressed twice or a request sent again refunds once.

\`\`\`tsx
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
      send(\`An action from the screen: \${JSON.stringify(action)}\`)
      return
    }
    const { amount, reason } = action.values
    if (typeof amount !== 'number' || amount <= 0 || amount > order.refundable) {
      send(\`The host refused the refund: the amount must be above 0 and at most \${order.refundable}.\`)
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
        title={\`Refund order \${order.number}?\`}
        description={asked === null ? '' : \`\${money(asked.amount)} goes back to the card that paid for this order.\`}
        confirmLabel="Refund"
        onConfirm={async () => {
          if (asked === null) return
          const outcome = await refund({ order: order.id, ...asked })
          send(\`The host's refund: \${outcome}\`)
        }}
      />
    </Stack>
  )
}
\`\`\`

- The promise ${f.p('ConfirmDialog', 'onConfirm')} returns keeps the confirm busy and the dialog
  open until it settles. The dialog closes when it resolves, and stays open when it rejects.
- Sending the outcome to the model is a request; the model's next screen then reads what happened
  from the host.

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
switch, \`""\` for text. A value is what the member reports: ${f.m('NumberInput')} a number,
${f.m('Input')} text for every \`type\`.

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
| \`the document has no root element\`, at \`$.root\` | The answer ended with no document, or none that holds a root. Draw the renderer only for an answer that holds one |

A fault in the root element leaves nothing to draw. \`faults="inline"\` draws each fault in its
node's place, which helps while building a host.

## Addresses

A string at a prop or object key that takes an address (\`avatar\`, \`href\`, \`nextHref\`,
\`previousHref\`, \`src\`, \`srcSet\`) is relative (\`/orders/1042\`, \`?page=2\`), a fragment
(\`#reason\`), or has the scheme \`http:\`, \`https:\`, \`mailto:\` or \`tel:\`. Any other scheme is a
fault and is not passed. An address with a control character anywhere is refused whole, and spaces
at either end are stripped before the scheme is read. Each address in a \`srcSet\` is held to the
same rule. The rule covers the document's values and a value a binding puts directly at an address;
it does not reach into an object the host binds whole. No option refuses every address: a host
that allows no link and no picture leaves out the members that take one (the skill's step 3).

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
- Who called an action (the skill's step 8).
- What ${check} cannot see: it reads only the document, so what the walk refuses from the
  host's data (an address, a function) is reported by the renderer, not the check.

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
`
}

/** Every export, prop, attribute and event, for a host that needs more than the procedure. */
function apiReference(registry: Registry, run: string): string {
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

No option refuses addresses while keeping the members that take them. \`checkScreen\` returns
\`{ ok, faults }\`, each fault \`{ path, message }\`. \`outputContract\` is the card's last part alone.

\`parsePartial(text)\` returns:

| Field | What it is |
| --- | --- |
| \`document\` | the document so far; \`undefined\` before its first brace, and for an answer that is prose only |
| \`complete\` | whether the document's outermost brace has closed; \`false\` for an answer that is prose only |
| \`open\` | the path of the string still being written, or \`null\` |
| \`cut\` | the path of the innermost value the text ends inside, or \`null\` |
| \`error\` | \`{ at, message }\` where the text stops being JSON, or \`null\` |

It reads the first fence marked \`json\`, or unmarked, and the first brace that opens an object when
the text has no fence. A name, a number, \`true\`, \`false\`, \`null\` and a binding are left out until
whole; a string a person reads is kept while it is written. It returns no prose.

\`createScreen(options)\` is for a renderer of your own: \`document\`, \`vocabulary\`, \`framework\`,
\`members\`, \`data\`, \`fill\` (\`absent\` or \`sample\`), \`streaming\`, \`open\`, \`cut\`, \`onAction\` and
\`onFault\`. It returns a ${walk('Screen')}: \`root\`, \`faults\`, \`values\`, \`changed\`, \`fills\`,
\`streaming\`, \`update(change)\`, \`subscribe(listener)\` and \`fail(fault)\`.

## The model's prose

No export returns the text around the document. This helper takes it, for the page to draw as text
beside the screen. A line of three backticks opens and closes a fence; the card asks for one fenced
block, so the first is the document's.

\`\`\`ts
// prose.ts

/** A line that opens or closes a fenced block. */
const FENCE = /^[ \\t]*\`{3}.*$/gm

/** A last line of one or two backticks: a fence still being written. */
const OPENING = /(?:^|\\n)[ \\t]*\`{1,2}$/

/**
 * The text of a model's answer outside the fenced block that holds its document: the prose before
 * it, and after it once it closes. \`document\` is what \`parsePartial\` read from the same answer.
 */
export function proseOf(answer: string, document: unknown): string {
  const fence = new RegExp(FENCE)
  const open = fence.exec(answer)
  // No fence: prose, unless the document was written bare.
  if (open === null) return document === undefined ? answer.replace(OPENING, '').trim() : ''
  const close = fence.exec(answer)
  const after = close === null ? '' : answer.slice(close.index + close[0].length)
  return [answer.slice(0, open.index), after]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\\n\\n')
}
\`\`\`

Draw it with ${f.m('StreamingText')}, which draws text as it is, with
${f.p('StreamingText', 'streaming')} on until the document begins. ${f.m('Markdown')} draws the links
and pictures its text writes and has no prop that refuses them.

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
| \`streaming\` | whether more is to come. With \`text\`, whether its document has not closed, unless given. Off while chunks still arrive, each chunk is a new whole document whose faults are told again |
| \`data\` | the host's data by input name |
| \`allow\` | the members a document may use. Read when the screen is made. Absent, every member React draws but \`ThirdParty\` and \`Toast\` |
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

## The tools while you build

Save an answer's document to a file to look at it:

${commands(run, `render answer.json --system ${DEFAULT_SYSTEM} --data data.json`, 'validate answer.json --framework react', 'component FormField --framework react')}

- \`render\` draws it with the React members, every member allowed, and reports layout faults.
  \`--data\` takes a JSON file of the host's data by input name. It does not apply the host's list
  or report a run-time fault, such as a refused address.
- \`validate\` checks it as \`emit\` would: names, props, values, cells and usage rules. It does not
  apply the host's list or the run-time rules; only \`checkScreen\` does.
- \`component\` prints what a member takes. No verb prints the run-time card.
`
}
