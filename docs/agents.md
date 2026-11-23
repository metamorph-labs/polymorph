# Agents

This page covers the agent bridge: how an application lets an agent on a running page read and
operate the members it renders, and how a member's author declares what an agent may read and
do. The first half is for an application. The second half is for the author of a member, and is
the procedure for giving a member an `## Agent` section.

The bridge works the members a page already renders. An agent that shows the person a screen of
its own, such as a form to fill or a choice to make, writes a screen spec that the application
draws at run time ([run-time-screens.md](run-time-screens.md)).

Terms used on this page:

- **Agent**: a program that reads and acts on a page through an API, such as a language model
  with tools.
- **Bridge**: what `createAgentBridge` returns. It reads the members mounted on the page and runs
  their actions.
- **Handle**: what a mounted member registers with the engine's agent registry: its states, its
  actions and its element.
- **Agent fence**: the fenced block marked `agent` at the end of a spec's `## Agent` section. It
  declares what an agent may read from the member and do with it.
- **Member**, **spec**, **states fixture**, **description**, **renderer**, **law**: as the
  [glossary](concepts.md#glossary) defines them.

## For an application

### What the bridge is

An agent reads and operates the members on a page by calling the bridge, not by clicking or
reading screenshots. Each mounted member whose spec has an agent fence registers a handle with
the engine's root while it is mounted, in every web framework: React, Vue, Svelte, Solid and
Angular. A custom element renders its Solid member, so the member inside a `poly-*` element
registers as it does in a Solid application. The bridge reads those handles. It reports the states a member's fence declares and runs
the actions it declares, and nothing else. A member with no fence is not visible to an agent.

The fence is the only thing that grants access. An application's policy can hide a member or deny
an action, and it has no way to add either. A secret value never leaves the bridge, and an action
a person must mean waits for that person to confirm it.

The bridge is its own entry point, `@polymorph/engine/agent`, so a page that does not import it
does not ship it. The root keeps only the list of mounted handles, which the members write to.
`@polymorph/engine/webmcp` registers the bridge's tools before the bridge is loaded, and holds
none of it ([Tools and WebMCP](#tools-and-webmcp)).
A page that builds the elements with a bundler imports `@polymorph/engine/agent` as any
application does. A page with no build loads the bridge from the elements' script it already
loads ([below](#a-page-with-no-build)).
SwiftUI and Compose members do not register; the bridge is for the web.

### Creating a bridge

```ts
import { createAgentBridge } from '@polymorph/engine/agent'

const bridge = createAgentBridge({
  // Asks a person, and resolves true for yes. Without it, every destructive action is refused.
  confirm: (request) => askThePerson(`${request.action} on ${request.name}?`),
  // Narrowing only: a policy hides a member or denies an action, and adds nothing.
  policy: {
    hide: (member) => member.member === 'PromptInput',
    deny: (member, action) => member.member === 'Button' && member.name === 'Delete account',
  },
})
```

| Option | What it does |
| --- | --- |
| `confirm(request)` | asks a person to confirm a destructive action, and resolves `true` for yes. `request` is `{ id, member, name, action, value? }`. A `confirm` that throws or rejects is a no |
| `policy.hide(member)` | takes a member out of every output: it is not listed, not matched and not run. `member` is `{ id, member, name, element }` |
| `policy.deny(member, action)` | takes one action away from a member. A function of the policy that throws hides or denies |
| `settleMs` | how long a step waits for the member's state to change after its action, in milliseconds (150 by default) |

Two bridges on one page read the same registry and report the same ids. `bridge.dispose()` stops
a bridge: it reports nothing and runs nothing after that.

In React, create the bridge in an effect, so it exists only in the browser, and dispose of it
when the component that owns it unmounts:

```tsx
import { useEffect } from 'react'
import { createAgentBridge, registerWebMCP } from '@polymorph/engine/agent'

export function PageAgent({ ask }: { ask: (question: string) => Promise<boolean> }) {
  useEffect(() => {
    const bridge = createAgentBridge({ confirm: (request) => ask(`${request.action} ${request.name}?`) })
    const unregister = registerWebMCP(bridge)
    return () => {
      unregister()
      bridge.dispose()
    }
  }, [ask])
  return null
}
```

In Vue, the same in `onMounted` and `onBeforeUnmount`:

```ts
import { onBeforeUnmount, onMounted } from 'vue'
import { createAgentBridge, registerWebMCP, type AgentBridge } from '@polymorph/engine/agent'

let bridge: AgentBridge | undefined
let unregister = () => {}
onMounted(() => {
  bridge = createAgentBridge({ confirm: (request) => ask(`${request.action} ${request.name}?`) })
  unregister = registerWebMCP(bridge)
})
onBeforeUnmount(() => {
  unregister()
  bridge?.dispose()
})
```

Svelte, Solid and Angular create it the same way, in their own mount and teardown hooks.

### A page with no build

A page with no build states when the bridge loads with one attribute on its document element,
`data-agent`, and writes no script:

```html
<html lang="en" data-system="plain" data-palette="neutral" data-agent="on-call">
```

| `data-agent` | What the page does |
| --- | --- |
| absent | registers nothing and fetches nothing more. Exposing a page to an agent is the application's decision, so this is the default |
| `on-call` | registers the three tools with the browser's WebMCP API at load, with their names, titles, descriptions, schemas and hints. The bridge is fetched and created on the first call of any of them, once, and that call and every later one run against it |
| `eager` | fetches and creates the bridge at load, and registers its tools |

- **The elements' script reads it once, as it runs,** and hands the value to the engine's
  `applyAgentSetting` ([below](#tools-and-webmcp)), which decides what it means. An attribute a
  script sets later is not read.
- **Another value warns and registers nothing.** The console says
  `polymorph: data-agent="…" is neither on-call nor eager, so no agent tools are registered`, and
  the page behaves as one without the attribute.
- **Without WebMCP the setting does nothing.** In a browser with neither `document.modelContext`
  nor `navigator.modelContext`, neither value registers or fetches anything, because nothing could
  call the tools. A page whose own agent reads the bridge loads it with `loadAgentBridge`, which
  fetches it whatever the browser.
- **What each script fetches.** With `polymorph.js` and `on-call`, two small chunks are fetched
  at load, the registration and the tools' definitions, and the bridge's chunk is fetched on the
  first call; with `eager` all three are fetched at load. A page without the setting fetches what
  it fetched before the setting existed. `polymorph-all.js` holds the bridge and the definitions, so
  with either value the tools register at load and nothing is fetched later.
- **No one is asked to confirm.** A setting cannot carry a `confirm` function, so the bridge it
  creates has none: a step on a destructive instance, or one that names a choice marked
  destructive, answers `needs-confirmation`, and nothing runs. A page that asks a person writes
  the script below and states no setting.
- **A call that cannot load the bridge** resolves to `{ error: { code: 'failed', message } }`,
  and the next call loads it again.

A page that gives its bridge a `confirm` or a policy writes a module script instead. The elements'
no-build scripts, `polymorph.js` and `polymorph-all.js`, export `loadAgentBridge`. It resolves to
`@polymorph/engine/agent`, so the page's own module script creates a bridge with the same
functions:

```html
<script type="module">
  import { loadAgentBridge } from './polymorph/polymorph.js'

  const { createAgentBridge, registerWebMCP } = await loadAgentBridge()
  const bridge = createAgentBridge({
    confirm: (request) => Promise.resolve(window.confirm(`${request.action} ${request.name}?`)),
  })
  registerWebMCP(bridge)
</script>
```

- **Import it from the script the page loads.** The members write their handles to a registry
  inside that script. A bridge loaded from anywhere else, a second copy of the file or a bundle
  of the engine, reads a registry of its own, which holds nothing.
- **A page that does not call it does not fetch the bridge.** With `polymorph.js` the bridge is
  a chunk of its own, fetched on the first call. `polymorph-all.js` holds it with every member.
- **The setting and the script together.** `loadAgentBridge()` resolves to the module the setting
  loaded, so a bridge the page creates reads the same members. The setting's registration stands:
  it takes the tools' names as the elements' script runs, before the page's own script, and the
  page's `registerWebMCP` then registers nothing and warns
  (`polymorph: registerWebMCP registers nothing, because data-agent="on-call" already registered
  the agent tools on this page`). A page that registers a bridge of its own states no setting.
- **The elements register as they render.** A member whose code is still loading is not listed
  yet, and neither is an element the page has not added. Take a snapshot when the agent asks,
  not once at load.

### `snapshot()`

`snapshot()` lists the mounted members an agent can see, in document order:

```ts
bridge.snapshot()
// {
//   members: [
//     {
//       id: 'checkbox-3',
//       member: 'Checkbox',
//       name: 'Email me about replies',
//       state: { checked: false, disabled: false },
//       actions: [{ name: 'check' }, { name: 'uncheck' }],
//     },
//     {
//       id: 'input-7',
//       member: 'Input',
//       name: 'Email',
//       description: 'Enter an email address.',
//       state: { value: 'ada', disabled: false, invalid: true, readonly: false },
//       actions: [{ name: 'fill', argument: 'text' }, { name: 'clear' }],
//     },
//     {
//       id: 'button-4',
//       member: 'Button',
//       name: 'Delete ticket',
//       within: 'dialog-2',
//       state: { disabled: false, loading: false, pressed: null, expanded: null },
//       actions: [{ name: 'press', confirm: true }],
//     },
//   ],
// }
```

| Field | What it holds |
| --- | --- |
| `id` | the instance's id, stable while it is mounted. A member mounted again has a new one |
| `member` | the member's name |
| `name` | the accessible name of the member's control, from `aria-labelledby`, `aria-label`, its `<label>`, `alt`, its text or `title`. A Table and a DataTable are named by the table's caption, which `label` writes, and never by their cells |
| `description` | the accessible description of the member's control: the text of the elements its `aria-describedby` names, in order, flattened as a name is. A field's hint and its error arrive here (FormField names both). Absent when empty, and for a member that holds a secret or whose control is a password field, because that text could repeat the value |
| `within` | the id of the nearest listed member whose element contains this one's, when there is one |
| `state` | the states the fence declares, read now. A secret state is `{ secret: true }` |
| `actions` | the actions allowed now, each with its argument type when it takes one, `among` with the state whose choices an `id` or `ids` argument names when the action names one, and `confirm: true` when a person must confirm it |

A chart with `onSelect` lists at most `CHART_MARK_CAP` of its marks as choices: all of them, or
on a larger chart the whole positions around its reading position. Its `position` and `count`
say where the reading is and how many positions the chart has, `read` moves the reading to bring
other marks into the list, and `query` matches the marks the list holds. A chart whose legend
toggles lists its series as a second list of choices, `series`, with the ids of those hidden in
`hidden`, and `toggle` names one of them (`among series`) where `choose` names a mark
(`among items`). A LineChart or AreaChart with a brush reads its range in rows as `range-start`
and `range-end`, and `brush` builds and commits a range with the brush's own keys. A chart is
listed while a person has something to operate in it, and one with a legend or a brush and no
`onSelect` lists no marks.

A member is listed only while its element is in the document. A member whose element is absent
shows a person nothing, so it is not listed, not matched by `query`, and a step on it answers
`unknown-member`: a closed Dialog, Drawer, Popover or ConfirmDialog, whose element is its panel,
a Pagination or Stepper that renders nothing, and a Card without `href`, whose element is its
stretched link. It is listed again when its element returns, with the same id. A member whose
element is in content marked `hidden` is treated the same way: the generated renderers keep a
closed collapsible's or accordion's content, and a tab's panel, in the document with that
attribute, where the React members remove it, and neither shows a person anything.

A member whose `disabled` state is true lists no actions. A member the policy hides is absent,
and so is an action it denies. A member another one withholds is absent too, and the policy
cannot list it: its element is the other member's region or inside it. ConfirmDialog withholds
its panel, so its confirm Button and phrase field are not listed, and ApprovalCard withholds the
card, so its two answers are not. A member that holds a secret withholds its own element:
PasswordInput draws an Input, and that Input is not a member an agent reads or runs.

### `query(query)`

`query({ name, text, member })` finds members. `name` matches the accessible name and the label of
each of a member's choices; `text` matches the text the member's element shows and its
description; `member` matches
the member's name whole. Each field ignores case and matches a substring, and every field given
must match. A match on a choice's label names the choice:

```ts
bridge.query({ name: 'urgent' })
// [{ id: 'select-5', member: 'Select', name: 'Priority', option: { id: 'urgent', label: 'Urgent' } }]
```

A secret is never matched and never returned.

### `act(steps)`

`act` runs steps in order and stops at the first that fails. A step names its member by `id`, or
by a `target` that names exactly one member (`{ member, name }`, the name matched whole before it
is matched as a substring). `value` is the action's argument, when it takes one:

```ts
const { results } = await bridge.act([
  { target: { member: 'Input', name: 'Subject' }, action: 'fill', value: 'Refund for order 1182' },
  { id: 'select-5', action: 'choose', value: 'urgent' },
  { target: { name: 'Save' }, action: 'press' },
])
// results[0]: { ok: true, id: 'input-1', changed: { value: { from: '', to: 'Refund for order 1182' } } }
```

After each action the bridge waits for the renderer to settle, reads the member's state again and
reports what differs in `changed`. A step that removes its member's element still succeeds and
reports what changed: a Dialog's `close` reports `open` from `true` to `false`, and the Dialog is
not listed afterwards. A secret state, and any value that holds a secret, is left out
of `changed`. `act` never rejects, and one `act` runs at a time, so two agents' steps never
interleave.

| Error code | When |
| --- | --- |
| `unknown-member` | the id names no listed member, or the target names none |
| `ambiguous-target` | the target names more than one member; the message lists their ids |
| `not-allowed` | the member does not declare the action, or the policy denies it. `allowed` lists the actions it allows now |
| `disabled` | the member's `disabled` state is true |
| `invalid-value` | the value is not of the argument's type, or names no enabled choice |
| `needs-confirmation` | the action needs a person, and the bridge has no `confirm` |
| `declined` | the person said no, or `confirm` failed |
| `failed` | the action threw. The message is the member's, with any secret replaced |

A member's own refusal is a `failed` step with the member's reason: a read-only Input refuses
`fill`, and a Dialog that is not dismissible refuses `close`.

### Change events and `acting`

Each step that succeeds emits one change event. `bridge.subscribe(listener)` calls the listener
with it, and the bridge dispatches `polymorph:agentchange`, bubbling, on the element the member
names after the step; when that is absent, on the element it named before the step, if that is
still in the document (a panel that plays its exit); and otherwise on the document (a Dialog's
panel that has closed):

```ts
document.addEventListener('polymorph:agentchange', (event) => {
  const { id, member, action, changed, source } = (event as CustomEvent).detail
  audit.record({ id, member, action, changed, source }) // source is always 'agent'
})
```

`bridge.acting` is true while a step's action runs, so an application's own handler can tell an
agent's change from a person's. A member's handlers keep their signatures: `onCheckedChange`
receives the same value from an agent's `check` as from a person's press.

### `confirm`

An action needs a person when its member's instance is destructive (a Button with
`tone="danger"`), or when its argument names a choice marked destructive (a Menu entry with
`tone="danger"`). Its snapshot entry carries `confirm: true`. The bridge then calls `confirm`
before the action runs, and runs it only on a `true`. Without `confirm` the step returns
`needs-confirmation` and nothing runs. The state is read again after the person answers, so
`changed` is measured from what the page held when the action ran.

`confirm` is the application's, and it asks the person at the page. An agent cannot answer it.

An agent cannot confirm for a person either. A member that asks a person a question (a
ConfirmDialog's confirm, an ApprovalCard's approve and deny) declares no action that answers it
and withholds the controls that do, so no snapshot, query or step reaches them. An agent can
cancel a ConfirmDialog and read an ApprovalCard's request and its decision.

### The policy

`hide` and `deny` each answer yes or no about a member the bridge already reads, so a policy can
only narrow what the fences declare. The bridge reads the allowed actions from the registered
handle, which the staleness law holds to the spec (below), so no application code can widen
what a member allows.

### Tools and WebMCP

`agentTools(bridge)` returns the bridge as three tools for an application's own agent. Each is
`{ name, title, description, inputSchema, annotations, execute }`, and `execute` resolves to a
JSON value and never rejects:

| Tool | Runs | Annotations |
| --- | --- | --- |
| `polymorph_snapshot` | `snapshot()` | `readOnlyHint` |
| `polymorph_query` | `query(input)` | `readOnlyHint` |
| `polymorph_act` | `act(input.steps)` | `consequentialHint` |

Every tool carries `untrustedContentHint`, because its output holds the page's content.

`registerWebMCP(bridge)` registers the same three tools with the browser's WebMCP API, on
`document.modelContext` or, in earlier builds, `navigator.modelContext`, and returns the function
that unregisters them. Where the API is absent it registers nothing, and the function does
nothing.

One registration of the tools stands on a page at a time. While one does, another
`registerWebMCP`, a `registerWebMCPOnCall` or a page's `data-agent` registers nothing, warns in the
console, and returns a function that does nothing, because the browser takes each name once and
every call would reach the first registration's bridge. Unregistering the first frees the names.

`registerWebMCPOnCall(load, options)`, from `@polymorph/engine/webmcp`, registers the three tools
before the bridge exists, and loads and creates the bridge on the first call. An application with a
bundler passes the bridge's entry point as a dynamic import, and the bundler puts the bridge in a
chunk the page fetches on that call:

```tsx
import { useEffect } from 'react'
import { registerWebMCPOnCall } from '@polymorph/engine/webmcp'

export function PageAgent({ ask }: { ask: (question: string) => Promise<boolean> }) {
  useEffect(
    () =>
      registerWebMCPOnCall(() => import('@polymorph/engine/agent'), {
        confirm: (request) => ask(`${request.action} ${request.name}?`),
      }),
    [ask],
  )
  return null
}
```

- **The tools are the same tools.** `agentTools` and `registerWebMCPOnCall` read one list of
  names, titles, descriptions, schemas and hints. `@polymorph/engine/webmcp` holds that list and
  none of the bridge, so importing it does not bring the bridge into the bundle.
- **`load` runs once.** Calls that arrive while it runs wait for it. The bridge is
  `createAgentBridge(options)` from the module it resolves to, and every call runs that bridge's
  tools from `agentTools`.
- **A failed load is an answer, not a throw.** Each waiting call resolves to
  `{ error: { code: 'failed', message } }`, and the next call runs `load` again.
- **The function it returns** unregisters the tools and disposes of the bridge it created.
- **Where the API is absent** it registers nothing and never calls `load`.

`applyAgentSetting(value)`, from the same entry point, does what a page's `data-agent` says, as the
elements' no-build scripts call it with the attribute's value (`AGENT_ATTRIBUTE`): `null` registers
nothing, `'on-call'` registers as `registerWebMCPOnCall` does, `'eager'` loads the bridge at once,
and another value warns. It loads `@polymorph/engine/agent` itself, creates the bridge with no
options, and returns the function that unregisters. An application that writes `<html data-agent>`
on a page it renders can call it the same way.

### Secrets

A state a fence marks `secret` is `{ secret: true }` in every output. The bridge also treats the
value of every `input[type="password"]` on the page as secret, whatever a handle says, and any
state, name, label or message that holds a secret is replaced. PasswordInput marks its value
secret and declares no action that writes it, because a person types a secret.

## For a member's author

A member is visible to agents when its spec has an `## Agent` section that ends with an agent
fence, its React member registers a handle that matches the fence, and its description has an
`agent` block that matches it. The laws below fail until all three agree, and the conformance law
then runs every statement of the fence against every renderer.

The steps, for a member that has none:

1. Write the `## Agent` section in the spec: the prose, then the fence (below).
2. Register the React member with `useAgentMember`.
3. Give the description an `agent` block, and run `pnpm shells`, then `pnpm registry`.
4. Add any part the fence names to `packages/conformance/src/parts.ts`.
5. Run the member's agent statements on every renderer (below), then on Firefox and WebKit.

### The `## Agent` section

The section's prose says what an agent can read and do with the member, and why anything is
withheld. The fence at its end restates the prose in a fixed grammar, one statement per line, as
the `contract` fence restates behaviour ([conformance.md](conformance.md)). Checkbox's:

````md
## Agent

An agent reads whether the box is checked and sets it. Indeterminate is read as `mixed` and is
not set by an agent, as a person cannot set it either.

```agent
state checked tristate as box aria-checked
state disabled boolean
action check sets checked calls onCheckedChange
action uncheck sets checked calls onCheckedChange
```
````

The fence sits in the `## Agent` section and nowhere else. A blank line in it is allowed.

### The grammar

| Statement | Claim |
| --- | --- |
| `state <name> <type> [secret] [as <part> <evidence>]` | an agent reads this value of the member |
| `action <name> [<type>] [among <state>] [sets <state>] [calls <handler>] [presses <part>]` | an agent may run this action, with one argument of the type when one is written; with `among`, an `id` or `ids` argument names a choice of that `choices` state only |
| `destructive when <prop>=<value>` | an instance whose prop has the value needs a person to confirm each action |
| `destructive option when <field>=<value>` | an action whose argument names an entry with that field value needs a person to confirm |
| `destructive never` | the member's `danger` tone colours what it says and not what its actions do, so no action needs a person |
| `withholds contents` | the registered members inside the member's region are not an agent's: the bridge lists, matches and runs none of them, and lists the member in their place |

A `state`, `action` or `withholds` statement may end with `when <state>`, which names the states fixture entry
the law starts from, resolved as a contract statement's is: the entry with that name, or the one
entry whose name begins with those words.

The closed lists are data in `packages/registry/src/agent.ts`:

| List | Values |
| --- | --- |
| State types | `boolean`; `tristate` (`true`, `false` or `mixed`); `number` (or `null` while the member holds none); `text`; `id` (a choice's id, or `null` for none); `ids`; `choices` (a list of `{ id, label, disabled?, destructive? }`); `list` (a list of JSON records, read only) |
| Argument types | `boolean`, `number`, `text`, `id`, `ids` |
| Evidence | an `aria-*` or `data-*` attribute, optionally `=<value>`; `value` (the part's value property); `text` (its text content); `present` (the part is in the document) |

Names are lower-case words joined by `-`. A state and an action may share a name (`state open`
and `action open`). A part is a name from the spec's anatomy, located by `PARTS` in
`packages/conformance/src/parts.ts`, the table the contract statements use; `root` needs no
entry. `calls` names a prop of the member that is a function, as a call site writes it
(`onCheckedChange`). An action that takes an `id` or `ids` may instead call a handler the spec's
API section declares on the entries it chooses among, in a type in one of its fences: Menu's
`action choose id calls onSelect` names `MenuEntry`'s `onSelect: () => void`. `presses` names a
part whose element the action presses with the element's own click; for an action that takes an
`id`, the element of the choice the id names (AppShell's `action go id presses item`). `among`
names the `choices` state an `id` or `ids` action chooses from, for a member with more than one:
the bridge checks the argument, and whether a choice is marked destructive, against that state's
choices only. A chart's `choose` names one of its marks and its `toggle` one of its legend's
series (`action toggle id among series presses key`).

How evidence reads a value:

| Evidence | Reads |
| --- | --- |
| `<attribute>` | the attribute's value as the state's type: for `boolean`, `true` or `""` is true and `false` or an absent attribute is false; for `tristate`, `mixed` is mixed as well; a `number` is the number; `text` is the value, or `""` when absent |
| `<attribute>=<value>` | true when the attribute has the value, false otherwise; for a `boolean` state |
| `value` | the part's `value` property, as the state's type |
| `text` | the part's text content, with runs of white space collapsed |
| `present` | true when an element is the part and is not inside a `hidden` subtree |

### Faults

`pnpm registry` fails on each, with the file and the line:

- a line outside the grammar; a name declared twice; a destructive statement made twice;
- `sets` naming a state the fence does not declare;
- `among` on an action whose argument is not `id` or `ids`; `among` naming a state the fence does
  not declare, or one that is not `choices`; an `id` or `ids` action with no `among` in a fence
  that declares more than one `choices` state;
- `calls` naming a prop the API lacks, or one that is not a function, unless the action takes an
  `id` or `ids` and the API declares the handler on its entries;
- `secret` on a state an action `sets`, when the state has evidence, because the action's check
  would read the secret off the part;
- evidence on a state whose type has no reading in the document (`id`, `ids`, `choices`, `list`);
- an action with neither `sets` on a state that has evidence, nor `calls`, nor `presses`,
  because the law has nothing to check;
- a `when` that names no fixture entry, or names two;
- a `destructive when` whose prop or value the API does not declare;
- a member whose `tone` admits `danger` that declares an action and neither
  `destructive when tone=danger` nor `destructive never`;
- `destructive never` beside a `destructive when` or a `destructive option when`, on a member with
  no `tone` that admits `danger`, or in a fence that declares no action;
- `withholds contents` written twice. A fence may hold it with no action (ApprovalCard).

### Choosing states and actions

Read what a person sees and needs to operate the member, and write that. An agent should be able
to do what a person at the page can do with the member, through the same path, and nothing more.

- **States are what a person sees.** A control's value, whether it is disabled, invalid or
  read-only, whether its popup is open, the options it offers. A state the member does not show
  is not a state an agent needs. Give a state evidence (`as <part> <evidence>`) when a part shows
  it, so the law checks the two agree: Checkbox's `as box aria-checked`, Select's open state
  `as panel present`, Input's value `as field value`. A state no part shows takes none.
- **Actions go through the member's own value and handlers.** An action sets the value the way a
  person's input does, and the member calls its handler from there, so `onChange` reports an
  agent's change with the same arguments as a person's, whether or not the caller controls the
  value. Do not call the caller's handler from the action beside the member's own path.
- **A text field is written through `agentFill`.** `agentFill(element, text)` writes through the
  element's native value setter and dispatches `input`, so the framework's own change handler
  runs. Input's `fill` and `clear` use it.
- **An activation is `agentPress`.** `agentPress(element)` is the element's own `click()`, so a
  submit button submits its form and a disabled or loading one does nothing, as for a person.
  Button's `press` uses it.
- **A press on what the application composed is `presses`.** An action that presses an element
  the application passed in, whose handler the law cannot reach with a spy, writes
  `presses <part>`, and the law checks that the step pressed that part: AppShell's `go` presses
  the NavItem the app composed, so `onNavigate` or the browser takes it, and Table's `sort`
  presses the sort control of a header the app composed, so the app's `onSort` decides the order.
- **Entries the application composes are read from the document.** A member that holds its
  entries as children, not as data, reads them from its own element: AppShell reads its NavItems
  from its navigation with the engine's `railDestinations`, and `goToRailDestination` presses one.
  A helper that every renderer shares lives in the engine, as `menuChoices` does. A member whose
  links read as a List's reuses List's helpers: ErrorSummary reads its errors' links with
  `listItems` and presses one with `chooseListItem`. A member whose entries each hold their own
  state reads them the same way: JsonTree reads its branches from their toggles with
  `jsonTreeBranches`, each by the JSON Pointer of its value, and `setJsonTreeBranch` presses one.
- **A chart's marks are read through its reading.** Its marks are hidden from the tree, and a
  person reaches them with the keys of the plot's one focus stop. `chartMarks` lists each
  position the keys reach at which `onSelect` reports something, labelled with what the live
  region says there, and `chooseChartMark` moves the reading to one and runs the chart's own
  activation, the function Enter runs. A chart without `onSelect` lists no marks.
  `chartMarks` lists at most `CHART_MARK_CAP` marks, the whole positions around the reading
  position. `chartPosition` reads that position, which the figure shows as `data-position`, and
  `readChartPosition` moves the reading as Left and Right do, so every mark stays in reach.
- **A chart's legend is read from its keys.** A legend that toggles draws each key as a button
  with `aria-pressed`, and the chart holds which series are hidden. `chartSeries` reads the keys
  from the figure by the legend recipe's key class, each by its series' `key`, labelled with what
  the key says, and `chartHiddenSeries` the ids of those not pressed; `toggleChartSeries` presses
  one with its own click, so the chart refits as it does for a person.
- **A chart's brush is driven by its own keys.** `chartRange` reads the range a person sees, in
  rows, from the brush machine, and `brushChartRange` builds one with the Shift and arrow presses
  a person makes, from where a person's range would start, and commits it with Enter, so
  `onBrushEnd` receives what a person's range reports. A chart registers while a person has
  something to operate in it: `onSelect`, a legend that toggles or a brush (`unless` otherwise).
- **A member's own refusal throws.** A read-only Input refuses `fill` and `clear`, and a Dialog
  that is not dismissible refuses `close`, by throwing an `Error` whose message says why; the
  bridge reports the step as `failed` with that message. The bridge refuses a disabled member
  itself, so an action does not check `disabled`.
- **Never write a secret.** A secret state declares no action that writes it, because a person
  types a secret. Mark the state `secret`, and read it only so the bridge can keep it out of every
  output. Input refuses `fill` while its `type` is `password`.
- **Never give an agent a confirmation that belongs to a person.** An action that confirms what a
  person asked to confirm (ConfirmDialog's confirm, ApprovalCard's approve) is not declared.
  Revealing a secret is not declared either (PasswordInput's toggle), because it puts the secret
  on the screen.
- **A danger tone is either destructive or not.** A member whose `tone` admits `danger` writes
  `destructive when tone=danger` when that tone marks a command a person must mean (Button), or
  `destructive never` with the reason in the prose when the tone colours only what the member
  says (Alert's dismiss). An entry of a list that can be `danger`-toned is marked
  `destructive: true` in the choices, and the fence writes `destructive option when tone=danger`
  (Menu).
- **Choices have stable ids.** A `choices` state lists `{ id, label, disabled?, destructive? }`.
  An id is the entry's own value where it has one (Select's option `value`), and a value read from
  the entry where it has none (Menu's entry label, with a submenu's label before it). The empty
  string is an id (Select's empty choice). An `id` state is `null` while nothing is chosen.
- **Open and close what the member opens itself.** A member that holds its own open state
  declares `open` and `close` (Select, Menu). A member opened only by a trigger its caller passes,
  whose closed form has nothing an agent could name, declares `close` only (Dialog): an agent
  presses the trigger to open it. An overlay whose element is its panel is listed only while it
  is open, so a statement about it runs from an open entry, which the statement names with
  `when` where the fixture also has closed entries, and its `close` is its last step: the law
  reads the outcome from the step's result and from the part, which is gone.
- **An empty number is `null`.** A `number` state reads `null` while the member holds nothing
  (an empty NumberInput, a Rating with no value). An action's `number` argument is never `null`;
  a member that can be emptied declares `clear`.
- **A number in the unit a person hears.** A number state reads what the member's control
  announces, and its action takes the same unit: SplitPane's `position` is the percent its
  separator reports in `aria-valuenow`, not its `ratio` prop.
- **A state an instance does not have is `null`.** Button's `pressed` is `null` on a Button that
  is not a toggle, and its `expanded` on one that discloses nothing, because `false` would say the
  toggle is off or a region is hidden. Each statement names with `when` an entry that has the
  state, because the law reads a state's type and evidence on the entry it starts from
  (`state expanded boolean as root aria-expanded when expanded`).
- **Withhold what is a person's, and what is the member's own.** See the next section.

### A member that draws other members

A member often renders other registering members: ConfirmDialog draws a Dialog, two Buttons and
an Input; SearchInput draws an Input; RecordButton draws a Button. Each drawn member registers
on its own unless the member that draws it withholds it. Decide by whose the drawn members are:

- **A person's.** A control that answers a question a person was asked is not an agent's.
  ConfirmDialog's confirm Button, its phrase field and the Dialog it borrows, and ApprovalCard's
  two Buttons, are withheld: the fence writes `withholds contents`, declares no action that
  answers the question, and says why in the prose.
- **The member's own parts.** A member that draws another as a part of one control registers
  one handle of its own and withholds the part, so an agent sees one member where a person sees
  one control: SearchInput withholds its Input and declares `fill` and `clear` as its own,
  RecordButton withholds its Button, and ModeSwitch withholds its SegmentedControl. A member
  whose parts are elements of its own registers one handle and has nothing to withhold
  (SplitButton's two halves are its own `<button>`s).
- **The application's.** A member that holds what the application passed it (Dialog's children
  and footer, Popover's content, Tabs' panels) does not withhold: those are the application's
  controls. Each is listed `within` the member when the member's element contains it, as a
  Dialog's panel does. Tabs' element is its tab list, so a panel's controls are not `within` it.

The region is an element of the member, given as the handle's `withholds`. It is separate from
`element`, because the control that names the member can be smaller than the region:
SearchInput's field names it, and its root holds the field and the clear Button. `withholds` may
return a list of elements, each a region, for a member whose own parts sit beside what the
application passed: PromptInput withholds its field and its own send and attach Buttons, and
leaves the `leading` and `trailing` slots between them to the application, and Toast's viewport
withholds each card's action and close Buttons and leaves a notice's content to the
application. Every registered
member whose element is
a region or inside one is withheld, and so is a member registered on the same element as the
member that withholds; the member that withholds is listed. A member that holds a secret
withholds its own element whether its fence says so or not (PasswordInput's Input). A withheld
member stays withheld whatever the policy says.

A withholding member's element is often one it does not render itself. ConfirmDialog renders a
Dialog, and its panel is the Dialog's. A member that lends its identity to the member it draws
reads that member's element through a holder the drawn member fills in: `DialogPanelMember`'s
`panel` callback in React, and the `borrowed` holder in a description ([Registering a
description](#registering-a-description)). The drawn member then registers nothing, because the
member it stands for is listed in its place while it is open, and neither is listed while it is
closed: the Dialog passes `unless` to
`useAgentMember` in React, and writes `unless: 'lender'` in its description's `agent` block.
ColorInput draws its picker's Popover the same way (`PopoverPanelMember`, and `lends` in its
description), and withholds the panel the Popover hands back beside its root.

A member that stands for one it draws needs no holder when it reads nothing of it. The Table a
DataTable draws registers nothing, because DataTable registers its columns and its sort from its
own props. In React the DataTable says so through `TableStoodFor`, which only the Table directly
inside reads. A description's Table reads it at mount: it registers nothing when the nearest
member around it is a DataTable. A description does not use `lends` for this, because a lending
member's identity reaches every member it holds, and a DataTable holds the application's cells.

### Registering a React member

A React member calls `useAgentMember` from `@polymorph/react` with its handle, once, on every
render. It registers on mount, removes itself on unmount, and calls the latest render's closures,
so the bridge reads the value on screen and an action calls the setter that is current.

```ts
useAgentMember({
  member: 'Checkbox',
  element: () => boxRef.current,
  state: () => ({ checked: current === 'indeterminate' ? 'mixed' : current, disabled }),
  actions: { check: () => change(true), uncheck: () => change(false) },
})
```

| Field | What it holds |
| --- | --- |
| `member` | the member's name, as a quoted string |
| `element` | a function returning the control that carries the accessible name |
| `state` | a function returning an object literal with one key per declared state |
| `actions` | an object literal with one key per declared action: a function for an action with no argument, or `{ argument, run }` for one with an argument, where `argument` is the fence's argument type. An action the fence writes with `among <state>` gives `{ argument, among: '<state>', run }` |
| `secret` | the names of the states the fence marks `secret`, as a list of quoted strings |
| `destructive` | a function that is true while the instance needs a person to confirm each action; given exactly when the fence has a `destructive when` |
| `withholds` | a function returning the region whose registered members are not an agent's; given exactly when the fence says `withholds contents` |

The staleness law reads the call with the TypeScript AST, so each field is written as a literal:
`state` is an arrow returning an object literal (or a function with one `return` of one), and
`actions` is an object literal with no spread and no computed key. A property may name a `const`
in scope that holds the literal.

Button presses through `agentPress`, and asks a person while its tone is `danger`:

```ts
const ref = useRef<HTMLButtonElement>(null)
useAgentMember({
  member: 'Button',
  element: () => ref.current,
  state: () => ({ disabled, loading, pressed: pressed ?? null, expanded: expanded ?? null }),
  actions: { press: () => agentPress(ref.current) },
  destructive: () => tone === 'danger',
})
```

Input writes through `agentFill`, and refuses what a person cannot do:

```ts
function writable(): HTMLInputElement | null {
  if (readOnly) throw new Error('The field is read-only.')
  return inputRef.current
}
useAgentMember({
  member: 'Input',
  element: () => inputRef.current,
  state: () => ({ value: current, disabled, invalid, readonly: readOnly }),
  actions: {
    fill: {
      argument: 'text',
      run: (text) => {
        if (type === 'password') throw new Error('A person types a password; an agent does not.')
        agentFill(writable(), text)
      },
    },
    clear: () => agentFill(writable(), ''),
  },
})
```

**A member that passed its value straight to its substrate holds it.** An action must change the
value through the member's own API whether or not the caller controls it. A member that handed
`value` and `defaultValue` to Radix untouched has no setter of its own to call, and Radix's
uncontrolled value cannot be set from outside. So the member keeps the value in its own state,
seeded from `defaultValue`, and passes the substrate `value ?? own` always, with one setter that
updates its own state when the caller does not control it and calls the caller's handler in
both forms. Checkbox does this for Radix's checkbox, and Select for Radix's select:

```ts
const [chosen, setChosen] = useState<string | null>(defaultValue ?? null)
const selected = value === undefined ? chosen : value
function commit(reported: string | null) {
  setChosen(reported)
  onChange?.(reported)
}
// Radix is always controlled: `<SelectPrimitive.Root value={radixValue} onValueChange={…}>`.
useAgentMember({
  member: 'Select',
  element: () => triggerRef.current,
  state: () => ({
    value: selected === null ? (offersEmpty ? '' : null) : selected,
    options: flat.map((option) => ({
      id: option.value === EMPTY_CHOICE ? '' : option.value,
      label: option.label,
      ...(option.disabled === true ? { disabled: true } : {}),
    })),
    open,
    disabled,
  }),
  actions: {
    choose: { argument: 'id', run: (choice) => { const next = choice === '' ? null : choice; if (next !== selected) commit(next) } },
    open: () => setOpen(true),
    close: () => setOpen(false),
  },
})
```

When you make a member hold its value, keep its markup and props as they were, run its existing
tests and states fixture unchanged, and add a test of an agent's action on a controlled and an
uncontrolled instance (`checkbox.test.tsx`, `select.test.tsx`). A member that already holds its
value (Input, Dialog, Menu) needs no change beyond the call.

A member whose element is not one it renders directly reads it: Menu's trigger is the caller's
control inside its anchor (`anchorRef.current?.querySelector('button, a[href], [tabindex]')`),
and PasswordInput's field is the input its Input draws.

### Registering a description

A generated member registers through the `agent` block of its description in
`packages/shells/src/members/`. `pnpm shells` lowers it to a mount effect in each renderer, which
calls the foundation's `agentMember` and removes the handle on unmount. Every expression is
written over the member's scope, as any expression of a description is, and the renderer
rewrites its free names (`api.checked` is `api.value.checked` in Vue and `this.api.value.checked`
in Angular), so each closure reads the value when the bridge calls it.

```ts
agent: {
  on: 'box',
  state: { checked: "api.indeterminate ? 'mixed' : api.checked", disabled: 'disabled' },
  actions: { check: 'api.setChecked(true)', uncheck: 'api.setChecked(false)' },
},
```

| Field | What it holds |
| --- | --- |
| `on` | the ref of the template element that carries the accessible name; give that element `ref`. A member whose template draws no element of its own gives `element` alone |
| `element` | an expression for that element when a member this one renders draws it, written from `on` (PasswordInput: `on: 'frame'`, `element: "frame?.querySelector('input')"`) or from the `borrowed` holder (ConfirmDialog: `element: 'borrowed.element?.()'`) |
| `state` | a value expression per declared state |
| `actions` | per declared action, a statement, or `{ argument, run }`, where `run` reads the argument as `value`, with `among: '<state>'` beside `argument` for an action the fence writes with `among` |
| `secret` | the states the fence marks `secret` |
| `destructive` | an expression that is true while the instance needs a person (`tone === 'danger'`) |
| `withholds` | the region whose registered members are not an agent's: a ref name (ApprovalCard's `'card'`) or an expression (ConfirmDialog's `'borrowed.element?.()'`) |
| `unless` | an expression that, when it holds at mount, registers nothing: for a member another one draws in its own place (Dialog's `'lender'`) |

A member whose control is one of its compound parts, and not its own template, gives the block on
that part, in its `parts` list. The part registers under the member's name: Toast renders nothing,
and its `Viewport` part reads the notices and registers as `Toast`. The staleness law reads a
part's block as the member's registration.

A member that lends its identity (`lends: true`) and reads `borrowed` gets a holder that the
member it lends to fills in: that member writes a function returning one of its elements into
`lender.element`, in an effect (Dialog: `{ run: 'lender && (lender.element = () => panel)' }`).
`borrowed` and `lender` are names the renderers provide, as `lent` is, and the holder reaches
only the member lent to. ConfirmDialog renders no element of its own, so its agent block gives
`element` and `withholds` as `borrowed.element?.()`, the Dialog's panel. In React the same holder
is a callback passed to `DialogPanelMember` (`<DialogPanelMember member="ConfirmDialog"
panel={holdPanel}>`).

A machine's member acts through the machine, which owns the value controlled or not and emits
the member's event: Checkbox's `api.setChecked(true)`, Select's `api.setValue([value])`, Dialog's
and Menu's `api.setOpen(false)`. A member without a machine acts through its element: Button's
`agentPress(control)`, Input's `agentFill(control, value)`. A refusal is a statement that throws,
written as an immediately called arrow:

```ts
clear: `(() => {
  if (readOnly) throw new Error('The field is read-only.')
  agentFill(control, '')
})()`,
```

The engine's helpers an expression may call are listed in `ENGINE_HELPERS`
(`packages/shells/src/types.ts`): `agentFill`, `agentPress`, `menuChoices` and `chooseMenuEntry`
among them. A helper the expression calls that is not listed is not imported by the generated
file.

[shells.md](shells.md) describes how each renderer writes the block.

### Parts and evidence

Each part an evidence names or an action presses needs a selector in `PARTS`
(`packages/conformance/src/parts.ts`), which the contract statements share. A selector must not find the part by the attribute its
evidence reads: `as box aria-checked` cannot be checked on a box found by `[aria-checked]`. A
secret state with no evidence needs a `field` part, which the runner types its probe into
(PasswordInput's `field`).

An action that calls a handler of the entry it chooses, rather than a prop, needs an entry in
`CHOICE_PROBES` in the same file: a function from a spy maker to the props that give the member
entries whose handlers are spies. Menu's gives four entries, two commands, a disabled one and a
`danger`-toned one. The law fails on a probe kept for a member whose fence calls no entry's
handler.

A handler that is neither a prop of the mounted member nor an entry a prop gives it cannot hold a
spy: a field of a record in the toast store, which the viewport reads and takes no prop for. The
fixture entry the law mounts then reports the call itself. Its handler dispatches
`polymorph:fixturecall` on `document` with the handler's name as the `detail`
(`FIXTURE_CALL_EVENT`, exported by `@polymorph/conformance`), and the runner counts the event as a
call of that handler while a step runs. Toast's pinned notices report `onDismiss` and their
action's `onClick` this way, in the React fixture and in the description, with the same
expression. A handler a prop or a choice probe can reach takes a spy, and never reports.

A `text` or `number` action whose member refuses the runner's fixed probe needs an entry in
`VALUE_PROBES` in the same file: a function from the current value to a value the member takes.
A date field's gives a day inside every bounded entry's limits, and PhoneInput's a number in
E.164. The law fails on a probe kept for a member whose fence takes no text or number. A secret
field that takes digits only is typed `AGENT_SECRET_DIGITS`, because it would keep none of the
letters of the usual probe (OTPInput).

An action that exists only at some window sizes is pinned with `when` to a fixture entry listed
in `WINDOW_SIZES` in the same file, with the size the entry is mounted at. AppShell's drawer
entries are mounted 600 pixels wide, below the drawer breakpoint. The law fails on a row that
names no member or no entry of the fixture, or an entry no statement of the fence names.

### What the law checks

The conformance law runs each statement from a fresh mount of one states fixture entry, with a
bridge installed, on every renderer ([conformance.md](conformance.md) has the full table). In
brief: a `state` is listed with a value of its type, its evidence agrees before and after each
action that sets it, and a secret one hides a probe typed into its field from every output; an
`action` is listed with its argument type and its `among`, runs with a probe value, sets its
state (read from the step's result when the step unlisted the member), calls its handler,
presses its part, refuses a disabled choice, refuses a choice of another list when it names its
own with `among`, and emits one change event; `destructive when` needs a person, is declined on a
no and runs on a yes; `destructive option when` does the same for an entry
marked destructive; `destructive never` runs on a `danger`-toned instance with no one to ask;
`withholds contents` finds a registered member inside the region and shows that no snapshot,
query or step reaches it.
Every member with a fence also refuses an action it does not declare, with its fence's actions as
the allowed list, and on its `disabled` fixture entry lists no action and refuses a step.

A statement with no `when` starts from the first entry that can run it: one that registers the
member, lists the action, and, for an action with no argument that `sets` a state, one in which
the action changes it (`uncheck` needs a checked entry). Write `when` when the entry the law
should use is not the first that qualifies, as Select's `choose` names the entry with a disabled
option so the refusal is checked.

The check of an undeclared action and the `destructive` statements have no entry of their own.
Each holds on any entry that lists the member, so it tries first the entries the fence's `when`
clauses name, then the rest in fixture order.

A mount waits up to three seconds for the member to register. The runner records each entry on
which a mount registers nothing, for that renderer and with the props it set on the member, and
a later statement's search passes over it. So an entry that never registers the member (a Card
without `href`, a chart with one series and no `onSelect`, a closed Dialog) costs that wait once
per member, renderer and set of props, and not once per statement. The props are part of the
record because they can decide whether a member registers: such a chart registers once the
runner gives it an `onSelect` spy. An entry a `when` names is mounted whatever the record says, and a statement
fails when its entry registers nothing. Before a search fails for want of an entry, it mounts
each entry it passed over. A member that registers in only some entries names one of them with
`when` in each statement, `withholds contents` included, so the law mounts no entry to find out
that it registers nothing there: Card's `action press calls onNavigate when linked`, and an
overlay with closed entries, as Dialog's `state open boolean as panel present when open md`.

### Running the law for one member

One member's agent statements on every renderer, on Chromium:

```sh
pnpm exec vitest run src/conformance.test -t "agent conformance — the .* shell Checkbox "
```

On one renderer, by its project (`ui` for React, `vue`, `svelte`, `solid`, `angular`, `elements`):

```sh
pnpm exec vitest run --project ui packages/react-ui/src/conformance.test.tsx -t "agent conformance — the React shell Checkbox "
pnpm exec vitest run --project vue packages/vue-ui/src/conformance.test.ts -t "agent conformance — the Vue shell Checkbox "
pnpm exec vitest run --project svelte packages/svelte-ui/src/conformance.test.ts -t "agent conformance — the Svelte shell Checkbox "
pnpm exec vitest run --project solid packages/solid-ui/src/conformance.test.ts -t "agent conformance — the Solid shell Checkbox "
pnpm exec vitest run --project angular packages/angular-ui/src/conformance.test.ts -t "agent conformance — the Angular shell Checkbox "
pnpm exec vitest run --project elements packages/elements-ui/src/conformance.test.ts -t "agent conformance — the Elements shell Checkbox "
```

The space after the member's name keeps `Checkbox` from also running `CheckboxGroup`. On Firefox
and WebKit as well, with the matrix:

```sh
PM_BROWSER_MATRIX=1 pnpm exec vitest run src/conformance.test -t "agent conformance — the .* shell Checkbox "
```

Every agent check, the well-formedness checks and the false statements among them:

```sh
pnpm exec vitest run src/conformance.test -t "agent"
```

The grammar and the staleness law run in the `logic` project:

```sh
pnpm exec vitest run packages/registry/src/agent.test.ts packages/registry/src/agent-staleness.test.ts
```

### The laws

| Law | Where | What fails it |
| --- | --- | --- |
| Grammar | `packages/registry/src/agent.test.ts`, and `pnpm registry` | a fence that does not parse, or breaks a fault above, with the rule and the line |
| Coverage | `packages/registry/src/registry.test.ts` | a control or an overlay whose spec has no `## Agent` section, or one with no prose, or one that still holds the scaffolder's placeholder. A section with prose and no fence is a decision that agents get nothing, and the prose gives the reason (Tooltip, CopyButton, FormField) |
| Staleness | `packages/registry/src/agent-staleness.ts` | a state or action the spec declares that the React member or the description does not register, or the reverse; a `secret` list or a `destructive` that disagrees with the fence; a member that registers with no fence |
| Conformance | `packages/conformance/src/agent.ts`, through each shell's `conformance.test` | a statement that does not hold on a renderer; an undeclared action that is not refused with the allowed list; a disabled entry that lists an action |
| Runtime | `packages/engine/src/agent/*.test.ts` | a secret in any output; a policy that widens; a destructive action that runs without a person; an undeclared action that runs |
| Size | `scripts/size` | the bridge in a fixture that does not import it; a fixture over its budget |

The staleness law treats `destructive never` as no `destructive` in the code.

### Traps

- **Svelte reads `$state` as a store of a value named `state`.** A description whose `derived`
  (or `state`) names a value after a rune the component writes (`state`, `derived`, `effect`,
  `props`, `bindable`) is refused by the Svelte renderer once an agent block adds an element ref,
  which Svelte holds in `$state`. Rename the value in the description; the DOM does not change
  (Button's `state` became `dataState`).
- **An element that is a member's host in Angular.** An Angular member renders inside its host
  element (`pm-button`), so a selector that reads a part's place in its parent reads through the
  host, as the existing `PARTS` entries do.
- **A closed overlay is not listed.** A Dialog's panel is its element, so a closed Dialog is not
  in the snapshot, and a step on it answers `unknown-member`. A statement pinned to a closed entry
  (`when closed …`) cannot run, and a test that expected a closed member in a snapshot expects
  its absence. The runner finds an open overlay's member by the registration its mount made,
  because its panel is portalled out of the element the entry rendered into.
- **A shared element.** Menu's trigger is a Button, which registers too: both are listed, Menu's
  `open` and Button's `press` reach the same control, and neither is `within` the other.
- **A choice the probe skips.** An `id` action's probe is an enabled, unmarked choice other than
  the current one, of the state it chooses among when it names one; an entry that offers none is
  skipped. A `destructive option when` needs an
  entry with an enabled choice marked destructive.
- **An entry named "disabled option".** The runner takes a fixture entry whose name begins with
  `disabled` as the disabled member, unless one is named exactly `disabled`. A member with an
  entry that disables one option needs an entry named `disabled` too (SegmentedControl).
- **An entry the spy does not reach.** An entry that draws the member inside surrounding text, or
  inside a holder component that keeps its own handler, gets no handler spy. Pin the statement to
  another entry with `when` (Link's `press when standalone`).
- **A handler no prop reaches.** A `calls` on a handler that a store record holds, not a prop of
  the mounted member, fails with "was not called" until the fixture reports it with
  `polymorph:fixturecall` (Toast's notices). Report only such a handler: one that a prop or a
  choice probe reaches takes the runner's spy, which checks that the member called the caller's
  own handler.
- **A statement, not an expression.** A block-bodied `run` in a description writes statements
  (`if (open) close()`), because `open && close()` fails lint in the generated Solid and Angular
  members.
- **A type literal in an agent expression.** The Vue renderer rewrites a prop's name wherever an
  expression writes it, inside a type literal too: `{ id: string }` becomes `props.id`. Name a
  type that mentions no prop (TreeSelect).
- **An action that adds to a list.** `sets` means the state equals the argument afterwards, so an
  action that adds one item writes `calls` and no `sets` (TagInput's `add`).
- **An element that changes between states.** A member may name a different element in each
  state (InlineEdit's field while editing, its edit control at rest). The change event is
  dispatched on the element the member names after the step.
- **An action that depends on the window's width.** The law mounts an entry at the default
  window size unless `WINDOW_SIZES` in `packages/conformance/src/parts.ts` gives it another, so an
  action that exists only below a breakpoint is pinned with `when` to an entry listed there
  (AppShell's `open` and `close`). The law fails on a row whose entry no statement names.
- **A state only a press reaches.** An entry whose state no prop sets presses a control once it
  is in the document (`presses` in a description, an effect in the React fixture), on its first
  frame. A statement pinned to it reads the state only once the press has run: the runner waits
  two frames after it mounts an entry `WINDOW_SIZES` lists (AppShell's open drawer).
- **A server component stays one.** Registering is a hook, so it would make a member without
  `'use client'` a client component in a React Server Components application. Such a member
  gets a section with the reason and no fence (Plan, ChatMessage). Citation and SourceList get
  one too: each of their links opens a new tab, which an agent's press cannot open.
- **An `id` action and an `ids` state.** `sets` compares the argument with the state, so an action
  that takes one id cannot write `sets` on a state that holds several (Accordion's `expand`). It
  writes `calls`. Without `among`, a member's `choices` states are read together for an `id`
  action's probe and for the bridge's check of the value. A member with more than one `choices`
  state names the one each `id` and `ids` action chooses from with `among`, and the grammar refuses
  such an action without it, because an id of one list would pass the check of another.
- **An action that ends after an animation.** An action whose handler runs when a leaving
  animation ends returns a promise that resolves when the handler has run, or when the member
  unmounts first, so the step never waits for nothing (Alert's `dismiss`).
- **A value React decides in an effect.** State set from an effect is one render behind the
  decision. A handle that reports such a value reads it from a ref (TableOfContents' `current`).
- **The card grows.** The system card lists each member's `agent:` segment, so each fence adds to
  the card's length, which `packages/registry/src/card.test.ts` holds under a ceiling.
