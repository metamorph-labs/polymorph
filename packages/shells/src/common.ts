import ts from 'typescript'

import { gallerySlug } from '@polymorph/engine'
import type { Registry } from '@polymorph/registry'
import { unionParts } from '@polymorph/registry/frameworks'

import type {
  AgentArgument,
  Effect,
  ElementNode,
  Expr,
  FixtureChild,
  FixtureValue,
  Handler,
  MemberShell,
  Node,
  Presence,
  SlotNode,
  StateEntry,
} from './dsl'
import { FIXTURE_VALUES } from './dsl'
import { freeNames } from './expr'

/**
 * What every renderer shares: the registry's reading of a described member,
 * the walks over a description's anatomy, the states fixture's grid and
 * subjects, the small string helpers whose output must not differ between
 * frameworks, and the readings of an expression or a type that more than one
 * renderer makes. A renderer (`vue.ts`, `svelte.ts`, `solid.ts`, `angular.ts`,
 * `elements.ts`) imports these and holds only what its framework spells its own
 * way.
 */

/* -------------------------------------------------------------------------- */
/* The registry's reading of a described member                               */
/* -------------------------------------------------------------------------- */

/** A prop as the registry publishes it. */
export interface RegistryPropLike {
  name: string
  type: string
  optional: boolean
  doc?: string
}

/** What the renderer reads from the registry for a member. */
export interface RegistryMemberLike {
  name: string
  purpose: string
  spec: string | null
  props: readonly RegistryPropLike[]
  grid: Record<string, string[]> | null
}

/** Where a described member's component lives. */
export interface Location {
  /**
   * `vocabulary` is the framework's vocabulary package (`@polymorph/vue-ui`); `foundation` is
   * its foundation (`@polymorph/vue`), from which a member imports it by name.
   */
  home: 'vocabulary' | 'foundation'
  dir: string
}

/** The registry entry for a described member: a member of the gallery, or a ladder primitive. */
export function registryMember(registry: Registry, name: string): RegistryMemberLike {
  const component = registry.components.find((candidate) => candidate.name === name)
  if (component !== undefined) return component
  const primitive = registry.exceptions.primitives.find((candidate) => candidate.name === name)
  if (primitive !== undefined) {
    return { name, purpose: primitive.purpose, spec: null, props: primitive.props, grid: null }
  }
  throw new Error(`shells: the registry has no member or primitive named ${name}`)
}

/** Whether a described member is one of the exception ladder's primitives, which have no fixture. */
export function isPrimitive(registry: Registry, name: string): boolean {
  return registry.exceptions.primitives.some((candidate) => candidate.name === name)
}

/** Where every described member and compound part lives, by component name. */
export function locations(shells: readonly MemberShell[]): Map<string, Location> {
  return new Map(
    shells.flatMap((shell) => [
      [shell.member, { home: shell.home ?? 'vocabulary', dir: shell.dir }] as const,
      ...(shell.parts ?? []).map(
        (part) => [`${shell.member}${part.name}`, { home: 'vocabulary', dir: shell.dir }] as const,
      ),
    ]),
  )
}

/**
 * The component that declares each type a description can share: every
 * member's and part's props interface, and every type in a description's
 * `types`. A type has one owner, so the vocabulary declares and exports it
 * once.
 */
export function typeOwners(shells: readonly MemberShell[]): Map<string, string> {
  const owners = new Map<string, string>()
  const claim = (name: string, component: string) => {
    const held = owners.get(name)
    if (held !== undefined) {
      throw new Error(`shells: ${component} and ${held} both declare the type ${name}`)
    }
    owners.set(name, component)
  }
  for (const shell of shells) {
    claim(`${shell.member}Props`, shell.member)
    for (const part of shell.parts ?? []) {
      claim(`${shell.member}${part.name}Props`, `${shell.member}${part.name}`)
    }
    for (const name of Object.keys(shell.types ?? {})) claim(name, shell.member)
  }
  return owners
}

/** The states fixture's file name, without `.states.ts`: the React fixture's. */
export const fixtureName = (shell: MemberShell): string =>
  shell.fixture ?? gallerySlug(shell.member)

/** The description's own file, which the generated header names. */
export function descriptionPath(shell: MemberShell): string {
  return `packages/shells/src/members/${fixtureName(shell)}.ts`
}

/**
 * The props the registry lists for one compound part, under the part's name
 * (`Group.title` for SettingsRow's `Group`), by their own names.
 */
export function partProps(component: RegistryMemberLike, part: string): RegistryPropLike[] {
  return component.props
    .filter((prop) => prop.name.startsWith(`${part}.`))
    .map((prop) => ({ ...prop, name: prop.name.slice(part.length + 1) }))
}

/**
 * A compound part as a member of its own, for the renderer: its name, and its
 * props, the registry's under the part's name when the member's entry lists
 * any, else the description's.
 */
export function partShell(
  owner: MemberShell,
  part: NonNullable<MemberShell['parts']>[number],
  ownerComponent?: RegistryMemberLike,
): { shell: MemberShell; component: RegistryMemberLike } {
  const name = `${owner.member}${part.name}`
  const listed = ownerComponent === undefined ? [] : partProps(ownerComponent, part.name)
  if (listed.length > 0 && part.props !== undefined) {
    throw new Error(
      `shells: ${owner.member}.${part.name} declares props the registry lists under ${owner.member}`,
    )
  }
  if (listed.length === 0 && part.props === undefined) {
    throw new Error(
      `shells: ${owner.member}.${part.name} has no props, and the registry lists none under ${owner.member}`,
    )
  }
  const props: RegistryPropLike[] =
    listed.length > 0
      ? listed
      : Object.entries(part.props ?? {}).map(([prop, entry]) => ({
          name: prop,
          type: entry.type,
          optional: entry.optional ?? false,
          ...(entry.doc ? { doc: entry.doc } : {}),
        }))
  return {
    shell: {
      member: name,
      dir: owner.dir,
      recipe: owner.recipe,
      ...(owner.recipes ? { recipes: owner.recipes } : {}),
      // The member's types and those it uses, which a part imports where its props name them.
      ...(owner.types || owner.uses
        ? { uses: [...Object.keys(owner.types ?? {}), ...(owner.uses ?? [])] }
        : {}),
      ...(part.defaults ? { defaults: part.defaults } : {}),
      ...(part.state ? { state: part.state } : {}),
      ...(part.machine ? { machine: part.machine } : {}),
      ...(part.derived ? { derived: part.derived } : {}),
      ...(part.effects ? { effects: part.effects } : {}),
      ...(part.presence ? { presence: part.presence } : {}),
      // A part's agent block registers under its member's name (Toast's viewport is `Toast`).
      ...(part.agent ? { agent: { ...part.agent, member: owner.member } } : {}),
      template: part.template,
      states: [],
    },
    component: {
      name,
      purpose: `${owner.member}.${part.name}: ${part.purpose}`,
      spec: null,
      props,
      grid: null,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* The states fixture                                                         */
/* -------------------------------------------------------------------------- */

/** The nodes a fixture's function returns (`renders`): one, or several, as a fragment holds them. */
export const renderedChildren = (
  renders: FixtureChild | readonly FixtureChild[],
): readonly FixtureChild[] => (Array.isArray(renders) ? renders : [renders as FixtureChild])

/** The foundation's values a fixture's JavaScript names, of those `FIXTURE_VALUES` lists. */
export function fixtureValues(source: string): string[] {
  const names = freeNames(source)
  return FIXTURE_VALUES.filter((name) => names.has(name))
}

/** A branded fixture value (`{ js }`, `{ node }`): an object with that key and no key but the brand's. */
export function branded<K extends string>(
  value: FixtureValue,
  brand: K,
  others: readonly string[] = [],
): value is FixtureValue & Record<K, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    brand in value &&
    Object.keys(value).every((name) => name === brand || others.includes(name))
  )
}

/** How many frames an entry that types waits for its field before it gives up. */
export const TYPING_FRAMES = 60

/**
 * The statements an entry runs to press a control once it is in the document
 * (`presses`), for a renderer that writes them into the entry: it looks for the
 * control once a frame, up to `TYPING_FRAMES` frames, and clicks it, as a
 * reader's press does. A control that is not drawn (the drawer's button above
 * the breakpoint) is one a reader cannot press, so the entry does not press it. `mounted` and `unmounted` are the framework's lifecycle
 * calls (`onMounted`, `onBeforeUnmount`). The names differ from the typing
 * statements', so an entry may do both.
 */
export function pressStatements(selector: string, mounted: string, unmounted: string): string {
  return `let pressFrame = 0; let pressFrames = 0; const press = () => { const control = document.querySelector<HTMLElement>(${selector}); if (control === null || control.getClientRects().length === 0) { if (++pressFrames < ${TYPING_FRAMES}) pressFrame = requestAnimationFrame(press); return } control.click() }; ${mounted}(() => { pressFrame = requestAnimationFrame(press) }); ${unmounted}(() => cancelAnimationFrame(pressFrame))`
}

/** How long after an element takes focus an entry that selects in it selects the words (`selects`). */
export const SELECT_DELAY_MS = 60

/**
 * The statements an entry runs to select words once their element is in the
 * document and holds them (`selects`), for a renderer that writes them into
 * the entry: it looks once a frame, up to `TYPING_FRAMES` frames, focuses the
 * element, and selects the first run of the words in one of its text nodes
 * `SELECT_DELAY_MS` later. `mounted` and `unmounted` are the framework's
 * lifecycle calls. The names differ from the typing and pressing statements',
 * so an entry may do all three.
 */
export function selectStatements(
  selector: string,
  text: string,
  mounted: string,
  unmounted: string,
): string {
  return `let selectFrame = 0; let selectFrames = 0; let selectTimer = 0; const select = () => { const element = document.querySelector<HTMLElement>(${selector}); if (element === null || element.getClientRects().length === 0 || !(element.textContent ?? '').includes(${text})) { if (++selectFrames < ${TYPING_FRAMES}) selectFrame = requestAnimationFrame(select); return } element.focus(); selectTimer = window.setTimeout(() => { const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) { const at = node.textContent?.indexOf(${text}) ?? -1; if (at === -1) continue; document.getSelection()?.setBaseAndExtent(node, at, node, at + ${text}.length); return } }, ${SELECT_DELAY_MS}) }; ${mounted}(() => { selectFrame = requestAnimationFrame(select) }); ${unmounted}(() => { cancelAnimationFrame(selectFrame); clearTimeout(selectTimer) })`
}

/**
 * The component an entry renders: the member, or the compound part it names
 * (`AppShellNavItem` for `part: 'NavItem'`), which must be one of the
 * member's public parts.
 */
export function entrySubject(shell: MemberShell, entry: StateEntry): string {
  if (entry.part === undefined) return shell.member
  const part = (shell.parts ?? []).find((candidate) => candidate.name === entry.part)
  if (part === undefined || !part.public) {
    throw new Error(
      `shells: ${shell.member}'s "${entry.name}" renders ${entry.part}, which is not one of its public parts`,
    )
  }
  return `${shell.member}${entry.part}`
}

/** The entries the registry's lawful grid gives a member, one per cell, before its own. */
export function gridEntries(shell: MemberShell, component: RegistryMemberLike): StateEntry[] {
  if (shell.grid === undefined || component.grid === null) return []
  return Object.entries(component.grid).flatMap(([variant, tones]) =>
    tones.map((tone) => ({
      name: `${variant} / ${tone}`,
      props: { ...(shell.grid?.props ?? {}), variant, tone },
      ...(shell.grid?.slots ? { slots: shell.grid.slots } : {}),
      expect: { 'data-variant': variant, 'data-tone': tone },
    })),
  )
}

/* -------------------------------------------------------------------------- */
/* A part drawn as its own element                                            */
/* -------------------------------------------------------------------------- */

/**
 * Elements that must be direct children of their parent's element: a list's
 * item, a table's section, row and cell, a description list's term and detail.
 * A part that draws one of them draws it as its host element.
 */
export const STRUCTURAL_TAGS = new Set([
  'li',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'dt',
  'dd',
  'option',
])

/**
 * The one element a part draws, and what it holds, when the part can draw it
 * as its host: a template of one element, or a condition whose every branch is
 * one element of the same tag and the same attributes (JsonTree's row), whose
 * content is then the condition over the branches' contents.
 */
export function hostElement(
  template: MemberShell['template'],
): { element: ElementNode; children: readonly Node[] } | null {
  const nodes = Array.isArray(template) ? (template as readonly Node[]) : [template as Node]
  if (nodes.length !== 1) return null
  const only = nodes[0] as Node
  const plainElement = (node: Node | undefined): node is ElementNode =>
    node !== undefined &&
    node.kind === 'element' &&
    typeof node.tag === 'string' &&
    /^[a-z]/.test(node.tag)
  if (plainElement(only)) return { element: only, children: only.children ?? [] }
  if (only.kind !== 'if' || only.otherwise === undefined) return null
  const lists = [...only.branches.map((branch) => branch.then), only.otherwise]
  const elements = lists.map((list) => (list.length === 1 ? list[0] : undefined))
  if (!elements.every(plainElement)) return null
  const first = elements[0] as ElementNode
  const shape = (element: ElementNode) =>
    JSON.stringify({ ...element, children: undefined, part: undefined })
  if (!elements.every((element) => shape(element) === shape(first))) return null
  return {
    element: first,
    children: [
      {
        kind: 'if',
        branches: only.branches.map((branch, at) => ({
          when: branch.when,
          then: (elements[at] as ElementNode).children ?? [],
        })),
        otherwise: (elements.at(-1) as ElementNode).children ?? [],
      },
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* Walking the anatomy                                                        */
/* -------------------------------------------------------------------------- */

/** The lists of nodes directly inside a node, in document order. */
export function childLists(node: Node): (readonly Node[])[] {
  switch (node.kind) {
    case 'element':
      return [node.children ?? []]
    case 'member':
      return Object.values(node.slots ?? {})
    case 'slot':
      return [node.fallback ?? []]
    case 'if':
      return [...node.branches.map((branch) => branch.then), node.otherwise ?? []]
    case 'each':
    case 'portal':
      return [node.children]
    default:
      return []
  }
}

/** Visits every node of a tree depth first, saying whether it is inside a loop. */
export function walk(
  nodes: readonly Node[],
  visit: (node: Node, inLoop: boolean) => void,
  inLoop = false,
) {
  for (const node of nodes) {
    visit(node, inLoop)
    for (const list of childLists(node)) walk(list, visit, inLoop || node.kind === 'each')
  }
}

/** Every node of a tree, depth first, for the analyses that look for one kind. */
export function allNodes(nodes: readonly Node[]): Node[] {
  const out: Node[] = []
  walk(nodes, (node) => {
    out.push(node)
  })
  return out
}

/** Whether any node of a tree passes the test. */
export function usesNode(nodes: readonly Node[], test: (node: Node) => boolean): boolean {
  return allNodes(nodes).some(test)
}

/** Every expression in a node tree, for the free-name analysis. */
export function templateExpressions(nodes: readonly Node[], out: Expr[] = []): Expr[] {
  for (const node of nodes) {
    switch (node.kind) {
      case 'element':
        if (typeof node.tag !== 'string') out.push(node.tag.expr)
        for (const name of node.class ?? []) if (typeof name !== 'string') out.push(name.when)
        out.push(...Object.values(node.geometry ?? {}))
        out.push(...(node.spread ?? []), ...Object.values(node.attrs ?? {}))
        for (const handler of Object.values(node.on ?? {})) out.push(...handlerExpressions(handler))
        templateExpressions(node.children ?? [], out)
        break
      case 'member':
        out.push(...Object.values(node.props ?? {}), ...Object.values(node.slotWhen ?? {}))
        for (const handler of Object.values(node.on ?? {})) out.push(...handlerExpressions(handler))
        for (const content of Object.values(node.slots ?? {})) templateExpressions(content, out)
        break
      case 'slot':
        out.push(...Object.values(node.props ?? {}), ...Object.values(node.pass ?? {}))
        if (node.take !== undefined) out.push(node.take)
        templateExpressions(node.fallback ?? [], out)
        break
      case 'text':
        if (node.expr !== undefined) out.push(node.expr)
        break
      case 'if':
        for (const branch of node.branches) {
          out.push(branch.when)
          templateExpressions(branch.then, out)
        }
        templateExpressions(node.otherwise ?? [], out)
        break
      case 'each':
        out.push(node.of, node.key)
        templateExpressions(node.children, out)
        break
      case 'portal':
        templateExpressions(node.children, out)
        break
      case 'render':
        out.push(node.value)
        break
    }
  }
  return out
}

/** The expressions a handler evaluates: its call or statement, and its condition. */
export function handlerExpressions(handler: Handler): Expr[] {
  const out: Expr[] = []
  if ('emit' in handler)
    out.push(`emit(${[`'${handler.emit}'`, ...(handler.args ?? [])].join(', ')})`)
  else out.push(handler.run)
  if (handler.when !== undefined) out.push(handler.when)
  return out
}

/** Members a node tree composes. */
export function composed(nodes: readonly Node[], out: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'member') {
      out.add(node.name)
      for (const content of Object.values(node.slots ?? {})) composed(content, out)
    } else if (node.kind === 'element') composed(node.children ?? [], out)
    else if (node.kind === 'slot') composed(node.fallback ?? [], out)
    else if (node.kind === 'if') {
      for (const branch of node.branches) composed(branch.then, out)
      composed(node.otherwise ?? [], out)
    } else if (node.kind === 'each' || node.kind === 'portal') composed(node.children, out)
  }
  return out
}

/** Every recipe class a template names. */
export function templateClassNames(
  nodes: readonly Node[],
  out: Set<string> = new Set(),
): Set<string> {
  for (const node of nodes) {
    if (node.kind === 'element') {
      for (const name of node.class ?? []) out.add(typeof name === 'string' ? name : name.name)
      templateClassNames(node.children ?? [], out)
    } else if (node.kind === 'member')
      Object.values(node.slots ?? {}).forEach((content) => templateClassNames(content, out))
    else if (node.kind === 'slot') templateClassNames(node.fallback ?? [], out)
    else if (node.kind === 'if') {
      node.branches.forEach((branch) => templateClassNames(branch.then, out))
      templateClassNames(node.otherwise ?? [], out)
    } else if (node.kind === 'each' || node.kind === 'portal')
      templateClassNames(node.children, out)
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Effects                                                                    */
/* -------------------------------------------------------------------------- */

/** Whether an effect holds an observer, a timer, a listener or what `run` did, which the member releases. */
export const holds = (effect: Effect): boolean =>
  effect.resize !== undefined ||
  effect.mutation !== undefined ||
  effect.delay !== undefined ||
  effect.listen !== undefined ||
  effect.release !== undefined

/**
 * Refuses an effect no renderer can write: one that neither mounts nor
 * watches, one that both waits and observes, one that observes attributes
 * without a subtree to observe them in (`attributes` without `mutation`), and
 * one that holds two kinds of thing a description cannot combine: one that
 * listens also observing or waiting, and one that releases also observing,
 * waiting or listening. Every renderer calls it for every effect.
 */
export function checkHolding(member: string, effect: Effect): void {
  if (effect.mount === false && effect.watch === undefined) {
    throw new Error(`shells: ${member} has an effect that neither mounts nor watches`)
  }
  if (effect.delay !== undefined && (effect.resize ?? effect.mutation) !== undefined) {
    throw new Error(`shells: ${member} has an effect that both waits and observes`)
  }
  if (effect.attributes !== undefined && effect.mutation === undefined) {
    throw new Error(`shells: ${member} observes attributes without a mutation subtree`)
  }
  const observes = effect.resize !== undefined || effect.mutation !== undefined
  if (effect.listen !== undefined && (observes || effect.delay !== undefined)) {
    throw new Error(`shells: ${member} has an effect that both listens and observes or waits`)
  }
  if (
    effect.release !== undefined &&
    (observes || effect.delay !== undefined || effect.listen !== undefined)
  ) {
    throw new Error(
      `shells: ${member} has an effect that both releases and observes, waits or listens`,
    )
  }
}

/* -------------------------------------------------------------------------- */
/* The agent block                                                            */
/* -------------------------------------------------------------------------- */

/** The argument types an agent action takes. */
export const AGENT_ARGUMENTS: readonly AgentArgument[] = ['boolean', 'number', 'text', 'id', 'ids']

/** A state's or an action's name: lower-case words joined by `-`, as the spec's `agent` fence writes it. */
const AGENT_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Refuses an agent block no renderer can register: one that names no element
 * (neither `on` nor `element`), one whose `on` names no element ref of the
 * template, or names the elements a loop renders; a state
 * or an action whose name is not lower-case words joined by `-`; an argument
 * type outside the closed list; an `among` on an action that takes no id, or
 * one that names no declared state; and a `secret` that names no declared
 * state.
 * A state and an action may share a name (`open`), as the spec's fence lets
 * them, because the handle keeps them in two objects. `loadMembers` calls it
 * for every description, and every renderer through `withAgent`.
 */
export function checkAgent(shell: MemberShell): void {
  const agent = shell.agent
  if (agent === undefined) return
  const where = `shells: ${shell.member}'s agent block`
  const template = Array.isArray(shell.template)
    ? (shell.template as readonly Node[])
    : [shell.template as Node]
  if (agent.on === undefined && agent.element === undefined) {
    throw new Error(`${where} names no element: give \`on\`, a ref, or \`element\``)
  }
  if (agent.on !== undefined) {
    // Whether each element with the ref is inside a loop.
    const loops: boolean[] = []
    walk(template, (node, inLoop) => {
      if (node.kind === 'element' && node.ref === agent.on) loops.push(inLoop)
    })
    if (loops.length === 0) {
      throw new Error(
        `${where} names "${agent.on}", which no element of the template has as its ref`,
      )
    }
    if (loops.includes(true)) {
      throw new Error(`${where} names "${agent.on}", which a loop renders once per item`)
    }
  }
  const states = Object.keys(agent.state)
  for (const name of [...states, ...Object.keys(agent.actions)]) {
    if (!AGENT_NAME.test(name)) {
      throw new Error(`${where} names "${name}", which is not lower-case words joined by "-"`)
    }
  }
  for (const [name, action] of Object.entries(agent.actions)) {
    if (typeof action !== 'string' && !AGENT_ARGUMENTS.includes(action.argument)) {
      throw new Error(
        `${where} gives "${name}" the argument "${action.argument}", which is not one of ${AGENT_ARGUMENTS.join(', ')}`,
      )
    }
    if (typeof action === 'string' || action.among === undefined) continue
    if (action.argument !== 'id' && action.argument !== 'ids') {
      throw new Error(
        `${where} gives "${name}" \`among\`, which names the list an id or ids argument chooses from, and "${name}" takes ${action.argument}`,
      )
    }
    if (!states.includes(action.among)) {
      throw new Error(
        `${where} gives "${name}" \`among: '${action.among}'\`, which it declares no state for`,
      )
    }
  }
  for (const name of agent.secret ?? []) {
    if (!states.includes(name))
      throw new Error(`${where} marks "${name}" secret, which it declares no state for`)
  }
}

/** A key of an object literal: as it is when it is an identifier, quoted when it is not (`select-all`). */
const objectKey = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : `'${name}'`)

/**
 * The agent block as an effect: on mount, the foundation's `agentMember`
 * registers a handle whose state, actions and destructive check are
 * closures over the member's scope, and on unmount the function it returned
 * removes it. A renderer rewrites the free names inside the closures as it
 * rewrites any expression's, so each closure reads the value of the moment
 * it is called (`api.value.checked` in Vue, `this.api.value.checked` in
 * Angular), not the value at mount.
 */
export function agentEffect(shell: MemberShell): Effect | undefined {
  const agent = shell.agent
  if (agent === undefined) return undefined
  const state = Object.entries(agent.state)
    .map(([name, expr]) => `${objectKey(name)}: (${expr})`)
    .join(', ')
  const actions = Object.entries(agent.actions)
    .map(([name, action]) =>
      typeof action === 'string'
        ? `${objectKey(name)}: () => (${action})`
        : `${objectKey(name)}: { argument: '${action.argument}', ${
            action.among === undefined ? '' : `among: '${action.among}', `
          }run: (value) => (${action.run}) }`,
    )
    .join(', ')
  const handle = [
    `member: '${agent.member ?? shell.member}'`,
    `element: () => ${agent.element ?? (agent.on as string)}`,
    `state: () => ({ ${state} })`,
    `actions: { ${actions} }`,
    ...(agent.secret === undefined || agent.secret.length === 0
      ? []
      : [`secret: [${agent.secret.map((name) => `'${name}'`).join(', ')}]`]),
    ...(agent.destructive === undefined
      ? []
      : [`destructive: () => Boolean(${agent.destructive})`]),
    ...(agent.withholds === undefined ? [] : [`withholds: () => ${agent.withholds}`]),
  ]
  const register = `agentMember({ ${handle.join(', ')} })`
  // A member that registers nothing still hands back a function, so the release is one call.
  return {
    run: agent.unless === undefined ? register : `(${agent.unless}) ? () => {} : ${register}`,
    release: 'ran()',
  }
}

/** The description with its agent block, checked, added to its effects as `agentEffect` writes it. */
export function withAgent(shell: MemberShell): MemberShell {
  const effect = agentEffect(shell)
  if (effect === undefined) return shell
  checkAgent(shell)
  return { ...shell, effects: [...(shell.effects ?? []), effect] }
}

/* -------------------------------------------------------------------------- */
/* Slots and presences                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Refuses a slot outlet no renderer writes the same way: one that renders the
 * first few elements (`take`) without passing them props, and one that passes
 * props (`pass`) and also has scoped `props` or a `fallback`. A slot that
 * passes props renders the caller's elements one by one, so it has no slot
 * props to give and nothing to fall back to. Every renderer calls it for every
 * template.
 */
export function checkSlots(member: string, nodes: readonly Node[]): void {
  for (const node of allNodes(nodes)) {
    if (node.kind !== 'slot') continue
    const outlet: SlotNode = node
    if (outlet.take !== undefined && outlet.pass === undefined) {
      throw new Error(`shells: ${member}'s slot "${outlet.name}" takes elements it passes nothing`)
    }
    if (
      outlet.pass !== undefined &&
      (outlet.props !== undefined || outlet.fallback !== undefined)
    ) {
      throw new Error(
        `shells: ${member}'s slot "${outlet.name}" passes props and has slot props or a fallback`,
      )
    }
  }
}

/** The expressions a presence reads, for the free-name analysis. */
export function presenceExpressions(presence: Presence): Expr[] {
  return [
    presence.open,
    ...[presence.binding, presence.sheetSide, presence.side, presence.align].flatMap((option) =>
      typeof option === 'object' ? [option.expr] : [],
    ),
    ...(presence.appear === undefined ? [] : [presence.appear]),
    ...(presence.key === undefined ? [] : [presence.key]),
  ]
}

/** Whether a presence's options read the member's scope: a side, an edge or `appear`. */
export const presenceReads = (presence: Presence): boolean =>
  [presence.sheetSide, presence.side, presence.align].some(
    (option) => typeof option === 'object',
  ) || presence.appear !== undefined

/**
 * A presence's options as object entries, each in a renderer's spelling of
 * its expressions. A written side, alignment or edge is a string. With
 * `getters`, one a prop chooses is a getter, which the motion engine reads
 * each time the element enters or leaves, and `appear` is a getter the
 * presence reads once, when it is made; without, each is its value, for a
 * renderer that passes the options as a function it calls each time
 * (`presenceReads`).
 */
export function presenceEntries(
  presence: Presence,
  expr: (source: Expr) => string,
  getters: boolean,
): string[] {
  const entry = (name: string, value: string | { expr: Expr } | undefined): string[] => {
    if (value === undefined) return []
    if (typeof value === 'string') return [`${name}: '${value}'`]
    return getters
      ? [`get ${name}() { return ${expr(value.expr)} }`]
      : [`${name}: ${expr(value.expr)}`]
  }
  return [
    ...entry('side', presence.side),
    ...entry('align', presence.align),
    ...entry('sheetSide', presence.sheetSide),
    ...(presence.appear === undefined
      ? []
      : getters
        ? [`get appear() { return ${expr(presence.appear)} }`]
        : [`appear: ${expr(presence.appear)}`]),
    ...(presence.reflow === undefined ? [] : [`reflow: '${presence.reflow}'`]),
  ]
}

/* -------------------------------------------------------------------------- */
/* The vocabulary's types                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The types `@polymorph/react-ui` exports that every framework's foundation
 * exports too, and so every generated vocabulary re-exports from its
 * foundation: the ones the React vocabulary re-exports from `@polymorph/react`,
 * which are the engine's, and the toast store's and the charts', which the
 * React vocabulary declares beside its members and each other foundation
 * declares or re-exports from the engine. A screen the emitter writes for any
 * framework imports them from the framework's vocabulary, as a React screen
 * imports them from `@polymorph/react-ui`.
 */
export const FOUNDATION_TYPE_EXPORTS: readonly string[] = [
  'AvatarTone',
  'BrandMarkProps',
  'BrandName',
  'CartesianChartProps',
  'ChartAnnotation',
  'ChartBaseline',
  'ChartDatum',
  'ChartMessages',
  'ChartScaleKind',
  'ChartSeries',
  'ChartSize',
  'ChartSlot',
  'ChartState',
  'ChartTooltipConfig',
  'ChartXAxis',
  'ChartYAxis',
  'ControlKind',
  'ControlSize',
  'DateGranularity',
  'DonutCenter',
  'DonutSegment',
  'FileRejection',
  'FileRejectionReason',
  'FunnelStage',
  'HeatmapValue',
  'HeatmapYAxis',
  'HistogramXAxis',
  'IconGroup',
  'IconRole',
  'IconRoleMeta',
  'IconSize',
  'InitialFocus',
  'LawfulVariants',
  'LayoutPatch',
  'RadarAxis',
  'ScatterBubble',
  'SeriesTone',
  'SpacingProps',
  'StateAttributeInput',
  'StateAttributes',
  'StateName',
  'ToastAction',
  'ToastOptions',
  'ToastPhase',
  'ToastPromiseSpec',
  'ToastRecord',
  'ToastTone',
  'ToneOf',
  'TooltipIndicator',
  'TreemapItem',
  'ValueFormat',
  'VariantOf',
]

/** Why a generated vocabulary exports none of the React foundation's `assertGoverned` types. */
const GOVERNED = {
  reason: "the React foundation's `assertGoverned` check of a React component's props",
}

/** Why a generated vocabulary exports neither of DatePicker's props variants. */
const DATE_PICKER_VARIANT = {
  reason:
    "React types DatePicker's props as a union over `granularity`; a generated DatePicker declares one props interface, `DatePickerProps`",
}

/** Why a generated vocabulary exports neither of Slider's props variants. */
const SLIDER_VARIANT = {
  reason:
    "React types Slider's props as a union over `range`; a generated Slider declares one props interface, `SliderProps`",
}

/** Why no generated vocabulary exports ImageEditor's types. */
const IMAGE_EDITOR = { reason: 'ImageEditor has no description, so no framework ships it' }

/**
 * The types `@polymorph/react-ui` exports that a generated vocabulary does
 * not, each with the reason, and the frameworks it holds for when it does not
 * hold for all of them. Every other type the React vocabulary exports, a
 * generated one exports under the same name (`packages/shells/src/shells.test.ts`).
 */
export const UNEXPORTED_TYPES: Readonly<
  Record<string, { reason: string; frameworks?: readonly string[] }>
> = {
  Governed: GOVERNED,
  GovernedCheck: GOVERNED,
  NativeProps: GOVERNED,
  StyleEscapeHatch: GOVERNED,
  DateOnlyPickerProps: DATE_PICKER_VARIANT,
  DateTimePickerProps: DATE_PICKER_VARIANT,
  SingleSliderProps: SLIDER_VARIANT,
  RangeSliderProps: SLIDER_VARIANT,
  ImageEditorMessages: IMAGE_EDITOR,
  ImageEditorProps: IMAGE_EDITOR,
  BrandMarkProps: {
    reason:
      "the Svelte and Angular foundations declare BrandMark's props inline and export no type",
    frameworks: ['svelte', 'angular'],
  },
}

/** Whether a framework's vocabulary leaves a type the React vocabulary exports out. */
export const unexported = (name: string, framework: string): boolean => {
  const entry = UNEXPORTED_TYPES[name]
  return entry !== undefined && (entry.frameworks?.includes(framework) ?? true)
}

/** The foundation's types a framework's index re-exports, by name, sorted. */
export function foundationTypeExports(framework: string): string[] {
  return FOUNDATION_TYPE_EXPORTS.filter((name) => !unexported(name, framework))
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** A kebab-case name in camelCase: `aria-label` is `ariaLabel`. */
export const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** Whether a name can be written as a bare TypeScript identifier. */
export const isIdentifier = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name)

/** A name with its first letter capitalised. */
export const capital = (name: string) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`

/** The registry's prop name as a TypeScript property key. */
export const key = (name: string) => (isIdentifier(name) ? name : `'${name}'`)

/** A plain string literal expression, written in single quotes, with no escapes. */
export function staticString(expr: Expr): string | null {
  const match = /^'([^'\\]*)'$/.exec(expr.trim())
  return match ? (match[1] as string) : null
}

/** A string as a JavaScript literal in single quotes. */
export function jsString(value: string): string {
  return `'${value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}'`
}

/** The import path from one member's directory to another's file. */
export function relativeFile(fromDir: string, toDir: string, file: string): string {
  if (fromDir === toDir) return `./${file}`
  return `../${toDir}/${file}`
}

/** A recipe class reference: `styles.button`, `focus.focusRing`, `styles['icon-only']`. */
export function classReference(name: string): string {
  const [binding, className] = name.includes('.')
    ? (name.split('.', 2) as [string, string])
    : ['styles', name]
  return isIdentifier(className) ? `${binding}.${className}` : `${binding}['${className}']`
}

/** The names a `generic` attribute declares: `Row`, or `T extends string, U` as `T` and `U`. */
export function typeParameters(generic: string | undefined): string[] {
  if (generic === undefined) return []
  return generic.split(',').map((parameter) => (parameter.trim().split(/\s/)[0] as string).trim())
}

/** The context key a lending member sets its identity under, and a borrowing one reads. */
export const IDENTITY_KEY = 'polymorph:identity'

/**
 * The key a member that lends its identity (`lends`) provides its hand-back
 * holder under, read as `borrowed` there and as `lender` in the member it
 * lends to. The member lent to writes a function returning one of its
 * elements into the holder (`lender.element = () => panel`), so the lender
 * reads an element it does not render: ConfirmDialog reads its Dialog's
 * panel, which its agent handle names and withholds.
 */
export const BORROWED_KEY = 'polymorph:borrowed'

/** The type of the hand-back holder, as each renderer writes it. */
export const BORROWED_TYPE = '{ element?: () => Element | null | undefined }'

/* -------------------------------------------------------------------------- */
/* Expressions and types, read with TypeScript                                */
/* -------------------------------------------------------------------------- */

/**
 * The DOM event type a handler for an event receives, for a handler no
 * binding types: Solid's and Angular's. Angular reads `input` as `Event`, the
 * type its template gives an `(input)` listener's `$event`.
 */
export const EVENT_TYPES: Readonly<Record<string, string>> = {
  click: 'MouseEvent',
  dblclick: 'MouseEvent',
  mousedown: 'MouseEvent',
  mouseup: 'MouseEvent',
  mouseenter: 'MouseEvent',
  mouseleave: 'MouseEvent',
  mousemove: 'MouseEvent',
  contextmenu: 'MouseEvent',
  pointerdown: 'PointerEvent',
  pointerup: 'PointerEvent',
  pointermove: 'PointerEvent',
  pointerenter: 'PointerEvent',
  pointerleave: 'PointerEvent',
  pointercancel: 'PointerEvent',
  keydown: 'KeyboardEvent',
  keyup: 'KeyboardEvent',
  focus: 'FocusEvent',
  blur: 'FocusEvent',
  focusin: 'FocusEvent',
  focusout: 'FocusEvent',
  input: 'InputEvent',
  beforeinput: 'InputEvent',
  paste: 'ClipboardEvent',
  copy: 'ClipboardEvent',
  dragover: 'DragEvent',
  dragenter: 'DragEvent',
  dragleave: 'DragEvent',
  drop: 'DragEvent',
  wheel: 'WheelEvent',
  compositionstart: 'CompositionEvent',
  compositionend: 'CompositionEvent',
  animationend: 'AnimationEvent',
  transitionend: 'TransitionEvent',
  submit: 'SubmitEvent',
}

/** An expression with its parentheses taken off, or `null` when the code is not one expression. */
function expressionOf(code: string, file: string): ts.Expression | null {
  const source = ts.createSourceFile(file, `(${code})`, ts.ScriptTarget.ESNext, true)
  const parsed = source.statements[0]
  if (parsed === undefined || !ts.isExpressionStatement(parsed)) return null
  let node: ts.Expression = parsed.expression
  while (ts.isParenthesizedExpression(node)) node = node.expression
  return node
}

/**
 * An expression written as a statement. A call, an assignment or an `await`
 * is written as it is; any other expression (a description's `a && b()`, or a
 * sequence) is marked `void`, which says its value is dropped on purpose and
 * which the unused-expression rule accepts.
 */
export function statement(code: string): string {
  const node = expressionOf(code, 'statement.ts')
  if (node === null) return code
  const kept =
    ts.isCallExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isPrefixUnaryExpression(node) ||
    ts.isPostfixUnaryExpression(node) ||
    ts.isVoidExpression(node) ||
    ts.isDeleteExpression(node) ||
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
  return kept ? code : `void (${code})`
}

/** Whether an expression is an arrow function of no parameters: a default's factory. */
export function isFactory(expr: Expr): boolean {
  const node = expressionOf(expr, 'default.ts')
  return node !== null && ts.isArrowFunction(node) && node.parameters.length === 0
}

/** Whether a prop's type is a function type, whose default is the function itself. */
export function isFunctionType(type: string): boolean {
  return unionParts(type).some((part) => {
    let text = part.trim()
    while (text.startsWith('(') && text.endsWith(')') && !/^\([^()]*\)\s*=>/.test(text))
      text = text.slice(1, -1).trim()
    return /^\(.*\)\s*=>/.test(text)
  })
}

/** Documentation text wrapped to a width for a doc comment, with any comment terminator escaped. */
export function wrapDoc(doc: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of doc.split(/\n+/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (word === '') continue
      if (line.length > 0 && line.length + word.length + 1 > width) {
        out.push(line)
        line = word
      } else line = line.length === 0 ? word : `${line} ${word}`
    }
    if (line.length > 0) out.push(line)
  }
  return out.map((line) => line.replace(/\*\//g, '*\\/'))
}
