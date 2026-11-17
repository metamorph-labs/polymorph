import { FRAMEWORK_VOCABULARY, type Framework } from '@polymorph/registry/frameworks'
import type { Registry } from '@polymorph/registry'
import { format, resolveConfig } from 'prettier'

import { angularScreen } from './emit-angular'
import { kotlinPackageOf, kotlinScreen } from './emit-kotlin'
import { MissingContractError } from './emit-native'
import { svelteScreen } from './emit-svelte'
import { swiftScreen } from './emit-swift'
import { MissingRegistryError, vueScreen } from './emit-vue'
import {
  isBinding,
  isElement,
  isObjectValue,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from './schema'
import type { NativePackage } from './validate'

/**
 * Spec to TSX.
 *
 * The output is a *presentational component*. It takes what it needs as props
 * and renders a tree. This split is the emitter's one real design decision, and
 * the format forces it. A spec has no expression language, so it cannot hold
 * state, write a handler body or derive a value, and its output does not
 * compute either. Behaviour stays in a hand-written container that renders the
 * emitted view.
 *
 * This is also the split that testable React codebases use. The part a machine
 * writes is exactly the part with no decisions in it.
 *
 * **A lawful spec has no place to write a red-rule violation.** It has no field
 * for a `style` prop, a `className`, a stylesheet import, a raw `<div>` or a
 * motion binding. Validation requires each field this file prints as code (a
 * component's name, a binding, an input's type, an imported name) to be exactly
 * that (`validate.ts`, `input-type.ts`). A lawful spec can still *contain*
 * something the rules read as a design value, such as a label whose text is a
 * colour. So every entry point that writes an emitted file lints it first
 * (`lawful.ts`). `spec.test.ts` runs every shipped screen through the same
 * `@polymorph/rules/verify`.
 *
 * **Text is printed as text.** A spec's prose (its purpose, an input's doc, an
 * exception's reason) goes into comments, and its strings go into attributes and
 * between tags. Each of those places gives some characters a special meaning. A
 * comment ends at its terminator, an attribute decodes entities, and tag content
 * drops the whitespace around a line break. So each is written in a form where
 * the file says exactly what the author typed, and no sentence can close the
 * comment it sits in. The places that hold *code* (a component's name, a
 * binding, an input's type, an imported name) are not escaped here, because
 * code cannot be escaped into something else. Validation requires each to be
 * exactly what it claims to be.
 *
 * Prettier formats the result, because emitted code that fails
 * `prettier --check` cannot be committed.
 *
 * **The framework is an option, not a field.** The same spec emits a Vue
 * single-file component with `{ framework: 'vue' }` (`emit-vue.ts`) and a
 * Svelte one with `{ framework: 'svelte' }` (`emit-svelte.ts`), each of which
 * reads each prop's type from the registry passed beside it, so it knows an
 * event or a node from a prop. `{ framework: 'solid' }` writes the TSX below
 * for Solid: the members come from `@polymorph/solid-ui`, and the inputs are
 * read from `props` instead of destructured. `{ framework: 'angular' }` writes
 * a standalone component with its template inline (`emit-angular.ts`), which
 * reads the registry as the Vue and Svelte emitters do. `{ framework:
 * 'elements' }` is refused (`ELEMENTS_UNEMITTED`).
 *
 * **The platform is a field.** A spec for `ios` emits SwiftUI (`emit-swift.ts`)
 * and one for `android` Jetpack Compose (`emit-kotlin.ts`): a model, an
 * actions record and a stateless view, against the platform's member package
 * passed as `native`. A native screen is held to the native screen contract's
 * law instead of the red rules, which read TSX, Vue, Svelte and Angular.
 */

/** The module every emitted file imports its members from. */
export const IMPORT_SOURCE = '@polymorph/react-ui'

/**
 * Why no screen is emitted for the elements. A spec's inputs include callbacks
 * and node renderers (`onRowClick`, a column's `cell`), and an HTML page has no
 * syntax that binds either to a member: a page sets them from a script beside
 * its markup. A spec is still validated against the elements vocabulary, and a
 * page is written from the system card.
 */
export const ELEMENTS_UNEMITTED =
  'a screen is not emitted for elements: HTML has no way to bind a screen’s callbacks and ' +
  'node renderers, which a page sets from a script beside its markup — write the page from ' +
  'the system card (`get_system_card` with `framework: "elements"`)'

/** A screen asked for in a framework no emitter writes. */
export class UnemittedFrameworkError extends Error {
  constructor(readonly framework: Framework) {
    super(ELEMENTS_UNEMITTED)
    this.name = 'UnemittedFrameworkError'
  }
}

/** The module an emitted Solid screen imports its members and their types from. */
export const SOLID_IMPORT_SOURCE = FRAMEWORK_VOCABULARY.solid

/**
 * How a TSX screen is written for React or for Solid. The tree is the same
 * JSX, because a Solid member takes the React member's props under the same
 * names (`docs/frameworks.md`).
 */
interface TsxDialect {
  /** The module the members and the vocabulary's types are imported from. */
  source: string
  /**
   * `destructure`: `function Inbox({ tickets }: InboxProps)`, and a binding is
   * the input's name. `props`: `function Inbox(props: InboxProps)`, and a
   * binding reads `props.tickets`, because a destructured Solid prop is read
   * once and does not follow its updates.
   */
  inputs: 'destructure' | 'props'
}

const REACT_DIALECT: TsxDialect = { source: IMPORT_SOURCE, inputs: 'destructure' }
const SOLID_DIALECT: TsxDialect = { source: SOLID_IMPORT_SOURCE, inputs: 'props' }

/**
 * The text in every emitted file's header. It is exported because it also
 * identifies an emitted file later. A tool that writes a screen to disk may
 * replace a file that contains this text, because it is regenerating its own
 * output. It may not replace a file without it, because that is someone's
 * hand-written source.
 */
export const EMITTED_MARKER = 'Emitted from a screen spec'

export interface EmitOptions {
  /**
   * Where the emitted file will live. Used to resolve the *consumer's* Prettier
   * config, so the output matches the repository it is written into, not this
   * one. Emitted code that fails the local `prettier --check` cannot be
   * committed. A Kotlin screen declares the package its directory names under
   * the source root (`kotlinPackageOf`).
   */
  filepath?: string
  /** The web framework the screen is written for. `react` when absent. */
  framework?: Framework
  /**
   * The registry the screen was validated against. The Vue, Svelte and Angular
   * emitters read each prop's printed type from it; the React and Solid
   * emitters need none.
   */
  registry?: Registry
  /**
   * The member package of a native screen's platform: its generated contract
   * and the members it draws (`readNativePackage(root, platform)`). An `ios` or
   * `android` screen's members, their props and their types are read from it;
   * no other screen needs it.
   */
  native?: NativePackage
}

export async function emitScreen(spec: ScreenSpec, options: EmitOptions = {}): Promise<string> {
  if (spec.platform === 'ios' || spec.platform === 'android') {
    const native = options.native
    if (native === undefined) throw new MissingContractError(spec.platform)
    if (native.platform !== spec.platform) {
      throw new MissingContractError(spec.platform, native.platform)
    }
    return spec.platform === 'ios'
      ? swiftScreen(spec, native, EMITTED_MARKER)
      : kotlinScreen(spec, native, EMITTED_MARKER, kotlinPackageOf(options.filepath))
  }
  if (options.framework === 'elements') throw new UnemittedFrameworkError(options.framework)
  // Uncached, because a long-lived caller such as the MCP server would otherwise
  // keep using the config a project had when its first screen was emitted.
  const local = options.filepath ? await resolveConfig(options.filepath, { useCache: false }) : null

  if (options.framework === 'vue') {
    if (options.registry === undefined) throw new MissingRegistryError()
    return format(vueScreen(spec, options.registry, header(spec)), { ...local, parser: 'vue' })
  }
  if (options.framework === 'svelte') {
    if (options.registry === undefined) throw new MissingRegistryError('svelte')
    return svelteScreen(spec, options.registry, header(spec), local)
  }
  if (options.framework === 'angular') {
    if (options.registry === undefined) throw new MissingRegistryError('angular')
    return angularScreen(spec, options.registry, header(spec), local)
  }

  const dialect = options.framework === 'solid' ? SOLID_DIALECT : REACT_DIALECT
  return format(tsxScreen(spec, dialect), { ...local, parser: 'typescript' })
}

/** The TSX file, unformatted. */
function tsxScreen(spec: ScreenSpec, dialect: TsxDialect): string {
  const walk: TsxWalk = { used: new Set(), dialect }
  const body = element(spec.root, walk, 2, false)

  return [
    header(spec),
    '',
    ...imports(spec, walk),
    '',
    propsInterface(spec),
    '',
    // Zero inputs is what the composer produces (literal-first documents). An
    // empty destructuring would be a parameter with nothing in it, so the
    // component takes no arguments, and the empty Props interface remains the
    // declared surface.
    spec.inputs.length === 0
      ? `export function ${spec.name}() {`
      : `export function ${spec.name}(${dialect.inputs === 'props' ? 'props' : destructure(spec)}: ${spec.name}Props) {`,
    '  return (',
    body,
    '  )',
    '}',
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* The file around the tree                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Prose made safe inside a block comment. The one sequence that would end the
 * comment early is broken up, and still reads the same to a person.
 */
const inComment = (text: string) => text.replace(/\*\//g, '*\\/')

function header(spec: ScreenSpec): string {
  return [
    '/**',
    // One comment line per line of prose, so a purpose that runs to a second
    // line stays inside the block's left margin.
    ...inComment(spec.purpose)
      .split(/\r\n|\n|\r/)
      .map((line) => ` * ${line}`),
    ' *',
    ` * ${EMITTED_MARKER} (\`${spec.spec}\`). Composition and bindings only:`,
    ' * this file holds no state, computes nothing, and expresses no style — the',
    ' * container that renders it owns all three.',
    ' */',
  ].join('\n')
}

/**
 * Every import the file needs: the members the tree mentions, and the types the
 * props interface names.
 *
 * The types are declared, not derived, because nothing else knows them. A
 * screen's inputs mention its own domain's types (`Ticket`) and some of the
 * vocabulary's (`DataTableColumn`), and the element tree knows about neither.
 * The merge *is* derived. A type from `@polymorph/react-ui` joins the existing
 * value import instead of opening a second import from the same module. Each
 * module gets one import, with the type names marked inline, as this
 * repository's own files write it. For Solid, a type the spec imports from
 * `@polymorph/react-ui` is imported from `@polymorph/solid-ui`, which exports
 * it under the same name.
 */
function imports(spec: ScreenSpec, walk: TsxWalk): string[] {
  const source = walk.dialect.source
  const declared = Object.entries(spec.types ?? {})
    .map(([module, names]) => [module === IMPORT_SOURCE ? source : module, names] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  // A name imported as a value is already in scope. Naming it twice on one line
  // would be a duplicate binding, not a stricter import.
  const inline = [...new Set(declared.find(([module]) => module === source)?.[1] ?? [])]
    .filter((name) => !walk.used.has(name))
    .sort()

  const members = [...[...walk.used].sort(), ...inline.map((name) => `type ${name}`)]

  return [
    `import { ${members.join(', ')} } from '${source}'`,
    ...declared
      .filter(([module]) => module !== source)
      .map(
        ([module, names]) =>
          `import type { ${[...new Set(names)].sort().join(', ')} } from '${module}'`,
      ),
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

function destructure(spec: ScreenSpec): string {
  return spec.inputs.length === 0 ? '' : `{ ${spec.inputs.map((input) => input.name).join(', ')} }`
}

/* -------------------------------------------------------------------------- */
/* The tree                                                                   */
/* -------------------------------------------------------------------------- */

const pad = (depth: number) => ' '.repeat(depth)

/** What the walk of the tree collects, and how it writes an input. */
interface TsxWalk {
  /** The members the tree names, by owner: what the file imports. */
  used: Set<string>
  dialect: TsxDialect
}

/** A binding as the component reads it: `tickets` in React, `props.tickets` in Solid. */
const read = (path: string, walk: TsxWalk): string =>
  walk.dialect.inputs === 'props' ? `props.${path}` : path

/**
 * One element.
 *
 * `walk.used` collects the imports as a side effect of the walk. This is the only
 * reliable way, because the components a screen needs are exactly those the
 * tree mentions, and a list kept beside the tree would be a second thing to
 * keep in sync. A compound part adds its owner, so `SettingsRow.Group` imports
 * `SettingsRow`.
 *
 * `inJsx` says whether the element sits among another element's children. It
 * decides only how a declared exception's comment is written, because
 * `{/* … *\/}` is a comment only there. At the root of the `return`, or as the
 * value of a prop, the same braces would be an object literal, so a plain
 * comment is used.
 */
function element(node: SpecElement, walk: TsxWalk, depth: number, inJsx: boolean): string {
  const [owner = node.component] = node.component.split('.')
  walk.used.add(owner)

  const props = Object.entries(node.props ?? {})
  const children = node.children ?? []

  const attributes = props.map(
    ([name, value]) => `${pad(depth + 2)}${attribute(name, value, walk, depth + 2)}`,
  )
  const open =
    attributes.length === 0
      ? `<${node.component}`
      : `<${node.component}\n${attributes.join('\n')}\n${pad(depth)}`

  const comment =
    node.exception === undefined ? '' : `${exceptionComment(node.exception, depth, inJsx)}\n`

  if (children.length === 0) {
    return `${comment}${pad(depth)}${open}${attributes.length === 0 ? ' />' : '/>'}`
  }

  const rendered = drawn(children, walk, depth + 2)
  return [
    `${comment}${pad(depth)}${open}${attributes.length === 0 ? '>' : '>'}`,
    rendered,
    `${pad(depth)}</${node.component}>`,
  ].join('\n')
}

/**
 * The declared exception, as a comment placed before the deviation.
 *
 * `pnpm inventory` counts exceptions from the *code* (`Bespoke`,
 * `DensityScope`, `patch`), so the comment does not make the exception
 * declared. It carries the `because` through the emit. A human needs that
 * reason, and it would otherwise be lost once the spec and the file are read
 * separately.
 */
function exceptionComment(
  exception: { rung: number; because: string },
  depth: number,
  inJsx: boolean,
): string {
  const comment = `/* Rung ${exception.rung}, declared: ${inComment(exception.because)} */`
  return `${pad(depth)}${inJsx ? `{${comment}}` : comment}`
}

function attribute(name: string, raw: SpecValue, walk: TsxWalk, depth: number): string {
  // `prop` with no value is `prop={true}` in JSX, and the shorter form is what a
  // hand-written call site would say.
  if (raw === true) return name

  // `title="Inbox"`, not `title={'Inbox'}`. Both are the same JSX, but a person
  // writes the first. Code that looks machine-generated is read as output, not
  // source, and this is source the consumer owns. The expression form is used
  // for anything a double-quoted attribute cannot hold verbatim. JSX attributes
  // have no escape sequences, and they decode character references, so `&amp;`
  // written there is not read back as `&amp;`.
  if (typeof raw === 'string' && !/["\r\n\\]/.test(raw) && !ENTITY.test(raw)) {
    return `${name}="${raw}"`
  }

  return `${name}={${value(raw, walk, depth, false).trim()}}`
}

/**
 * A value, in the position it appears in.
 *
 * `asChild` is the one thing that changes. A string in a prop is a JSX
 * expression (`title={'Inbox'}` → `title="Inbox"`), and a string in the children
 * position is text.
 *
 * A list is handled by its contents. Among children it is just more children.
 * In a prop, a list that holds an element is a fragment (`actions={<>…</>}`),
 * and its items are written as that fragment's children. A list that holds no
 * element is data, and is written as an array: `value={['a', 'b']}`.
 */
function value(raw: SpecValue, walk: TsxWalk, depth: number, asChild: boolean): string {
  if (Array.isArray(raw)) {
    if (asChild) return drawn(raw, walk, depth + 2)

    if (raw.some((item) => !Array.isArray(item) && isElement(item))) {
      return [`<>`, drawn(raw, walk, depth + 2), `${pad(depth)}</>`].join('\n')
    }

    const items = raw.map(
      (item) => `${pad(depth + 2)}${value(item, walk, depth + 2, false).trim()},`,
    )
    return ['[', ...items, `${pad(depth)}]`].join('\n')
  }

  if (isElement(raw)) return element(raw, walk, depth, asChild)

  if (isBinding(raw)) return asChild ? `${pad(depth)}{${read(raw.$, walk)}}` : read(raw.$, walk)

  if (isObjectValue(raw)) {
    const fields = Object.entries(raw.$object).map(
      ([key, item]) =>
        `${pad(depth + 2)}${quoteKey(key)}: ${value(item, walk, depth + 2, false).trim()},`,
    )
    return ['{', ...fields, `${pad(depth)}}`].join('\n')
  }

  if (typeof raw === 'string') return asChild ? `${pad(depth)}${jsxText(raw)}` : quote(raw)
  return asChild ? `${pad(depth)}{${JSON.stringify(raw)}}` : JSON.stringify(raw)
}

/**
 * Children, one to a line.
 *
 * The line break between them matters. JSX reads two lines of text as one text
 * with a space where the break was, so `['Total:', '42']` written as two lines
 * would render "Total: 42" where the spec has two adjacent strings. So a string
 * that follows a string is written as an expression, which is a separate child
 * and adds no space next to its neighbour. A list among children is just more
 * children, so it is flattened.
 */
function drawn(items: SpecValue[], walk: TsxWalk, depth: number): string {
  let afterText = false
  return (items.flat(Infinity as 1) as SpecValue[])
    .map((item) => {
      if (typeof item !== 'string') {
        afterText = false
        return value(item, walk, depth, true)
      }
      const literal = isLiteralText(item) && !afterText
      afterText = literal
      return `${pad(depth)}${literal ? item : `{${quote(item)}}`}`
    })
    .join('\n')
}

/* -------------------------------------------------------------------------- */
/* Spelling                                                                   */
/* -------------------------------------------------------------------------- */

/** `&amp;`, `&#38;`, `&#x26;`: JSX decodes each of these to one character. */
const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i

/**
 * Single quotes, matching the repo. Apostrophes in prose are escaped. Line
 * breaks are escaped too, because a string literal cannot hold one, and an
 * unescaped break would end the literal. A tab is also escaped: it is legal as
 * written, but invisible.
 */
function quote(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `'${escaped}'`
}

/**
 * Whether text can be written between tags unchanged.
 *
 * JSX text is mostly literal. The exceptions are what it reads differently from
 * how it is written: the four characters that start a tag or an expression, a
 * character reference it would decode, and whitespace that it trims and
 * collapses (at either end, in a run, or any kind other than an ordinary
 * space). Words separated by single spaces pass. Anything else goes in an
 * expression container, where a string is exactly its characters, which is
 * also what a person would write.
 */
function isLiteralText(text: string): boolean {
  return /^[^\s<>{}]+( [^\s<>{}]+)*$/.test(text) && !ENTITY.test(text)
}

/**
 * A text value in the children position. See `drawn`, which also knows what
 * came before it.
 */
function jsxText(text: string): string {
  return isLiteralText(text) ? text : `{${quote(text)}}`
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * `__proto__` is the one key an object literal does not treat as a key. Written
 * bare or quoted, it sets the prototype. Computed, it is an ordinary property.
 */
function quoteKey(key: string): string {
  if (key === '__proto__') return `[${quote(key)}]`
  return IDENTIFIER.test(key) ? key : quote(key)
}
