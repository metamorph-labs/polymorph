import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'

import { readAgent, type AgentContract } from './agent'
import { memberSource, openUiProgram, specFor } from './vocabulary'

/**
 * The agent half of the spec-staleness law: the states and actions a spec's
 * agent fence declares are the ones the code registers with the agent
 * runtime, in both directions, for the React member and for its description.
 *
 * The fence is the only thing that grants an agent access, and the runtime
 * reads the allowed set from the registered handle. So a handle that
 * registers a state or an action the spec does not declare widens access past
 * the spec, and one that leaves a declared one out narrows it below what the
 * conformance law runs. Either fails here:
 *
 *  - a state or an action the spec declares that the code does not register,
 *    or the reverse;
 *  - a state the spec marks `secret` that the code's `secret` list leaves out,
 *    or the reverse;
 *  - a spec with `destructive when` whose code gives no `destructive`, or the
 *    reverse;
 *  - a spec with `withholds contents` whose code gives no `withholds`, or the
 *    reverse;
 *  - an action whose `among` in the fence differs from the `among` its code
 *    gives, or that one of them gives and the other does not;
 *  - a member that registers with no fence, and one that has a fence and
 *    registers nothing.
 *
 * The code is read in two shapes, each with the TypeScript AST:
 *
 *  - React, in `packages/react-ui/src`: a call
 *    `useAgentMember({ member: 'Checkbox', element, state: () => ({ checked, … }), actions: { check, … }, secret: ['…'], destructive })`,
 *    where an action with an argument is `{ argument, among?, run }`.
 *    `state` is a function that returns an object literal, as an arrow
 *    (`() => ({ … })`) or with a block and one `return`.
 *  - A description, in `packages/shells/src/members`: an `agent` property of
 *    the `describeMember({ … })` object,
 *    `agent: { on: 'box', state: { checked: '…' }, actions: { check: '…' }, secret: ['…'], destructive: '…' }`,
 *    from which `pnpm shells` writes every other web framework's registration.
 *
 * Every property may also name a `const` in scope that holds the literal. A
 * handle the reader cannot read (a spread, a computed key, a handle passed as
 * a variable it cannot follow) is a finding, not a skip, so the law never
 * passes over a registration it did not compare.
 *
 * The prop half of the law is `packages/rules/src/spec-api.ts`. This half
 * lives beside the registry because it reads the fence with the registry's
 * grammar (`agent.ts`), and `@polymorph/rules`, which the registry depends on
 * and other repositories install, cannot depend on the registry.
 */

/** The code a handle is registered in: a React member, or a description. */
export type AgentCodeShape = 'react' | 'description'

/** One handle, as the code registers it. */
export interface AgentRegistration {
  member: string
  shape: AgentCodeShape
  /** Repo-relative. */
  file: string
  /** The line of the `useAgentMember` call, or of the `agent` property. */
  line: number
  states: string[]
  actions: string[]
  /** The `among` each action gives, by the action's name; an action that gives none is absent. */
  among: Record<string, string>
  secret: string[]
  destructive: boolean
  /** Whether the handle gives `withholds`. */
  withholds: boolean
}

/** A registration the reader could not read, and why. */
export interface AgentCodeFault {
  /** The member it names, when the reader got that far. */
  member: string | null
  shape: AgentCodeShape
  file: string
  line: number
  message: string
}

/** What one file registers. */
export interface AgentCodeReading {
  registrations: AgentRegistration[]
  faults: AgentCodeFault[]
  /** The members a description file describes, with or without an `agent` block. */
  described: string[]
}

/** What a spec's fence declares, in the terms the code registers. */
export interface AgentDeclaration {
  member: string
  /** Repo-relative. */
  spec: string
  states: string[]
  actions: string[]
  /** The state each action chooses among (`among <state>`), by the action's name. */
  among: Record<string, string>
  secret: string[]
  /** Whether the fence has a `destructive when` statement. */
  destructive: boolean
  /** Whether the fence says `withholds contents`. */
  withholds: boolean
}

export type AgentFindingKind =
  | 'unregistered'
  | 'unspecified'
  | 'not-a-member'
  | 'unreadable'
  | 'state'
  | 'action'
  | 'secret'
  | 'destructive'
  | 'withholds'
  | 'among'

export interface AgentStalenessFinding {
  member: string
  shape: AgentCodeShape
  kind: AgentFindingKind
  /** `code-only`: registered and not declared. `spec-only`: declared and not registered. */
  direction?: 'code-only' | 'spec-only'
  /** The state or action the finding is about. */
  name?: string
  /** The member, the file and line, and what is missing, as one sentence. */
  message: string
}

/** A member as the law names its files. */
export interface AgentSubject {
  name: string
  spec: string | null
  /** The React member's file, which a missing registration is reported against. */
  source: string | null
  /** The description's file, or `null` for a member no other framework is generated for. */
  description: string | null
}

/* -------------------------------------------------------------------------- */
/* Reading the code                                                           */
/* -------------------------------------------------------------------------- */

/** A registration the reader cannot read. */
class Unreadable extends Error {}

function parse(file: string, text: string): ts.SourceFile {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
}

function lineOf(node: ts.Node): number {
  const source = node.getSourceFile()
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

/** The expression under any `as`, `satisfies`, `!` and parentheses. */
function unwrap(node: ts.Node | undefined): ts.Node | undefined {
  let current = node
  while (
    current !== undefined &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression
  }
  return current
}

/**
 * What the nearest declaration of `name` in scope from `from` gives it: a
 * variable's initializer, or a function declaration itself.
 */
function declared(name: string, from: ts.Node): ts.Node | undefined {
  for (let scope = from.parent as ts.Node | undefined; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope) && !ts.isModuleBlock(scope)) continue
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          return declaration.initializer
        }
      }
    }
  }
  return undefined
}

/** A node, with an identifier followed to what its declaration gives it. */
function valueOf(node: ts.Node | undefined, depth = 0): ts.Node | undefined {
  const current = unwrap(node)
  if (current !== undefined && ts.isIdentifier(current) && depth < 8) {
    return valueOf(declared(current.text, current), depth + 1)
  }
  return current
}

function keyOf(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text
  }
  return null
}

function propertyOf(
  object: ts.ObjectLiteralExpression,
  key: string,
): ts.ObjectLiteralElementLike | undefined {
  return object.properties.find(
    (element) => !ts.isSpreadAssignment(element) && keyOf(element.name) === key,
  )
}

/** What a property of an object literal holds: its value, a shorthand's local, or a method. */
function held(element: ts.ObjectLiteralElementLike): ts.Node | undefined {
  if (ts.isPropertyAssignment(element)) return valueOf(element.initializer)
  if (ts.isShorthandPropertyAssignment(element)) return valueOf(element.name)
  if (ts.isMethodDeclaration(element)) return element
  return undefined
}

/** The keys of an object literal. */
function keysOf(node: ts.Node | undefined, what: string): string[] {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) {
    throw new Unreadable(`${what} is not an object literal the law can read`)
  }
  return node.properties.map((element) => {
    if (ts.isSpreadAssignment(element)) {
      throw new Unreadable(`${what} spreads another object, so the law cannot read its names`)
    }
    const key = keyOf(element.name)
    if (key === null) {
      throw new Unreadable(`${what} has a computed key, so the law cannot read its names`)
    }
    return key
  })
}

/** The `return` statements of a body, without those of the functions nested in it. */
function returnsOf(body: ts.Block): ts.ReturnStatement[] {
  const found: ts.ReturnStatement[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) found.push(node)
    else if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)
  return found
}

/** The keys of the object literal a function returns: `() => ({ … })`, or one `return { … }`. */
function returnedKeysOf(node: ts.Node | undefined, what: string): string[] {
  if (
    node === undefined ||
    !(
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionDeclaration(node)
    ) ||
    node.body === undefined
  ) {
    throw new Unreadable(`${what} is not a function that returns an object literal`)
  }
  if (!ts.isBlock(node.body)) return keysOf(valueOf(node.body), what)
  const returns = returnsOf(node.body)
  const [only] = returns
  if (returns.length !== 1 || only === undefined) {
    throw new Unreadable(
      `${what} has ${returns.length === 0 ? 'no' : returns.length} \`return\` statements; ` +
        'the law reads a function with one, of an object literal',
    )
  }
  return keysOf(valueOf(only.expression), what)
}

/** A list of quoted names. */
function namesOf(node: ts.Node | undefined, what: string): string[] {
  if (node === undefined || !ts.isArrayLiteralExpression(node)) {
    throw new Unreadable(`${what} is not an array literal of quoted names`)
  }
  return node.elements.map((element) => {
    const item = unwrap(element)
    if (item && (ts.isStringLiteral(item) || ts.isNoSubstitutionTemplateLiteral(item))) {
      return item.text
    }
    throw new Unreadable(`${what} holds something other than a quoted name`)
  })
}

/** Every call of a function named `name`, bare (`useAgentMember(…)`) or on an object (`x.useAgentMember(…)`). */
function callsOf(source: ts.SourceFile, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression)
      if (
        callee !== undefined &&
        ((ts.isIdentifier(callee) && callee.text === name) ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === name))
      ) {
        found.push(node)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function objectArgument(call: ts.CallExpression, callee: string): ts.ObjectLiteralExpression {
  const object = valueOf(call.arguments[0])
  if (object === undefined || !ts.isObjectLiteralExpression(object)) {
    throw new Unreadable(`\`${callee}\` takes an object literal here, so the law can read it`)
  }
  return object
}

function memberOf(object: ts.ObjectLiteralExpression, callee: string): string {
  const element = propertyOf(object, 'member')
  const node = element === undefined ? undefined : held(element)
  if (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  ) {
    return node.text
  }
  throw new Unreadable(`\`${callee}\` names no member as a quoted string (\`member: 'Checkbox'\`)`)
}

/**
 * The `among` each action of an `actions` object literal gives: an action
 * written `{ argument, among: '<state>', run }`, by its name. An action that is
 * a function, a statement, or an object with no `among` gives none.
 */
function amongOf(node: ts.Node | undefined, what: string): Record<string, string> {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) return {}
  const out: Record<string, string> = {}
  for (const element of node.properties) {
    if (ts.isSpreadAssignment(element)) continue
    const name = keyOf(element.name)
    const action = held(element)
    if (name === null || action === undefined || !ts.isObjectLiteralExpression(action)) continue
    const among = propertyOf(action, 'among')
    if (among === undefined) continue
    const value = held(among)
    if (
      value === undefined ||
      !(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
    ) {
      throw new Unreadable(`${what} gives "${name}" an \`among\` that is not a quoted state name`)
    }
    out[name] = value.text
  }
  return out
}

/** The names a handle registers. React's `state` is a function; a description's is an object. */
function handleOf(
  object: ts.ObjectLiteralExpression,
  stateOf: (node: ts.Node | undefined, what: string) => string[],
  what: string,
): Pick<
  AgentRegistration,
  'states' | 'actions' | 'among' | 'secret' | 'destructive' | 'withholds'
> {
  const read = (key: string): { node: ts.Node | undefined } | undefined => {
    const element = propertyOf(object, key)
    return element === undefined ? undefined : { node: held(element) }
  }
  const state = read('state')
  const actions = read('actions')
  const secret = read('secret')
  return {
    states: state === undefined ? [] : stateOf(state.node, `${what} \`state\``),
    actions: actions === undefined ? [] : keysOf(actions.node, `${what} \`actions\``),
    among: actions === undefined ? {} : amongOf(actions.node, `${what} \`actions\``),
    secret: secret === undefined ? [] : namesOf(secret.node, `${what} \`secret\``),
    destructive: propertyOf(object, 'destructive') !== undefined,
    withholds: propertyOf(object, 'withholds') !== undefined,
  }
}

/**
 * The handles a React file registers: every `useAgentMember({ … })` call in
 * it, each with the keys of the object its `state` returns, the keys of its
 * `actions`, its `secret` list and whether it gives `destructive`.
 */
export function readReactRegistrations(text: string, file: string): AgentCodeReading {
  const reading: AgentCodeReading = { registrations: [], faults: [], described: [] }
  for (const call of callsOf(parse(file, text), 'useAgentMember')) {
    const line = lineOf(call)
    let member: string | null = null
    try {
      const object = objectArgument(call, 'useAgentMember')
      member = memberOf(object, 'useAgentMember')
      const handle = handleOf(object, returnedKeysOf, 'its')
      reading.registrations.push({ member, shape: 'react', file, line, ...handle })
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error
      reading.faults.push({ member, shape: 'react', file, line, message: error.message })
    }
  }
  return reading
}

/**
 * The `agent` blocks a description gives: the member's own, and each one a
 * part in its `parts` list gives, which registers under the member's name
 * (Toast's viewport).
 */
function agentBlocksOf(object: ts.ObjectLiteralExpression): ts.ObjectLiteralElementLike[] {
  const blocks: ts.ObjectLiteralElementLike[] = []
  const own = propertyOf(object, 'agent')
  if (own !== undefined) blocks.push(own)
  const parts = propertyOf(object, 'parts')
  const list = parts === undefined ? undefined : held(parts)
  if (list === undefined || !ts.isArrayLiteralExpression(list)) return blocks
  for (const element of list.elements) {
    const part = valueOf(element)
    if (part === undefined || !ts.isObjectLiteralExpression(part)) continue
    const agent = propertyOf(part, 'agent')
    if (agent !== undefined) blocks.push(agent)
  }
  return blocks
}

/**
 * What a description file describes: the member of every `describeMember({ … })`
 * call in it, and the handle each `agent` block registers, the member's own or
 * a part's, with the keys of its `state` and `actions`, its `secret` list and
 * whether it gives `destructive`.
 */
export function readDescribedRegistrations(text: string, file: string): AgentCodeReading {
  const reading: AgentCodeReading = { registrations: [], faults: [], described: [] }
  for (const call of callsOf(parse(file, text), 'describeMember')) {
    let member: string | null = null
    let line = lineOf(call)
    try {
      const object = objectArgument(call, 'describeMember')
      member = memberOf(object, 'describeMember')
      reading.described.push(member)
      for (const agent of agentBlocksOf(object)) {
        line = lineOf(agent)
        const block = held(agent)
        if (block === undefined || !ts.isObjectLiteralExpression(block)) {
          throw new Unreadable('its `agent` is not an object literal the law can read')
        }
        const handle = handleOf(block, keysOf, 'its `agent`')
        reading.registrations.push({ member, shape: 'description', file, line, ...handle })
      }
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error
      reading.faults.push({ member, shape: 'description', file, line, message: error.message })
    }
  }
  return reading
}

/* -------------------------------------------------------------------------- */
/* Comparing                                                                  */
/* -------------------------------------------------------------------------- */

/** A fence's declaration, in the terms a handle registers. */
export function declarationOf(
  member: string,
  spec: string,
  agent: AgentContract,
): AgentDeclaration {
  return {
    member,
    spec,
    states: agent.states.map((state) => state.name),
    actions: agent.actions.map((action) => action.name),
    among: Object.fromEntries(
      agent.actions.flatMap((action) =>
        action.among === undefined ? [] : [[action.name, action.among] as const],
      ),
    ),
    secret: agent.states.filter((state) => state.secret).map((state) => state.name),
    destructive: agent.destructive.length > 0,
    withholds: agent.withholdsContents,
  }
}

/** Every way one registration differs from the declaration, in both directions. */
export function compareRegistration(
  declared: AgentDeclaration,
  registration: AgentRegistration,
): AgentStalenessFinding[] {
  const { member, spec } = declared
  const { shape } = registration
  const at = `${registration.file}:${registration.line}`
  const findings: AgentStalenessFinding[] = []
  const compare = (kind: 'state' | 'action', specified: string[], registered: string[]) => {
    for (const name of registered) {
      if (specified.includes(name)) continue
      findings.push({
        member,
        shape,
        kind,
        direction: 'code-only',
        name,
        message: `${member}: ${at} registers the ${kind} "${name}", which ${spec} does not declare`,
      })
    }
    for (const name of specified) {
      if (registered.includes(name)) continue
      findings.push({
        member,
        shape,
        kind,
        direction: 'spec-only',
        name,
        message: `${member}: ${spec} declares the ${kind} "${name}", which ${at} does not register`,
      })
    }
  }
  compare('state', declared.states, registration.states)
  compare('action', declared.actions, registration.actions)
  for (const name of declared.actions) {
    if (!registration.actions.includes(name)) continue
    const specified = declared.among[name]
    const registered = registration.among[name]
    if (specified === registered) continue
    findings.push({
      member,
      shape,
      kind: 'among',
      // Both sides give one and name different states: neither has what the other lacks.
      ...(specified === undefined
        ? { direction: 'code-only' as const }
        : registered === undefined
          ? { direction: 'spec-only' as const }
          : {}),
      name,
      message:
        specified === undefined
          ? `${member}: ${at} gives "${name}" \`among: '${registered}'\`, and ${spec} declares it with no \`among\``
          : registered === undefined
            ? `${member}: ${spec} declares "${name}" \`among ${specified}\`, and ${at} gives it no \`among\``
            : `${member}: ${spec} declares "${name}" \`among ${specified}\`, and ${at} gives it \`among: '${registered}'\``,
    })
  }
  for (const name of registration.secret) {
    if (declared.secret.includes(name)) continue
    findings.push({
      member,
      shape,
      kind: 'secret',
      direction: 'code-only',
      name,
      message: `${member}: ${at} lists "${name}" in \`secret\`, which ${spec} does not mark secret`,
    })
  }
  for (const name of declared.secret) {
    if (registration.secret.includes(name)) continue
    findings.push({
      member,
      shape,
      kind: 'secret',
      direction: 'spec-only',
      name,
      message: `${member}: ${spec} marks the state "${name}" secret, which ${at} does not list in \`secret\``,
    })
  }
  if (declared.destructive !== registration.destructive) {
    findings.push({
      member,
      shape,
      kind: 'destructive',
      direction: declared.destructive ? 'spec-only' : 'code-only',
      message: declared.destructive
        ? `${member}: ${spec} declares \`destructive when\`, and ${at} gives no \`destructive\``
        : `${member}: ${at} gives \`destructive\`, and ${spec} declares no \`destructive when\``,
    })
  }
  if (declared.withholds !== registration.withholds) {
    findings.push({
      member,
      shape,
      kind: 'withholds',
      direction: declared.withholds ? 'spec-only' : 'code-only',
      message: declared.withholds
        ? `${member}: ${spec} declares \`withholds contents\`, and ${at} gives no \`withholds\``
        : `${member}: ${at} gives \`withholds\`, and ${spec} declares no \`withholds contents\``,
    })
  }
  return findings
}

/**
 * The law over a set of members: every member with a fence registers in each
 * shape it has, as its fence declares; every registration has a fence. A
 * member with no description is generated for no other framework, so only its
 * React member registers.
 */
export function agentStaleness(input: {
  members: readonly AgentSubject[]
  declarations: readonly AgentDeclaration[]
  readings: readonly AgentCodeReading[]
}): AgentStalenessFinding[] {
  const findings: AgentStalenessFinding[] = []
  const subjects = new Map(input.members.map((member) => [member.name, member]))
  const declarations = new Map(input.declarations.map((entry) => [entry.member, entry]))
  const registrations = input.readings.flatMap((reading) => reading.registrations)
  const faults = input.readings.flatMap((reading) => reading.faults)
  // A member whose call the reader could not read is reported for that, not
  // again as registering nothing.
  const attempted = new Set(faults.map((fault) => `${fault.shape}:${fault.member ?? ''}`))

  for (const fault of faults) {
    findings.push({
      member: fault.member ?? '',
      shape: fault.shape,
      kind: 'unreadable',
      message: `${fault.member ?? 'A handle'}: ${fault.file}:${fault.line}: ${fault.message}`,
    })
  }

  for (const member of input.members) {
    const declared = declarations.get(member.name)
    if (declared === undefined) continue
    for (const shape of ['react', 'description'] as const) {
      const file = shape === 'react' ? member.source : member.description
      if (shape === 'description' && file === null) continue
      const own = registrations.filter(
        (registration) => registration.member === member.name && registration.shape === shape,
      )
      if (own.length === 0) {
        if (attempted.has(`${shape}:${member.name}`)) continue
        const missing =
          shape === 'react'
            ? 'registers no handle: no `useAgentMember({ member: ' + `'${member.name}', … })\` call`
            : 'has no `agent` block on its `describeMember({ … })`'
        findings.push({
          member: member.name,
          shape,
          kind: 'unregistered',
          message: `${member.name}: ${declared.spec} has an agent fence, and ${file ?? 'its React member'} ${missing}`,
        })
        continue
      }
      for (const registration of own) findings.push(...compareRegistration(declared, registration))
    }
  }

  for (const registration of registrations) {
    if (declarations.has(registration.member)) continue
    const at = `${registration.file}:${registration.line}`
    const subject = subjects.get(registration.member)
    findings.push(
      subject === undefined
        ? {
            member: registration.member,
            shape: registration.shape,
            kind: 'not-a-member',
            message: `${registration.member}: ${at} registers a handle for "${registration.member}", which is not a member`,
          }
        : {
            member: registration.member,
            shape: registration.shape,
            kind: 'unspecified',
            message:
              `${registration.member}: ${at} registers a handle, and ` +
              `${subject.spec ?? 'the member, which has no spec,'} has no agent fence`,
          },
    )
  }
  return findings
}

/* -------------------------------------------------------------------------- */
/* The repository                                                             */
/* -------------------------------------------------------------------------- */

/** Where React members register. */
const REACT_TREE = 'packages/react-ui/src'
/** Where the descriptions are, one file per member. */
const DESCRIPTIONS = 'packages/shells/src/members'

/** The TypeScript sources under a directory, repo-relative, without tests or declarations. */
function sourcesUnder(root: string, dir: string): string[] {
  return readdirSync(resolve(root, dir), { recursive: true })
    .map((entry) => `${dir}/${String(entry)}`)
    .filter((file) => /\.tsx?$/.test(file) && !/\.d\.ts$|\.test\.tsx?$/.test(file))
    .sort()
}

export interface AgentStalenessReport {
  findings: AgentStalenessFinding[]
  /** The members whose spec has an agent fence, in gallery order. */
  declared: string[]
  /** How many files each reader was given. */
  read: { react: number; descriptions: number }
}

/**
 * Runs the law over a repository: the gallery's members, their specs' fences,
 * every React source under `packages/react-ui/src` (and each member's own
 * file, wherever it is) that calls `useAgentMember`, and every description.
 */
export function auditAgentStaleness(root: string): AgentStalenessReport {
  const ui = openUiProgram(root)
  const subjects: AgentSubject[] = ui.components.map(({ name }) => ({
    name,
    spec: specFor(root, name),
    source: memberSource(ui, name),
    description: null,
  }))

  const reactFiles = [
    ...new Set([
      ...sourcesUnder(root, REACT_TREE),
      ...subjects.flatMap((subject) => (subject.source === null ? [] : [subject.source])),
    ]),
  ]
  const readings: AgentCodeReading[] = []
  for (const file of reactFiles) {
    const text = readFileSync(resolve(root, file), 'utf8')
    if (text.includes('useAgentMember')) readings.push(readReactRegistrations(text, file))
  }

  const descriptions = sourcesUnder(root, DESCRIPTIONS).filter(
    (file) => file !== `${DESCRIPTIONS}/index.ts`,
  )
  const describedIn = new Map<string, string>()
  for (const file of descriptions) {
    const reading = readDescribedRegistrations(readFileSync(resolve(root, file), 'utf8'), file)
    for (const member of reading.described) describedIn.set(member, file)
    readings.push(reading)
  }
  for (const subject of subjects) subject.description = describedIn.get(subject.name) ?? null

  const declarations: AgentDeclaration[] = []
  for (const subject of subjects) {
    if (subject.spec === null) continue
    const { agent } = readAgent(readFileSync(resolve(root, subject.spec), 'utf8'), subject.spec)
    if (agent !== null) declarations.push(declarationOf(subject.name, subject.spec, agent))
  }

  return {
    findings: agentStaleness({ members: subjects, declarations, readings }),
    declared: declarations.map((declaration) => declaration.member),
    read: { react: reactFiles.length, descriptions: descriptions.length },
  }
}
