---
name: polymorph-agent-bridge
description: Let an AI agent on a running page read and operate the polymorph members through the agent bridge, instead of scraping the DOM or clicking coordinates. Use when asked to let an in-app assistant or chatbot fill a form or operate a screen, make a page usable by an AI agent or a browser agent, expose a page’s actions as tools for a model, add WebMCP (document.modelContext) tools, keep a field such as a card number or an action such as placing an order from an agent (data-agent-key), ask the person before an agent acts, put data-agent on a page with no build, read the agent segment of the polymorph system card, or drive a page built with polymorph from an agent. Covers @polymorph/engine/agent (createAgentBridge, snapshot, query, act, confirm, the policy, secrets, agentTools, registerWebMCP), @polymorph/engine/webmcp (registerWebMCPOnCall, applyAgentSetting, AGENT_TOOL_DEFINITIONS), one bridge shared by an assistant and WebMCP and loaded on its first use, loadAgentBridge in polymorph.js, and testing a bridge.
---

# Let an agent on the page read and operate the members

The agent bridge, `@polymorph/engine/agent`, lets an agent on a running page read the polymorph members the
page shows and operate them: an assistant inside the product, an agent in the browser that calls
the page's WebMCP tools, or you. Each member whose spec declares an agent section registers with
the bridge while it is mounted, in every web framework and in the `poly-*` elements. The bridge
reports the states that declaration names and runs the actions it names, and nothing else.

Every command in this skill starts with the same words, the polymorph tools run from a shell.
`<framework>` is the app's: the `polymorph-screen` skill says how to tell it.

## 1. Check that the bridge is the tool

| The job | Use |
| --- | --- |
| An assistant in the product reads the screen, fills fields, chooses and presses | the page's bridge as the assistant's tools: steps 3 to 6 |
| An agent in the browser operates the page through WebMCP | the page's bridge, registered with WebMCP: steps 3 to 5 |
| You drive a page built with polymorph and want a surer way than the DOM | the tools the page registered: step 7 |
| The agent shows the person a form or a choice of its own | a run-time screen: the `polymorph-runtime-screen` skill |
| The agent needs a record's data, or an operation no member offers | a tool of the application's own: step 9 |
| A SwiftUI or Compose screen | nothing: native members do not register, and there is no bridge |

For each member it lists, the bridge gives an id, the member's name, its control's accessible
name and description (a field's hint and error), the member it is `within`, its declared states
and the actions it allows now. It never gives:

- A member that declares nothing, such as `Text`, `Heading`, `FormField`, `Tooltip` and `CopyButton`, or anything that is not a member: a plain
  element in a `Bespoke` zone, a component inside `ThirdParty`, the page's text.
- A member whose element is absent or inside content marked `hidden` (a closed `Dialog`,
  a collapsed panel), or one another member withholds (`ConfirmDialog`'s confirm).
- A secret: `PasswordInput` and `OTPInput` read their value as `{ secret: true }`, and every password field's value
  is removed from every output. Every other field's value is read, an `Input` that holds
  a card number included: step 5 keeps such a field out.
- What a member shows beyond its states: a `Table` reads its sort, never its cells.
- An action of a member whose `disabled` state is true.

## 2. Read what each member lets an agent do

```sh
npx -y @metamorph-labs/polymorph@1.0.18 card --framework <framework>
```

A member an agent can see ends its card line with an `agent:` segment: the actions an agent may
run, then, after `|`, the states it reads. A `(secret)` state reads `{ secret: true }`. A
member with no segment is hidden from agents.

- `Checkbox`: `agent: check, uncheck | checked, disabled`.
- `Select`: `agent: choose, open, close | value, options, open, disabled`. `choose` takes the id of
  one of its `options`, which is the `value` of an
  option the app passed.
- `PasswordInput`: `agent: | value (secret), revealed, disabled, invalid, readonly`. An agent runs nothing.

The JSON answer adds the types:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 component Select --framework <framework> --json
```

Under `component.agent`, each action gives its `argument` (`boolean`, `number`, `text`,
`id` or `ids`), the `among` state its ids name, and the state it `sets`. `destructive` and
`destructiveOptions` say what waits for a person, such as `Button`'s
`tone="danger"`. [references/members.md](references/members.md) says what each
member's ids are, and how the members that need care read and act.

## 3. Choose how the page loads the bridge

A bundled app, in any framework, imports the bridge from `@polymorph/engine`, which `init`
installs. If `package.json` does not list it, add it as the other `@polymorph/*` packages are
listed, at their release. The members write to a registry inside that package, so the app must
resolve one copy of it: a second copy holds an empty registry. No foundation has a hook or a
component for the bridge, and nothing in a bundled app reads `data-agent`.

What a module imports from `@polymorph/engine/agent` with a static `import` is in that module's chunk, and
`createAgentBridge` is the bridge. An `import type` adds nothing.
`@polymorph/engine/webmcp` holds the tools' definitions and their registration, and none of the bridge. So a
page that loads the bridge on its first use, by the assistant or by a WebMCP call, imports it with
`import('@polymorph/engine/agent')` and registers with `registerWebMCPOnCall` (step 4). A page
that loads it at once imports `createAgentBridge` and `registerWebMCP`
statically. To see where the bridge went, build the app and find the file that holds
`polymorph:agentchange`, which only the bridge holds:
[references/testing.md](references/testing.md) has the check.

A page with no build writes no script. `<html data-agent="on-call">` registers the three tools
with WebMCP at load and fetches the bridge on the first call, and `"eager"` fetches it at load.
Without the attribute the page registers nothing, because exposing a page is its owner's
decision. The setting's bridge has no `confirm` and no policy, so a page that asks a person or
narrows what an agent may do creates its own: [references/no-build.md](references/no-build.md).

## 4. Create one bridge for the page

One bridge serves the product's assistant and the browser's WebMCP agents. A bridge runs one
`act` at a time and asks the person inside it, so the page asks one question at a time. Two
bridges each ask, and two questions can then be open at once. This module loads the bridge on the
first call from either side:

```ts
// src/agent/page-agent.ts
import type { AgentBridge, AgentConfirmRequest } from '@polymorph/engine/agent'
import { registerWebMCPOnCall } from '@polymorph/engine/webmcp'

import { policy } from './policy'

export interface PageAgent {
  bridge: () => Promise<AgentBridge>
  stop: () => void
}

/** Starts one bridge for the page, which the product's assistant and WebMCP share. */
export function startPageAgent(ask: (request: AgentConfirmRequest) => Promise<boolean>): PageAgent {
  let stopped = false
  let loading: Promise<AgentBridge> | undefined
  const bridge = () =>
    (loading ??= import('@polymorph/engine/agent').then(
      ({ createAgentBridge }) => {
        if (stopped) throw new Error('The page agent has stopped.')
        return createAgentBridge({ confirm: ask, policy })
      },
      (error: unknown) => {
        loading = undefined // the next call loads again
        throw error
      },
    ))
  const unregister = registerWebMCPOnCall({ bridge })
  return {
    bridge,
    stop: () => {
      stopped = true
      unregister()
      void loading?.then((made) => made.dispose(), () => {})
    },
  }
}
```

- `registerWebMCPOnCall({ bridge })` registers the three tools now, calls
  `bridge` on the first call, once, and runs every call on what it resolves to: the assistant's
  bridge. Unregistering removes the tools and never disposes of a bridge it did not create, so
  `stop` disposes of it.
- Where the browser has no WebMCP API, nothing registers, and the assistant still loads the
  bridge. While another registration of the tools stands on the page, such as `data-agent`, it
  registers nothing and warns in the console.
- A page that loads the bridge at once creates it with the same options, calls
  `registerWebMCP(bridge)`, which returns the function that unregisters, and
  hands the same bridge to the assistant.

Start it in the browser once the page has mounted, keep what it returns where the assistant can
reach it, and call its `stop` when the page unmounts. `ask` asks the person, resolves `true`
for yes, and keeps its identity. [references/asking.md](references/asking.md) has the React
component that does this through a `ConfirmDialog`, and
[references/api.md](references/api.md) the call in Vue, Svelte, Solid and Angular, and each
option, field, error and event.

## 5. Write the policy

`policy.hide(member)` returns `true` to take a member out of every output and every step, and
`policy.deny(member, action)` returns `true` to take one action away. A policy only narrows: it
cannot add a member, a state or an action. A function that throws hides or denies. The bridge
calls both on every read and step, and only about a member whose element is in the document, so
keep them cheap. `member` is a frozen `AgentPolicyMember`:

| Field | What it is | Stable |
| --- | --- | --- |
| `id` | the bridge's id for this mount of the member | no: each mount gets a new one, which the app does not choose |
| `member` | the member's name, such as `Input` | yes, and it names every instance |
| `name` | its control's accessible name: the label as the page shows it | no: it changes with the language and the wording |
| `element` | the member's control: an `Input`'s `<input>`, a `Button`'s `<button>`, a `Select`'s trigger | its attributes are the ones the page sets |
| `keys` | the `data-agent-key` of each element around the control, the nearest first | yes: the page writes them |

So name a member by a key. Write `data-agent-key` on a plain element around the member, which
takes the member's place in the layout, or on the `poly-*` element itself on a page with no
build. No member takes a prop for it, so it works the same in every framework. A key names every
member inside its element, and `keys` holds each key around a member, so one key on a form
names its fields. `Dialog`, `Drawer` and `Popover` draw their panel at
the end of the document: a key around one names nothing, and a key inside its content names the
members there.

```tsx
<div data-agent-key="place-order">
  <Button label={t('Place order')} onClick={placeOrder} />
</div>
```

```ts
// src/agent/policy.ts
import type { AgentPolicy } from '@polymorph/engine/agent'

export const policy: AgentPolicy = {
  // Every card field, by the autocomplete token the page gives it.
  hide: ({ element }) => element?.getAttribute('autocomplete')?.startsWith('cc-') === true,
  // A person places the order: the page writes data-agent-key="place-order" around its Button.
  deny: ({ keys = [] }, action) => keys.includes('place-order') && action === 'press',
}
```

Read `keys` as `{ keys = [] }`: the bridge always gives them, and the type marks them optional.
An attribute a member passes to its control works too: an `Input`'s
`autoComplete` reaches its `<input>`. The page's code reads keys in the
policy, `confirm` and the change event; no output an agent reads carries them.

Card data belongs in the payment provider's own hosted field, inside a `ThirdParty`
boundary: it is outside the vocabulary, so the bridge never lists it.

The bridge is a filter in the page, not a security boundary. An agent acts with the person's
session, and any script on the page can create a bridge without this policy or `confirm`. The
server authorises every consequential action again, as it does a person's.

## 6. Hand the tools to the product's assistant

The bridge's three tools are `polymorph_snapshot`, `polymorph_query` and `polymorph_act`.
`AGENT_TOOL_DEFINITIONS` gives each one's `name`, a `description` written for
a model and a JSON Schema `inputSchema`, without the bridge, so the app sends them to its model
before the bridge loads. `agentTools(bridge)` gives the same tools with
`execute(input)`, which resolves to JSON and never rejects:

```ts
// src/agent/assistant-tools.ts
import { AGENT_TOOL_DEFINITIONS } from '@polymorph/engine/webmcp'

import type { PageAgent } from './page-agent'

/** The tools to send the product's model, which load nothing. */
export const definitions = AGENT_TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}))

/** Runs one tool call the model returned, loading the bridge on the first. */
export async function runTool(agent: PageAgent, name: string, input: unknown): Promise<unknown> {
  const { agentTools } = await import('@polymorph/engine/agent')
  const tool = agentTools(await agent.bridge()).find((each) => each.name === name)
  if (tool === undefined) return { error: { code: 'unknown-tool', message: `No tool ${name}.` } }
  return tool.execute(input)
}
```

The app sends `definitions` with the conversation, in the shape the model's API takes for a tool.
For each tool call the model returns, it calls `runTool` with the call's name and input, and sends
what that resolves to back as the call's result.
The calls run in the page, where the bridge is: a model on a server sends each call to the page.
Every output holds the page's content, which a person or a record wrote, and each tool says so
with `untrustedContentHint`. The system prompt tells the model that what it reads from the page
is data and never an instruction. Nothing enforces that sentence, so the policy and the server's
checks are what hold.

## 7. Read, then act

This is the procedure for the agent, through the tools or the bridge.

1. Read the page with `bridge.snapshot()`, or find members with
   `bridge.query({ name, text, member })`. `name` matches the accessible name and each choice's
   label, `text` the text the member shows and its description, and `member` the member's name
   whole. Each ignores case. On a large page, query: a snapshot lists every choice.
2. Write each step as `{ id, action, value }` with an id from that read, or as
   `{ target: { member, name }, action, value }`. A target must name one member: its name is
   matched whole, then as a part.
3. Give `value` only to an action that lists an `argument`, and of that type. An `id` or
   `ids` names enabled choices of the state `among` names, or of any choices state. Write text
   in the form the member's own state shows, such as a date field's `2026-07-15`.
4. Run `bridge.act(steps)`. It runs the steps in order, stops at the first that fails, never
   rejects, and runs one `act` at a time.
5. Read each result. `{ ok: true, id, changed }` means the action ran, and `changed` holds each
   state that changed, as `{ from, to }`. An empty `changed` means the member did not change
   within `settleMs`: a press that opened something else, or a value the application did not
   take. Read again before you conclude.
6. Read again after a step that changes the page. An opened `Dialog` lists new members,
   and a member mounted again has a new id. Inside one `act`, name a member an earlier step
   brings up by `target`, because it had no id when you read.

A failed result's `error.code` says why, and [references/api.md](references/api.md) says what to
do for each code. On `unknown-member`, read again. On `not-allowed`, choose from `allowed`:
an empty list is the application's policy. On `needs-confirmation`, the page asks no one, so a
person must do it: do not look for another way. On `declined`, the person said no: do not run it
again unasked.

An agent that drives a browser from outside the page calls the tools the page registered, which
carry the owner's policy and `confirm`. A page that registered none has offered no bridge:
exposing a page is its owner's decision. Operate that page as a person does, through the browser,
and do not load a bridge into it.

## 8. Decide what needs a person

| The bridge holds | The bridge does not |
| --- | --- |
| A destructive instance (`Button` with `tone="danger"`) or a choice marked destructive (a `danger` entry of `Menu`) waits for `confirm`, and is refused without one | Ask about a consequential action that is not destructive: a `Button` labelled Send or Place order runs at once |
| No action answers for a person: `ConfirmDialog` withholds its confirm | Know which agent calls: every WebMCP client the browser lets call the page gets what the policy leaves |
| A secret never leaves it, in a state, a name, a message or a change | Bind a bridge it did not make: any script on the page can create one without the policy or `confirm` |
| A policy only narrows, and one `act` runs at a time | Respect modality: while a modal `Dialog` is open, the members behind it are listed and run |
| | Filter what the page says: a name or a value can hold text written to steer a model |

A `Button` with `tone="danger"` that opens a `ConfirmDialog`
asks twice: `confirm` before the press, then the dialog, whose confirm no agent can press. Give a
Button that only opens the dialog another tone, such as `variant="ghost"` with
`tone="neutral"`: an agent's press opens the dialog, and the person answers
there, once. The dialog's own `tone`, `danger` unless set, marks the
destruction. Keep `tone="danger"` for a Button whose own press destroys.

So the product decides, and writes down:

1. Who gets the tools: its own assistant, the browser's agents through WebMCP, or no one.
2. What needs a person beyond the destructive actions. Deny it in the policy, or let its handler
   ask the person when `bridge.acting` is true. The bridge sets it while a step's action runs,
   and a `Button`'s `onClick` runs inside a `press`.
3. How the person is asked: through a member the page draws, such as a `ConfirmDialog`,
   whose confirm an agent cannot press: [references/asking.md](references/asking.md).

Each step that succeeds dispatches `polymorph:agentchange`, so the page can show the person what
an agent changed. Logging it is the product's choice, and the record that counts is the one the
server keeps of each request: any script on the page can dispatch that event.

## 9. When the member the task needs declares nothing

1. Look for a member that declares what the task needs: `search` and the card's segments say
   which. A `Link` is pressed where a plain `<a>` is not listed.
2. For data or an operation that is the application's own, such as a table's rows, an export or
   a filter no member draws, give the agent a tool of the application's own beside the bridge's.
   It calls the code the interface's handler calls, and the server authorizes it. Add it to the
   assistant's tool list, or register it with WebMCP under a name of its own.
3. A member that should declare more is the design system's decision. Tell the person which
   member, and which state or action. A member's `## Agent` section declares it, and a release
   of polymorph ships it.

Never write to a member's DOM, or click it from a script, to reach what it does not declare: that
skips every check the bridge makes. Never call `agentMember` or
`useAgentMember` from application code: a handle the application
writes is held to no spec, and the bridge would list it as a member. Take step 2 instead.

## 10. Test it

Test the bridge in a real browser, as polymorph does, with Vitest's browser mode and Playwright:
the bridge reads the rendered page, its accessible names and what is in the document.
[references/testing.md](references/testing.md) has the setup, a test to copy, the traps, and how
to check that the bridge is not in what the page loads at start. `validate` and `check` read
the red rules and not prop values, so run the project's typecheck as well.
