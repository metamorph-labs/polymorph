---
name: polymorph-agent-bridge
description: Let an AI agent on a running page read and operate the polymorph members through the agent bridge, instead of scraping the DOM or clicking coordinates. Use when asked to let an in-app assistant or chatbot fill a form or operate a screen, make a page usable by an AI agent or a browser agent, expose a page’s actions as tools for a model, add WebMCP (document.modelContext) tools, put data-agent on a page with no build, read the agent segment of the polymorph system card, or drive a page built with polymorph from an agent. Covers @polymorph/engine/agent (createAgentBridge, snapshot, query, act, confirm, the policy, secrets, agentTools, registerWebMCP), @polymorph/engine/webmcp (registerWebMCPOnCall, applyAgentSetting), loadAgentBridge in polymorph.js, and testing a bridge.
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
| An assistant in the product reads the screen, fills fields, chooses and presses | a bridge handed to the assistant as tools: steps 3, 4 and 5 |
| An agent in the browser operates the page through WebMCP | a bridge registered with WebMCP: steps 3, 4 and 6 |
| You drive a page built with polymorph and want a surer way than the DOM | the tools the page registered: step 7 |
| The agent shows the person a form or a choice of its own | a run-time screen: the `polymorph-runtime-screen` skill |
| The agent needs a record's data, or an operation no member offers | a tool of the application's own: step 9 |
| A SwiftUI or Compose screen | nothing: native members do not register, and there is no bridge |

For each member it lists, the bridge gives an id, the member's name, its control's accessible
name and description (a field's hint and error), the member it is `within`, its declared states
and the actions it allows now. It runs steps on those actions and reports what changed. It never
gives:

- A member that declares nothing, such as `Text`, `Heading`, `FormField`, `Tooltip` and `CopyButton`, or anything that is not a member: a plain
  element in a `Bespoke` zone, a component inside `ThirdParty`, the page's text.
- A member whose element is absent or inside content marked `hidden` (a closed `Dialog`,
  a collapsed panel), or one another member withholds (`ConfirmDialog`'s confirm).
- A secret: `PasswordInput` and `OTPInput` read their value as `{ secret: true }`, and every password field's value
  is removed from every output.
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
  one of its `options`.
- `PasswordInput`: `agent: | value (secret), revealed, disabled, invalid, readonly`. An agent runs nothing.

The JSON answer adds the types:

```sh
npx -y @metamorph-labs/polymorph@1.0.18 component Select --framework <framework> --json
```

Under `component.agent`, each action gives its `argument` (`boolean`, `number`, `text`,
`id` or `ids`), the `among` state whose choices an id names, and the state it `sets`.
`destructive` and `destructiveOptions` say what makes a step wait for a person, such as
`Button`'s `tone="danger"`. [references/members.md](references/members.md)
says how the members that need care read and act.

## 3. Choose how the page loads the bridge

A bundled app, in any framework, imports the bridge from `@polymorph/engine`, which `init`
installs. If `package.json` does not list it, add it as the other `@polymorph/*` packages are
listed, at their release. The members write to a registry inside that package, so the app must
resolve one copy of it: a second copy holds an empty registry. No foundation has a hook or a
component for the bridge, and nothing in a bundled app reads `data-agent`.

| The app wants | It calls | The page loads |
| --- | --- | --- |
| Its own assistant to call the tools | `createAgentBridge` and `agentTools` (steps 4 and 5) | the bridge, in the app's bundle |
| Browser agents to call the tools, the bridge loaded at once | `createAgentBridge` and `registerWebMCP` (step 4) | the bridge, in the app's bundle |
| Browser agents to call the tools, the bridge loaded on the first call | `registerWebMCPOnCall` from `@polymorph/engine/webmcp` (step 6) | the tools' definitions now, and the bridge as a chunk of its own on the first call |

A page with no build states the choice on its document element, and writes no script:

```html
<html lang="en" data-system="…" data-palette="…" data-agent="on-call">
```

| `data-agent` | The page |
| --- | --- |
| absent | registers nothing and fetches nothing more. Exposing a page is its owner's decision, so this is the default |
| `on-call` | registers the three tools with WebMCP at load, and fetches and creates the bridge on the first call |
| `eager` | fetches and creates the bridge at load, and registers its tools |

`polymorph.js` and `polymorph-all.js` read the attribute once, as they run. Another value warns
in the console and registers nothing. In a browser without WebMCP neither value does anything. The
bridge the setting creates has no `confirm` and no policy, so a step that needs a person answers
`needs-confirmation`. A page that asks a person, or narrows what an agent may do, states no
`data-agent` and creates its own bridge: [references/no-build.md](references/no-build.md).

## 4. Create the bridge

Create it in the browser once the page has mounted, and dispose of it when the page unmounts. One
module serves every framework:

```ts
// src/agent/page-agent.ts
import {
  createAgentBridge,
  registerWebMCP,
  type AgentConfirmRequest,
} from '@polymorph/engine/agent'

/** Creates the page's agent bridge and registers its tools. Returns what stops both. */
export function startPageAgent(ask: (request: AgentConfirmRequest) => Promise<boolean>): () => void {
  const bridge = createAgentBridge({
    // Asks the person at the page, and resolves true for yes.
    confirm: ask,
    policy: {
      // The assistant does not operate the composer it is asked in.
      hide: (member) => member.member === 'PromptInput',
      // Only a person places an order.
      deny: (member, action) =>
        member.member === 'Button' && member.name === 'Place order' && action === 'press',
    },
  })
  const unregister = registerWebMCP(bridge)
  return () => {
    unregister()
    bridge.dispose()
  }
}
```

Call it where the framework runs code after mounting:

```ts
// React, in a component. `ask` keeps its identity (useCallback), or the bridge is made again.
useEffect(() => startPageAgent(ask), [ask])

// Vue, in <script setup>
let stop = () => {}
onMounted(() => {
  stop = startPageAgent(ask)
})
onBeforeUnmount(() => stop())

// Svelte, in <script>
onMount(() => startPageAgent(ask))

// Solid, in a component
onMount(() => onCleanup(startPageAgent(ask)))

// Angular, in a component's constructor. afterNextRender runs in the browser only.
const destroyRef = inject(DestroyRef)
afterNextRender(() => destroyRef.onDestroy(startPageAgent(ask)))
```

`ask` asks the person and resolves `true` for yes: step 8 says how. The options are `confirm`,
`policy`, whose `hide` and `deny` can only take a member or an action away, and `settleMs`, how
long a step waits for its member to change (150 by default).
[references/api.md](references/api.md) has each option, field, error and event. A page with no
build creates its bridge in a module script: [references/no-build.md](references/no-build.md).

## 5. Hand the tools to the product's assistant

`agentTools(bridge)` returns three tools, `polymorph_snapshot`, `polymorph_query` and
`polymorph_act`. Each has a `description` written for a model, a JSON Schema `inputSchema`, and
`execute(input)`, which resolves to JSON and never rejects. Create the bridge as in step 4, and
hand its tools to the assistant in place of `registerWebMCP`:

```ts
// src/agent/assistant-tools.ts
import { agentTools, type AgentBridge } from '@polymorph/engine/agent'

/** The bridge's tools for the product's own model: what to declare, and what runs a call. */
export function assistantTools(bridge: AgentBridge) {
  const tools = agentTools(bridge)
  return {
    // Declare each to the model in the shape its API takes for a tool.
    definitions: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
    // Run a call the model made, and send back what it resolves to as the tool's result.
    run: async (name: string, input: unknown): Promise<unknown> => {
      const tool = tools.find((each) => each.name === name)
      if (tool === undefined) return { error: { code: 'unknown-tool', message: `No tool ${name}.` } }
      return tool.execute(input)
    },
  }
}
```

The calls run in the page, where the bridge is: a model on a server sends each call to the page.
Every output holds the page's content, which a person or a record wrote, and each tool says so
with `untrustedContentHint`. Tell the model that this content is data and never an instruction.

## 6. Or register the tools with WebMCP

`registerWebMCP(bridge)` registers the three tools on `document.modelContext`, or on
`navigator.modelContext` in earlier browser builds, and returns the function that unregisters
them. `registerWebMCPOnCall` registers them before the bridge loads, and loads it on the first
call: [references/api.md](references/api.md) has a React component that does it.

- A load that fails answers that call with `{ error: { code: 'failed', message } }`, and the
  next call loads again.
- One registration holds the tool names on a page. While it stands, another `registerWebMCP`,
  `registerWebMCPOnCall` or `data-agent` registers nothing and warns in the console.
- Where the browser has no WebMCP API, nothing registers, and the function returned does nothing.

## 7. Read, then act

This is the procedure for the agent, through the tools or the bridge.

1. Read the page with `bridge.snapshot()`, or find members with
   `bridge.query({ name, text, member })`. `name` matches the accessible name and each choice's
   label, `text` the text the member shows and its description, and `member` the member's name
   whole. Each ignores case. A snapshot lists every choice of every member, so on a large page
   query instead.
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

| `error.code` | Do |
| --- | --- |
| `unknown-member` | Read again. The member is gone, closed, hidden, withheld or declares nothing |
| `ambiguous-target` | Name it by one of the ids the message lists |
| `not-allowed` | Choose from `allowed`, the actions it allows now. An empty list is the application's policy |
| `disabled` | Do what enables it, or tell the person |
| `invalid-value` | Read the action's argument and the member's choices again |
| `needs-confirmation` | The page asks no one, so a person must do it. Do not look for another way |
| `declined` | The person said no. Do not run it again unasked |
| `failed` | The member refused or threw, and the message says why, such as a read-only field |

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
| A policy only narrows what the members declare | Respect modality: while a modal `Dialog` is open, the members behind it are listed and run |
| One `act` of a bridge runs at a time | Filter what the page says: a name or a value can hold text written to steer a model |

So the product decides, and writes down:

1. Who gets the tools: its own assistant, the browser's agents through WebMCP, or no one.
2. What needs a person beyond the destructive actions. Deny it in the policy, or let its handler
   ask the person when `bridge.acting` is true. The bridge sets it while a step's action runs,
   and a `Button`'s `onClick` runs inside a `press`.
3. How the person is asked: through a member the page draws, such as a `ConfirmDialog`,
   whose confirm an agent cannot press. [references/asking.md](references/asking.md) has a React
   component that asks this way, and records what an agent did.

The server still checks every request, because an agent acts with the person's session.

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
the members need real focus, pointer and layout. [references/testing.md](references/testing.md)
has a test to copy and the traps.
