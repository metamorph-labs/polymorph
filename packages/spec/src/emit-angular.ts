import { FRAMEWORK_VOCABULARY, vueBinding, type VueBinding } from '@polymorph/registry/frameworks'
import type { Registry, RegistryProp } from '@polymorph/registry'
import { format, type Options } from 'prettier'
import ts from 'typescript'

import { propTypes } from './emit-vue'
import { angularClassName } from './validate'
import {
  isBinding,
  isElement,
  isObjectValue,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from './schema'

/**
 * Spec to an Angular standalone component.
 *
 * The same screen the React emitter writes, in Angular's terms: one TypeScript
 * module that exports the props interface and a component class whose
 * template, inline, composes `@polymorph/angular-ui` members. It holds no
 * state and computes nothing, for the same reason the TSX does not: the spec
 * has no expression language.
 *
 * **Every input is a signal input** under its spec name and type
 * (`readonly tickets = input.required<InboxViewProps['tickets']>()`), callbacks
 * included, as every other emitter keeps a callback a prop. A callback is not
 * an output of the screen, because an output named as a DOM event (`submit`,
 * `change`) would also hear the native event that bubbles through the screen's
 * host element. The template reads an input by calling it (`tickets()`,
 * `summary().open.label`).
 *
 * **Each prop is read through the fixed mapping** (`vueBinding`,
 * `docs/frameworks.md`), with the type the registry prints for it. A value
 * bound to `onFoo` is the output `foo`, whose handler calls the callback:
 * `(click)="onNewTicket()()"`. The handler passes `$event` only when both the
 * member's callback and the screen's take an argument, because a call with an
 * argument the function does not declare fails the template type check. A
 * node-typed prop is the named slot: its value is content projected through
 * `<ng-container ngProjectAs="[slot=foo]">`, and `children` is the content
 * between the member's tags. A structured value is a bound expression, and an
 * element inside one (`emptyState.secondaryAction`) is an `<ng-template>`
 * declared at the top of the template and named where the value holds it. A
 * render prop given an element is such a template too. A template reference
 * would hide an input of the same name, so a template is named apart from
 * every input.
 *
 * **Text is written as text** only when Angular reads it back unchanged: no
 * tag, block, interpolation or entity character, and no whitespace it would
 * collapse. Anything else is a string literal in an interpolation, with every
 * character the template or the module's template literal reads specially
 * written as a `\u` escape. Text and the interpolations beside it are written
 * on one line with nothing between them, because Angular keeps whitespace that
 * sits beside text, where React drops it. Whitespace between two elements is
 * removed by Angular's compiler under its default `preserveWhitespaces: false`,
 * so elements are written one to a line.
 *
 * Prettier formats the module with the target's config, the inline template
 * included: it formats a component's `template` with its Angular parser, which
 * adds no whitespace beside text.
 */

/** The module every emitted Angular screen imports its members and their types from. */
export const ANGULAR_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.angular

/** The React vocabulary, whose type names the Angular vocabulary exports under the same names. */
const REACT_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.react

/**
 * The compound parts whose element is their host: a table's sections, rows
 * and cells are the element the table needs there, marked with the part's
 * attribute (`<tr pmTableRow>`), because a custom element between a `<table>`
 * and its rows would break the table. A list's item is its `<li>` for the same
 * reason: a `<ul>` takes only list items as children. `angular.test.ts` holds
 * this list to the selectors in `@polymorph/angular-ui`'s source.
 */
export const ANGULAR_HOST_PARTS: Readonly<Record<string, string>> = {
  'List.Item': 'li',
  'CommentThread.Comment': 'li',
  'Table.Head': 'thead',
  'Table.Body': 'tbody',
  'Table.Foot': 'tfoot',
  'Table.Row': 'tr',
  'Table.Header': 'th',
  'Table.Cell': 'td',
}

// The validator holds a screen's name to these classes, and it runs in the
// browser, so the rule is written there.
export { angularClassName }

/** `settings-row-group`: a name in kebab case, as the vocabulary's selectors spell it. */
const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

/** A member's element: `pm-button`, `pm-settings-row-group`. */
export const angularMemberSelector = (component: string): string =>
  `pm-${kebab(angularClassName(component))}`

/** The selector of an emitted screen's component: `app-inbox-view`. */
export const angularScreenSelector = (name: string): string => `app-${kebab(name)}`

interface Walk {
  /** The classes the template names, which the component imports. */
  used: Set<string>
  /** Each prop's reading and its registry record, by member and prop name. */
  read: (component: string, name: string) => { binding: VueBinding; prop?: RegistryProp }
  /** Each input's type, by name. */
  inputs: Map<string, string>
  /** The templates declared at the top of the markup, in order. */
  hoisted: string[][]
  /**
   * The name of each template declared at the top, by what it holds: an element
   * a value holds, or a member's render prop, keyed by `<prop>` under the
   * element. The same value always names the same template.
   */
  names: Map<SpecElement, Map<string, string>>
  /** Names in the template's scope: the inputs and the declared templates. */
  taken: Set<string>
}

/** The module, formatted. `header` is the doc comment the React emitter writes. */
export async function angularScreen(
  spec: ScreenSpec,
  registry: Registry,
  header: string,
  local: Options | null,
): Promise<string> {
  const types = propTypes(registry)
  const walk: Walk = {
    used: new Set(),
    read: (component, name) => {
      const prop = types(component)?.get(name)
      return {
        binding: vueBinding(prop ?? { name, type: 'unknown' }),
        ...(prop === undefined ? {} : { prop }),
      }
    },
    inputs: new Map(spec.inputs.map((input) => [input.name, input.type])),
    hoisted: [],
    names: new Map(),
    taken: new Set(spec.inputs.map((input) => input.name)),
  }
  const root = elementLines(spec.root, walk, 4)
  const markup = [...walk.hoisted.flat(), ...root]

  const module = [
    header,
    ...imports(spec, walk),
    '',
    propsInterface(spec),
    '',
    '@Component({',
    `  selector: '${angularScreenSelector(spec.name)}',`,
    `  imports: [${[...walk.used].sort().join(', ')}],`,
    `  template: \`\n${inTemplateLiteral(markup.join('\n'))}\n  \`,`,
    '})',
    spec.inputs.length === 0
      ? `export class ${spec.name} {}`
      : [
          `export class ${spec.name} {`,
          ...spec.inputs.map(
            (input) =>
              `  readonly ${input.name} = input.required<${spec.name}Props['${input.name}']>()`,
          ),
          '}',
        ].join('\n'),
    '',
  ].join('\n')

  return format(module, { ...local, parser: 'typescript' })
}

/* -------------------------------------------------------------------------- */
/* The module around the template                                             */
/* -------------------------------------------------------------------------- */

/**
 * `Component` and `input` from Angular, then the members and the types as the
 * React emitter imports them, from `@polymorph/angular-ui`.
 */
function imports(spec: ScreenSpec, walk: Walk): string[] {
  // A type the React vocabulary exports is a type the Angular vocabulary exports.
  const declared = new Map<string, Set<string>>()
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    const target = module === REACT_IMPORT_SOURCE ? ANGULAR_IMPORT_SOURCE : module
    declared.set(target, new Set([...(declared.get(target) ?? []), ...names]))
  }
  const inline = [...(declared.get(ANGULAR_IMPORT_SOURCE) ?? [])]
    .filter((name) => !walk.used.has(name))
    .sort()
  const members = [...[...walk.used].sort(), ...inline.map((name) => `type ${name}`)]

  return [
    `import { Component${spec.inputs.length === 0 ? '' : ', input'} } from '@angular/core'`,
    `import { ${members.join(', ')} } from '${ANGULAR_IMPORT_SOURCE}'`,
    ...[...declared]
      .filter(([module]) => module !== ANGULAR_IMPORT_SOURCE)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, names]) => `import type { ${[...names].sort().join(', ')} } from '${module}'`),
  ]
}

function propsInterface(spec: ScreenSpec): string {
  if (spec.inputs.length === 0) return `export interface ${spec.name}Props {}`
  const fields = spec.inputs.flatMap((input) => [
    ...(input.doc === undefined ? [] : [`  /** ${inComment(input.doc)} */`]),
    `  ${input.name}: ${input.type}`,
  ])
  return [`export interface ${spec.name}Props {`, ...fields, '}'].join('\n')
}

/** Prose made safe inside a block comment, as the React emitter makes it. */
const inComment = (text: string) => text.replace(/\*\//g, '*\\/')

/**
 * The template as the text of a template literal: a backslash, a backtick and
 * `${` are escaped, so the literal holds exactly the template.
 */
const inTemplateLiteral = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

/* -------------------------------------------------------------------------- */
/* The template                                                               */
/* -------------------------------------------------------------------------- */

const pad = (depth: number) => ' '.repeat(depth)

/** The declared exception, as a comment written before the element it explains. */
function exceptionComment(node: SpecElement): string {
  if (node.exception === undefined) return ''
  const text = `Rung ${node.exception.rung}, declared: ${node.exception.because}`
  // A comment ends at `-->` (or `--!>`). A backslash breaks the sequence; the
  // comment then reads `--\>`.
  return `<!-- ${text.replace(/--(!?)>/g, '--$1\\>')} -->`
}

/** What React draws nothing for. */
const drawsNothing = (value: SpecValue): boolean => value === null || typeof value === 'boolean'

/** A value as the nodes it holds, a list flattened. */
const nodesOf = (value: SpecValue): SpecValue[] =>
  ((Array.isArray(value) ? value : [value]).flat(Infinity as 1) as SpecValue[]).filter(
    (item) => !drawsNothing(item),
  )

/** The tag an element opens with and the one it closes with. */
function tagOf(component: string): { open: string; close: string; custom: boolean } {
  const host = ANGULAR_HOST_PARTS[component]
  if (host !== undefined) {
    const attribute = `pm${angularClassName(component)}`
    return { open: `${host} ${attribute}`, close: host, custom: false }
  }
  const selector = angularMemberSelector(component)
  return { open: selector, close: selector, custom: true }
}

/**
 * One element: its attributes on its opening tag, then each named slot's
 * content, then its children. Its lines start at `depth`. Content that holds
 * text is one run, written flush against the tags around it.
 */
function elementLines(node: SpecElement, walk: Walk, depth: number): string[] {
  walk.used.add(angularClassName(node.component))
  const tag = tagOf(node.component)

  const attributes: string[] = []
  const slots: { name: string; nodes: SpecValue[] }[] = []
  let content: SpecValue[] = []
  for (const [name, value] of Object.entries(node.props ?? {})) {
    const { binding, prop } = walk.read(node.component, name)
    if (binding.kind === 'event') {
      attributes.push(`(${binding.name})="${handler(value, prop, walk)}"`)
    } else if (binding.kind === 'slot' && binding.name === 'default') {
      content = nodesOf(value)
    } else if (binding.kind === 'slot') {
      if (drawsNothing(value)) continue
      if (isObjectValue(value)) attributes.push(`[${name}]="${expression(value, walk, name)}"`)
      else slots.push({ name: binding.name, nodes: nodesOf(value) })
    } else if (binding.kind === 'scoped-slot') {
      if (drawsNothing(value)) continue
      // A render function handed in as an input is the template itself.
      const bound =
        isBinding(value) || isObjectValue(value)
          ? expression(value, walk, name)
          : hoist(node, name, nodesOf(value), walk)
      attributes.push(`[${name}]="${bound}"`)
    } else {
      attributes.push(attribute(name, value, walk, !tag.custom))
    }
  }
  if ((node.children ?? []).length > 0) content = nodesOf(node.children ?? [])

  const comment = exceptionComment(node)
  const head = comment === '' ? [] : [`${pad(depth)}${comment}`]
  const open = `<${tag.open}${attributes.map((written) => ` ${written}`).join('')}`

  if (slots.length === 0 && content.length === 0) {
    // Angular closes a component's element itself; a native element needs its end tag.
    return [...head, `${pad(depth)}${open}${tag.custom ? ' />' : `></${tag.close}>`}`]
  }
  if (slots.length === 0 && !content.every((item) => isElement(item))) {
    return [...head, `${pad(depth)}${open}>${run(content, walk)}</${tag.close}>`]
  }
  return [
    ...head,
    `${pad(depth)}${open}>`,
    ...slots.flatMap((slot) =>
      wrapped(
        `ng-container ngProjectAs="[slot=${slot.name}]"`,
        'ng-container',
        slot.nodes,
        walk,
        depth + 2,
      ),
    ),
    ...children(content, walk, depth + 2),
    `${pad(depth)}</${tag.close}>`,
  ]
}

/**
 * Nodes inside an element of Angular's own (`ng-container`, `ng-template`):
 * the element's lines, its content one element to a line, or one run flush
 * against its tags when any of it is text.
 */
function wrapped(
  open: string,
  close: string,
  nodes: SpecValue[],
  walk: Walk,
  depth: number,
): string[] {
  if (!nodes.every((item) => isElement(item))) {
    return [`${pad(depth)}<${open}>${run(nodes, walk)}</${close}>`]
  }
  return [`${pad(depth)}<${open}>`, ...children(nodes, walk, depth + 2), `${pad(depth)}</${close}>`]
}

/** Elements, one to a line. */
function children(nodes: SpecValue[], walk: Walk, depth: number): string[] {
  return nodes.flatMap((item) => elementLines(item as SpecElement, walk, depth))
}

/**
 * Content that holds text, a number or a binding: one run on a single line,
 * with nothing between its parts, an element in it written on one line.
 */
function run(nodes: SpecValue[], walk: Walk): string {
  let afterText = false
  return nodes
    .map((item) => {
      if (typeof item === 'string') {
        // A string after a string is its own node in React; here it is an
        // interpolation, which never merges with the text before it in the source.
        const literal = isLiteralText(item) && !afterText
        afterText = literal
        return literal ? item : `{{ ${angularString(item)} }}`
      }
      afterText = false
      if (isElement(item)) {
        return elementLines(item, walk, 0)
          .map((line) => line.trim())
          .join('')
      }
      if (isBinding(item)) return `{{ ${read(item.$)} }}`
      return `{{ ${JSON.stringify(item)} }}`
    })
    .join('')
}

/**
 * Whether text can be written between tags unchanged: words separated by
 * single spaces, with nothing Angular reads as a tag, a block, an
 * interpolation or an entity, and nothing the template literal escapes.
 */
function isLiteralText(text: string): boolean {
  return /^[^\s<>{}&@`$\\]+( [^\s<>{}&@`$\\]+)*$/.test(text)
}

/* -------------------------------------------------------------------------- */
/* Attributes, handlers and the expressions they hold                         */
/* -------------------------------------------------------------------------- */

/**
 * `title="Inbox"`, `[columns]="4"`, `[stickyHeader]="true"`, `[data]="tickets()"`.
 * A string is a static attribute only when Angular reads it unchanged: an
 * attribute's value still decodes an entity and reads `{{` as an
 * interpolation. A static attribute sets the input of the same name. A
 * boolean is always bound, because a bare attribute sets an input to `''`.
 *
 * On a part whose element is its host (`<li pmListItem>`) a string is bound
 * too. A member's own element removes every attribute it was written with, and
 * a host part keeps all but its selector, so a static `title` would set the
 * input and also stay on the `<li>` as its tooltip. The shells' renderer binds
 * a host part's literals for the same reason.
 */
function attribute(name: string, value: SpecValue, walk: Walk, host: boolean): string {
  if (!host && typeof value === 'string' && /^[^"&{}<>@`$\\\r\n\t]*$/.test(value))
    return `${name}="${value}"`
  return `[${name}]="${expression(value, walk, name)}"`
}

/** An input read in the template: `summary().open.label` for `summary.open.label`. */
function read(path: string): string {
  const [root = path, ...rest] = path.split('.')
  return [`${root}()`, ...rest].join('.')
}

/**
 * The statement an output's binding runs: the callback the value names,
 * called with `$event` when both it and the member's callback take an
 * argument. Anything but a binding is written as the expression it is.
 */
function handler(value: SpecValue, prop: RegistryProp | undefined, walk: Walk): string {
  if (!isBinding(value)) return expression(value, walk, 'handler')
  const [root = value.$, ...rest] = value.$.split('.')
  const screen = pathType(walk.inputs.get(root), rest)
  const takes = (type: string | undefined) => {
    const count = type === undefined ? null : parameterCount(type)
    return count === null || count > 0
  }
  const passes = takes(screen) && takes(prop?.type)
  const callee = rest.length === 0 ? `${root}()` : read(value.$)
  return `${callee}(${passes ? '$event' : ''})`
}

/**
 * A value as an expression in a bound attribute or an interpolation. Strings
 * are single-quoted with every character the template reads specially
 * escaped. An element is the template declared for it, named by where it
 * sits. A structure is written on one line; Prettier breaks it.
 */
function expression(value: SpecValue, walk: Walk, key: string): string {
  if (Array.isArray(value))
    return `[${value.map((item) => expression(item, walk, key)).join(', ')}]`
  if (isElement(value)) return hoist(value, key, [value], walk)
  if (isBinding(value)) return read(value.$)
  if (isObjectValue(value)) {
    const fields = Object.entries(value.$object).map(
      ([field, item]) => `${quoteKey(field)}: ${expression(item, walk, field)}`,
    )
    return fields.length === 0 ? '{}' : `{ ${fields.join(', ')} }`
  }
  if (typeof value === 'string') return attributeString(value)
  return JSON.stringify(value)
}

/**
 * A template declared at the top of the markup, and its reference's name: for
 * an element a value holds (`secondaryActionTemplate` for the
 * `secondaryAction` of an `emptyState`), or for a render prop given nodes.
 * `holder` and `key` say where it is used, so the same place always names the
 * same template.
 */
function hoist(holder: SpecElement, key: string, nodes: SpecValue[], walk: Walk): string {
  const byKey = walk.names.get(holder) ?? new Map<string, string>()
  walk.names.set(holder, byKey)
  const known = byKey.get(key)
  if (known !== undefined) return known
  const base = `${key.replace(/[^A-Za-z0-9_$]/g, '')}Template`
  let name = base
  for (let count = 2; walk.taken.has(name); count += 1) name = `${base}${count}`
  walk.taken.add(name)
  byKey.set(key, name)
  // Its place is claimed before its content is laid out, so a template its
  // content declares comes after it.
  const at = walk.hoisted.length
  walk.hoisted.push([])
  walk.hoisted[at] = wrapped(`ng-template #${name}`, 'ng-template', nodes, walk, 4)
  return name
}

/**
 * A single-quoted Angular string literal that holds no character the
 * template, an attribute or the module's template literal reads specially:
 * quotes, `&`, `<`, `>`, braces, `@`, a backtick, `$` and line breaks are
 * escapes, so the literal says exactly what the author typed wherever it
 * sits. Angular's expression lexer reads `\u` escapes and no `\x` ones.
 */
export function angularString(text: string, apostrophe = "\\'"): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, apostrophe)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/["&<>{}@`$]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `'${escaped}'`
}

/**
 * The literal inside a binding's attribute, where an apostrophe is a `\u`
 * escape as the double quote is. In content the formatter turns a literal with
 * an apostrophe into a double-quoted one. In an attribute it cannot, and keeps
 * `\'`, which the module's template literal writes as two backslashes and a
 * quote. The red rules read an inline template as the module's source spells
 * it, so they would see the literal end there and refuse the screen.
 */
const attributeString = (text: string): string => angularString(text, '\\u0027')

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** An object key: bare when it is an identifier, quoted otherwise. */
const quoteKey = (key: string): string => (IDENTIFIER.test(key) ? key : attributeString(key))

/* -------------------------------------------------------------------------- */
/* Callbacks, read from their types                                           */
/* -------------------------------------------------------------------------- */

/** The type a type's text parses to, as an alias's right-hand side, with its file. */
function typeNode(text: string): { node: ts.TypeNode; file: ts.SourceFile } | null {
  const file = ts.createSourceFile('type.ts', `type T = ${text}`, ts.ScriptTarget.Latest, true)
  const [alias] = file.statements
  return alias !== undefined && ts.isTypeAliasDeclaration(alias) ? { node: alias.type, file } : null
}

/** The members of a union, without `undefined` and `null`, parentheses removed. */
function members(node: ts.TypeNode): ts.TypeNode[] {
  if (ts.isParenthesizedTypeNode(node)) return members(node.type)
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(members)
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return []
  if (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword) return []
  return [node]
}

/**
 * How many parameters the function a type describes takes, or `null` when the
 * type is not one function type written out (an alias, an interface).
 */
function parameterCount(text: string): number | null {
  const parsed = typeNode(text)
  if (parsed === null) return null
  const functions = members(parsed.node).filter(ts.isFunctionTypeNode)
  const [only] = functions
  return functions.length === 1 && only !== undefined ? only.parameters.length : null
}

/**
 * The type at a path into an input's type, as text: `() => void` at `onSave`
 * in `{ onSave: () => void }`. `undefined` when the path leaves the types
 * written out as object literals.
 */
function pathType(text: string | undefined, path: string[]): string | undefined {
  const [segment, ...rest] = path
  if (text === undefined || segment === undefined) return text
  const parsed = typeNode(text)
  if (parsed === null) return undefined
  for (const member of members(parsed.node)) {
    if (!ts.isTypeLiteralNode(member)) continue
    for (const field of member.members) {
      if (field.name === undefined || field.name.getText(parsed.file) !== segment) continue
      if (ts.isPropertySignature(field) && field.type !== undefined) {
        return pathType(field.type.getText(parsed.file), rest)
      }
      if (ts.isMethodSignature(field) && rest.length === 0) {
        return `(${field.parameters.map((parameter) => parameter.getText(parsed.file)).join(', ')}) => void`
      }
    }
  }
  return undefined
}
