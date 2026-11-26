import { renderSystemCard, type Registry } from '@polymorph/registry'

import { all, commands, either, Facts, SkillFactError, skill, type SkillFile } from './facts'

/** A member's agent contract: what its spec's `agent` fence declares. */
type Contract = NonNullable<Registry['components'][number]['agent']>

/**
 * What the texts say an agent may read from a member and do with it, read from
 * the registry's agent contracts and from the card the reader has. A state, an
 * action or a segment the registry lacks throws, so a renamed action stops the
 * texts from being written rather than reaching a model.
 */
class AgentFacts {
  /** Each member's `agent:` segment, as the web card writes it. */
  private readonly segments = new Map<string, string>()

  constructor(
    private readonly registry: Registry,
    private readonly f: Facts,
  ) {
    for (const line of renderSystemCard(registry).split('\n')) {
      const name = /^- \*\*(\w+)\*\* — /.exec(line)?.[1]
      const segment = line.split(' · ').find((part) => part.startsWith('agent:'))
      if (name !== undefined && segment !== undefined) this.segments.set(name, segment)
    }
  }

  private contract(member: string): Contract {
    const found = this.registry.components.find((entry) => entry.name === member)
    if (found === undefined) throw new SkillFactError(`no member called ${member}`)
    if (found.agent === null) throw new SkillFactError(`${member} declares nothing for an agent`)
    return found.agent
  }

  /** The member's `agent:` segment in code font, as the card writes it. */
  segment(member: string): string {
    this.contract(member)
    const found = this.segments.get(member)
    if (found === undefined) throw new SkillFactError(`the card gives ${member} no agent segment`)
    return `\`${found}\``
  }

  /** `state` in code font, once the member's contract reads it. */
  state(member: string, state: string): string {
    if (!this.contract(member).states.some((entry) => entry.name === state)) {
      throw new SkillFactError(`${member}'s agent reads no state ${state}`)
    }
    return `\`${state}\``
  }

  /** `action` in code font, once the member's contract runs it, taking `argument` when given. */
  action(member: string, action: string, argument?: string): string {
    const found = this.contract(member).actions.find((entry) => entry.name === action)
    if (found === undefined) throw new SkillFactError(`${member}'s agent runs no action ${action}`)
    if (argument !== undefined && found.argument !== argument) {
      throw new SkillFactError(`${member}'s ${action} takes ${found.argument ?? 'nothing'}`)
    }
    return `\`${action}\``
  }

  /** The member in code font, once its spec declares nothing for an agent. */
  hidden(member: string): string {
    const found = this.registry.components.find((entry) => entry.name === member)
    if (found === undefined || found.agent !== null) {
      throw new SkillFactError(`${member} is not a member hidden from agents`)
    }
    return this.f.m(member)
  }

  /** Every member whose contract `test` holds, in code font, in the registry's order. */
  members(test: (contract: Contract) => boolean): string[] {
    const found = this.registry.components
      .filter((entry) => entry.agent !== null && test(entry.agent))
      .map((entry) => this.f.m(entry.name))
    if (found.length === 0) throw new SkillFactError('no member has that agent contract')
    return found
  }
}

/** `name(args)` in code font, once the module or the file `from` declares `name`. */
function call(f: Facts, name: string, from: string, args: string): string {
  return `${f.x(name, from).slice(0, -1)}(${args})\``
}

/**
 * `polymorph-agent-bridge`: an agent on a running page reads and operates the
 * mounted members through `@polymorph/engine/agent`, its tools and WebMCP.
 * The procedure is the application's side of `docs/agents.md`, written for a
 * reader in another repository; the API is in `references/api.md` and the
 * members that need care in `references/members.md`.
 */
export function bridgeSkill(registry: Registry, run: string): SkillFile[] {
  const f = new Facts(registry)
  const a = new AgentFacts(registry, f)
  const agent = '@polymorph/engine/agent'
  const webmcp = '@polymorph/engine/webmcp'
  const secrets = all(a.members((contract) => contract.states.some((state) => state.secret)))
  const hidden = all(['Text', 'Heading', 'FormField', 'Tooltip', 'CopyButton'].map(a.hidden, a))
  const body = `
# Let an agent on the page read and operate the members

The agent bridge, \`${agent}\`, lets an agent on a running page read the polymorph members the
page shows and operate them: an assistant inside the product, an agent in the browser that calls
the page's WebMCP tools, or you. Each member whose spec declares an agent section registers with
the bridge while it is mounted, in every web framework and in the \`poly-*\` elements. The bridge
reports the states that declaration names and runs the actions it names, and nothing else.

Every command in this skill starts with the same words, the polymorph tools run from a shell.
\`<framework>\` is the app's: the \`polymorph-screen\` skill says how to tell it.

## 1. Check that the bridge is the tool

| The job | Use |
| --- | --- |
| An assistant in the product reads the screen, fills fields, chooses and presses | a bridge handed to the assistant as tools: steps 3, 4 and 5 |
| An agent in the browser operates the page through WebMCP | a bridge registered with WebMCP: steps 3, 4 and 6 |
| You drive a page built with polymorph and want a surer way than the DOM | the tools the page registered: step 7 |
| The agent shows the person a form or a choice of its own | a run-time screen: the \`polymorph-runtime-screen\` skill |
| The agent needs a record's data, or an operation no member offers | a tool of the application's own: step 9 |
| A SwiftUI or Compose screen | nothing: native members do not register, and there is no bridge |

For each member it lists, the bridge gives an id, the member's name, its control's accessible
name and description (a field's hint and error), the member it is \`within\`, its declared states
and the actions it allows now. It runs steps on those actions and reports what changed. It never
gives:

- A member that declares nothing, such as ${hidden}, or anything that is not a member: a plain
  element in a ${f.m('Bespoke')} zone, a component inside ${f.m('ThirdParty')}, the page's text.
- A member whose element is absent or inside content marked \`hidden\` (a closed ${f.m('Dialog')},
  a collapsed panel), or one another member withholds (${f.m('ConfirmDialog')}'s confirm).
- A secret: ${secrets} read their value as \`{ secret: true }\`, and every password field's value
  is removed from every output.
- What a member shows beyond its states: a ${f.m('Table')} reads its sort, never its cells.
- An action of a member whose \`disabled\` state is true.

## 2. Read what each member lets an agent do

${commands(run, 'card --framework <framework>')}

A member an agent can see ends its card line with an \`agent:\` segment: the actions an agent may
run, then, after \`|\`, the states it reads. A \`(secret)\` state reads \`{ secret: true }\`. A
member with no segment is hidden from agents.

- ${f.m('Checkbox')}: ${a.segment('Checkbox')}.
- ${f.m('Select')}: ${a.segment('Select')}. ${a.action('Select', 'choose', 'id')} takes the id of
  one of its ${a.state('Select', 'options')}.
- ${f.m('PasswordInput')}: ${a.segment('PasswordInput')}. An agent runs nothing.

The JSON answer adds the types:

${commands(run, 'component Select --framework <framework> --json')}

Under \`component.agent\`, each action gives its \`argument\` (\`boolean\`, \`number\`, \`text\`,
\`id\` or \`ids\`), the \`among\` state whose choices an id names, and the state it \`sets\`.
\`destructive\` and \`destructiveOptions\` say what makes a step wait for a person, such as
${f.m('Button')}'s ${f.v('Button', 'tone', 'danger')}. [references/members.md](references/members.md)
says how the members that need care read and act.

## 3. Choose how the page loads the bridge

A bundled app, in any framework, imports the bridge from \`@polymorph/engine\`, which \`init\`
installs. If \`package.json\` does not list it, add it as the other \`@polymorph/*\` packages are
listed, at their release. The members write to a registry inside that package, so the app must
resolve one copy of it: a second copy holds an empty registry. No foundation has a hook or a
component for the bridge, and nothing in a bundled app reads \`data-agent\`.

| The app wants | It calls | The page loads |
| --- | --- | --- |
| Its own assistant to call the tools | ${f.x('createAgentBridge', agent)} and ${f.x('agentTools', agent)} (steps 4 and 5) | the bridge, in the app's bundle |
| Browser agents to call the tools, the bridge loaded at once | \`createAgentBridge\` and ${f.x('registerWebMCP', agent)} (step 4) | the bridge, in the app's bundle |
| Browser agents to call the tools, the bridge loaded on the first call | ${f.x('registerWebMCPOnCall', webmcp)} from \`${webmcp}\` (step 6) | the tools' definitions now, and the bridge as a chunk of its own on the first call |

A page with no build states the choice on its document element, and writes no script:

\`\`\`html
<html lang="en" data-system="…" data-palette="…" data-agent="on-call">
\`\`\`

| \`data-agent\` | The page |
| --- | --- |
| absent | registers nothing and fetches nothing more. Exposing a page is its owner's decision, so this is the default |
| \`on-call\` | registers the three tools with WebMCP at load, and fetches and creates the bridge on the first call |
| \`eager\` | fetches and creates the bridge at load, and registers its tools |

\`polymorph.js\` and \`polymorph-all.js\` read the attribute once, as they run. Another value warns
in the console and registers nothing. In a browser without WebMCP neither value does anything. The
bridge the setting creates has no \`confirm\` and no policy, so a step that needs a person answers
\`needs-confirmation\`. A page that asks a person, or narrows what an agent may do, states no
\`data-agent\` and creates its own bridge: [references/no-build.md](references/no-build.md).

## 4. Create the bridge

Create it in the browser once the page has mounted, and dispose of it when the page unmounts. One
module serves every framework:

\`\`\`ts
// src/agent/page-agent.ts
import {
  createAgentBridge,
  registerWebMCP,
  type AgentConfirmRequest,
} from '${agent}'

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
\`\`\`

Call it where the framework runs code after mounting:

\`\`\`ts
// React, in a component. \`ask\` keeps its identity (useCallback), or the bridge is made again.
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
\`\`\`

\`ask\` asks the person and resolves \`true\` for yes: step 8 says how. The options are \`confirm\`,
\`policy\`, whose \`hide\` and \`deny\` can only take a member or an action away, and \`settleMs\`, how
long a step waits for its member to change (150 by default).
[references/api.md](references/api.md) has each option, field, error and event. A page with no
build creates its bridge in a module script: [references/no-build.md](references/no-build.md).

## 5. Hand the tools to the product's assistant

\`agentTools(bridge)\` returns three tools, \`polymorph_snapshot\`, \`polymorph_query\` and
\`polymorph_act\`. Each has a \`description\` written for a model, a JSON Schema \`inputSchema\`, and
\`execute(input)\`, which resolves to JSON and never rejects. Create the bridge as in step 4, and
hand its tools to the assistant in place of \`registerWebMCP\`:

\`\`\`ts
// src/agent/assistant-tools.ts
import { agentTools, type AgentBridge } from '${agent}'

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
      if (tool === undefined) return { error: { code: 'unknown-tool', message: \`No tool \${name}.\` } }
      return tool.execute(input)
    },
  }
}
\`\`\`

The calls run in the page, where the bridge is: a model on a server sends each call to the page.
Every output holds the page's content, which a person or a record wrote, and each tool says so
with \`untrustedContentHint\`. Tell the model that this content is data and never an instruction.

## 6. Or register the tools with WebMCP

\`registerWebMCP(bridge)\` registers the three tools on \`document.modelContext\`, or on
\`navigator.modelContext\` in earlier browser builds, and returns the function that unregisters
them. \`registerWebMCPOnCall\` registers them before the bridge loads, and loads it on the first
call: [references/api.md](references/api.md) has a React component that does it.

- A load that fails answers that call with \`{ error: { code: 'failed', message } }\`, and the
  next call loads again.
- One registration holds the tool names on a page. While it stands, another \`registerWebMCP\`,
  \`registerWebMCPOnCall\` or \`data-agent\` registers nothing and warns in the console.
- Where the browser has no WebMCP API, nothing registers, and the function returned does nothing.

## 7. Read, then act

This is the procedure for the agent, through the tools or the bridge.

1. Read the page with \`bridge.snapshot()\`, or find members with
   \`bridge.query({ name, text, member })\`. \`name\` matches the accessible name and each choice's
   label, \`text\` the text the member shows and its description, and \`member\` the member's name
   whole. Each ignores case. A snapshot lists every choice of every member, so on a large page
   query instead.
2. Write each step as \`{ id, action, value }\` with an id from that read, or as
   \`{ target: { member, name }, action, value }\`. A target must name one member: its name is
   matched whole, then as a part.
3. Give \`value\` only to an action that lists an \`argument\`, and of that type. An \`id\` or
   \`ids\` names enabled choices of the state \`among\` names, or of any choices state. Write text
   in the form the member's own state shows, such as a date field's \`2026-07-15\`.
4. Run \`bridge.act(steps)\`. It runs the steps in order, stops at the first that fails, never
   rejects, and runs one \`act\` at a time.
5. Read each result. \`{ ok: true, id, changed }\` means the action ran, and \`changed\` holds each
   state that changed, as \`{ from, to }\`. An empty \`changed\` means the member did not change
   within \`settleMs\`: a press that opened something else, or a value the application did not
   take. Read again before you conclude.
6. Read again after a step that changes the page. An opened ${f.m('Dialog')} lists new members,
   and a member mounted again has a new id. Inside one \`act\`, name a member an earlier step
   brings up by \`target\`, because it had no id when you read.

| \`error.code\` | Do |
| --- | --- |
| \`unknown-member\` | Read again. The member is gone, closed, hidden, withheld or declares nothing |
| \`ambiguous-target\` | Name it by one of the ids the message lists |
| \`not-allowed\` | Choose from \`allowed\`, the actions it allows now. An empty list is the application's policy |
| \`disabled\` | Do what enables it, or tell the person |
| \`invalid-value\` | Read the action's argument and the member's choices again |
| \`needs-confirmation\` | The page asks no one, so a person must do it. Do not look for another way |
| \`declined\` | The person said no. Do not run it again unasked |
| \`failed\` | The member refused or threw, and the message says why, such as a read-only field |

An agent that drives a browser from outside the page calls the tools the page registered, which
carry the owner's policy and \`confirm\`. A page that registered none has offered no bridge:
exposing a page is its owner's decision. Operate that page as a person does, through the browser,
and do not load a bridge into it.

## 8. Decide what needs a person

| The bridge holds | The bridge does not |
| --- | --- |
| A destructive instance (${f.m('Button')} with ${f.v('Button', 'tone', 'danger')}) or a choice marked destructive (a \`danger\` entry of ${f.m('Menu')}) waits for \`confirm\`, and is refused without one | Ask about a consequential action that is not destructive: a ${f.m('Button')} labelled Send or Place order runs at once |
| No action answers for a person: ${f.m('ConfirmDialog')} withholds its confirm | Know which agent calls: every WebMCP client the browser lets call the page gets what the policy leaves |
| A secret never leaves it, in a state, a name, a message or a change | Bind a bridge it did not make: any script on the page can create one without the policy or \`confirm\` |
| A policy only narrows what the members declare | Respect modality: while a modal ${f.m('Dialog')} is open, the members behind it are listed and run |
| One \`act\` of a bridge runs at a time | Filter what the page says: a name or a value can hold text written to steer a model |

So the product decides, and writes down:

1. Who gets the tools: its own assistant, the browser's agents through WebMCP, or no one.
2. What needs a person beyond the destructive actions. Deny it in the policy, or let its handler
   ask the person when \`bridge.acting\` is true. The bridge sets it while a step's action runs,
   and a ${f.m('Button')}'s ${f.p('Button', 'onClick')} runs inside a \`press\`.
3. How the person is asked: through a member the page draws, such as a ${f.m('ConfirmDialog')},
   whose confirm an agent cannot press. [references/asking.md](references/asking.md) has a React
   component that asks this way, and records what an agent did.

The server still checks every request, because an agent acts with the person's session.

## 9. When the member the task needs declares nothing

1. Look for a member that declares what the task needs: \`search\` and the card's segments say
   which. A ${f.m('Link')} is pressed where a plain \`<a>\` is not listed.
2. For data or an operation that is the application's own, such as a table's rows, an export or
   a filter no member draws, give the agent a tool of the application's own beside the bridge's.
   It calls the code the interface's handler calls, and the server authorizes it. Add it to the
   assistant's tool list, or register it with WebMCP under a name of its own.
3. A member that should declare more is the design system's decision. Tell the person which
   member, and which state or action. A member's \`## Agent\` section declares it, and a release
   of polymorph ships it.

Never write to a member's DOM, or click it from a script, to reach what it does not declare: that
skips every check the bridge makes. Never call ${f.x('agentMember', '@polymorph/engine')} or
${f.x('useAgentMember', '@polymorph/react')} from application code: a handle the application
writes is held to no spec, and the bridge would list it as a member. Take step 2 instead.

## 10. Test it

Test the bridge in a real browser, as polymorph does, with Vitest's browser mode and Playwright:
the members need real focus, pointer and layout. [references/testing.md](references/testing.md)
has a test to copy and the traps.
`
  return [
    {
      path: 'polymorph-agent-bridge/SKILL.md',
      contents: skill(
        'polymorph-agent-bridge',
        'Let an AI agent on a running page read and operate the polymorph members through the ' +
          'agent bridge, instead of scraping the DOM or clicking coordinates. Use when asked to ' +
          'let an in-app assistant or chatbot fill a form or operate a screen, make a page usable ' +
          'by an AI agent or a browser agent, expose a page’s actions as tools for a model, add ' +
          'WebMCP (document.modelContext) tools, put data-agent on a page with no build, read the ' +
          'agent segment of the polymorph system card, or drive a page built with polymorph from ' +
          'an agent. Covers @polymorph/engine/agent (createAgentBridge, snapshot, query, act, ' +
          'confirm, the policy, secrets, agentTools, registerWebMCP), @polymorph/engine/webmcp ' +
          '(registerWebMCPOnCall, applyAgentSetting), loadAgentBridge in polymorph.js, and ' +
          'testing a bridge.',
        body,
      ),
    },
    { path: 'polymorph-agent-bridge/references/api.md', contents: apiReference(registry) },
    {
      path: 'polymorph-agent-bridge/references/members.md',
      contents: membersReference(registry, run),
    },
    { path: 'polymorph-agent-bridge/references/asking.md', contents: askingReference(registry) },
    { path: 'polymorph-agent-bridge/references/testing.md', contents: testingReference(registry) },
    { path: 'polymorph-agent-bridge/references/no-build.md', contents: noBuildReference(registry) },
  ]
}

/** The bridge's API, entry point by entry point, as the published packages export it. */
function apiReference(registry: Registry): string {
  const f = new Facts(registry)
  const agent = '@polymorph/engine/agent'
  const webmcp = '@polymorph/engine/webmcp'
  const testing = '@polymorph/engine/testing'
  const types = [
    'AgentBridge',
    'AgentBridgeOptions',
    'AgentConfirmRequest',
    'AgentPolicy',
    'AgentPolicyMember',
    'AgentSnapshot',
    'AgentSnapshotMember',
    'AgentSnapshotAction',
    'AgentQuery',
    'AgentMatch',
    'AgentStep',
    'AgentStepResult',
    'AgentActResult',
    'AgentChange',
    'AgentChangeDetail',
    'AgentError',
    'AgentErrorCode',
    'AgentTool',
    'AgentToolName',
    'AgentToolAnnotations',
  ].map((name) => f.x(name, agent))
  return `# The agent bridge's API

What each entry point exports, as the published packages have them. \`@polymorph/engine\` is
installed under that name, as an alias of \`@metamorph-labs/polymorph-engine\`.

## \`${agent}\`

| Export | What it is |
| --- | --- |
| ${call(f, 'createAgentBridge', agent, 'options?')} | a bridge over the members mounted on the page. Two bridges read the same registry and report the same ids |
| ${call(f, 'agentTools', agent, 'bridge')} | the bridge as three tools, for the application's own agent |
| ${call(f, 'registerWebMCP', agent, 'bridge')} | registers those tools with the browser's WebMCP API, and returns the function that unregisters them |
| ${f.x('AGENT_CHANGE_EVENT', agent)} | \`'polymorph:agentchange'\` |
| ${f.x('AGENT_SETTLE_MS', agent)} | \`150\`, the default \`settleMs\` |

Types: ${all(types)}.

### The bridge

| Member | What it does |
| --- | --- |
| \`snapshot()\` | \`{ members }\`: each listed member, in document order |
| \`query(query)\` | the members that match, each \`{ id, member, name, option? }\` |
| \`act(steps)\` | runs the steps in order and resolves to \`{ results }\`, stopping at the first that fails. It never rejects, and one \`act\` runs at a time |
| \`subscribe(listener)\` | calls \`listener\` after each step that succeeds, and returns the function that stops it. A listener that throws does not fail the step |
| \`acting\` | \`true\` while a step's action runs |
| \`dispose()\` | stops the bridge: it lists nothing after this, and a step answers \`unknown-member\` |

### Options

| Option | What it takes |
| --- | --- |
| \`confirm\` | \`(request) => boolean \\| Promise<boolean>\`. \`request\` is \`{ id, member, name, action, value? }\`. Only \`true\` is yes. A \`confirm\` that throws or rejects is a no. The state is read again after the answer, and a member removed while the person was asked answers \`unknown-member\` |
| \`policy.hide\` | \`(member) => boolean\`, where \`member\` is \`{ id, member, name, element }\`. \`true\` takes the member out of every output and every step |
| \`policy.deny\` | \`(member, action) => boolean\`. \`true\` takes the action away. Either function that throws hides or denies |
| \`settleMs\` | milliseconds a step waits for the member's state to change after its action. The bridge reads the state again every few milliseconds and stops at the first change |

### A snapshot entry

| Field | What it holds |
| --- | --- |
| \`id\` | the instance's id, stable while it is mounted. A member mounted again has a new one |
| \`member\` | the member's name |
| \`name\` | the accessible name of its control: from \`aria-labelledby\`, \`aria-label\`, its \`<label>\`, \`alt\`, its text or \`title\`. A table is named by its caption, never its cells |
| \`description\` | the text its control's \`aria-describedby\` names: a field's hint and error. Absent when empty, and for a member that holds a secret |
| \`within\` | the id of the nearest listed member whose element contains this one's |
| \`state\` | the declared states, read now. A secret one, and one that holds a secret, is \`{ secret: true }\` |
| \`actions\` | each action allowed now: \`{ name, argument?, among?, confirm? }\`. \`confirm: true\` means a person must confirm it. A disabled member lists none |

A snapshot has no size limit of its own: it lists every listed member with every choice of each,
such as every option of a long ${f.m('Select')}. Only a chart caps its marks. To keep what a model
reads small, use \`query\`, hide the members outside the region the agent works in with
\`policy.hide\`, or page the content the members show.

### A step and its result

A step is \`{ id?, target?: { member?, name? }, action, value? }\`. A result is
\`{ ok: true, id, changed }\`, where \`changed\` maps each state that changed to \`{ from, to }\`, or
\`{ ok: false, id?, error: { code, message, allowed? } }\`. A state that holds a secret is left out
of \`changed\`.

| Code | When |
| --- | --- |
| \`unknown-member\` | the id names no listed member, the target names none, or the member was removed while the person was asked |
| \`ambiguous-target\` | the target names more than one member. The message lists their ids |
| \`not-allowed\` | the member does not declare the action, or the policy denies it. \`allowed\` lists the actions it allows now |
| \`disabled\` | the member's \`disabled\` state is true |
| \`invalid-value\` | the value is not of the argument's type, names no enabled choice, or the step is not an object |
| \`needs-confirmation\` | the action needs a person, and the bridge has no \`confirm\` |
| \`declined\` | the person said no, or \`confirm\` failed |
| \`failed\` | the action threw, with the member's message, any secret replaced |

### Change events

A step that succeeds dispatches \`polymorph:agentchange\`, bubbling, on the element its member names
after the step; when that is gone, on the element it named before, while that is in the document;
and otherwise on the document. The detail is \`{ id, member, action, changed, source: 'agent' }\`,
the same object \`subscribe\` hands its listeners. A step whose \`changed\` is empty dispatches one
too, and a step that fails dispatches none. \`references/asking.md\` shows a listener.

### The tools

| Name | Title | Input | Annotations |
| --- | --- | --- | --- |
| \`polymorph_snapshot\` | Read the page | \`{}\` | \`readOnlyHint\`, \`untrustedContentHint\` |
| \`polymorph_query\` | Find controls on the page | \`{ name?, text?, member? }\`, strings | \`readOnlyHint\`, \`untrustedContentHint\` |
| \`polymorph_act\` | Operate controls on the page | \`{ steps }\`, each \`{ id?, target?, action, value? }\` | \`consequentialHint\`, \`untrustedContentHint\` |

Each tool's \`execute(input)\` resolves to JSON and never rejects. A malformed input is answered:
\`polymorph_act\` given no list of steps resolves to one \`invalid-value\` result.

## \`${webmcp}\`

It holds the tools' definitions and none of the bridge, so importing it keeps the bridge out of
the bundle.

| Export | What it does |
| --- | --- |
| ${call(f, 'registerWebMCPOnCall', webmcp, 'load, options?')} | registers the three tools now. On the first call it runs \`load\`, a dynamic import of \`${agent}\`, once, and creates the bridge with \`options\`. Calls that arrive while it loads wait for it. A failed load answers each waiting call with \`{ error: { code: 'failed', message } }\`, and the next call loads again. Returns the function that unregisters the tools and disposes of the bridge |
| ${call(f, 'applyAgentSetting', webmcp, 'value')} | does what a \`data-agent\` value says: \`null\` registers nothing, \`'on-call'\` registers as \`registerWebMCPOnCall\` does, \`'eager'\` also loads the bridge at once, and another value warns. The bridge has no options. Returns the function that unregisters |
| ${f.x('AGENT_ATTRIBUTE', webmcp)} | \`'data-agent'\` |

Types: ${f.x('AgentSetting', webmcp)} and ${f.x('AgentBridgeModule', webmcp)}.

In React, register in an effect and return what unregisters. The bundler puts the bridge in a
chunk the page fetches on the first call:

\`\`\`tsx
'use client'

import { useEffect } from 'react'
import { registerWebMCPOnCall } from '${webmcp}'

/** Registers the tools now, and fetches and creates the bridge on the first call. */
export function OnCallAgent({ ask }: { ask: (question: string) => Promise<boolean> }) {
  useEffect(
    () =>
      registerWebMCPOnCall(() => import('${agent}'), {
        confirm: (request) => ask(\`\${request.action} “\${request.name}”?\`),
      }),
    [ask],
  )
  return null
}
\`\`\`

A bundled app that wants the no-build setting's behaviour reads the attribute itself:

\`\`\`ts
import { AGENT_ATTRIBUTE, applyAgentSetting } from '${webmcp}'

const stop = applyAgentSetting(document.documentElement.getAttribute(AGENT_ATTRIBUTE))
\`\`\`

Every registration needs the browser's WebMCP API: \`document.modelContext\`, or
\`navigator.modelContext\` in earlier builds. Where neither exists, nothing registers or loads.

## \`${testing}\`

| Export | What it does |
| --- | --- |
| ${call(f, 'agentRegistrations', testing, '')} | every registered member as \`{ id, member, element, withholds }\`, withheld ones included, with no state and no action |
| ${call(f, 'installTestTheme', testing, '')} | installs a theme, so a member's computed style reads a token |
| ${call(f, 'fixedWidthHost', testing, 'width?')} | a host element of a fixed width in the body |
`
}

/** How the members that need care read and act, each name read from its agent contract. */
function membersReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const a = new AgentFacts(registry, f)
  const menus = all(a.members((contract) => contract.destructiveOptions.length > 0))
  const charts = a.members((contract) => contract.states.some((state) => state.name === 'count'))
  const legends = a.members((contract) => contract.actions.some((each) => each.name === 'toggle'))
  const brushes = a.members((contract) => contract.actions.some((each) => each.name === 'brush'))
  const one = ['Select', 'RadioGroup', 'SegmentedControl', 'Tabs'].map((name) => {
    a.action(name, 'choose', 'id')
    return f.m(name)
  })
  const many = ['CheckboxGroup', 'ChoiceCard'].map((name) => {
    a.action(name, 'choose', 'ids')
    return f.m(name)
  })
  return `# How the members read and act

The card names each member's actions and states. This file says what the names mean where a
caller can go wrong. The JSON answer of \`component\` gives each one's type:

${commands(run, 'component LineChart --framework <framework> --json')}

## What holds for every member

- **A choice** is \`{ id, label }\`, with \`disabled: true\` on one a person cannot pick and
  \`destructive: true\` on one that waits for a person. An action that takes \`id\` names one
  choice, and one that takes \`ids\` names the whole set. An id is the option's \`value\` where the
  member has one, else what the member says it is, such as a ${f.m('Menu')} entry's label. A
  repeated id takes \` (2)\` after it.
- **The application owns a controlled value.** A member whose value the application holds changes
  when the application passes the new value back. Until it does, a step succeeds with an empty
  \`changed\`.
- **A press is a person's press.** An action that presses a link takes the path a person's click
  takes: \`onNavigate\` routes it, or the browser leaves the page, and the step may never return.
- **A refusal is a \`failed\` step** with the member's reason: a read-only field refuses
  ${a.action('Input', 'fill', 'text')}, and a ${f.m('Dialog')} that is not dismissible refuses
  ${a.action('Dialog', 'close')}.

## Fields

- ${f.m('Input')}, ${f.m('Textarea')} and ${f.m('SearchInput')}: ${a.action('Input', 'fill', 'text')}
  writes the whole value, as typing it does, and ${a.action('Input', 'clear')} empties it.
- ${f.m('NumberInput')}: ${a.action('NumberInput', 'set', 'number')} commits a number held within
  its bounds, and ${a.action('NumberInput', 'clear')} commits \`null\`.
- ${f.m('Slider')}: ${a.action('Slider', 'set', 'number')} moves the first thumb and
  ${a.action('Slider', 'set-high', 'number')} the second of a range.
- A field that holds formatted text takes the form its own ${a.state('DatePicker', 'value')}
  shows, and refuses another form with the reason. ${f.m('DatePicker')} takes \`2026-07-15\`, or
  \`2026-07-15T09:30:00\` at a time granularity. ${f.m('DateRangePicker')} takes
  \`2026-06-01/2026-06-14\`. ${f.m('TimeInput')} takes \`09:30:00\`. ${f.m('PhoneInput')} takes a
  number with its \`+\` code or the national number, and reads the E.164 value.
- ${f.m('FormField')} declares nothing. Its label names the control, and its hint and its error are
  the control's \`description\`, which an agent reads after a fill.
- ${f.m('PasswordInput')} and ${f.m('OTPInput')} run nothing. A person types a secret.
- ${f.m('FileUpload')} runs ${a.action('FileUpload', 'remove', 'id')} and
  ${a.action('FileUpload', 'retry', 'id')} on the ${a.state('FileUpload', 'rows')} ids, and adds
  no file: a file is on the person's disk.

## Choices

- ${all(one)}: \`choose\` takes one id. A choice made while a list is closed needs no \`open\`
  first. ${all(many)}: \`choose\` takes the whole set of ids.
- ${f.m('Combobox')}: ${a.action('Combobox', 'choose', 'id')} picks among every option the
  application passed, not only those the typed text leaves, and
  ${a.action('Combobox', 'fill', 'text')} types the query, which the application hears as typing.
- ${f.m('MultiSelect')}: ${a.action('MultiSelect', 'choose', 'ids')} sets the whole selection, and
  \`[]\` clears it.
- ${menus}: \`choose\` runs an entry by its id, without opening the menu. The id is the entry's
  label, after each enclosing submenu's label and, on a ${f.m('Menubar')}, its menu's title, joined
  by \` / \` (\`Move to / Billing\`, \`File / Save\`). A \`danger\` entry waits for a person.

## Overlays and disclosure

- A closed ${f.m('Dialog')}, ${f.m('Drawer')} or ${f.m('Popover')} is not listed. Press the
  control that opens it, usually a ${f.m('Button')}, then read again. An open one runs
  \`close\`. A ${f.m('Dialog')} that is not dismissible is answered with one of its own Buttons.
- ${f.m('ConfirmDialog')} runs ${a.action('ConfirmDialog', 'cancel')} only. Its confirm is the
  person's.
- Content in a closed ${f.m('Accordion')} item, ${f.m('Collapsible')} or tab is not listed. Run
  ${a.action('Accordion', 'expand', 'id')}, ${a.action('Collapsible', 'open')} or
  ${a.action('Tabs', 'choose', 'id')} first, then read again.
- A modal does not hide the page behind it from the bridge, and neither does a stylesheet: only
  an absent element and content marked \`hidden\` are left out. Read \`within\` to tell the members
  inside an open ${f.m('Dialog')} from the ones behind it.

## Tables, lists and paging

- ${f.m('Table')}: ${a.state('Table', 'columns')} lists the sortable headers, each by its label.
  ${a.action('Table', 'sort', 'id')} presses a header once, and the application decides the order,
  so read ${a.state('Table', 'sort-key')} and ${a.state('Table', 'sort-direction')} afterwards.
- ${f.m('DataTable')}: ${a.action('DataTable', 'sort-ascending', 'id')} and
  ${a.action('DataTable', 'sort-descending', 'id')} take a column's key. Its row Checkboxes and
  disclosure Buttons are members listed \`within\` it, and ${a.state('DataTable', 'selection')}
  and ${a.state('DataTable', 'expanded')} read row ids.
- No table reads its cells. A model that needs the rows gets them from a tool of the
  application's own.
- ${f.m('List')}: ${a.action('List', 'choose', 'id')} presses an item, whose id is its \`href\`, or
  its title when it has none. An item that is only read is not a choice.
- ${f.m('Pagination')}: ${a.action('Pagination', 'set', 'number')} asks for a page by its number.

## Charts

A chart is listed while a person has something to operate in it: ${f.p('LineChart', 'onSelect')}
on ${all(charts)}, a legend that hides and shows a series on ${all(legends)}, or a brush on
${all(brushes)}. Without \`onSelect\`, ${a.state('LineChart', 'items')} is empty.

- \`items\` lists at most ${f.x('CHART_MARK_CAP', '@polymorph/engine')} marks: the whole positions
  around the reading position. ${a.state('LineChart', 'position')} is the reading position, and
  ${a.state('LineChart', 'count')} how many positions the chart has.
- ${a.action('LineChart', 'read', 'number')} moves the reading, which brings other marks into
  \`items\`. ${a.action('LineChart', 'choose', 'id')} picks a listed mark as Enter does, so
  \`onSelect\` receives what a person's press reports.
- ${a.action('LineChart', 'toggle', 'id')} hides or shows one of ${a.state('LineChart', 'series')},
  and ${a.state('LineChart', 'hidden')} lists the hidden ones. \`choose\` and \`toggle\` each name,
  as \`among\`, the list their id belongs to, and each refuses an id of the other list.
- ${a.action('LineChart', 'brush', 'number')} takes the row a range ends on and commits the range,
  and ${a.state('LineChart', 'range-start')} and ${a.state('LineChart', 'range-end')} read it.

## Toasts and the app shell

- ${f.m('Toast')} is one member on the viewport. ${a.state('Toast', 'notices')} lists the notices
  on screen by their ids, ${a.state('Toast', 'details')} says what each holds, and
  ${a.action('Toast', 'dismiss', 'id')} and ${a.action('Toast', 'act', 'id')} answer one. Neither
  waits for a person.
- ${f.m('AppShell')}: ${a.action('AppShell', 'go', 'id')} presses one of
  ${a.state('AppShell', 'destinations')}, and ${a.state('AppShell', 'current')} is where the person
  is. ${a.action('AppShell', 'collapse')} and ${a.action('AppShell', 'expand')} work the rail,
  and ${a.action('AppShell', 'open')} and ${a.action('AppShell', 'close')} the drawer below its
  breakpoint.

## What no agent does

- Type a secret, or reveal one.
- Add a file to ${f.m('FileUpload')}, or start a ${f.m('RecordButton')}, which runs
  ${a.action('RecordButton', 'stop')} only.
- Confirm for a person: ${f.m('ConfirmDialog')}'s confirm and ${f.m('ApprovalCard')}'s answers are
  withheld.
- Press a ${f.m('Link')} that opens a new tab: a browser opens one only in a person's own gesture.
- Read or run ${either(['CopyButton', 'Tooltip', 'HoverCard', 'Plan', 'ChatMessage'].map((name) => a.hidden(name)))},
  which declare nothing.
`
}
/** How the person is asked, and how an application records what an agent did. */
function askingReference(registry: Registry): string {
  const f = new Facts(registry)
  const agent = '@polymorph/engine/agent'
  return `# Asking the person

\`confirm\` is the application's, and it asks the person at the page. The bridge calls it with
\`{ id, member, name, action, value? }\` before an action that needs a person, and runs the action
only when it resolves \`true\`. An agent cannot answer it, and a \`confirm\` that throws is a no.

## In React, through a ${f.m('ConfirmDialog')}

This component starts the bridge with \`startPageAgent\` from step 4 of the skill, and asks through
a ${f.m('ConfirmDialog')}. The dialog withholds its confirm, so no agent presses Allow.

\`\`\`tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentConfirmRequest } from '${agent}'
import { ConfirmDialog } from '@polymorph/react-ui'

import { startPageAgent } from './page-agent'

export function PageAgent() {
  const [asking, setAsking] = useState<AgentConfirmRequest | null>(null)
  const answer = useRef<(yes: boolean) => void>(() => {})
  const ask = useCallback(
    (request: AgentConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current = (yes) => {
          setAsking(null)
          resolve(yes)
        }
        setAsking(request)
      }),
    [],
  )
  useEffect(() => {
    const stop = startPageAgent(ask)
    return () => {
      stop()
      answer.current(false)
    }
  }, [ask])
  return (
    <ConfirmDialog
      open={asking !== null}
      title="Let the assistant do this?"
      description={asking === null ? '' : \`The assistant asks to \${asking.action} “\${asking.name}”.\`}
      confirmLabel="Allow"
      onConfirm={() => answer.current(true)}
      onOpenChange={(open) => {
        if (!open) answer.current(false)
      }}
    />
  )
}
\`\`\`

- \`ask\` keeps its identity, so the bridge is made once.
- Closing the dialog any other way, and unmounting the page while the person is asked, answer no.
- \`request.name\` is the member's accessible name on this page, and \`request.value\` is what the
  agent asked to set or choose. Say both in the question, so the person knows what they allow.
- Other frameworks do the same with their own state and the framework's ${f.m('ConfirmDialog')}.
  A page with no build can ask with \`window.confirm\`, as \`references/no-build.md\` shows.

## Recording what an agent did

Each step that succeeds dispatches ${f.x('AGENT_CHANGE_EVENT', agent)}, \`polymorph:agentchange\`,
bubbling, on its member's element, or on the document when the step removed that element. The
detail is \`{ id, member, action, changed, source: 'agent' }\`. \`bridge.subscribe(listener)\` hands
a listener the same object, and returns the function that stops it.

\`\`\`ts
document.addEventListener('polymorph:agentchange', (event) => {
  const { id, member, action, changed } = (event as CustomEvent).detail
  console.info('the agent ran', action, 'on', member, id, changed)
})
\`\`\`

A step whose \`changed\` is empty dispatches one too, and a step that fails dispatches none. Write
the audit line the product keeps, or tell the person what the agent changed, from this detail.

## Telling an agent's change from a person's

\`bridge.acting\` is \`true\` while a step's action runs. A member's handler keeps its signature, so
${f.m('Checkbox')}'s ${f.p('Checkbox', 'onCheckedChange')} receives the same value from an agent's
\`check\` as from a person's press. A handler that must treat the two apart reads \`bridge.acting\`
when it is called: a ${f.m('Button')}'s ${f.p('Button', 'onClick')} runs inside the agent's
\`press\`, so it reads \`true\` there.
`
}

/** How a consumer tests a bridge over its own screens. */
function testingReference(registry: Registry): string {
  const f = new Facts(registry)
  const agent = '@polymorph/engine/agent'
  const testing = '@polymorph/engine/testing'
  return `# Testing the bridge

polymorph tests what its members declare in a real browser, with Vitest's browser mode and
Playwright, because the members need real focus, pointer and layout. Test a screen's bridge the
same way: render the screen, create a bridge, act, and read what changed.

\`\`\`tsx
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createAgentBridge } from '${agent}'
import { installTestTheme } from '${testing}'

import { TicketForm } from './TicketForm'

it('lets an agent fill the ticket form', async () => {
  installTestTheme()
  render(<TicketForm onSubmit={() => {}} />)
  const bridge = createAgentBridge()
  try {
    const { results } = await bridge.act([
      { target: { member: 'Input', name: 'Subject' }, action: 'fill', value: 'Refund' },
      { target: { name: 'Priority' }, action: 'choose', value: 'urgent' },
    ])
    expect(results.every((result) => result.ok)).toBe(true)
    const subject = bridge.snapshot().members.find((member) => member.name === 'Subject')
    expect(subject?.state['value']).toBe('Refund')
  } finally {
    bridge.dispose()
  }
})
\`\`\`

- Never wrap \`bridge.act\` in Testing Library's \`act()\`. React holds the render until that scope
  ends, so the bridge sees no change and reports an empty \`changed\`.
- Dispose of each bridge in the test that made it.
- A step on a member that does not change waits the whole \`settleMs\`. A test may pass a smaller
  one, such as \`createAgentBridge({ settleMs: 60 })\`.
- ${f.x('agentRegistrations', testing)} lists every registered member, withheld ones included,
  so a test can tell a member the bridge withholds from one that never registered.
- ${f.x('installTestTheme', testing)} installs a theme, so the members render as on the page.

## The WebMCP registration

Stand in for the browser's API with an object on \`document.modelContext\` that keeps each tool
until its signal aborts, then call a tool's \`execute\`:

\`\`\`ts
const tools = new Map<string, (input: unknown) => Promise<unknown>>()
Object.defineProperty(document, 'modelContext', {
  configurable: true,
  value: {
    registerTool: (
      tool: { name: string; execute: (input: unknown) => Promise<unknown> },
      options?: { signal?: AbortSignal },
    ) => {
      tools.set(tool.name, tool.execute)
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name))
      return Promise.resolve()
    },
  },
})

// After the test:
delete (document as { modelContext?: unknown }).modelContext
\`\`\`

Mount the component that registers, check that \`tools\` holds the three names, call
\`tools.get('polymorph_snapshot')?.({})\`, and check that unmounting empties \`tools\`.
`
}

/** What a page with no build does: the setting, a module script, and a script run from outside. */
function noBuildReference(registry: Registry): string {
  const f = new Facts(registry)
  const agent = '@polymorph/engine/agent'
  return `# A page with no build

A page that loads the elements' no-build files, \`polymorph.js\` or \`polymorph-all.js\`, reaches the
bridge through its \`data-agent\` setting or through a module script of its own. Both files export
${call(f, 'loadAgentBridge', 'packages/elements-ui/src/cdn/polymorph.ts', '')}, which resolves to
\`${agent}\`, built with the members the page loaded.

## The setting

\`<html data-agent="on-call">\` or \`"eager"\` registers the three tools with the browser's WebMCP API
and creates a bridge with no \`confirm\` and no policy. The file reads the attribute once, as it
runs, so a value a script sets later is not read.

| The page loads | \`on-call\` fetches | \`eager\` fetches | \`loadAgentBridge()\` fetches |
| --- | --- | --- | --- |
| \`polymorph.js\` | two small chunks at load, the bridge on the first call | all three at load | the bridge's chunk |
| \`polymorph-all.js\` | nothing more | nothing more | nothing more |

A call that cannot load the bridge answers \`{ error: { code: 'failed', message } }\`, and the next
call loads it again. The console says why a setting registered nothing:

- \`polymorph: data-agent="…" is neither on-call nor eager, so no agent tools are registered\`
- \`polymorph: registerWebMCP registers nothing, because data-agent="on-call" already registered the agent tools on this page\`

## A module script

A page that asks a person, or narrows what an agent may do, states no \`data-agent\` and creates
its bridge in a module script:

\`\`\`html
<script type="module">
  import { loadAgentBridge } from './polymorph/polymorph.js'

  const { createAgentBridge, registerWebMCP } = await loadAgentBridge()
  const bridge = createAgentBridge({
    confirm: (request) => Promise.resolve(window.confirm(\`\${request.action} “\${request.name}”?\`)),
    policy: { deny: (member) => member.member === 'Button' && member.name === 'Place order' },
  })
  registerWebMCP(bridge)
</script>
\`\`\`

- Import it from the file the page loads, at the same path. A copy from anywhere else reads a
  registry of its own, which holds nothing.
- The elements register as they render, so a member whose code is still loading is not listed
  yet. Read the page when the agent asks, never once at load.
- A page that states \`data-agent\` and also calls \`registerWebMCP\` keeps the setting's
  registration: the second registers nothing and warns.
`
}
