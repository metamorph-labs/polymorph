# The agent bridge's API

What each entry point exports, as the published packages have them. `@polymorph/engine` is
installed under that name, as an alias of `@metamorph-labs/polymorph-engine`.

## `@polymorph/engine/agent`

A static import of a value from this entry point puts it in the importing module's chunk:
`createAgentBridge` is the bridge. A page that loads the bridge on its first use imports it with
`import('@polymorph/engine/agent')`, and imports only types from it statically.

| Export | What it is |
| --- | --- |
| `createAgentBridge(options?)` | a bridge over the members mounted on the page. Two bridges read the same registry and report the same ids, and each runs its own acts and asks its own questions |
| `agentTools(bridge)` | the bridge as three tools, for the application's own agent |
| `registerWebMCP(bridge)` | registers those tools with the browser's WebMCP API, and returns the function that unregisters them |
| `AGENT_CHANGE_EVENT` | `'polymorph:agentchange'` |
| `AGENT_SETTLE_MS` | `150`, the default `settleMs` |

Types: `AgentBridge`, `AgentBridgeOptions`, `AgentConfirmRequest`, `AgentPolicy`, `AgentPolicyMember`, `AgentSnapshot`, `AgentSnapshotMember`, `AgentSnapshotAction`, `AgentQuery`, `AgentMatch`, `AgentStep`, `AgentStepResult`, `AgentActResult`, `AgentChange`, `AgentChangeDetail`, `AgentError`, `AgentErrorCode`, `AgentTool`, `AgentToolName` and `AgentToolAnnotations`.

### The bridge

| Member | What it does |
| --- | --- |
| `snapshot()` | `{ members }`: each listed member, in document order |
| `query(query)` | the members that match, each `{ id, member, name, option? }` |
| `act(steps)` | runs the steps in order and resolves to `{ results }`, stopping at the first that fails. It never rejects. One `act` runs at a time: the next waits for it, also while it waits for `confirm` |
| `subscribe(listener)` | calls `listener` after each step that succeeds, and returns the function that stops it. A listener that throws does not fail the step |
| `acting` | `true` while a step's action runs |
| `dispose()` | stops the bridge: it lists nothing after this, and a step answers `unknown-member` |

### Options

| Option | What it takes |
| --- | --- |
| `confirm` | `(request) => boolean \| Promise<boolean>`. `request` is `{ id, member, name, action, value? }`. Only `true` is yes. A `confirm` that throws or rejects is a no. The state is read again after the answer, and a member removed while the person was asked answers `unknown-member` |
| `policy.hide` | `(member) => boolean`. `member` is `{ id, member, name, element }`, frozen: the bridge's id for this mount, the member's name, its control's accessible name, and its control. A truthy answer takes the member out of every output and every step. The bridge asks only about a member whose element is in the document and not inside `hidden` content, and never about one another member withholds |
| `policy.deny` | `(member, action) => boolean`, with the same `member`. A truthy answer takes the action away, and a step that names it answers `not-allowed`. Either function that throws hides or denies |
| `settleMs` | milliseconds a step waits for the member's state to change after its action. The bridge reads the state again every few milliseconds and stops at the first change |

### Starting the page agent in each framework

`startPageAgent` is the function of step 4 of the skill. Call it where the framework runs code in
the browser after mounting, keep what it returns for the assistant, and call its `stop` when the
page unmounts:

```ts
// React: the component in references/asking.md.

// Vue, in <script setup>
let agent: PageAgent | undefined
onMounted(() => {
  agent = startPageAgent(ask)
})
onBeforeUnmount(() => agent?.stop())

// Svelte, in <script>
onMount(() => startPageAgent(ask).stop)

// Solid, in a component
onMount(() => onCleanup(startPageAgent(ask).stop))

// Angular, in a component's constructor. afterNextRender runs in the browser only.
const destroyRef = inject(DestroyRef)
afterNextRender(() => destroyRef.onDestroy(startPageAgent(ask).stop))
```

### A snapshot entry

| Field | What it holds |
| --- | --- |
| `id` | the instance's id, stable while it is mounted. A member mounted again has a new one |
| `member` | the member's name |
| `name` | the accessible name of its control: from `aria-labelledby`, `aria-label`, its `<label>`, `alt`, its text or `title`. A table is named by its caption, never its cells |
| `description` | the text its control's `aria-describedby` names: a field's hint and error. Absent when empty, and for a member that holds a secret |
| `within` | the id of the nearest listed member whose element contains this one's |
| `state` | the declared states, read now. A secret one, and one that holds a secret, is `{ secret: true }` |
| `actions` | each action allowed now: `{ name, argument?, among?, confirm? }`. `confirm: true` means a person must confirm it. A disabled member lists none |

A snapshot has no size limit of its own: it lists every listed member with every choice of each,
such as every option of a long `Select`. Only a chart caps its marks. To keep what a model
reads small, use `query`, hide the members outside the region the agent works in with
`policy.hide`, or page the content the members show.

### A step and its result

A step is `{ id?, target?: { member?, name? }, action, value? }`. A result is
`{ ok: true, id, changed }`, where `changed` maps each state that changed to `{ from, to }`, or
`{ ok: false, id?, error: { code, message, allowed? } }`. A state that holds a secret is left out
of `changed`.

| Code | When | Do |
| --- | --- | --- |
| `unknown-member` | the id names no listed member, the target names none, or the member was removed while the person was asked | read again: the member is gone, closed, hidden, withheld or declares nothing |
| `ambiguous-target` | the target names more than one member. The message lists their ids | name it by one of those ids |
| `not-allowed` | the member does not declare the action, or the policy denies it. `allowed` lists the actions it allows now | choose from `allowed`. An empty list is the application's policy |
| `disabled` | the member's `disabled` state is true | do what enables it, or tell the person |
| `invalid-value` | the value is not of the argument's type, names no enabled choice, or the step is not an object | read the action's argument and the member's choices again |
| `needs-confirmation` | the action needs a person, and the bridge has no `confirm` | leave it to a person. Do not look for another way |
| `declined` | the person said no, or `confirm` failed | do not run it again unasked |
| `failed` | the action threw, with the member's message, any secret replaced | read the message, such as a read-only field's refusal |

### Change events

A step that succeeds dispatches `polymorph:agentchange`, bubbling, on the element its member names
after the step; when that is gone, on the element it named before, while that is in the document;
and otherwise on the document. The detail is `{ id, member, action, changed, source: 'agent' }`,
the same object `subscribe` hands its listeners. A step whose `changed` is empty dispatches one
too, and a step that fails dispatches none. `references/asking.md` shows a listener.

### The tools

| Name | Title | Input | Annotations |
| --- | --- | --- | --- |
| `polymorph_snapshot` | Read the page | `{}` | `readOnlyHint`, `untrustedContentHint` |
| `polymorph_query` | Find controls on the page | `{ name?, text?, member? }`, strings | `readOnlyHint`, `untrustedContentHint` |
| `polymorph_act` | Operate controls on the page | `{ steps }`, each `{ id?, target?, action, value? }` | `consequentialHint`, `untrustedContentHint` |

Each tool's `execute(input)` resolves to JSON and never rejects. A malformed input is answered:
`polymorph_act` given no list of steps resolves to one `invalid-value` result. The tools'
definitions are read from a bridge's `agentTools`: no entry point exports them alone.

## `@polymorph/engine/webmcp`

It holds the tools' definitions and their registration, and none of the bridge, so importing it
keeps the bridge out of the bundle.

| Export | What it does |
| --- | --- |
| `registerWebMCPOnCall(load, options?)` | registers the three tools now. On the first call it runs `load` once and creates the bridge with `options` from what `load` resolves to: `@polymorph/engine/agent`, or an object with its `createAgentBridge` and `agentTools`. Calls that arrive while it loads wait for it. A failed load answers each waiting call with `{ error: { code: 'failed', message } }`, and the next call loads again. Returns the function that unregisters the tools and disposes of the bridge |
| `applyAgentSetting(value)` | does what a `data-agent` value says: `null` registers nothing, `'on-call'` registers as `registerWebMCPOnCall` does, `'eager'` also loads the bridge at once, and another value warns. The bridge has no options. Returns the function that unregisters |
| `AGENT_ATTRIBUTE` | `'data-agent'` |

Types: `AgentSetting` and `AgentBridgeModule`.

A page whose only agents are the browser's registers in an effect and returns what unregisters.
The bundler puts the bridge in a chunk the page fetches on the first call:

```tsx
'use client'

import { useEffect } from 'react'
import { registerWebMCPOnCall } from '@polymorph/engine/webmcp'

/** Registers the tools now, and fetches and creates the bridge on the first call. */
export function OnCallAgent({ ask }: { ask: (question: string) => Promise<boolean> }) {
  useEffect(
    () =>
      registerWebMCPOnCall(() => import('@polymorph/engine/agent'), {
        confirm: (request) => ask(`${request.action} “${request.name}”?`),
      }),
    [ask],
  )
  return null
}
```

A bundled app that wants the no-build setting's behaviour reads the attribute itself:

```ts
import { AGENT_ATTRIBUTE, applyAgentSetting } from '@polymorph/engine/webmcp'

const stop = applyAgentSetting(document.documentElement.getAttribute(AGENT_ATTRIBUTE))
```

Every registration needs the browser's WebMCP API: `document.modelContext`, or
`navigator.modelContext` in earlier builds. Where neither exists, nothing registers or loads.

## `@polymorph/engine/testing`

| Export | What it does |
| --- | --- |
| `agentRegistrations()` | every registered member as `{ id, member, element, withholds }`, withheld ones included, with no state and no action |
| `installTestTheme()` | installs a theme, so a member's computed style reads a token |
| `fixedWidthHost(width?)` | a host element of a fixed width in the body |
