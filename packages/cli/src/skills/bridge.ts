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
| An assistant in the product reads the screen, fills fields, chooses and presses | the page's bridge as the assistant's tools: steps 3 to 6 |
| An agent in the browser operates the page through WebMCP | the page's bridge, registered with WebMCP: steps 3 to 5 |
| You drive a page built with polymorph and want a surer way than the DOM | the tools the page registered: step 7 |
| The agent shows the person a form or a choice of its own | a run-time screen: the \`polymorph-runtime-screen\` skill |
| The agent needs a record's data, or an operation no member offers | a tool of the application's own: step 9 |
| A SwiftUI or Compose screen | nothing: native members do not register, and there is no bridge |

For each member it lists, the bridge gives an id, the member's name, its control's accessible
name and description (a field's hint and error), the member it is \`within\`, its declared states
and the actions it allows now. It never gives:

- A member that declares nothing, such as ${hidden}, or anything that is not a member: a plain
  element in a ${f.m('Bespoke')} zone, a component inside ${f.m('ThirdParty')}, the page's text.
- A member whose element is absent or inside content marked \`hidden\` (a closed ${f.m('Dialog')},
  a collapsed panel), or one another member withholds (${f.m('ConfirmDialog')}'s confirm).
- A secret: ${secrets} read their value as \`{ secret: true }\`, and every password field's value
  is removed from every output. Every other field's value is read, an ${f.m('Input')} that holds
  a card number included: step 5 keeps such a field out.
- What a member shows beyond its states: a ${f.m('Table')} reads its sort, never its cells.
- An action of a member whose \`disabled\` state is true.

## 2. Read what each member lets an agent do

${commands(run, 'card --framework <framework>')}

A member an agent can see ends its card line with an \`agent:\` segment: the actions an agent may
run, then, after \`|\`, the states it reads. A \`(secret)\` state reads \`{ secret: true }\`. A
member with no segment is hidden from agents.

- ${f.m('Checkbox')}: ${a.segment('Checkbox')}.
- ${f.m('Select')}: ${a.segment('Select')}. ${a.action('Select', 'choose', 'id')} takes the id of
  one of its ${a.state('Select', 'options')}, which is the ${f.field('SelectOption', 'value')} of an
  option the app passed.
- ${f.m('PasswordInput')}: ${a.segment('PasswordInput')}. An agent runs nothing.

The JSON answer adds the types:

${commands(run, 'component Select --framework <framework> --json')}

Under \`component.agent\`, each action gives its \`argument\` (\`boolean\`, \`number\`, \`text\`,
\`id\` or \`ids\`), the \`among\` state its ids name, and the state it \`sets\`. \`destructive\` and
\`destructiveOptions\` say what waits for a person, such as ${f.m('Button')}'s
${f.v('Button', 'tone', 'danger')}. [references/members.md](references/members.md) says what each
member's ids are, and how the members that need care read and act.

## 3. Choose how the page loads the bridge

A bundled app, in any framework, imports the bridge from \`@polymorph/engine\`, which \`init\`
installs. If \`package.json\` does not list it, add it as the other \`@polymorph/*\` packages are
listed, at their release. The members write to a registry inside that package, so the app must
resolve one copy of it: a second copy holds an empty registry. No foundation has a hook or a
component for the bridge, and nothing in a bundled app reads \`data-agent\`.

What a module imports from \`${agent}\` with a static \`import\` is in that module's chunk, and
${f.x('createAgentBridge', agent)} is the bridge. An \`import type\` adds nothing.
\`${webmcp}\` holds the tools' definitions and their registration, and none of the bridge. So a
page that loads the bridge on its first use, by the assistant or by a WebMCP call, imports it with
\`import('${agent}')\` and registers with ${f.x('registerWebMCPOnCall', webmcp)} (step 4). A page
that loads it at once imports \`createAgentBridge\` and ${f.x('registerWebMCP', agent)}
statically. To see where the bridge went, build the app and find the file that holds
\`polymorph:agentchange\`, which only the bridge holds:
[references/testing.md](references/testing.md) has the check.

A page with no build writes no script. \`<html data-agent="on-call">\` registers the three tools
with WebMCP at load and fetches the bridge on the first call, and \`"eager"\` fetches it at load.
Without the attribute the page registers nothing, because exposing a page is its owner's
decision. The setting's bridge has no \`confirm\` and no policy, so a page that asks a person or
narrows what an agent may do creates its own: [references/no-build.md](references/no-build.md).

## 4. Create one bridge for the page

One bridge serves the product's assistant and the browser's WebMCP agents. A bridge runs one
\`act\` at a time and asks the person inside it, so the page asks one question at a time. Two
bridges each ask, and two questions can then be open at once. This module loads the bridge on the
first call from either side:

\`\`\`ts
// src/agent/page-agent.ts
import type { AgentBridge, AgentConfirmRequest, AgentTool } from '${agent}'
import { registerWebMCPOnCall } from '${webmcp}'

import { policy } from './policy'

export interface PageAgent {
  load: () => Promise<{ bridge: AgentBridge; tools: AgentTool[] }>
  stop: () => void
}

/** Starts one bridge for the page, which the product's assistant and WebMCP share. */
export function startPageAgent(ask: (request: AgentConfirmRequest) => Promise<boolean>): PageAgent {
  let stopped = false
  let loading: Promise<{ bridge: AgentBridge; tools: AgentTool[] }> | undefined
  const load = () =>
    (loading ??= import('${agent}').then(
      ({ createAgentBridge, agentTools }) => {
        if (stopped) throw new Error('The page agent has stopped.')
        const bridge = createAgentBridge({ confirm: ask, policy })
        return { bridge, tools: agentTools(bridge) }
      },
      (error: unknown) => {
        loading = undefined // the next call loads again
        throw error
      },
    ))
  // A WebMCP call runs on the same bridge: the module this load resolves to hands it back.
  const unregister = registerWebMCPOnCall(async () => {
    const { bridge, tools } = await load()
    return { createAgentBridge: () => bridge, agentTools: () => tools }
  })
  return {
    load,
    stop: () => {
      stopped = true
      unregister()
      void loading?.then(({ bridge }) => bridge.dispose(), () => {})
    },
  }
}
\`\`\`

- \`registerWebMCPOnCall(load)\` registers the three tools now, and on the first call runs \`load\`
  once and creates the bridge from what it resolves to: \`${agent}\`, or an object with its
  \`createAgentBridge\` and ${f.x('agentTools', agent)}. This \`load\` hands back the page's bridge.
- Where the browser has no WebMCP API, nothing registers, and the assistant still loads the
  bridge. While another registration of the tools stands on the page, such as \`data-agent\`, it
  registers nothing and warns in the console.
- A page that loads the bridge at once creates it with the same options, calls
  \`registerWebMCP(bridge)\`, which returns the function that unregisters, and hands the same
  bridge to \`agentTools\` for the assistant.

Start it in the browser once the page has mounted, keep what it returns where the assistant can
reach it, and call its \`stop\` when the page unmounts. \`ask\` asks the person, resolves \`true\`
for yes, and keeps its identity. [references/asking.md](references/asking.md) has the React
component that does this through a ${f.m('ConfirmDialog')}, and
[references/api.md](references/api.md) the call in Vue, Svelte, Solid and Angular, and each
option, field, error and event.

## 5. Write the policy

\`policy.hide(member)\` returns \`true\` to take a member out of every output and every step, and
\`policy.deny(member, action)\` returns \`true\` to take one action away. A policy only narrows: it
cannot add a member, a state or an action. A function that throws hides or denies. The bridge
calls both on every read and step, and only about a member whose element is in the document, so
keep them cheap. \`member\` is a frozen ${f.x('AgentPolicyMember', agent)}:

| Field | What it is | Stable |
| --- | --- | --- |
| \`id\` | the bridge's id for this mount of the member | no: each mount gets a new one, which the app does not choose |
| \`member\` | the member's name, such as \`Input\` | yes, and it names every instance |
| \`name\` | its control's accessible name: the label as the page shows it | no: it changes with the language and the wording |
| \`element\` | the member's control: an ${f.m('Input')}'s \`<input>\`, a ${f.m('Button')}'s \`<button>\`, a ${f.m('Select')}'s trigger | its attributes are the ones the page sets |

So name a member by an attribute the page sets on its control. An ${f.m('Input')}'s
${f.p('Input', 'name')}, ${f.p('Input', 'autoComplete')} and ${f.p('Input', 'id')} reach its
\`<input>\`, and inside a ${f.m('FormField')} the control's id is the field's
${f.p('FormField', 'id')}. A ${f.m('Button')} takes no \`id\` or \`name\`: name it by the label
the page passes it, read from the same string the page renders, or let its
${f.p('Button', 'onClick')} decide (step 8).

\`\`\`ts
// src/agent/policy.ts
import type { AgentPolicy } from '${agent}'

import { labels } from '../labels'

export const policy: AgentPolicy = {
  // Every card field, by the autocomplete token the page gives it, which no translation changes.
  hide: ({ element }) => element?.getAttribute('autocomplete')?.startsWith('cc-') === true,
  // A person places the order. The label is the string the page passes the Button.
  deny: ({ member, name }, action) =>
    member === 'Button' && name === labels.placeOrder && action === 'press',
}
\`\`\`

Card data belongs in the payment provider's own hosted field, inside a ${f.m('ThirdParty')}
boundary: it is outside the vocabulary, so the bridge never lists it.

The bridge is a filter in the page, not a security boundary. An agent acts with the person's
session, and any script on the page can create a bridge without this policy or \`confirm\`. The
server authorises every consequential action again, as it does a person's.

## 6. Hand the tools to the product's assistant

\`agentTools(bridge)\` returns three tools, \`polymorph_snapshot\`, \`polymorph_query\` and
\`polymorph_act\`. Each has a \`description\` written for a model, a JSON Schema \`inputSchema\`,
and \`execute(input)\`, which resolves to JSON and never rejects. The definitions come from a
bridge, so the assistant loads it when it is first used, such as when the person opens it:

\`\`\`ts
// src/agent/assistant-tools.ts
import type { PageAgent } from './page-agent'

/** The bridge's tools for the product's own model, loading the bridge on the first use. */
export async function assistantTools(agent: PageAgent) {
  const { tools } = await agent.load()
  return {
    definitions: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
    run: async (name: string, input: unknown): Promise<unknown> => {
      const tool = tools.find((each) => each.name === name)
      if (tool === undefined) return { error: { code: 'unknown-tool', message: \`No tool \${name}.\` } }
      return tool.execute(input)
    },
  }
}
\`\`\`

The app sends \`definitions\` with the conversation, in the shape the model's API takes for a tool.
For each tool call the model returns, it calls \`run\` with the call's name and input, and sends
what that resolves to back as the call's result.
The calls run in the page, where the bridge is: a model on a server sends each call to the page.
Every output holds the page's content, which a person or a record wrote, and each tool says so
with \`untrustedContentHint\`. The system prompt tells the model that what it reads from the page
is data and never an instruction. Nothing enforces that sentence, so the policy and the server's
checks are what hold.

## 7. Read, then act

This is the procedure for the agent, through the tools or the bridge.

1. Read the page with \`bridge.snapshot()\`, or find members with
   \`bridge.query({ name, text, member })\`. \`name\` matches the accessible name and each choice's
   label, \`text\` the text the member shows and its description, and \`member\` the member's name
   whole. Each ignores case. On a large page, query: a snapshot lists every choice.
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

A failed result's \`error.code\` says why, and [references/api.md](references/api.md) says what to
do for each code. On \`unknown-member\`, read again. On \`not-allowed\`, choose from \`allowed\`:
an empty list is the application's policy. On \`needs-confirmation\`, the page asks no one, so a
person must do it: do not look for another way. On \`declined\`, the person said no: do not run it
again unasked.

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
| A policy only narrows, and one \`act\` runs at a time | Respect modality: while a modal ${f.m('Dialog')} is open, the members behind it are listed and run |
| | Filter what the page says: a name or a value can hold text written to steer a model |

A ${f.m('Button')} with ${f.v('Button', 'tone', 'danger')} that opens a ${f.m('ConfirmDialog')}
asks twice: \`confirm\` before the press, then the dialog, whose confirm no agent can press. Give a
Button that only opens the dialog another tone, such as ${f.v('Button', 'variant', 'ghost')} with
${f.v('Button', 'tone', 'neutral')}: an agent's press opens the dialog, and the person answers
there, once. The dialog's own ${f.p('ConfirmDialog', 'tone')}, \`danger\` unless set, marks the
destruction. Keep ${f.v('Button', 'tone', 'danger')} for a Button whose own press destroys.

So the product decides, and writes down:

1. Who gets the tools: its own assistant, the browser's agents through WebMCP, or no one.
2. What needs a person beyond the destructive actions. Deny it in the policy, or let its handler
   ask the person when \`bridge.acting\` is true. The bridge sets it while a step's action runs,
   and a ${f.m('Button')}'s ${f.p('Button', 'onClick')} runs inside a \`press\`.
3. How the person is asked: through a member the page draws, such as a ${f.m('ConfirmDialog')},
   whose confirm an agent cannot press: [references/asking.md](references/asking.md).

Each step that succeeds dispatches \`polymorph:agentchange\`, so the page can show the person what
an agent changed. Logging it is the product's choice, and the record that counts is the one the
server keeps of each request: any script on the page can dispatch that event.

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
the bridge reads the rendered page, its accessible names and what is in the document.
[references/testing.md](references/testing.md) has the setup, a test to copy, the traps, and how
to check that the bridge is not in what the page loads at start. \`validate\` and \`check\` read
the red rules and not prop values, so run the project's typecheck as well.
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
          'WebMCP (document.modelContext) tools, keep a field such as a card number or an action ' +
          'such as placing an order from an agent, ask the person before an agent acts, put ' +
          'data-agent on a page with no build, read the agent segment of the polymorph system ' +
          'card, or drive a page built with polymorph from an agent. Covers ' +
          '@polymorph/engine/agent (createAgentBridge, snapshot, query, act, confirm, the policy, ' +
          'secrets, agentTools, registerWebMCP), @polymorph/engine/webmcp (registerWebMCPOnCall, ' +
          'applyAgentSetting), one bridge shared by an assistant and WebMCP and loaded on its ' +
          'first use, loadAgentBridge in polymorph.js, and testing a bridge.',
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

A static import of a value from this entry point puts it in the importing module's chunk:
\`createAgentBridge\` is the bridge. A page that loads the bridge on its first use imports it with
\`import('${agent}')\`, and imports only types from it statically.

| Export | What it is |
| --- | --- |
| ${call(f, 'createAgentBridge', agent, 'options?')} | a bridge over the members mounted on the page. Two bridges read the same registry and report the same ids, and each runs its own acts and asks its own questions |
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
| \`act(steps)\` | runs the steps in order and resolves to \`{ results }\`, stopping at the first that fails. It never rejects. One \`act\` runs at a time: the next waits for it, also while it waits for \`confirm\` |
| \`subscribe(listener)\` | calls \`listener\` after each step that succeeds, and returns the function that stops it. A listener that throws does not fail the step |
| \`acting\` | \`true\` while a step's action runs |
| \`dispose()\` | stops the bridge: it lists nothing after this, and a step answers \`unknown-member\` |

### Options

| Option | What it takes |
| --- | --- |
| \`confirm\` | \`(request) => boolean \\| Promise<boolean>\`. \`request\` is \`{ id, member, name, action, value? }\`. Only \`true\` is yes. A \`confirm\` that throws or rejects is a no. The state is read again after the answer, and a member removed while the person was asked answers \`unknown-member\` |
| \`policy.hide\` | \`(member) => boolean\`. \`member\` is \`{ id, member, name, element }\`, frozen: the bridge's id for this mount, the member's name, its control's accessible name, and its control. A truthy answer takes the member out of every output and every step. The bridge asks only about a member whose element is in the document and not inside \`hidden\` content, and never about one another member withholds |
| \`policy.deny\` | \`(member, action) => boolean\`, with the same \`member\`. A truthy answer takes the action away, and a step that names it answers \`not-allowed\`. Either function that throws hides or denies |
| \`settleMs\` | milliseconds a step waits for the member's state to change after its action. The bridge reads the state again every few milliseconds and stops at the first change |

### Starting the page agent in each framework

\`startPageAgent\` is the function of step 4 of the skill. Call it where the framework runs code in
the browser after mounting, keep what it returns for the assistant, and call its \`stop\` when the
page unmounts:

\`\`\`ts
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
\`\`\`

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

| Code | When | Do |
| --- | --- | --- |
| \`unknown-member\` | the id names no listed member, the target names none, or the member was removed while the person was asked | read again: the member is gone, closed, hidden, withheld or declares nothing |
| \`ambiguous-target\` | the target names more than one member. The message lists their ids | name it by one of those ids |
| \`not-allowed\` | the member does not declare the action, or the policy denies it. \`allowed\` lists the actions it allows now | choose from \`allowed\`. An empty list is the application's policy |
| \`disabled\` | the member's \`disabled\` state is true | do what enables it, or tell the person |
| \`invalid-value\` | the value is not of the argument's type, names no enabled choice, or the step is not an object | read the action's argument and the member's choices again |
| \`needs-confirmation\` | the action needs a person, and the bridge has no \`confirm\` | leave it to a person. Do not look for another way |
| \`declined\` | the person said no, or \`confirm\` failed | do not run it again unasked |
| \`failed\` | the action threw, with the member's message, any secret replaced | read the message, such as a read-only field's refusal |

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
\`polymorph_act\` given no list of steps resolves to one \`invalid-value\` result. The tools'
definitions are read from a bridge's \`agentTools\`: no entry point exports them alone.

## \`${webmcp}\`

It holds the tools' definitions and their registration, and none of the bridge, so importing it
keeps the bridge out of the bundle.

| Export | What it does |
| --- | --- |
| ${call(f, 'registerWebMCPOnCall', webmcp, 'load, options?')} | registers the three tools now. On the first call it runs \`load\` once and creates the bridge with \`options\` from what \`load\` resolves to: \`${agent}\`, or an object with its \`createAgentBridge\` and \`agentTools\`. Calls that arrive while it loads wait for it. A failed load answers each waiting call with \`{ error: { code: 'failed', message } }\`, and the next call loads again. Returns the function that unregisters the tools and disposes of the bridge |
| ${call(f, 'applyAgentSetting', webmcp, 'value')} | does what a \`data-agent\` value says: \`null\` registers nothing, \`'on-call'\` registers as \`registerWebMCPOnCall\` does, \`'eager'\` also loads the bridge at once, and another value warns. The bridge has no options. Returns the function that unregisters |
| ${f.x('AGENT_ATTRIBUTE', webmcp)} | \`'data-agent'\` |

Types: ${f.x('AgentSetting', webmcp)} and ${f.x('AgentBridgeModule', webmcp)}.

A page whose only agents are the browser's registers in an effect and returns what unregisters.
The bundler puts the bridge in a chunk the page fetches on the first call:

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

/** The data type a member's prop takes a list of, as the registry names it. */
function listType(registry: Registry, member: string, prop: string): string {
  const type = registry.components
    .find((entry) => entry.name === member)
    ?.props.find((entry) => entry.name === prop)?.type
  const found = type
    ?.match(/\w+/g)
    ?.find((word) => registry.dataTypes.some((entry) => entry.name === word))
  if (found === undefined) throw new SkillFactError(`${member}'s ${prop} takes no declared type`)
  return found
}

/** How the members that need care read and act, each name read from its agent contract. */
function membersReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  const a = new AgentFacts(registry, f)
  const menus = all(a.members((contract) => contract.destructiveOptions.length > 0))
  const charts = a.members((contract) => contract.states.some((state) => state.name === 'count'))
  const legends = a.members((contract) => contract.actions.some((each) => each.name === 'toggle'))
  const brushes = a.members((contract) => contract.actions.some((each) => each.name === 'brush'))
  // The empty choice's prop, which both members that offer one take under one name.
  const emptyOption = [f.p('Select', 'emptyOption'), f.p('TreeSelect', 'emptyOption')][0]
  // Each choosing member drawn from a list the app passes, and the field of an entry its id is.
  const ids = (
    [
      ['Select', 'options', 'id', 'value'],
      ['Combobox', 'options', 'id', 'value'],
      ['MultiSelect', 'options', 'ids', 'value'],
      ['TreeSelect', 'items', 'id', 'id'],
      ['RadioGroup', 'options', 'id', 'value'],
      ['CheckboxGroup', 'options', 'ids', 'value'],
      ['SegmentedControl', 'options', 'id', 'value'],
      ['ChoiceCard', 'options', 'ids', 'value'],
      ['Tabs', 'tabs', 'id', 'value'],
    ] as const
  ).map(([member, prop, argument, field]) => {
    const type = listType(registry, member, prop)
    // Checked, not printed: the table's column says what the argument is.
    a.action(member, 'choose', argument)
    const takes = argument === 'id' ? 'one id' : 'the whole set of ids'
    return `| ${f.m(member)} | ${takes} | the ${f.field(type, field)} of an entry of ${f.p(member, prop)}, a ${f.x(type, '@polymorph/react-ui')} |`
  })
  return `# How the members read and act

The card names each member's actions and states. This file says what the names mean where a
caller can go wrong. The JSON answer of \`component\` gives each one's type:

${commands(run, 'component LineChart --framework <framework> --json')}

## What holds for every member

- **A choice** is \`{ id, label }\`, with \`disabled: true\` on one a person cannot pick and
  \`destructive: true\` on one that waits for a person. An action that takes \`id\` names one
  choice, and one that takes \`ids\` names the whole set. A repeated id takes \` (2)\` after it.
- **The application owns a controlled value.** A member whose value the application holds changes
  when the application passes the new value back. Until it does, a step succeeds with an empty
  \`changed\`.
- **A press is a person's press.** An action that presses a link takes the path a person's click
  takes: \`onNavigate\` routes it, or the browser leaves the page, and the step may never return.
- **A refusal is a \`failed\` step** with the member's reason: a read-only field refuses
  ${a.action('Input', 'fill', 'text')}, and a ${f.m('Dialog')} that is not dismissible refuses
  ${a.action('Dialog', 'close')}.

## What an id names

A member drawn from a list the application passes names each choice by a field of the entry. The
text answer of \`${run} component <Name> --framework <framework>\` prints that entry's fields under
Types.

| Member | \`choose\` takes | Each id is |
| --- | --- | --- |
${ids.join('\n')}

- ${f.m('Select')} and ${f.m('TreeSelect')} with ${emptyOption} list the empty choice as \`''\`.
- An entry with \`disabled: true\` is listed with that flag, and a step that names it answers
  \`invalid-value\`.
- Another member names its choices as it says below, such as a ${f.m('Menu')} entry by its label.

## Fields

- ${f.m('Input')}, ${f.m('Textarea')} and ${f.m('SearchInput')}: ${a.action('Input', 'fill', 'text')}
  writes the whole value, as typing it does, and ${a.action('Input', 'clear')} empties it. Their
  value is read, whatever the field holds: only ${f.m('PasswordInput')}, ${f.m('OTPInput')} and a
  password field keep a value secret.
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

- A choice made while a list is closed needs no \`open\` first.
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
  person's. The Button that opens it is the application's, and an agent presses it: a
  ${f.v('Button', 'tone', 'danger')} one asks \`confirm\` first, so the person is asked twice.
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

This component starts the page's one bridge with \`startPageAgent\` from step 4 of the skill, hands
what that returns to \`onStart\`, and asks through a ${f.m('ConfirmDialog')}. The dialog withholds
its confirm, so no agent presses Allow.

\`\`\`tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentConfirmRequest } from '${agent}'
import { ConfirmDialog } from '@polymorph/react-ui'

import { startPageAgent, type PageAgent } from './page-agent'

/** Starts the page's one bridge, hands it to \`onStart\`, and asks the person through a ConfirmDialog. */
export function PageAgentHost({ onStart }: { onStart: (agent: PageAgent | null) => void }) {
  const [asking, setAsking] = useState<AgentConfirmRequest | null>(null)
  const answer = useRef<(yes: boolean) => void>(() => {})
  const ask = useCallback(
    (request: AgentConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        answer.current = (yes) => {
          // Once: the close ConfirmDialog makes after Allow finds nothing left to answer.
          answer.current = () => {}
          setAsking(null)
          resolve(yes)
        }
        setAsking(request)
      }),
    [],
  )
  useEffect(() => {
    const agent = startPageAgent(ask)
    onStart(agent)
    return () => {
      onStart(null)
      agent.stop()
      answer.current(false)
    }
  }, [ask, onStart])
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

- Render it once on the page. Give it an \`onStart\` that keeps its identity, such as a state
  setter, and hand the agent it receives to the assistant (\`assistantTools(agent)\`, step 6). It
  receives \`null\` once the page unmounts.
- One question is open at a time. The page has one bridge, the bridge asks inside the one \`act\`
  it runs, and the next \`act\`, from the assistant or from WebMCP, waits.
- \`answer\` runs once per question. ${f.m('ConfirmDialog')} calls
  ${f.p('ConfirmDialog', 'onOpenChange')} with \`false\` after ${f.p('ConfirmDialog', 'onConfirm')},
  and that close finds nothing left to answer.
- Closing the dialog any other way, and unmounting the page while the person is asked, answer no.
- \`ask\` keeps its identity, so the bridge is made once.
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

A step whose \`changed\` is empty dispatches one too, and a step that fails dispatches none. The
event is for the page's own code: to tell the person what the agent changed, or to log it, which is
the product's choice. It is no audit record. Any script on the page can dispatch an event of that
name, so the record that counts is the one the server keeps of each request it authorises.

## Telling an agent's change from a person's

\`bridge.acting\` is \`true\` while a step's action runs. A member's handler keeps its signature, so
${f.m('Checkbox')}'s ${f.p('Checkbox', 'onCheckedChange')} receives the same value from an agent's
\`check\` as from a person's press. A handler that must treat the two apart reads \`bridge.acting\`
when it is called: a ${f.m('Button')}'s ${f.p('Button', 'onClick')} runs inside the agent's
\`press\`, so it reads \`true\` there. Such a handler can ask the person before it places an order,
in place of a policy that denies the press.
`
}

/** How a consumer tests a bridge over its own screens. */
function testingReference(registry: Registry): string {
  const f = new Facts(registry)
  const agent = '@polymorph/engine/agent'
  const testing = '@polymorph/engine/testing'
  return `# Testing the bridge

The bridge reads the rendered page: each control's accessible name, whether its element is in the
document and drawn, and the state the member reads from it. A test of it renders the screen in a
real browser. polymorph tests its members this way, in Chromium through Playwright, with Vitest's
browser mode.

## Set it up

Install Vitest, its Playwright provider and Playwright, and a browser for Playwright. The provider
package takes the same version as \`vitest\`. A React app adds Testing Library and React's Vite
plugin, as below; another framework adds its own.

\`\`\`sh
npm install --save-dev vitest @vitest/browser-playwright playwright @testing-library/react @vitejs/plugin-react
npx playwright install chromium
\`\`\`

Declare the browser in the Vitest config. If the app has a \`vite.config.ts\`, put \`test\` there,
so the tests build the members as the app does.

\`\`\`ts
// vitest.config.ts
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      // Vitest's default viewport is a phone's. This is the wide layout.
      viewport: { width: 1280, height: 800 },
    },
  },
})
\`\`\`

A project that also has tests for Node lists each kind as an entry of \`test.projects\`, with its
own \`name\` and \`include\`, as polymorph's own config does.

## A test

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
- A test of the policy creates the bridge with it and reads the snapshot: a hidden member is
  absent, and a denied action is missing from \`actions\` and answers \`not-allowed\`.
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

## What a test cannot show: where the bridge is bundled

Vitest's browser mode serves each module as Vite's dev server does, without the chunks of a build.
No test can show that the bridge stays out of what the page loads at start. Check the build:

1. Build the app as it ships.
2. Find the built file that holds \`polymorph:agentchange\`. Only the bridge holds that text, and a
   minifier keeps it. Vite writes the files to \`dist/assets/\`:

   \`\`\`sh
   grep -l 'polymorph:agentchange' dist/assets/*.js
   \`\`\`

3. Check that the page does not load that file at start. With Vite, \`build.manifest: true\` writes
   \`dist/.vite/manifest.json\`. Follow \`imports\` from the entry's record: no record it reaches
   has that file as its \`file\`, and the bridge's record is reached through \`dynamicImports\`.
   With another bundler, load the built page and check that its network list holds no such file
   until the first use.

A file that holds the text and loads at start has a static value import from \`${agent}\` in its
module graph. Make it an \`import()\` or an \`import type\`.
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

\`\`\`html
<html lang="en" data-system="…" data-palette="…" data-agent="on-call">
\`\`\`

| \`data-agent\` | The page |
| --- | --- |
| absent | registers nothing and fetches nothing more. Exposing a page is its owner's decision, so this is the default |
| \`on-call\` | registers the three tools with WebMCP at load, and fetches and creates the bridge on the first call |
| \`eager\` | fetches and creates the bridge at load, and registers its tools |

The bridge either value creates has no \`confirm\` and no policy, so a step that needs a person
answers \`needs-confirmation\`. The file reads the attribute once, as it runs, so a value a script
sets later is not read. In a browser without WebMCP neither value registers or fetches anything.

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
    // The label is the one this page writes on the button.
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
