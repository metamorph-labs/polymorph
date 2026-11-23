import { gallerySlug } from '@polymorph/engine'
import { vueBinding } from '@polymorph/registry/frameworks'

import type {
  ClassName,
  Effect,
  ElementNode,
  Expr,
  FixtureChild,
  FixtureInstance,
  FixtureValue,
  Handler,
  MemberNode,
  MemberShell,
  Node,
  SlotNode,
  StateEntry,
} from './dsl'
import {
  branded,
  camel,
  checkHolding,
  checkSlots,
  classReference,
  composed,
  entrySubject,
  fixtureName,
  fixtureValues,
  foundationTypeExports,
  gridEntries,
  holds,
  BORROWED_KEY,
  BORROWED_TYPE,
  IDENTITY_KEY,
  key,
  presenceEntries,
  presenceExpressions,
  relativeFile,
  renderedChildren,
  RENDERS_KEYS,
  type FixtureRenders,
  staticString,
  templateClassNames,
  templateExpressions,
  typeParameters,
  pressStatements,
  selectStatements,
  TYPING_FRAMES,
  usesNode,
  withAgent,
  wrapDoc,
  type Location,
  type RegistryMemberLike,
} from './common'
import { freeNames, rewrite } from './expr'
import {
  ENGINE_HELPERS,
  eventParameters,
  FOUNDATION_TYPES,
  renderParameter,
  rewriteType,
} from './types'

/**
 * The Vue renderer: a member's description, written as a `<script setup>`
 * single-file component, its states fixture and the vocabulary's index.
 *
 * The props, events and slots come from the registry's props table through
 * `vueBinding` (`@polymorph/registry/frameworks`), the reading the screen
 * emitter uses, so the two cannot disagree about a prop: a node prop is a slot
 * of its name, an `onFoo` prop the event `foo`, a render prop a scoped slot,
 * anything else a prop of the same name and type. The template comes from the
 * description's anatomy. Each member is declared with `inheritAttrs: false`,
 * so it binds no `class`, `style` or attribute it is not given as a prop.
 *
 * Output is deterministic: the same description and registry give the same
 * bytes, which the freshness law (`shells.test.ts`) relies on.
 */

/** Where every described member's file is, for imports between them. */
export interface VueContext {
  locations: ReadonlyMap<string, Location>
  /**
   * The component that declares each shared type, by the type's name: a
   * description's `types`, and every component's props interface. Another
   * description's `uses` imports the type from there.
   */
  owners: ReadonlyMap<string, string>
  /** The description's file, for the generated header. */
  source: string
}

/** The imports a file needs for the members it composes: relative files, and foundation names. */
function memberImports(
  names: Iterable<string>,
  fromDir: string,
  fromHome: 'vocabulary' | 'foundation',
  context: VueContext,
): { lines: string[]; foundation: string[] } {
  const lines: string[] = []
  const foundation: string[] = []
  for (const name of [...names].sort()) {
    const location = context.locations.get(name)
    if (location === undefined)
      throw new Error(`shells: ${name} is composed but has no description`)
    if (location.home === 'foundation' && fromHome === 'vocabulary') foundation.push(name)
    else lines.push(`import ${name} from '${relativeFile(fromDir, location.dir, `${name}.vue`)}'`)
  }
  return { lines, foundation }
}

/**
 * The foundation's helpers an expression may call, imported from
 * `@polymorph/vue`: the engine's framework-free conventions, which it
 * re-exports and the React members import too, and its own.
 */
const FOUNDATION_HELPERS = new Set([
  ...ENGINE_HELPERS,
  'Glyph',
  'BrandMark',
  'PageTransition',
  'slotted',
  // A slot as a node another component renders (a declared Toast's content), and whether a
  // scoped slot draws anything for its props.
  'slotNode',
  'slotDraws',
  // A function run once the pending changes are in the document.
  'afterRender',
  // The toast store's, which Toast's viewport and FormField's notice read and write.
  'toast',
  'getToasts',
  'subscribeToasts',
  'removeToast',
])

/** An attribute value in double quotes: a double quote is the one character that would end it. */
const escapeAttribute = (value: string) => value.replace(/"/g, '&quot;')

/**
 * Static text as a template writes it. Vue reads `{{` as the start of an
 * interpolation, and condenses the whitespace at either end of a text node
 * that sits on its own line, so text with either is written as a string
 * literal in an interpolation (`{{ ' *' }}`), which Vue renders as it is. The
 * literal holds no character the template reads specially: quotes, `&`, `<`,
 * `>`, braces and line breaks are escapes, as the screen emitter writes them.
 * Other text is written as markup, with `&`, `<` and `>` as entities.
 */
function staticText(value: string): string {
  if (value.includes('{{') || /^\s|\s$/.test(value)) {
    const literal = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/["&<>{}]/g, (char) => `\\x${char.charCodeAt(0).toString(16)}`)
    return `{{ '${literal}' }}`
  }
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* -------------------------------------------------------------------------- */
/* The member's interface: props, events and slots from the registry          */
/* -------------------------------------------------------------------------- */

interface Interface {
  props: { name: string; type: string; optional: boolean; doc?: string; boolean: boolean }[]
  events: { name: string; prop: string; parameters: { name: string; type: string }[] }[]
  slots: { name: string; prop: string; optional: boolean; scope: string | null }[]
  /** Type names the interface references. */
  names: Set<string>
}

/**
 * A member's props, events and slots, by the registry. A prop the registry
 * lists under a part's name (`Group.title`) is the part's (`partProps`), not
 * the member's.
 */
function vueInterface(component: RegistryMemberLike): Interface {
  const result: Interface = { props: [], events: [], slots: [], names: new Set() }
  for (const prop of component.props) {
    if (prop.name.includes('.')) continue
    const binding = vueBinding(prop)
    if (binding.kind === 'prop') {
      const printed = rewriteType(prop.type)
      printed.names.forEach((name) => result.names.add(name))
      result.props.push({
        name: prop.name,
        type: printed.text,
        optional: prop.optional,
        ...(prop.doc ? { doc: prop.doc } : {}),
        boolean: /\bboolean\b/.test(printed.text),
      })
    } else if (binding.kind === 'event') {
      const { parameters, names } = eventParameters(prop.type)
      names.forEach((name) => result.names.add(name))
      result.events.push({ name: binding.name, prop: prop.name, parameters })
    } else {
      let scope: string | null = null
      if (binding.kind === 'scoped-slot') {
        const parameter = renderParameter(prop.type)
        if (parameter !== null) {
          parameter.names.forEach((name) => result.names.add(name))
          scope = parameter.text
        }
      }
      result.slots.push({ name: binding.name, prop: prop.name, optional: prop.optional, scope })
    }
  }
  return result
}

/* -------------------------------------------------------------------------- */
/* The SFC                                                                    */
/* -------------------------------------------------------------------------- */

interface Scope {
  props: Set<string>
  derived: Set<string>
  state: Set<string>
  refs: Set<string>
  machine: boolean
}

function classBinding(names: readonly ClassName[]): string {
  const parts = names.map((name) =>
    typeof name === 'string'
      ? classReference(name)
      : `(${name.when}) ? ${classReference(name.name)} : undefined`,
  )
  return parts.length === 1 && typeof names[0] === 'string'
    ? (parts[0] as string)
    : `[${parts.join(', ')}]`
}

/** Template expressions read slots as `$slots`. */
const templateExpr = (expr: Expr): string =>
  rewrite(expr, (name) => (name === 'slots' ? '$slots' : null))

function handlerCode(handler: Handler): string {
  const action =
    'emit' in handler
      ? `emit(${[`'${handler.emit}'`, ...(handler.args ?? [])].join(', ')})`
      : handler.run
  return templateExpr(handler.when === undefined ? action : `(${handler.when}) && ${action}`)
}

function attribute(name: string, expr: Expr): string {
  const value = staticString(expr)
  if (value !== null) return `${name}="${escapeAttribute(value)}"`
  return `:${name}="${escapeAttribute(templateExpr(expr))}"`
}

interface Rendered {
  lines: string[]
}

/**
 * The element refs the member hands to a caller's `controlRef`, for the
 * render in progress. Rendering is synchronous, so one module value serves.
 */
let controlRefNames: ReadonlySet<string> = new Set()

const attachName = (name: string) => `attach${name.charAt(0).toUpperCase()}${name.slice(1)}`

function renderNodes(
  nodes: readonly Node[],
  depth: number,
  out: Rendered,
  directive?: string,
): void {
  for (const node of nodes) renderNode(node, depth, out, directive)
}

function indent(depth: number): string {
  return '  '.repeat(depth)
}

/** An element's opening tag attributes, in a fixed order. */
function elementAttributes(
  node: ElementNode | MemberNode,
  directive: string | undefined,
): string[] {
  const parts: string[] = []
  if (directive !== undefined) parts.push(directive)
  if (node.kind === 'element') {
    if (typeof node.tag !== 'string')
      parts.push(`:is="${escapeAttribute(templateExpr(node.tag.expr))}"`)
    if (node.ref !== undefined) {
      parts.push(
        controlRefNames.has(node.ref) ? `:ref="${attachName(node.ref)}"` : `ref="${node.ref}"`,
      )
    }
    const spread = node.spread ?? []
    if (spread.length === 1)
      parts.push(`v-bind="${escapeAttribute(templateExpr(spread[0] as Expr))}"`)
    else if (spread.length > 1)
      parts.push(
        `v-bind="${escapeAttribute(`mergeParts(${spread.map(templateExpr).join(', ')})`)}"`,
      )
    if (node.class && node.class.length > 0)
      parts.push(`:class="${escapeAttribute(templateExpr(classBinding(node.class)))}"`)
    if (node.geometry && Object.keys(node.geometry).length > 0) {
      const style = `{ ${Object.entries(node.geometry)
        .map(
          ([property, expr]) =>
            `${key(property.startsWith('--') ? property : camel(property))}: ${expr}`,
        )
        .join(', ')} }`
      parts.push(`:style="${escapeAttribute(templateExpr(style))}"`)
    }
    for (const [name, expr] of Object.entries(node.attrs ?? {})) parts.push(attribute(name, expr))
  } else {
    for (const [name, expr] of Object.entries(node.props ?? {})) parts.push(attribute(name, expr))
  }
  for (const [event, handler] of Object.entries(node.on ?? {})) {
    parts.push(`@${event}="${escapeAttribute(handlerCode(handler))}"`)
  }
  return parts
}

function openTag(name: string, attributes: string[], selfClosing: boolean): string {
  const inner = attributes.length === 0 ? name : `${name} ${attributes.join(' ')}`
  return selfClosing ? `<${inner} />` : `<${inner}>`
}

function renderNode(node: Node, depth: number, out: Rendered, directive?: string): void {
  const pad = indent(depth)
  switch (node.kind) {
    case 'element': {
      const tag = typeof node.tag === 'string' ? node.tag : 'component'
      // A comment beside a root would make the component a fragment in development builds.
      if (node.part !== undefined && depth > 1) out.lines.push(`${pad}<!-- ${node.part} -->`)
      const children = node.children ?? []
      const attributes = elementAttributes(node, directive)
      if (children.length === 0) {
        out.lines.push(`${pad}${openTag(tag, attributes, true)}`)
        return
      }
      out.lines.push(`${pad}${openTag(tag, attributes, false)}`)
      renderNodes(children, depth + 1, out)
      out.lines.push(`${pad}</${tag}>`)
      return
    }
    case 'member': {
      const attributes = elementAttributes(node, directive)
      const slots = Object.entries(node.slots ?? {})
      for (const name of Object.keys(node.slotWhen ?? {})) {
        if (!(name in (node.slots ?? {}))) {
          throw new Error(`shells: ${node.name}'s slot "${name}" has a condition and no content`)
        }
      }
      if (slots.length === 0) {
        out.lines.push(`${pad}${openTag(node.name, attributes, true)}`)
        return
      }
      out.lines.push(`${pad}${openTag(node.name, attributes, false)}`)
      if (
        slots.length === 1 &&
        slots[0]?.[0] === 'default' &&
        node.slotWhen?.default === undefined
      ) {
        renderNodes(slots[0][1], depth + 1, out)
      } else {
        for (const [name, content] of slots) {
          // A slot under a condition is passed only while it holds: Vue leaves a
          // `v-if` slot out of the component's slots, as React leaves out an
          // `undefined` node prop.
          const condition = node.slotWhen?.[name]
          const passed =
            condition === undefined
              ? `#${name}`
              : `v-if="${escapeAttribute(templateExpr(condition))}" #${name}`
          out.lines.push(`${indent(depth + 1)}<template ${passed}>`)
          renderNodes(content, depth + 2, out)
          out.lines.push(`${indent(depth + 1)}</template>`)
        }
      }
      out.lines.push(`${pad}</${node.name}>`)
      return
    }
    case 'slot':
      return renderSlot(node, depth, out, directive)
    case 'text': {
      const content =
        node.expr !== undefined ? `{{ ${templateExpr(node.expr)} }}` : staticText(node.value ?? '')
      if (directive !== undefined)
        out.lines.push(`${pad}<template ${directive}>${content}</template>`)
      else out.lines.push(`${pad}${content}`)
      return
    }
    case 'if': {
      const clauses = [
        ...node.branches.map((branch, at) => ({
          directive: `${at === 0 ? 'v-if' : 'v-else-if'}="${escapeAttribute(templateExpr(branch.when))}"`,
          then: branch.then,
        })),
        ...(node.otherwise ? [{ directive: 'v-else', then: node.otherwise }] : []),
      ]
      for (const clause of clauses) {
        const only = clause.then.length === 1 ? clause.then[0] : undefined
        if (
          only !== undefined &&
          (only.kind === 'element' || only.kind === 'member' || only.kind === 'text')
        ) {
          renderNode(only, depth, out, clause.directive)
          continue
        }
        out.lines.push(`${pad}<template ${clause.directive}>`)
        renderNodes(clause.then, depth + 1, out)
        out.lines.push(`${pad}</template>`)
      }
      return
    }
    case 'each': {
      const variables = node.index === undefined ? node.as : `(${node.as}, ${node.index})`
      out.lines.push(
        `${pad}<template v-for="${escapeAttribute(`${variables} in ${templateExpr(node.of)}`)}" :key="${escapeAttribute(templateExpr(node.key))}">`,
      )
      renderNodes(node.children, depth + 1, out)
      out.lines.push(`${pad}</template>`)
      return
    }
    case 'portal':
      out.lines.push(`${pad}<Teleport to="body"${directive ? ` ${directive}` : ''}>`)
      renderNodes(node.children, depth + 1, out)
      out.lines.push(`${pad}</Teleport>`)
      return
    case 'render':
      out.lines.push(
        `${pad}${openTag('component', [...(directive ? [directive] : []), `:is="${escapeAttribute(templateExpr(node.value))}"`], true)}`,
      )
      return
  }
}

function renderSlot(
  node: SlotNode,
  depth: number,
  out: Rendered,
  directive: string | undefined,
): void {
  const pad = indent(depth)
  if (node.pass !== undefined) {
    // React's `cloneElement`: the slotted elements, each given these props over
    // its own, leaving its own where a value is `undefined`. `child` is the
    // element's own props.
    const passed = `definedProps({ ${Object.entries(node.pass)
      .map(([name, expr]) => `${key(name)}: ${expr}`)
      .join(', ')} })`
    const source = `slottedElements($slots.${node.name}${node.take === undefined ? '' : `, ${templateExpr(node.take)}`})`
    const clone = rewrite(templateExpr(passed), (name) =>
      name === 'child' ? '(node.props ?? {})' : null,
    )
    out.lines.push(
      `${pad}<template ${directive ? `${directive} ` : ''}v-for="(node, at) in ${escapeAttribute(source)}" :key="at">`,
    )
    out.lines.push(
      `${indent(depth + 1)}<component :is="${escapeAttribute(`cloneVNode(node, ${clone})`)}" />`,
    )
    out.lines.push(`${pad}</template>`)
    return
  }
  const attributes: string[] = []
  if (directive !== undefined) attributes.push(directive)
  if (node.name !== 'default') attributes.push(`name="${node.name}"`)
  for (const [name, expr] of Object.entries(node.props ?? {}))
    attributes.push(attribute(name, expr))
  const fallback = node.fallback ?? []
  if (fallback.length === 0) {
    out.lines.push(`${pad}${openTag('slot', attributes, true)}`)
    return
  }
  out.lines.push(`${pad}${openTag('slot', attributes, false)}`)
  renderNodes(fallback, depth + 1, out)
  out.lines.push(`${pad}</slot>`)
}

/** The SFC for one member, before formatting. */
export function renderVueMember(
  described: MemberShell,
  component: RegistryMemberLike,
  context: VueContext,
  /** For a compound part: the member it belongs to, whose `provide` it reads as `owner`. */
  owner?: string,
): string {
  // The agent block is one more effect, which registers the instance with the agent registry.
  const shell = withAgent(described)
  const face = vueInterface(component)
  controlRefNames = new Set(Object.keys(shell.controlRefs ?? {}))
  const home = shell.home ?? 'vocabulary'
  const template = Array.isArray(shell.template)
    ? (shell.template as readonly Node[])
    : [shell.template as Node]
  const scope: Scope = {
    props: new Set(face.props.map((prop) => camel(prop.name))),
    derived: new Set(Object.keys(shell.derived ?? {})),
    state: new Set(Object.keys(shell.state ?? {})),
    refs: new Set(Object.keys(shell.controlRefs ?? {})),
    machine: shell.machine !== undefined,
  }
  const lists = Object.keys(shell.listPresence ?? {})
  for (const name of [
    ...scope.derived,
    ...scope.state,
    ...Object.keys(shell.presence ?? {}),
    ...lists,
    ...(shell.mode === undefined ? [] : [shell.mode]),
  ]) {
    if (scope.props.has(name)) {
      throw new Error(
        `shells: ${shell.member} names a derived or state value "${name}" after a prop`,
      )
    }
  }
  // A recipe is a binding of the script too, so it cannot share a name with a value.
  for (const name of Object.keys(shell.recipes ?? {})) {
    if (
      name === 'styles' ||
      scope.props.has(name) ||
      scope.derived.has(name) ||
      scope.state.has(name) ||
      name in (shell.presence ?? {}) ||
      name in (shell.listPresence ?? {}) ||
      name in (shell.media ?? {}) ||
      name === shell.mode
    ) {
      throw new Error(`shells: ${shell.member} names a recipe "${name}" after another value`)
    }
  }

  /** A script-side expression: props through `props`, refs through `.value`. */
  const templateRefs = new Set<string>()
  const scriptExpr = (expr: Expr): string =>
    rewrite(expr, (name) => {
      if (scope.props.has(name)) return `props.${name}`
      if (scope.derived.has(name) || scope.state.has(name) || scope.refs.has(name))
        return `${name}.value`
      if (templateRefs.has(name)) return `${name}.value`
      if (
        name in (shell.presence ?? {}) ||
        name in (shell.listPresence ?? {}) ||
        name in (shell.media ?? {}) ||
        name === shell.mode
      )
        return `${name}.value`
      if (name === 'slots') return 'slots'
      if (name === 'api' && scope.machine) return 'api.value'
      return null
    })

  const scriptSources: Expr[] = [
    ...Object.values(shell.derived ?? {}),
    ...Object.values(shell.state ?? {}),
    ...Object.values(shell.machine?.context ?? {}),
    ...Object.values(shell.machine?.events ?? {}).map((event) =>
      'emit' in event ? `emit('${event.emit}', ${event.payload})` : event.run,
    ),
    ...Object.values(shell.presence ?? {}).flatMap(presenceExpressions),
    ...Object.values(shell.listPresence ?? {}).flatMap((list) => [list.of, list.key]),
    ...Object.values(shell.statics ?? {}),
    ...(shell.effects ?? []).flatMap((effect) => [
      effect.run,
      ...(effect.watch === undefined ? [] : [effect.watch]),
      ...(effect.resize ?? []),
      ...(effect.mutation ?? []),
      ...(effect.delay === undefined ? [] : [effect.delay]),
      ...(effect.release === undefined ? [] : [effect.release]),
    ]),
    ...Object.values(shell.provide ?? {}),
  ]
  const templateSources = templateExpressions(template)
  const scriptNames = new Set(scriptSources.flatMap((expr) => [...freeNames(expr)]))
  const templateNames = new Set(templateSources.flatMap((expr) => [...freeNames(expr)]))
  const usesProps = [...scriptNames].some((name) => scope.props.has(name))
  const usesEmit = scriptNames.has('emit') || templateNames.has('emit')
  const usesSlotsInScript = scriptNames.has('slots')
  const usesUid = scriptNames.has('uid') || templateNames.has('uid') || scope.machine
  const usesClone = usesNode(template, (node) => node.kind === 'slot' && node.pass !== undefined)
  const usesMerge = usesNode(
    template,
    (node) => node.kind === 'element' && (node.spread?.length ?? 0) > 1,
  )
  for (const event of Object.values(shell.machine?.events ?? {})) {
    if ('emit' in event && !face.events.some((candidate) => candidate.name === event.emit)) {
      throw new Error(`shells: ${shell.member} emits "${event.emit}", which no on-prop declares`)
    }
  }

  /* imports ---------------------------------------------------------------- */
  const vueImports = new Set<string>()
  const foundationValuesEarly = new Set<string>()
  if (shell.derived || shell.machine) vueImports.add('computed')
  const readsOwner = owner !== undefined && (scriptNames.has('owner') || templateNames.has('owner'))
  const readsLent = scriptNames.has('lent') || templateNames.has('lent')
  const readsLender = scriptNames.has('lender')
  const handsBack = shell.lends === true && scriptNames.has('borrowed')
  if (readsOwner || readsLent || readsLender) vueImports.add('inject')
  if (shell.provide || shell.lends || readsLender) vueImports.add('provide')
  checkSlots(shell.member, template)
  for (const effect of shell.effects ?? []) {
    checkHolding(shell.member, effect)
    if (effect.mount !== false) vueImports.add('onMounted')
    if (effect.watch !== undefined) vueImports.add('watch')
    if (holds(effect)) vueImports.add('onBeforeUnmount')
  }
  if (shell.state) vueImports.add('ref')
  if (lists.length > 0) {
    vueImports.add('computed')
    vueImports.add('shallowRef')
    vueImports.add('watch')
  }
  if (usesUid) vueImports.add('useId')
  if (usesClone) {
    vueImports.add('cloneVNode')
    foundationValuesEarly.add('definedProps')
    foundationValuesEarly.add('slottedElements')
  }
  if (usesMerge) foundationValuesEarly.add('mergeParts')
  // A ref inside a loop names every element the loop renders, so it is a list.
  const listRefs = new Set<string>()
  const collectRefs = (nodes: readonly Node[], inLoop: boolean) => {
    for (const node of nodes) {
      if (node.kind === 'element' && node.ref !== undefined && !scope.refs.has(node.ref)) {
        templateRefs.add(node.ref)
        if (inLoop) listRefs.add(node.ref)
      }
      if (node.kind === 'element') collectRefs(node.children ?? [], inLoop)
      else if (node.kind === 'member')
        Object.values(node.slots ?? {}).forEach((content) => collectRefs(content, inLoop))
      else if (node.kind === 'slot') collectRefs(node.fallback ?? [], inLoop)
      else if (node.kind === 'if') {
        node.branches.forEach((branch) => collectRefs(branch.then, inLoop))
        collectRefs(node.otherwise ?? [], inLoop)
      } else if (node.kind === 'each') collectRefs(node.children, true)
      else if (node.kind === 'portal') collectRefs(node.children, inLoop)
    }
  }
  collectRefs(template, false)
  if (templateRefs.size > 0) vueImports.add('useTemplateRef')
  const typeImportsFromVue = new Set<string>()
  if (face.names.has('Ref')) typeImportsFromVue.add('Ref')
  // A node inside a structured prop (`AccordionItem.content`) is a VNode, and
  // so is a node prop the props interface carries.
  if (
    Object.values(shell.types ?? {}).some((definition) => /\bVNode\b/.test(definition)) ||
    (shell.carries ?? []).length > 0
  ) {
    typeImportsFromVue.add('VNode')
  }
  const readsInvoke = scriptNames.has('invoke') || templateNames.has('invoke')
  if (readsInvoke) vueImports.add('getCurrentInstance')
  const readsSlotText = scriptNames.has('slotText') || templateNames.has('slotText')
  if (readsSlotText) {
    vueImports.add('isVNode')
    vueImports.add('Text as TextVNode')
  }

  const composedImports = memberImports(
    [...composed(template)].filter((name) => name !== shell.member),
    shell.dir,
    home,
    context,
  )
  const foundationValues = new Set<string>([
    ...composedImports.foundation,
    ...foundationValuesEarly,
  ])
  const foundationTypes = new Set<string>()
  if (shell.controlRefs) foundationValues.add('useControlRef')
  if (scriptNames.has('listening') || templateNames.has('listening'))
    foundationValues.add('useListening')
  if (shell.departures) foundationValues.add('useDeparture')
  if (shell.media) foundationValues.add('useMediaQuery')
  if (shell.mode) foundationValues.add('useMode')
  if (shell.machine) foundationValues.add('useDirection')
  if (usesSlotsInScript) foundationValues.add('useTrackedSlots')
  for (const name of face.names) if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  // A type the member declares may name the foundation's (`TabDescriptor.icon` is an `IconRole`).
  for (const name of FOUNDATION_TYPES) {
    if (
      Object.values(shell.types ?? {}).some((definition) =>
        new RegExp(`\\b${name}\\b`).test(definition),
      )
    ) {
      foundationTypes.add(name)
    }
  }
  // A prop's default may name a helper too (FileUpload's sizes default to `formatBytes`).
  const defaultNames = Object.values(shell.defaults ?? {}).flatMap((expr) => [...freeNames(expr)])
  for (const name of [...scriptNames, ...templateNames, ...defaultNames]) {
    if (FOUNDATION_HELPERS.has(name)) foundationValues.add(name)
    // A type an expression names (`null as RichTextEditorState | null`) is the foundation's too.
    if (FOUNDATION_TYPES.has(name)) foundationTypes.add(name)
  }
  if (usesNode(template, (node) => node.kind === 'element' && node.tag === 'Glyph'))
    foundationValues.add('Glyph')

  // The member's type parameters (`generic: 'Row'`) are declared by the script tag.
  const parameters = typeParameters(shell.generic)
  const declared = new Set([...Object.keys(shell.types ?? {}), ...parameters])
  const uses = new Set(shell.uses ?? [])
  const undeclared = [...face.names].filter(
    (name) =>
      name !== 'Ref' && !FOUNDATION_TYPES.has(name) && !declared.has(name) && !uses.has(name),
  )
  if (undeclared.length > 0) {
    throw new Error(
      `shells: ${shell.member}'s props name ${undeclared.join(', ')}, which its description neither declares (\`types\`) nor uses (\`uses\`)`,
    )
  }
  // A shared type is imported from the component that declares it. A member
  // names each type it uses; a part imports those of its member's that its own
  // props name.
  const named = (name: string) =>
    face.names.has(name) ||
    Object.values(shell.types ?? {}).some((definition) =>
      new RegExp(`\\b${name}\\b`).test(definition),
    )
  const sharedTypes = new Map<string, string[]>()
  for (const name of [...uses].sort()) {
    const from = context.owners.get(name)
    if (from === undefined || declared.has(name)) {
      throw new Error(
        `shells: ${shell.member} uses ${name}, which ${from === undefined ? 'no description declares' : 'it declares itself'}`,
      )
    }
    if (!named(name)) {
      if (owner !== undefined) continue
      throw new Error(
        `shells: ${shell.member} uses ${name}, which neither its props nor its types name`,
      )
    }
    const location = context.locations.get(from)
    if (location?.home === 'foundation' && home === 'vocabulary') foundationTypes.add(name)
    else sharedTypes.set(from, [...(sharedTypes.get(from) ?? []), name])
  }

  const lines: string[] = []
  lines.push(
    shell.generic === undefined
      ? '<script setup lang="ts">'
      : `<script setup lang="ts" generic="${escapeAttribute(shell.generic)}">`,
  )
  lines.push('/**')
  lines.push(` * ${component.purpose}${component.spec ? ` (\`${component.spec}\`)` : ''}.`)
  lines.push(' *')
  lines.push(` * Generated by \`pnpm shells\` from \`${context.source}\`, the member's`)
  lines.push(' * framework-neutral description. Never edit it by hand: change the description and')
  lines.push(' * run `pnpm shells`.')
  lines.push(' */')
  if (vueImports.size > 0 || typeImportsFromVue.size > 0) {
    const names = [
      ...[...vueImports].sort(),
      ...[...typeImportsFromVue].sort().map((name) => `type ${name}`),
    ]
    lines.push(`import { ${names.join(', ')} } from 'vue'`)
  }
  if (shell.machine) {
    lines.push('')
    lines.push(`import * as zag from '@zag-js/${shell.machine.of}'`)
    lines.push(`import { normalizeProps, useMachine } from '@zag-js/vue'`)
  }
  lines.push('')
  if (home === 'foundation') {
    // Inside the foundation, its own index would import this file back: the
    // gateway is a sibling module, and the types are the engine's.
    if (foundationValues.has('Glyph')) lines.push(`import { Glyph } from './Glyph'`)
    if (foundationTypes.size > 0) {
      lines.push(
        `import type { ${[...foundationTypes].sort().join(', ')} } from '@polymorph/engine'`,
      )
    }
  } else if (foundationValues.size > 0 || foundationTypes.size > 0) {
    const names = [
      ...[...foundationValues].sort(),
      ...[...foundationTypes].sort().map((name) => `type ${name}`),
    ]
    lines.push(`import { ${names.join(', ')} } from '@polymorph/vue'`)
  }
  if (shell.presence) {
    const presences = Object.values(shell.presence)
    const names = [
      ...(presences.some((presence) => presence.key !== undefined) ? ['useKeyedPresence'] : []),
      ...(presences.some((presence) => presence.key === undefined) ? ['usePresence'] : []),
    ]
    lines.push(`import { ${names.join(', ')} } from '@polymorph/vue/motion'`)
  }
  const classNames = templateClassNames(template)
  // A part shares its member's recipe and imports it only when it draws with it
  // (Table's `Body` is a bare `<tbody>`), because an unused import fails the build.
  const drawsWithRecipe =
    [...classNames].some((name) => !name.includes('.')) ||
    scriptNames.has('styles') ||
    templateNames.has('styles')
  if (shell.recipe !== null && drawsWithRecipe) {
    const specifier = /^[@.]/.test(shell.recipe)
      ? shell.recipe
      : `@polymorph/recipes/${shell.recipe}.module.css`
    lines.push(`import styles from '${specifier}'`)
  }
  for (const [binding, recipe] of Object.entries(shell.recipes ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    // A part shares its member's recipes and imports the ones it uses.
    if (![...classNames].some((name) => name.startsWith(`${binding}.`))) continue
    lines.push(`import ${binding} from '@polymorph/recipes/${recipe}.module.css'`)
  }
  // A shared type comes from its owner's component, in the line that imports
  // the component when the member composes it too.
  const componentLines = [...composedImports.lines]
  for (const [from, names] of sharedTypes) {
    const location = context.locations.get(from)
    if (location === undefined) throw new Error(`shells: ${from} declares types and has no file`)
    const file = relativeFile(shell.dir, location.dir, `${from}.vue`)
    const at = componentLines.indexOf(`import ${from} from '${file}'`)
    // `import type`, so a type alone never imports the component at run time.
    if (at === -1) componentLines.push(`import type { ${names.join(', ')} } from '${file}'`)
    else
      componentLines[at] =
        `import ${from}, { ${names.map((name) => `type ${name}`).join(', ')} } from '${file}'`
  }
  lines.push(...componentLines)

  /* types ------------------------------------------------------------------ */
  for (const [name, definition] of Object.entries(shell.types ?? {})) {
    // A generic type writes its parameters first: `<Row> { cell?: (row: Row) => … }`.
    const [, typed = '', body = definition] = /^\s*(<[^>]*>)?\s*([\s\S]*)$/.exec(definition) ?? []
    lines.push('')
    lines.push(
      body.trim().startsWith('{')
        ? `export interface ${name}${typed} ${body.trim()}`
        : `export type ${name}${typed} = ${body.trim()}`,
    )
  }
  const own = parameters.length === 0 ? '' : `<${parameters.join(', ')}>`
  lines.push('')
  lines.push(`export interface ${shell.member}Props${own} {`)
  const writeDoc = (doc: string | undefined) => {
    if (!doc) return
    lines.push('  /**')
    for (const line of wrapDoc(doc, 92)) lines.push(`   * ${line}`.trimEnd())
    lines.push('   */')
  }
  for (const prop of face.props) {
    writeDoc(prop.doc)
    // Declared camelCase, as Vue normalizes a prop's name: a caller writes `aria-label`.
    lines.push(`  ${camel(prop.name)}${prop.optional ? '?' : ''}: ${prop.type}`)
  }
  // A node prop a value of this type carries: a VNode, which the component
  // itself takes as a slot.
  for (const name of shell.carries ?? []) {
    const entry = face.slots.find((candidate) => candidate.name === name)
    if (entry === undefined || entry.scope !== null) {
      throw new Error(`shells: ${shell.member} carries "${name}", which is not a node prop`)
    }
    writeDoc(component.props.find((prop) => prop.name === entry.prop)?.doc)
    lines.push(`  ${key(name)}?: VNode`)
  }
  lines.push('}')

  /* setup ------------------------------------------------------------------ */
  lines.push('')
  const options = [`name: '${shell.member}'`, 'inheritAttrs: false']
  for (const [name, expr] of Object.entries(shell.statics ?? {}))
    options.push(`${name}: ${scriptExpr(expr)}`)
  lines.push(`defineOptions({ ${options.join(', ')} })`)
  lines.push('')

  const defaults: string[] = []
  for (const prop of face.props) {
    const declaredDefault = shell.defaults?.[camel(prop.name)] ?? shell.defaults?.[prop.name]
    if (declaredDefault !== undefined) defaults.push(`${camel(prop.name)}: ${declaredDefault}`)
    else if (prop.boolean && prop.optional) defaults.push(`${camel(prop.name)}: undefined`)
  }
  for (const name of Object.keys(shell.defaults ?? {})) {
    if (!face.props.some((prop) => camel(prop.name) === name || prop.name === name)) {
      throw new Error(`shells: ${shell.member} sets a default for "${name}", which is not a prop`)
    }
  }
  const declaredProps =
    (shell.carries ?? []).length === 0
      ? `${shell.member}Props${own}`
      : `Omit<${shell.member}Props${own}, ${(shell.carries ?? []).map((name) => `'${name}'`).join(' | ')}>`
  const propsCall =
    defaults.length > 0
      ? `withDefaults(defineProps<${declaredProps}>(), { ${defaults.join(', ')} })`
      : `defineProps<${declaredProps}>()`
  lines.push(usesProps ? `const props = ${propsCall}` : propsCall)

  if (face.events.length > 0) {
    const entries = face.events.map(
      (event) =>
        `${key(event.name)}: [${event.parameters.map((parameter) => `${parameter.name}: ${parameter.type}`).join(', ')}]`,
    )
    const call = `defineEmits<{ ${entries.join('; ')} }>()`
    lines.push(usesEmit ? `const emit = ${call}` : call)
  } else if (usesEmit) {
    throw new Error(`shells: ${shell.member} emits, and its props declare no event`)
  }

  if (face.slots.length > 0) {
    const entries = face.slots.map(
      (entry) =>
        `${key(entry.name)}${entry.optional ? '?' : ''}: (props: ${entry.scope ?? 'Record<string, never>'}) => unknown`,
    )
    const call = `defineSlots<{ ${entries.join('; ')} }>()`
    // The script reads slots through an object that follows which slots are filled, because
    // Vue's slots are not reactive and a computed value would keep what it read first.
    if (usesSlotsInScript) {
      lines.push(`const callerSlots = ${call}`)
      lines.push('const slots = useTrackedSlots(callerSlots)')
    } else lines.push(call)
  }

  if (usesUid) lines.push('const uid = useId()')
  if (scriptNames.has('listening') || templateNames.has('listening')) {
    lines.push('const listening = useListening()')
  }
  if (readsOwner) {
    // What the member provides; a part outside its member reads nothing.
    lines.push(`const owner = inject<Record<string, any>>('polymorph:${owner}', {})`)
  }
  if (readsLent) {
    // The identity a composing member lends; none outside one.
    lines.push(`const lent = inject<string | undefined>('${IDENTITY_KEY}', undefined)`)
  }
  if (shell.lends) lines.push(`provide('${IDENTITY_KEY}', '${gallerySlug(shell.member)}')`)
  if (readsLender) {
    // The holder of the member that lends this one its identity, kept from the members this one
    // renders; none outside one.
    lines.push(`const lender = inject<${BORROWED_TYPE} | undefined>('${BORROWED_KEY}', undefined)`)
    lines.push(`provide('${BORROWED_KEY}', undefined)`)
  }
  if (handsBack) {
    // The holder the member this one lends its identity to writes its element into.
    lines.push(`const borrowed: ${BORROWED_TYPE} = {}`)
    lines.push(`provide('${BORROWED_KEY}', borrowed)`)
  }
  if (readsInvoke) {
    lines.push(
      "// Calls the caller's handlers for an event and returns what they return, which `emit` drops.",
    )
    lines.push('const instance = getCurrentInstance()')
    lines.push(
      "const invoke = (event: string, ...args: unknown[]): unknown => { const bound: unknown = instance?.vnode.props?.[`on${event.charAt(0).toUpperCase()}${event.slice(1)}`]; const results = (Array.isArray(bound) ? bound : [bound]).flatMap((handler: unknown) => (typeof handler === 'function' ? [handler(...args)] : [])); return results.length > 1 ? Promise.all(results) : results[0] }",
    )
  }
  if (readsSlotText) {
    lines.push(
      "// The text the caller put in a slot: its text nodes, in order, without the elements'.",
    )
    lines.push(
      "const slotText = (slot: ((...args: never[]) => unknown) | undefined): string => { const read = (nodes: unknown): string => typeof nodes === 'string' ? nodes : Array.isArray(nodes) ? nodes.map(read).join('') : isVNode(nodes) && nodes.type === TextVNode ? read(nodes.children) : ''; return read(slot?.()) }",
    )
  }
  for (const [name, expr] of Object.entries(shell.state ?? {})) {
    lines.push(`const ${name} = ref(${scriptExpr(expr)})`)
  }
  for (const name of [...templateRefs].sort()) {
    lines.push(
      `const ${name} = useTemplateRef<HTMLElement${listRefs.has(name) ? '[]' : ''}>('${name}')`,
    )
  }
  for (const [name, query] of Object.entries(shell.media ?? {})) {
    lines.push(`const ${name} = useMediaQuery('${query}')`)
  }
  if (shell.mode) lines.push(`const ${shell.mode} = useMode()`)
  for (const [name, prop] of Object.entries(shell.controlRefs ?? {})) {
    lines.push(`const [${name}, ${attachName(name)}] = useControlRef(() => props.${camel(prop)})`)
  }

  // A derived value the machine reads is declared before it; one that reads
  // the machine, after. Declaration order is evaluation order in setup.
  const late = new Set<string>()
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    const names = freeNames(expr)
    if (names.has('api') || names.has('service') || [...names].some((other) => late.has(other)))
      late.add(name)
  }
  const derivedLine = (name: string, expr: Expr) =>
    `const ${name} = computed(() => (${scriptExpr(expr)}))`
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (!late.has(name)) lines.push(derivedLine(name, expr))
  }

  if (shell.machine) {
    const context = [
      'id: uid',
      // The document's direction: a machine given none writes `dir="ltr"` on the member's root.
      'dir: documentDirection.value',
      ...Object.entries(shell.machine.context).map(
        ([name, expr]) => `${key(name)}: ${scriptExpr(expr)}`,
      ),
      // A block body, so the callback's type never depends on what it reads: a
      // callback may read `service`, whose own type is being inferred here.
      ...Object.entries(shell.machine.events ?? {}).map(([name, event]) => {
        const body =
          'emit' in event
            ? `emit('${event.emit}', ${scriptExpr(event.payload)})`
            : scriptExpr(event.run)
        return `${name}: (details) => { ${body} }`
      }),
    ]
    lines.push('const documentDirection = useDirection()')
    lines.push(
      `const service = useMachine(zag.machine, computed(() => ({ ${context.join(', ')} })))`,
    )
    lines.push('const api = computed(() => zag.connect(service, normalizeProps))')
  }
  for (const [name, expr] of Object.entries(shell.derived ?? {})) {
    if (late.has(name)) lines.push(derivedLine(name, expr))
  }
  for (const [name, list] of Object.entries(shell.listPresence ?? {})) {
    lines.push(...listPresenceLines(name, scriptExpr(list.of), scriptExpr(list.key)))
  }
  for (const [name, departure] of Object.entries(shell.departures ?? {})) {
    lines.push(`const ${name} = useDeparture(${departure.ref}, '${departure.binding}')`)
  }
  for (const [name, presence] of Object.entries(shell.presence ?? {})) {
    if (presence.key !== undefined) {
      if (presence.binding !== undefined || !listRefs.has(presence.ref)) {
        throw new Error(
          `shells: ${shell.member}'s keyed presence "${name}" needs a ref inside a loop and no binding`,
        )
      }
      lines.push(
        `const ${name} = useKeyedPresence(() => ${scriptExpr(presence.open)}, ${presence.ref}, (element) => ${scriptExpr(presence.key)})`,
      )
      continue
    }
    const binding =
      presence.binding === undefined
        ? 'undefined'
        : typeof presence.binding === 'string'
          ? `'${presence.binding}'`
          : `() => ${scriptExpr(presence.binding.expr)}`
    const entries = presenceEntries(presence, scriptExpr, true)
    const options = entries.length === 0 ? '' : `, { ${entries.join(', ')} }`
    const rest = presence.binding === undefined && options === '' ? '' : `, ${binding}${options}`
    lines.push(
      `const ${name} = usePresence(() => ${scriptExpr(presence.open)}, ${presence.ref}${rest})`,
    )
  }
  if (shell.provide) {
    const getters = Object.entries(shell.provide).map(
      ([name, expr]) => `get ${name}() { return ${scriptExpr(expr)} }`,
    )
    lines.push(`provide('polymorph:${shell.member}', { ${getters.join(', ')} })`)
  }
  for (const [at, effect] of (shell.effects ?? []).entries()) {
    const name = `effect${at + 1}`
    lines.push(...effectLines(effect, at + 1, scriptExpr))
    if (effect.mount !== false) lines.push(`onMounted(${name})`)
    if (effect.watch !== undefined) {
      lines.push(`watch(() => ${scriptExpr(effect.watch)}, ${name}, { flush: 'post' })`)
    }
    if (holds(effect)) lines.push(`onBeforeUnmount(() => release${at + 1}?.())`)
  }
  lines.push('</script>')
  lines.push('')
  lines.push('<template>')
  const out: Rendered = { lines: [] }
  renderNodes(template, 1, out)
  // A member that draws nothing (Toast, which only raises a toast) still writes one node. A
  // browser's render of an empty template is a comment, and a server's is no markup at all, so
  // hydrating the server's markup would find the comment missing. A branch that never renders
  // is a comment in both.
  lines.push(...(out.lines.length > 0 ? out.lines : ['  <template v-if="false" />']))
  lines.push('</template>')
  lines.push('')
  return lines.join('\n')
}

/**
 * One effect, as a function the member calls on mount and on a watched change.
 * An effect that observes makes its observers, runs, and keeps a release that
 * disconnects them; one that waits sets a timer and keeps a release that
 * clears it; one that listens adds a document listener and keeps a release
 * that removes it; and one with `release` runs and keeps its release, which
 * reads what `run` returned. Each release runs before the effect runs again.
 */
function effectLines(effect: Effect, at: number, scriptExpr: (expr: Expr) => string): string[] {
  const run = scriptExpr(effect.run)
  if (!holds(effect)) return [`const effect${at} = () => {`, `  ${run}`, '}']
  const lines = [`let release${at}: (() => void) | undefined`, `const effect${at} = () => {`]
  lines.push(`  release${at}?.()`)
  if (effect.listen !== undefined) {
    // The listener runs the effect with the event as `$event`, which a script may name.
    const event = `'${effect.listen}'`
    lines.push(`  const listener = ($event: DocumentEventMap[${event}]) => { ${run} }`)
    lines.push(`  document.addEventListener(${event}, listener)`)
    lines.push(`  release${at} = () => document.removeEventListener(${event}, listener)`)
    lines.push('}')
    return lines
  }
  if (effect.release !== undefined) {
    // What `run` returned, which the release reads as `ran`.
    lines.push(freeNames(effect.release).has('ran') ? `  const ran = ${run}` : `  ${run}`)
    lines.push(`  release${at} = () => { ${scriptExpr(effect.release)} }`)
    lines.push('}')
    return lines
  }
  if (effect.delay !== undefined) {
    lines.push(`  const timer = setTimeout(() => { ${run} }, ${scriptExpr(effect.delay)})`)
    lines.push(`  release${at} = () => clearTimeout(timer)`)
    lines.push('}')
    return lines
  }
  lines.push(`  const run = () => { ${run} }`)
  const releases: string[] = []
  if (effect.resize !== undefined) {
    lines.push(
      "  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(run)",
    )
    lines.push(
      `  for (const element of [${effect.resize.map(scriptExpr).join(', ')}]) if (element) resize?.observe(element)`,
    )
    releases.push('resize?.disconnect()')
  }
  if (effect.mutation !== undefined) {
    lines.push(
      "  const mutation = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(run)",
    )
    lines.push(
      `  for (const element of [${effect.mutation.map(scriptExpr).join(', ')}]) if (element) mutation?.observe(element, { childList: true, characterData: true, subtree: true${effect.attributes === undefined ? '' : `, attributeFilter: [${effect.attributes.map((name) => `'${name}'`).join(', ')}]`} })`,
    )
    releases.push('mutation?.disconnect()')
  }
  lines.push(`  release${at} = () => { ${releases.join('; ')} }`)
  lines.push('  run()')
  lines.push('}')
  return lines
}

/**
 * A list presence: the items of `of`, and each item removed from it, kept at
 * the position it held until its `done` runs. A removal is read synchronously,
 * in the same update that removes the item, so the leaving item's element is
 * never unmounted and mounted again.
 */
function listPresenceLines(name: string, of: string, keyOf: string): string[] {
  return [
    `const ${name}Of = () => ${of}`,
    `const ${name}Key = ${keyOf}`,
    `const ${name}Leaving = shallowRef<{ key: string; item: ReturnType<typeof ${name}Of>[number]; at: number }[]>([])`,
    `watch(${name}Of, (now, before) => { const kept = new Set(now.map(${name}Key)); const leaving = ${name}Leaving.value.filter((entry) => !kept.has(entry.key)); before.forEach((item, at) => { const key = ${name}Key(item); if (!kept.has(key) && !leaving.some((entry) => entry.key === key)) leaving.push({ key, item, at }) }); ${name}Leaving.value = leaving }, { flush: 'sync' })`,
    `const ${name} = computed(() => { const entries = ${name}Of().map((item) => ({ item, key: ${name}Key(item), open: true, done: () => {} })); for (const entry of [...${name}Leaving.value].sort((a, b) => a.at - b.at)) entries.splice(Math.min(entry.at, entries.length), 0, { item: entry.item, key: entry.key, open: false, done: () => { ${name}Leaving.value = ${name}Leaving.value.filter((other) => other.key !== entry.key) } }); return entries })`,
  ]
}

/* -------------------------------------------------------------------------- */
/* The states fixture                                                         */
/* -------------------------------------------------------------------------- */

/** What a fixture's code reads, collected as it is written, for its imports. */
interface FixtureNeeds {
  /** The members it renders. */
  members: Set<string>
  /** The recipe bindings an element's class reads: `styles`, or one of the member's `recipes`. */
  recipes: Set<string>
  /** Whether a value reads the member's machine module, `zag`. */
  zag: boolean
  /** The foundation's values a value names (`FIXTURE_VALUES`), which the fixture imports. */
  foundation: Set<string>
}

function literal(value: FixtureValue, needs: FixtureNeeds): string {
  if (branded(value, 'js')) {
    const source = (value as { js: string }).js
    if (/(^|[^.\w$])zag\./.test(source)) needs.zag = true
    for (const name of fixtureValues(source)) needs.foundation.add(name)
    return source
  }
  if (branded(value, 'node')) return childCode((value as { node: FixtureChild }).node, needs)
  if (branded(value, 'renders', RENDERS_KEYS)) {
    const { params, renders, when } = value as FixtureRenders
    const children = renderedChildren(renders).map((child) => childCode(child, needs))
    const drawn = children.length === 1 ? children[0] : `[${children.join(', ')}]`
    return `(${params.join(', ')}) => ${when === undefined ? drawn : `(${when}) ? ${drawn} : undefined`}`
  }
  if (branded(value, 'held')) return `held.${(value as { held: string }).held}`
  if (branded(value, 'hold', ['to'])) {
    const { hold, to } = value as { hold: string; to?: FixtureValue }
    return 'to' in value
      ? `() => { held.${hold} = ${literal(to, needs)} }`
      : `(value: typeof held.${hold}) => { held.${hold} = value }`
  }
  if (Array.isArray(value)) return `[${value.map((entry) => literal(entry, needs)).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    return `{ ${Object.entries(value as Record<string, FixtureValue>)
      .map(([name, entry]) => `${key(name)}: ${literal(entry, needs)}`)
      .join(', ')} }`
  }
  // A line break in a fixture's text is content (StreamingText keeps whitespace), escaped.
  return typeof value === 'string'
    ? `'${value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')}'`
    : JSON.stringify(value)
}

function propsLiteral(
  props: Readonly<Record<string, FixtureValue>> | undefined,
  overrides: boolean,
  needs: FixtureNeeds,
): string {
  const entries = Object.entries(props ?? {}).map(
    ([name, value]) => `${key(name)}: ${literal(value, needs)}`,
  )
  if (overrides) entries.push('...overrides')
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
}

function childCode(child: FixtureChild, needs: FixtureNeeds): string {
  if (typeof child === 'string') return literal(child, needs)
  if ('js' in child) return literal(child, needs)
  if ('member' in child) {
    needs.members.add(child.member)
    return vnode(child.member, child.props, child.slots, false, needs)
  }
  return elementCode(
    child,
    (child.children ?? []).map((entry) => childCode(entry, needs)),
    needs,
  )
}

/** A fixture element: its recipe classes and attributes, and the code of its children. */
function elementCode(
  element: { element: string; attrs?: Readonly<Record<string, string>>; class?: readonly string[] },
  children: readonly string[],
  needs: FixtureNeeds,
): string {
  const attrs = Object.entries(element.attrs ?? {}).map(
    ([name, value]) => `${key(name)}: ${literal(value, needs)}`,
  )
  if (element.class !== undefined && element.class.length > 0) {
    const references = element.class.map((name) => {
      needs.recipes.add(name.includes('.') ? (name.split('.')[0] as string) : 'styles')
      return classReference(name)
    })
    attrs.unshift(
      `class: ${references.length === 1 ? references[0] : `[${references.join(', ')}]`}`,
    )
  }
  return `h('${element.element}', ${attrs.length === 0 ? '{}' : `{ ${attrs.join(', ')} }`}${children.length > 0 ? `, [${children.join(', ')}]` : ''})`
}

/**
 * A member's slots in a fixture: its node props, and its render props. A render
 * prop is a scoped slot in Vue (`vueBinding`), so a function the fixture passes
 * for one (`renders`, DataTable's `rowDetail`) is written here with its
 * parameters, under the slot's name, and not among the props.
 */
function slotsCode(
  slots: Readonly<Record<string, readonly FixtureChild[]>> | undefined,
  scoped: readonly (readonly [string, FixtureValue])[],
  needs: FixtureNeeds,
): string | null {
  const entries = [
    ...Object.entries(slots ?? {}).map(
      ([name, children]) =>
        `${key(name)}: () => [${children.map((child) => childCode(child, needs)).join(', ')}]`,
    ),
    ...scoped.map(([name, value]) => {
      const { params, renders, when } = value as FixtureRenders
      const children = `[${renderedChildren(renders)
        .map((child) => childCode(child, needs))
        .join(', ')}]`
      return `${key(name)}: (${params.join(', ')}) => ${when === undefined ? children : `(${when}) ? ${children} : []`}`
    }),
  ]
  return entries.length === 0 ? null : `{ ${entries.join(', ')} }`
}

/**
 * `renderProps` is the member's render props, each with its scoped slot's
 * name. A function the fixture passes under one of them goes to the slots.
 */
function vnode(
  name: string,
  props: Readonly<Record<string, FixtureValue>> | undefined,
  slots: Readonly<Record<string, readonly FixtureChild[]>> | undefined,
  overrides: boolean,
  needs: FixtureNeeds,
  renderProps: ReadonlyMap<string, string> = new Map(),
): string {
  const scopedSlot = ([prop, value]: readonly [string, FixtureValue]): boolean =>
    renderProps.has(prop) && branded(value, 'renders', RENDERS_KEYS)
  const given = Object.entries(props ?? {})
  const scoped = given
    .filter(scopedSlot)
    .map(([prop, value]) => [renderProps.get(prop) as string, value] as const)
  const values = Object.fromEntries(given.filter((entry) => !scopedSlot(entry)))
  const slotCode = slotsCode(slots, scoped, needs)
  return `h(${name}, ${propsLiteral(values, overrides, needs)}${slotCode ? `, ${slotCode}` : ''})`
}

/**
 * An entry that holds state, puts content before its member, types into a
 * field or presses a control is a component of its own, as the application
 * component around the member would be: it holds the values in `held`, types
 * once the field is in the document, as a reader would, with the field's
 * `input` event, and presses once the control is in the document.
 */
function statefulEntry(entry: StateEntry, rendered: string[], needs: FixtureNeeds): string {
  const setup: string[] = []
  if (entry.holds !== undefined) {
    setup.push(`const held = reactive(${literal(entry.holds, needs)})`)
  }
  if (entry.types !== undefined) {
    const into = literal(entry.types.into, needs)
    const typed = literal(entry.types.text, needs)
    setup.push(
      `let frame = 0; let frames = 0; const type = () => { const field = document.querySelector<HTMLInputElement>(${into}); if (field === null) { if (++frames < ${TYPING_FRAMES}) frame = requestAnimationFrame(type); return } field.value = ${typed}; field.dispatchEvent(new Event('input', { bubbles: true })) }; onMounted(() => { frame = requestAnimationFrame(type) }); onBeforeUnmount(() => cancelAnimationFrame(frame))`,
    )
  }
  if (entry.presses !== undefined) {
    setup.push(pressStatements(literal(entry.presses, needs), 'onMounted', 'onBeforeUnmount'))
  }
  if (entry.selects !== undefined) {
    setup.push(
      selectStatements(
        literal(entry.selects.in, needs),
        literal(entry.selects.text, needs),
        'onMounted',
        'onBeforeUnmount',
      ),
    )
  }
  return `h({ setup() { ${setup.join('; ')}${setup.length > 0 ? '; ' : ''}return () => [${rendered.join(', ')}] } })`
}

function entryCode(
  shell: MemberShell,
  entry: StateEntry,
  needs: FixtureNeeds,
  renderProps: ReadonlyMap<string, string>,
): string {
  let body: string
  const named = entrySubject(shell, entry)
  needs.members.add(named)
  // `h()` cannot infer a generic member's parameters, so the fixture passes its own.
  const subject =
    named === shell.member && shell.fixtureGeneric !== undefined
      ? `${named}<${shell.fixtureGeneric}>`
      : named
  // The member's render props are its own: a part the entry renders in its place has none here.
  const own = named === shell.member ? renderProps : new Map<string, string>()
  const stateful =
    entry.holds !== undefined ||
    entry.before !== undefined ||
    entry.types !== undefined ||
    entry.presses !== undefined ||
    entry.selects !== undefined
  // What comes before the member, then the member's instances, then what comes after.
  const before = (entry.before ?? []).map((child) => childCode(child, needs))
  if (entry.many !== undefined) {
    const instances = entry.many.each.map((instance: FixtureInstance, at) =>
      vnode(subject, instance.props, instance.slots, at === 0, needs, own),
    )
    const also = (entry.many.also ?? []).map((child) => childCode(child, needs))
    const content = [...before, ...instances, ...also]
    const within = entry.many.within
    if ('element' in within) {
      // An element takes its children as an array, where a member takes a default slot.
      body = elementCode(within, content, needs)
    } else {
      needs.members.add(within.member)
      body = `h(${within.member}, ${propsLiteral(within.props, false, needs)}, { default: () => [${content.join(', ')}] })`
    }
    // An entry that holds state lays its launchers out in the same layout member.
    if (stateful) body = statefulEntry(entry, [body], needs)
  } else if (stateful) {
    body = statefulEntry(
      entry,
      [...before, vnode(subject, entry.props, entry.slots, true, needs, own)],
      needs,
    )
  } else {
    body = vnode(subject, entry.props, entry.slots, true, needs, own)
  }
  if (!stateful && body.includes('held.')) {
    throw new Error(`shells: ${shell.member}'s "${entry.name}" reads a held value it does not hold`)
  }
  // An entry whose member sits inside other content takes no overrides.
  const parameter = body.includes('...overrides') ? '(overrides = {})' : '()'
  const fields = [`name: ${literal(entry.name, needs)}`, `render: ${parameter} => ${body}`]
  if (entry.expect) {
    fields.push(
      `expect: { ${Object.entries(entry.expect)
        .map(([name, value]) => `${key(name)}: ${value === null ? 'null' : literal(value, needs)}`)
        .join(', ')} }`,
    )
  }
  if (entry.rendersNothing) fields.push('rendersNothing: true')
  return `{ ${fields.join(', ')} }`
}

export function renderVueStates(
  shell: MemberShell,
  component: RegistryMemberLike,
  context: VueContext,
): string {
  const needs: FixtureNeeds = {
    members: new Set([shell.member]),
    recipes: new Set(),
    zag: false,
    foundation: new Set(),
  }
  // The member's render props, by prop name, with the scoped slot each one is in Vue.
  const renderProps = new Map<string, string>()
  for (const prop of component.props) {
    const binding = vueBinding(prop)
    if (binding.kind === 'scoped-slot') renderProps.set(prop.name, binding.name)
  }
  const entries = [...gridEntries(shell, component), ...shell.states].map((entry) =>
    entryCode(shell, entry, needs, renderProps),
  )
  const types = shell.states.some(
    (entry) =>
      entry.types !== undefined || entry.presses !== undefined || entry.selects !== undefined,
  )
  const holding = shell.states.some((entry) => entry.holds !== undefined)
  const vue = [
    'h',
    ...(types ? ['onBeforeUnmount', 'onMounted'] : []),
    ...(holding ? ['reactive'] : []),
  ].sort()
  const lines = [
    '/**',
    ` * ${shell.member}'s states fixture, with the React fixture's entry names, so a`,
    " * contract's `when <state>` names the same entry in both shells.",
    ' *',
    ` * Generated by \`pnpm shells\` from \`${context.source}\`. Never edit it by hand.`,
    ' */',
    `import { ${vue.join(', ')} } from 'vue'`,
    '',
    "import type { ComponentStates } from '@polymorph/vue'",
    '',
  ]
  if (needs.zag) {
    if (shell.machine === undefined) {
      throw new Error(`shells: ${shell.member}'s fixture reads \`zag\`, and it binds no machine`)
    }
    lines.splice(1 + lines.indexOf(''), 0, `import * as zag from '@zag-js/${shell.machine.of}'`, '')
  }
  const imports = memberImports(needs.members, shell.fixtureDir ?? shell.dir, 'vocabulary', context)
  // The members the foundation ships, and the values a fixture's JavaScript names (`toast`, `Time`).
  const foundation = [...imports.foundation, ...[...needs.foundation].sort()]
  if (foundation.length > 0) {
    lines.splice(
      lines.indexOf("import type { ComponentStates } from '@polymorph/vue'"),
      1,
      `import { ${foundation.join(', ')}, type ComponentStates } from '@polymorph/vue'`,
    )
  }
  lines.push(...imports.lines)
  for (const binding of [...needs.recipes].sort()) {
    const recipe = binding === 'styles' ? shell.recipe : shell.recipes?.[binding]
    if (recipe === undefined || recipe === null) {
      throw new Error(
        `shells: ${shell.member}'s fixture names the recipe "${binding}", which it has not`,
      )
    }
    lines.push(`import ${binding} from '@polymorph/recipes/${recipe}.module.css'`)
  }
  lines.push('')
  // The types the fixture's values name (DataTable's rows), declared once for every entry.
  for (const [name, type] of Object.entries(shell.fixtureTypes ?? {})) {
    lines.push(`type ${name} = ${type}`, '')
  }
  lines.push('export const states: ComponentStates = {')
  lines.push(`  component: '${shell.member}',`)
  lines.push(`  entries: [${entries.join(', ')}],`)
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/* -------------------------------------------------------------------------- */
/* The index                                                                  */
/* -------------------------------------------------------------------------- */

export function renderVueIndex(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * `@polymorph/vue-ui`, the closed vocabulary for Vue.',
    ' *',
    ' * Every member is a single-file component generated by `pnpm shells` from its',
    ' * framework-neutral description (`packages/shells/src/members/`), and takes the',
    " * React member's props, events and slots by the mapping in `docs/frameworks.md`.",
    ' * The base layer is imported for its side effect, as the React vocabulary does.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    '',
    "import '@polymorph/recipes/base.css'",
    '',
    "export { gallerySlug, lawfulCells } from '@polymorph/vue'",
    `export type { ${['ComponentStates', 'StateEntry', ...foundationTypeExports('vue')].join(', ')} } from '@polymorph/vue'`,
    '',
  ]
  for (const shell of [...shells].sort((a, b) => a.member.localeCompare(b.member))) {
    const types = [`${shell.member}Props`, ...Object.keys(shell.types ?? {})].sort()
    if ((shell.home ?? 'vocabulary') === 'foundation') {
      lines.push(`export { ${shell.member} } from '@polymorph/vue'`)
      lines.push(`export type { ${types.join(', ')} } from '@polymorph/vue'`)
      continue
    }
    const file = `./${shell.dir}/${shell.member}.vue`
    const parts = (shell.parts ?? []).filter((part) => part.public)
    if (parts.length === 0) {
      lines.push(`export { default as ${shell.member} } from '${file}'`)
    } else {
      // A compound part is a property of its member: `<Tabs.Content>`.
      lines.push(`import ${shell.member}Root from '${file}'`)
      for (const part of parts) {
        lines.push(
          `import ${shell.member}${part.name} from './${shell.dir}/${shell.member}${part.name}.vue'`,
        )
      }
      // Pure, so an application that never uses the member drops it and its parts.
      lines.push(
        `export const ${shell.member} = /* @__PURE__ */ Object.assign(${shell.member}Root, { ${parts
          .map((part) => `${part.name}: ${shell.member}${part.name}`)
          .join(', ')} })`,
      )
      for (const part of parts) {
        lines.push(
          `export type { ${shell.member}${part.name}Props } from './${shell.dir}/${shell.member}${part.name}.vue'`,
        )
      }
    }
    lines.push(`export type { ${types.join(', ')} } from '${file}'`)
  }
  lines.push('')
  return lines.join('\n')
}

/** The galleries: every described member's states fixture, in the order of the descriptions. */
export function renderVueGalleries(shells: readonly MemberShell[]): string {
  const lines = [
    '/**',
    ' * Every states fixture in the Vue vocabulary, for the laws. A separate module from',
    ' * the index, so an application never bundles the fixtures.',
    ' *',
    ' * Generated by `pnpm shells`. Never edit it by hand.',
    ' */',
    "import type { ComponentStates } from '@polymorph/vue'",
    '',
  ]
  const names = shells.map((shell) => ({
    shell,
    binding: `${shell.member.charAt(0).toLowerCase()}${shell.member.slice(1)}States`,
  }))
  for (const { shell, binding } of names) {
    lines.push(
      `import { states as ${binding} } from './${shell.fixtureDir ?? shell.dir}/${fixtureName(shell)}.states'`,
    )
  }
  lines.push('')
  lines.push(
    `export const GALLERIES: readonly ComponentStates[] = [${names.map(({ binding }) => binding).join(', ')}]`,
  )
  lines.push('')
  return lines.join('\n')
}
