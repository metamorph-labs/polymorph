// The value imports use the pure subpaths, because the browser validates
// documents too. The types come from the root and are erased at compile time.
import {
  DEFAULT_FRAMEWORK,
  shippedParts,
  type Framework,
  type FrameworkStatus,
} from '@polymorph/registry/frameworks'
import {
  DEFAULT_PLATFORM,
  NO_SUBSTITUTE,
  type Platform,
  type PlatformStatus,
} from '@polymorph/registry/platforms'
import { validate as validateShape } from '@polymorph/registry/shape'

import { isActionType } from './action-type'
import {
  BINDING_PATH,
  isBinding,
  isElement,
  isObjectValue,
  SCREEN_SHAPE,
  type ScreenInput,
  type ScreenSpec,
  type SpecElement,
  type SpecValue,
} from './schema'

// Whether a printed type is a callback is read by the emitters and the run-time walk too, from a
// module that holds nothing else.
export { EVENT_HANDLER_ALIAS, isActionType } from './action-type'

/**
 * Checks whether a spec is lawful.
 *
 * There are two passes, and the second matters more.
 *
 * **Shape** checks whether this is a screen spec at all. `SCREEN_SHAPE` decides,
 * and it is the same object published as JSON Schema, so an agent's own
 * validator and this one reach the same result.
 *
 * **Meaning** checks whether this is a screen in *this* system. Does the
 * component exist, and does it render on the screen's platform and in the
 * framework it is emitted for (an option, `SpecOptions`); does every prop
 * exist on it, does the grid have the variant × tone cell, is a declared
 * exception at the right rung with a reason.
 * All of it is read from the registry, and none from a list here. A validator
 * with its own copy of Button's props would be the second source of truth the
 * registry exists to prevent, and it would go stale the first time a prop was
 * renamed.
 *
 * The second pass is why a spec format is useful. A schema alone accepts
 * `{"component": "Buton", "props": {"clasName": "big"}}`, which is well-formed
 * but meaningless. Checked against the registry, both mistakes are faults with
 * a path, before any TSX is written.
 */

export interface SpecFault {
  path: string
  message: string
}

/* -------------------------------------------------------------------------- */
/* What the validator reads of the registry                                   */
/* -------------------------------------------------------------------------- */

/** A prop as the validator reads it: its name, its printed type, and whether it may be left out. */
export interface SpecProp {
  readonly name: string
  readonly type: string
  readonly optional: boolean
}

/** A member's entry on one platform: its status, and for an absent one, why and what instead. */
export interface SpecPlatformEntry {
  readonly status: PlatformStatus
  readonly reason?: string
  readonly substitute?: string
}

/**
 * A member's entry in one web framework: its status, why it is absent, and
 * the files its shell declares there, of which `shippedParts` reads the names.
 */
export interface SpecFrameworkEntry {
  readonly status: FrameworkStatus
  readonly reason?: string
  readonly shell?: { readonly sources: readonly string[] }
}

/** A member as the validator reads it. */
export interface SpecMember {
  readonly name: string
  readonly tier: string
  /** Searched for a correction when a name is unknown (`Modal` finds Dialog's purpose). */
  readonly purpose: string
  /** Its own props, and the props of the parts a native contract carries, named `Part.prop`. */
  readonly props: readonly SpecProp[]
  readonly parts: readonly { readonly name: string; readonly props: readonly SpecProp[] }[]
  readonly grid: Readonly<Record<string, readonly string[]>> | null
  readonly platforms: Readonly<Record<Platform, SpecPlatformEntry>>
  readonly frameworks: Readonly<Record<Framework, SpecFrameworkEntry>>
}

/** An exception primitive as the validator reads it: a member that is a rung of the ladder. */
export interface SpecPrimitive {
  readonly name: string
  readonly rung: number
  readonly props: readonly SpecProp[]
  readonly platforms: Readonly<Record<Platform, SpecPlatformEntry>>
  readonly frameworks: Readonly<Record<Framework, SpecFrameworkEntry>>
}

/**
 * Exactly what `validateSpec` reads of the vocabulary: the members, the
 * exception primitives and the icon roles. The registry is one
 * (`@polymorph/registry`'s `Registry`). The run-time vocabulary table
 * (`@polymorph/screen`), which holds only these fields, is another, so a page
 * checks a document with no registry in it and gets the same faults.
 */
export interface SpecVocabulary {
  readonly components: readonly SpecMember[]
  readonly exceptions: { readonly primitives: readonly SpecPrimitive[] }
  readonly icons: { readonly roles: readonly { readonly name: string }[] }
}

export interface SpecValidation {
  ok: boolean
  faults: SpecFault[]
}

/** Rungs a *screen* can take. 1 is not an exception, and 5 is a promotion, not a node. */
const SPEC_RUNGS = [2, 3, 4]

/**
 * The words a parameter cannot be named.
 *
 * `emit.ts` writes every input name into a binding pattern
 * (`function View({ draft, onSave }: ViewProps)`). So an input named `class`
 * causes a Prettier parse error inside the emitter, and nothing in that error
 * points back at `$.inputs[n]`. The schema cannot express this:
 * `^[a-z][A-Za-z0-9]*$` describes the *shape* of an identifier, and a reserved
 * word has a valid shape.
 *
 * The list comes from the language, not from preference: ECMAScript's reserved
 * words, the words reserved only under strict mode (an emitted module is always
 * strict), and the two names strict mode refuses to bind.
 */
const RESERVED = new Set(
  [
    // Always reserved.
    'break case catch class const continue debugger default delete do else enum export extends',
    'false finally for function if import in instanceof new null return super switch this throw',
    'true try typeof var void while with',
    // Reserved under strict mode and in modules, and an emitted file is a module.
    'await implements interface let package private protected public static yield',
    // Not reserved words, but strict mode still refuses to bind them.
    'arguments eval',
  ].flatMap((line) => line.split(' ')),
)

/** The only keys a rung-3 patch may carry, read from the props it lands on. */
const PATCH_PROP = 'patch'

/**
 * The checks that cannot run everywhere.
 *
 * This module is the half the browser runs, so it has no compiler. Whether an
 * input's `type` is one TypeScript type is a question for the compiler's
 * parser, and a caller that has one passes it in. `lawful.ts` does, and the
 * package's root entry (and so `pnpm emit` and the MCP server) uses
 * `lawful.ts`. Without it, types are left to whoever has a compiler.
 */
export interface SpecJudges {
  /** Why a string is not one TypeScript type, as the end of a sentence, or `null`. */
  inputType?: (type: string) => string | null
  /**
   * Why an input's type has no type on the screen's native platform by the
   * native screen contract's table, as the end of a sentence, or `null`.
   * Asked of an `ios` or `android` screen's inputs whose type `inputType`
   * accepts.
   */
  nativeType?: (input: ScreenInput, spec: ScreenSpec) => string | null
  /**
   * Whether the native platform's member package draws a member or a
   * compound part. A screen that uses one it does not draw would not compile,
   * so each such node is a fault. Left out where the member package is not at
   * hand, as in the browser.
   */
  renders?: (component: string) => boolean
}

/** How a spec is checked, beyond the document itself. */
export interface SpecOptions {
  /**
   * The web framework the screen will be emitted for. A member that
   * framework's vocabulary does not ship is a fault that gives the reason.
   * `react` when absent.
   */
  framework?: Framework
  /**
   * The member package of the screen's native platform (`readNativePackage`
   * in `emit-native.ts`). With it, an `ios` or `android` screen's types are
   * checked against the names the package declares and its members against
   * the ones it draws. The root entry's `validateSpec` (`lawful.ts`) reads
   * it; this module only types it.
   */
  native?: NativePackage
}

/** A platform a native screen emitter writes. */
export type NativePlatform = Exclude<Platform, 'web'>

/**
 * A native platform's member package, as the emitters and the validator read
 * it: the generated contract every member's props are declared in, and the
 * members the package draws.
 */
export interface NativePackage {
  platform: NativePlatform
  /** The text of the generated contract: `Contracts.swift` or `Contracts.kt`. */
  contract: string
  /**
   * What the package draws, by the name a screen calls: `PMButton` on both
   * platforms, and a compound part joined on Android (`PMSettingsRowGroup`).
   */
  rendered: readonly string[]
}

/** What the shape check adds where a value is an object of no form the format has. */
const PLAIN_OBJECT =
  'a binding is `{ "$": "anInput" }`, an element is `{ "component": … }`, and a plain object, ' +
  'such as a column or an option, is written `{ "$object": { … } }`'

export function validateSpec(
  registry: SpecVocabulary,
  document: unknown,
  judges: SpecJudges = {},
  options: SpecOptions = {},
): SpecValidation {
  // This runs before the shape check because of how the shape check would
  // report it. A binding that is not a path fails the schema's pattern, and a
  // value is a union, so the fault would be the union's best guess ("expected a
  // string") for a document whose author wrote an expression where a name goes.
  const expressions = bindingFaults(document, '$')
  if (expressions.length > 0) return { ok: false, faults: expressions }

  const components = new Map<string, SpecMember>(
    registry.components.map((component) => [component.name, component]),
  )
  const primitives = new Map<string, SpecPrimitive>(
    registry.exceptions.primitives.map((primitive) => [primitive.name, primitive]),
  )

  // A prop written beside `props` is a key the schema lacks. The shape check
  // would list the element's four fields. This says what the key is.
  const outside = propsOutsideProps(document, '$', (name) =>
    surfaceOf(name, components, primitives),
  )
  const shapeFaults = validateShape(SCREEN_SHAPE, document).map((message) => {
    const [path = '$', ...rest] = message.split(': ')
    const said = rest.join(': ')
    // The one union in the format is a value, and the object a value is most
    // often miswritten as is a plain one.
    return {
      path,
      message:
        outside.get(path) ??
        (said.startsWith('an object here has ') ? `${said} — ${PLAIN_OBJECT}` : said),
    }
  })
  if (shapeFaults.length > 0) return { ok: false, faults: shapeFaults }

  const spec = document as ScreenSpec
  const platform = spec.platform ?? DEFAULT_PLATFORM
  const framework = options.framework ?? DEFAULT_FRAMEWORK
  const faults: SpecFault[] = []

  // A web framework writes web screens. A phone platform has its own vocabulary.
  if (framework !== DEFAULT_FRAMEWORK && platform !== DEFAULT_PLATFORM) {
    faults.push({
      path: '$.platform',
      message:
        `${/^[aeiou]/.test(framework) ? 'an' : 'a'} ${framework} screen runs on the web, and ` +
        `this one names ${platform} — remove ` +
        '`platform`, or validate it without a framework',
    })
  }
  const inputs = new Set(spec.inputs.map((input) => input.name))
  /** Every identifier the emitted file imports from the vocabulary, by the emitter's rule. */
  const used = new Set<string>()
  /** Every member and compound part the tree composes, by its full name. */
  const composed = new Set<string>()

  checkInputNames(spec, faults)
  checkInputTypes(spec, faults, judges.inputType)
  checkTypeImports(spec, faults)

  /* ---- the walk --------------------------------------------------------- */

  /**
   * `rendered` says whether React draws the value: a child, or an item of a
   * list in a prop that holds an element, which the emitter writes as a
   * fragment. A string, a binding and an element can all be drawn. A
   * structured object cannot, and one in that position would be emitted as a
   * pair of braces that is neither a child nor an expression.
   */
  const walkValue = (value: SpecValue, path: string, rendered: boolean): void => {
    if (Array.isArray(value)) {
      const drawn = rendered || value.some((item) => !Array.isArray(item) && isElement(item))
      value.forEach((item, index) => walkValue(item, `${path}[${index}]`, drawn))
      return
    }
    if (isBinding(value)) {
      // The schema requires a binding to be a path. What remains is whether the
      // path's head is a declared input.
      const [head] = value.$.split('.')
      if (head === undefined || !inputs.has(head)) {
        faults.push({
          path,
          message: `\`${value.$}\` binds to "${head}", which the screen does not declare as an input`,
        })
      }
      return
    }
    if (isObjectValue(value)) {
      if (rendered) {
        faults.push({
          path,
          message:
            'a structured object is data, and this is a place where things are drawn — a child, ' +
            'or a list that holds an element. Pass it to the prop that takes it',
        })
        return
      }
      // A structured prop can also hold an icon role. `emptyState` takes one, as
      // a string in an object, not as a prop on a component. The closed role
      // set must be enforced in both positions, or it is not closed.
      checkIcons(registry, value.$object, path, faults)
      for (const [key, item] of Object.entries(value.$object)) {
        walkValue(item, `${path}.${key}`, false)
      }
      return
    }
    if (isElement(value)) walkElement(value, path)
  }

  const walkElement = (element: SpecElement, path: string): void => {
    const props = element.props ?? {}
    const known = withNativeProps(
      surfaceOf(element.component, components, primitives),
      element.component,
      platform,
    )
    // Same as the emitter: a compound part adds its owner, whether or not the
    // registry knows the name.
    used.add(element.component.split('.')[0] ?? element.component)
    composed.add(element.component)

    if (known === null) {
      faults.push({
        path,
        message:
          `no component called \`${element.component}\`` +
          (partsOfOwner(element.component, components, platform, framework) ??
            nearest(registry, element.component, components, primitives)),
      })
    } else {
      checkPlatform(element, known, platform, path, faults)
      checkFramework(element, known, framework, path, faults)
      const absent = partFault(element.component, known, platform, framework)
      if (absent !== null) faults.push({ path, message: absent })

      /*
       * The prop check is the style law. `className`, `style` and `css` are
       * absent from every governed component's public surface by design, so
       * they fail here as "no such prop", the same fault a typo gets. Nothing
       * in this file names them, so the law is not a denylist someone has to
       * maintain.
       */
      for (const name of Object.keys(props)) {
        if (!known.props.has(name)) {
          faults.push({
            path: `${path}.props.${name}`,
            message: `\`${element.component}\` has no prop \`${name}\`${suggestProp(name, known.props)}`,
          })
        }
      }

      /*
       * The value check. Checking names alone accepts `label: 42` and
       * `size: "xxl"`, and an agent's most likely mistake is a value, not a
       * name. The registry's printed types decide, and only what they can decide
       * is checked. Literal unions and scalar primitives fault on a mismatch. A
       * type with a member that cannot be checked (`ReactNode`, functions,
       * object shapes) accepts the value, because a validator that guesses is
       * worse than one that abstains.
       */
      for (const [name, value] of Object.entries(props)) {
        const declared = known.types.get(name)
        if (!declared) continue
        const fault = valueFault(declared.type, value)
        if (fault !== null) {
          faults.push({
            path: `${path}.props.${name}`,
            message: `\`${element.component}\` prop \`${name}\` wants \`${declared.type}\`, got ${fault}`,
          })
        }
      }

      // A required prop the emitter cannot default breaks the screen at emit
      // time. Validation reports it earlier, which is its purpose.
      for (const [name, declared] of known.types) {
        if (declared.optional || name === 'children') continue
        if (name in props) continue
        faults.push({
          path,
          message: `\`${element.component}\` is missing its required prop \`${name}\``,
        })
      }

      // The grid is the member's. A part has no variant × tone cell of its own.
      if (known.component && known.part === undefined) {
        checkGrid(known.component, props, path, faults)
      }
      checkIcons(registry, props, path, faults)
      if (element.children !== undefined && !known.props.has('children')) {
        faults.push({ path, message: `\`${element.component}\` takes no children` })
      }
    }

    checkException(element, known, path, faults)

    for (const [name, value] of Object.entries(props)) {
      walkValue(value, `${path}.props.${name}`, false)
    }
    ;(element.children ?? []).forEach((child, index) =>
      walkValue(child, `${path}.children[${index}]`, true),
    )
  }

  walkElement(spec.root, '$.root')
  checkScreenName(spec, screenImports(used, composed, framework), faults)
  if (isNativePlatform(platform)) {
    checkNativeScreen(spec, platform, components, primitives, faults, judges)
  }
  return { ok: faults.length === 0, faults }
}

/* -------------------------------------------------------------------------- */
/* The identifiers the emitted file will hold                                 */
/* -------------------------------------------------------------------------- */

/**
 * Input names, checked as the emitted *parameter list*, not as strings.
 *
 * There are two faults about the same names. A reserved word cannot be a
 * binding at all. Two inputs with one name become one entry in the props
 * interface and two identifiers in the destructuring, which is `TS2300` from a
 * generated file about a document that validated cleanly. The names are
 * checked in order and each repeat is reported where it appears, so the path
 * names the *second* `onSave`, not the first.
 */
function checkInputNames(spec: ScreenSpec, faults: SpecFault[]): void {
  const seen = new Set<string>()
  spec.inputs.forEach((input, index) => {
    const path = `$.inputs[${index}].name`
    if (RESERVED.has(input.name)) {
      faults.push({
        path,
        message:
          `\`${input.name}\` is a word the language has taken — the emitted component ` +
          'destructures its inputs, and no parameter can be called that',
      })
    }
    if (seen.has(input.name)) {
      faults.push({
        path,
        message:
          `\`${input.name}\` is declared twice — the props interface would hold one field and ` +
          'the destructuring two identifiers of the same name',
      })
    }
    seen.add(input.name)
  })
}

/** `a`, `a and b`, `a, b and c`. */
function listed(items: string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`
}

/** Long enough to recognise what was written, short enough to stay one line of a fault. */
function abbreviated(text: string): string {
  const flat = text.replace(/\s+/g, ' ')
  return flat.length <= 60 ? flat : `${flat.slice(0, 57)}…`
}

/**
 * Every binding in a document that is not a path, found before any other
 * check.
 *
 * A binding is the one value the emitter prints as code. If a binding were
 * checked only on its first segment, `items.map((item) => <button …>)` would
 * pass, because its head is a valid input. That would add an expression
 * language to the format, and give a spec one place to write a raw element or
 * a style. The schema's pattern forbids it. This walk reports it in words, at
 * the node, to the author.
 *
 * It reads plain JSON, not a spec, because it runs before the document is known
 * to be one.
 */
function bindingFaults(value: unknown, path: string): SpecFault[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => bindingFaults(item, `${path}[${index}]`))
  }
  if (typeof value !== 'object' || value === null) return []

  const record = value as Record<string, unknown>
  const binding = record['$']
  if (typeof binding === 'string' && !BINDING_PATH.test(binding)) {
    return [
      {
        path,
        message:
          `\`${abbreviated(binding)}\` is not a binding — a binding names an input and, with ` +
          'dots, a path into it (`draft.subject`). It cannot hold an expression: a call, an ' +
          'index, a condition or an element is computed by the container that renders this ' +
          'screen, and handed in as an input',
      },
    ]
  }

  return Object.entries(record).flatMap(([key, item]) => bindingFaults(item, `${path}.${key}`))
}

/** The fields of an element, as `ELEMENT` in the schema lists them. */
const ELEMENT_FIELDS = new Set(['component', 'props', 'children', 'exception'])

/**
 * Every prop written as a field of its element, beside `props`, by the path
 * the shape check reports it at, with what to say there.
 *
 * `{"component": "AuthPage", "props": {…}, "cardFooter": …}` closes `props` one
 * prop early. The key is a prop the member has, so the fault can name the slip
 * where the shape check knows only that an element has no such field.
 *
 * It reads plain JSON, not a spec, because it runs before the document is known
 * to be one.
 */
function propsOutsideProps(
  value: unknown,
  path: string,
  surface: (name: string) => Surface | null,
  found = new Map<string, string>(),
): Map<string, string> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => propsOutsideProps(item, `${path}[${index}]`, surface, found))
    return found
  }
  if (typeof value !== 'object' || value === null) return found

  const record = value as Record<string, unknown>
  const name = record['component']
  const props = typeof name === 'string' ? surface(name)?.props : undefined
  for (const [key, item] of Object.entries(record)) {
    if (props?.has(key) === true && !ELEMENT_FIELDS.has(key)) {
      const member = abbreviated(String(name))
      found.set(
        `${path}.${key}`,
        `\`${key}\` is a prop of \`${member}\`, written here as a field of the element — a prop ` +
          `goes inside \`props\`: \`{ "component": "${member}", "props": { "${key}": … } }\``,
      )
    }
    propsOutsideProps(item, `${path}.${key}`, surface, found)
  }
  return found
}

/**
 * An input's type, passed to the check that understands types.
 *
 * The format has no model of TypeScript, and `tsc` decides whether `Ticket[]`
 * means anything. But the emitter prints the type into the middle of an
 * interface, so before that it must be exactly one type that stays where it
 * was put. That is the compiler's question. This module runs in the browser
 * and has no compiler, so a caller that has one supplies the check
 * (`SpecJudges`).
 */
function checkInputTypes(
  spec: ScreenSpec,
  faults: SpecFault[],
  judge: SpecJudges['inputType'],
): void {
  if (judge === undefined) return
  spec.inputs.forEach((input, index) => {
    const fault = judge(input.type)
    if (fault === null) return
    faults.push({
      path: `$.inputs[${index}].type`,
      message:
        `\`${abbreviated(input.type)}\` ${fault} — an input's type is one TypeScript type, ` +
        'written into the props interface as it stands',
    })
  })
}

/** A name the emitted file can import: an identifier, and nothing around it. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** A module specifier, as it sits between the quotes of an import. */
const MODULE = /^[^\s'"`\\]+$/

/** What a `types` entry written as a default or a namespace import is told. */
const NO_NAMESPACE =
  'A spec has no default or namespace import: name the type itself (`ReactNode`), and write ' +
  'it in the input’s type without the namespace (`ReactNode`, not `React.ReactNode`)'

/**
 * The `types` block, checked as the import lines it becomes.
 *
 * `import type { Ticket } from './types'` is built from a key and a list of
 * names, and both are printed verbatim. A name that is not an identifier, or a
 * module that contains a quote, adds a second statement to that line.
 */
function checkTypeImports(spec: ScreenSpec, faults: SpecFault[]): void {
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    if (!MODULE.test(module)) {
      faults.push({
        path: `$.types.${abbreviated(module)}`,
        message:
          'is not a module specifier — it is written between the quotes of an import, so it ' +
          'holds no quote, backslash or space',
      })
    }
    names.forEach((name, index) => {
      // A reserved word has the shape of a name and cannot be imported as one.
      if (IDENTIFIER.test(name) && !RESERVED.has(name)) return
      faults.push({
        path: `$.types.${abbreviated(module)}[${index}]`,
        message:
          `\`${abbreviated(name)}\` is not a type name — an import names identifiers` +
          (/\bas\b|\*/.test(name) ? `. ${NO_NAMESPACE}` : ''),
      })
    })
  }
}

/** `SettingsRowGroup` for `SettingsRow.Group`: the class an Angular member or part is exported as. */
export const angularClassName = (component: string): string => component.replace('.', '')

/** What an emitted Angular screen imports from `@angular/core`. */
const ANGULAR_CORE_IMPORTS = ['Component', 'input']

/**
 * The identifiers the emitted file imports, beside the types, each with where
 * it comes from. Every emitter imports the members by the React emitter's
 * rule (`used`: a compound part adds its owner). An Angular screen also
 * imports `Component` and `input` from Angular, and each member and part by
 * its class (`TabsContent` for `Tabs.Content`).
 */
function screenImports(
  used: Set<string>,
  composed: Set<string>,
  framework: Framework,
): Map<string, string> {
  const imports = new Map<string, string>()
  for (const member of used) imports.set(member, 'a member this screen composes')
  if (framework !== 'angular') return imports
  for (const name of ANGULAR_CORE_IMPORTS) imports.set(name, 'a name from `@angular/core`')
  for (const component of composed) {
    imports.set(angularClassName(component), 'a member or part this screen composes')
  }
  return imports
}

/**
 * The screen's own name, checked against the names the emitted file already
 * has.
 *
 * The emitter writes two identifiers of its own, `Screen` and `ScreenProps`,
 * into a file that already imports every member the tree composes and every
 * type the `types` block declares. A collision is not a harmless shadowed
 * variable. `{"name": "Stack"}` on a tree containing a Stack emits a component
 * that renders itself until the call stack overflows. That happens at runtime,
 * in the consumer's app, from a document that passed every other law here. In
 * an Angular module the same collision is a duplicate identifier, and the
 * module does not compile.
 */
function checkScreenName(
  spec: ScreenSpec,
  imports: Map<string, string>,
  faults: SpecFault[],
): void {
  const taken = new Map(imports)
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    for (const name of names) taken.set(name, `a type it imports from \`${module}\``)
  }

  for (const written of [spec.name, `${spec.name}Props`]) {
    const origin = taken.get(written)
    if (origin === undefined) continue
    faults.push({
      path: '$.name',
      message:
        `the emitted file would both declare \`${written}\` and import it as ${origin} — ` +
        'the declaration shadows the import, so name the screen something the file does not ' +
        'already hold',
    })
  }
}

/* -------------------------------------------------------------------------- */
/* The native screen contract                                                 */
/* -------------------------------------------------------------------------- */

/** Whether a platform is one a native screen emitter writes, held to the native screen contract. */
export const isNativePlatform = (platform: Platform): platform is NativePlatform =>
  platform === 'ios' || platform === 'android'

/** The language each native platform's screen is written in, for a fault. */
const LANGUAGE: Readonly<Record<NativePlatform, string>> = { ios: 'Swift', android: 'Kotlin' }

/** The toolkit each native platform's members are drawn with, for a fault. */
const TOOLKIT: Readonly<Record<NativePlatform, string>> = { ios: 'SwiftUI', android: 'Compose' }

/** Where each native platform lists the members it does not draw yet. */
const PENDING_LIST: Readonly<Record<NativePlatform, string>> = {
  ios: 'packages/native/src/pending.ts',
  android: 'packages/native/src/kotlin-pending.ts',
}

/** The page archetype that frames an app's router rather than being a screen. */
const FRAME = 'AppShell'

/** The tier of the page archetypes, which own the four load states on a native platform. */
const ARCHETYPES = 'archetypes'

/** A page archetype's web state props, which `loadStatus` sets on a native platform. */
const STATUS_OWNED = ['empty', 'pending']

/**
 * The action every page archetype takes on a native platform beside the
 * registry's props: loading again after it failed.
 */
const RETRY: SpecProp = { name: 'onRetry', type: '(() => void) | undefined', optional: true }

/**
 * Words Swift has taken, which an input of an `ios` screen cannot be named,
 * because each input is a field of the model or the actions. `async` and
 * `await` are contextual, and taken too: the emitter's law reads them in the
 * file as asynchronous calls.
 */
export const SWIFT_KEYWORDS = new Set(
  [
    'Any Self Type as associatedtype async await break case catch class continue default defer',
    'deinit do else enum extension fallthrough false fileprivate for func guard if import in init',
    'inout internal is let nil operator private protocol public repeat rethrows return self static',
    'struct subscript super switch throw throws true try typealias var where while',
  ].flatMap((line) => line.split(' ')),
)

/**
 * Kotlin's hard keywords, which no property or function can be named
 * unescaped. An input of an `android` screen cannot take one, nor a name of
 * `Any`'s three functions, which every action interface already has.
 */
export const KOTLIN_KEYWORDS = new Set(
  [
    'as break class continue do else false for fun if in interface is null object package return',
    'super this throw true try typealias typeof val var when while',
  ].flatMap((line) => line.split(' ')),
)
const KOTLIN_TAKEN = new Set([...KOTLIN_KEYWORDS, 'equals', 'hashCode', 'toString'])

/** `InboxView` and `InboxScreen` → `Inbox`; a name with neither suffix is used whole. */
export function screenStem(name: string): string {
  return name.replace(/(View|Screen)$/, '')
}

/**
 * The names a native screen's file declares: the model, the actions and the
 * view on iOS; on Android also the inert actions, an object.
 */
export function nativeDeclarations(platform: NativePlatform, name: string): string[] {
  const stem = screenStem(name)
  return platform === 'ios'
    ? [`${stem}Model`, `${stem}Actions`, `${stem}View`]
    : [`${stem}Model`, `${stem}Actions`, `${stem}Screen`, `${stem}Inert`]
}

/**
 * Names the emitted file already uses from its platform, which a declaration
 * would shadow: every SwiftUI body draws through `AnyView` and `EmptyView`.
 */
const PLATFORM_NAMES: Readonly<Record<NativePlatform, ReadonlySet<string>>> = {
  ios: new Set(['AnyView', 'EmptyView', 'Group', 'Text', 'View']),
  android: new Set(['Composable', 'Text']),
}

/** A page archetype that owns the four load states: every archetype but the app's frame. */
const ownsLoadStatus = (component: SpecMember | undefined) =>
  component !== undefined && component.tier === ARCHETYPES && component.name !== FRAME

/**
 * A member's props on the platform: on a natively emitted platform, a page
 * archetype also takes `onRetry`, which the native contract adds.
 */
function withNativeProps(
  known: Surface | null,
  component: string,
  platform: Platform,
): Surface | null {
  if (known === null || !isNativePlatform(platform)) return known
  if (!ownsLoadStatus(known.component) || component !== known.component?.name) return known
  if (known.props.has(RETRY.name)) return known
  const types = new Map(known.types)
  types.set(RETRY.name, RETRY)
  return { ...known, props: new Set(types.keys()), types }
}

/**
 * The native screen contract's faults (`design/native/screen-contract.md`),
 * each at the input or node it concerns, with what to do instead. One rule
 * holds on both native platforms; where its words differ, the platform's
 * language supplies them.
 *
 * - `loadStatus` is the model's first field, so no input takes the name, and
 *   no input takes a word the platform's language has taken.
 * - Every input's type maps by the contract's table (`judges.nativeType`,
 *   which needs the TypeScript parser and is left out where there is none).
 * - The root is a page archetype other than `AppShell`, because the archetype
 *   draws the four load states.
 * - Every member the screen uses is one the platform's member package draws
 *   (`judges.renders`, left out where the package is not at hand), because
 *   the emitted file calls each and would not compile otherwise.
 * - A page archetype's `empty` and `pending` are unbound: the status sets them.
 * - A prop the registry types as a function is an event and is bound to an
 *   action; any other prop, and every child, holds model data; no binding is a
 *   path into an action, which has no fields.
 * - A grid member's `variant` and `tone` are one lawful cell on a native
 *   platform, so they are literals and name one cell between them.
 * - A member whose children the registry types `string` takes one text.
 * - The file's declarations are not names `types` already gives it, nor a
 *   name the file uses from its platform.
 */
function checkNativeScreen(
  spec: ScreenSpec,
  platform: NativePlatform,
  components: Map<string, SpecMember>,
  primitives: Map<string, SpecPrimitive>,
  faults: SpecFault[],
  judges: SpecJudges,
): void {
  const language = LANGUAGE[platform]
  const taken = platform === 'ios' ? SWIFT_KEYWORDS : KOTLIN_TAKEN
  const actions = new Set(
    spec.inputs.filter((input) => isActionType(input.type)).map((input) => input.name),
  )

  spec.inputs.forEach((input, index) => {
    const path = `$.inputs[${index}]`
    if (input.name === 'loadStatus') {
      faults.push({
        path: `${path}.name`,
        message:
          '`loadStatus` is the model’s first field, which the root archetype draws the four load ' +
          'states from — name the input something else, and set the status in the app’s store',
      })
    } else if (taken.has(input.name)) {
      faults.push({
        path: `${path}.name`,
        message: `\`${input.name}\` is a word ${language} has taken — every input is a field of the model or the actions, and no field can be called that`,
      })
    }
    // A type that is not one TypeScript type has its fault already.
    const unparsed = judges.inputType === undefined ? null : judges.inputType(input.type)
    if (judges.nativeType === undefined || unparsed !== null) return
    const fault = judges.nativeType(input, spec)
    if (fault !== null) {
      faults.push({ path: `${path}.type`, message: `\`${abbreviated(input.type)}\` ${fault}` })
    }
  })

  const root = components.get(spec.root.component)
  if (!ownsLoadStatus(root)) {
    faults.push({
      path: '$.root',
      message:
        `a native screen’s root is a page archetype that draws the four load states, and ` +
        `\`${spec.root.component}\` is not one — use ListPage, DetailPage, FormPage, Dashboard, ` +
        'SettingsPage, MasterDetailPage, SearchPage, ConversationPage or AuthPage' +
        (spec.root.component === FRAME ? '; AppShell is the app’s frame around its router' : ''),
    })
  }

  /** Every binding in a value that is a path into an action. */
  const intoActions = (value: SpecValue, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => intoActions(item, `${path}[${index}]`))
    } else if (isBinding(value)) {
      const [head = value.$, ...rest] = value.$.split('.')
      if (rest.length > 0 && actions.has(head)) {
        faults.push({
          path,
          message: `\`${value.$}\` is a path into the action \`${head}\`, and an action has no fields — bind \`${head}\` itself, or a model input`,
        })
      }
    } else if (isObjectValue(value)) {
      for (const [key, item] of Object.entries(value.$object)) intoActions(item, `${path}.${key}`)
    } else if (isElement(value)) {
      walk(value, path)
    }
  }

  const walk = (element: SpecElement, path: string): void => {
    const surface = withNativeProps(
      surfaceOf(element.component, components, primitives),
      element.component,
      platform,
    )
    const component = surface?.component
    const isOwner = component !== undefined && element.component === component.name
    const props = element.props ?? {}

    // A member the registry does not know has its fault already, and so has a
    // part the platform does not carry.
    if (
      surface !== null &&
      partFault(element.component, surface, platform, DEFAULT_FRAMEWORK) === null &&
      judges.renders !== undefined &&
      !judges.renders(element.component)
    ) {
      faults.push({
        path,
        message:
          `\`${element.component}\` has no ${TOOLKIT[platform]} rendering yet ` +
          `(\`${PENDING_LIST[platform]}\`), so a screen for ${platform} that uses it would not ` +
          'compile — leave it out until it is drawn, or compose the screen from members that are',
      })
    }

    for (const [name, value] of Object.entries(props)) {
      const at = `${path}.props.${name}`
      intoActions(value, at)
      if (isOwner && ownsLoadStatus(component) && STATUS_OWNED.includes(name)) {
        faults.push({
          path: at,
          message: `\`${element.component}\`’s \`${name}\` is set from \`loadStatus\` on a native screen — remove it, and set the model’s \`loadStatus\` in the app’s store`,
        })
        continue
      }
      const declaredType = surface?.types.get(name)?.type
      if (declaredType === undefined) continue
      if (isActionType(declaredType)) {
        if (!isBinding(value)) {
          faults.push({
            path: at,
            message: `\`${name}\` is an event, and an event is handed an action — bind it to a function-typed input`,
          })
        } else if (!actions.has(value.$.split('.')[0] ?? value.$)) {
          faults.push({
            path: at,
            message: `\`${name}\` is an event, and \`${value.$}\` is model data — bind it to a function-typed input, an action`,
          })
        }
      } else if (isBinding(value) && actions.has(value.$)) {
        faults.push({
          path: at,
          message: `\`${name}\` holds data, and \`${value.$}\` is an action — bind it to a model input`,
        })
      }
    }

    if (isOwner && component.grid !== null) checkCell(component, props, path, faults)

    const children = element.children ?? []
    children.forEach((child, index) => {
      const at = `${path}.children[${index}]`
      if (isBinding(child) && actions.has(child.$)) {
        faults.push({
          path: at,
          message: `a child is drawn, and \`${child.$}\` is an action — bind a model input`,
        })
      }
      intoActions(child, at)
    })
    const childrenType = surface?.types.get('children')?.type
    const texts = (children.flat(Infinity as 1) as SpecValue[]).filter((child) => child !== null)
    if (
      childrenType !== undefined &&
      /^string( \| undefined)?$/.test(childrenType) &&
      texts.length > 1
    ) {
      faults.push({
        path: `${path}.children`,
        message: `\`${element.component}\` takes its children as one text on a native screen, and this has ${texts.length} — join them in the app’s store and bind one input`,
      })
    }
  }
  walk(spec.root, '$.root')

  const declaredTypes = new Map<string, string>()
  for (const [module, names] of Object.entries(spec.types ?? {})) {
    for (const name of names) declaredTypes.set(name, module)
  }
  const stem = screenStem(spec.name)
  const written = nativeDeclarations(platform, spec.name)
  if (stem === '') {
    faults.push({
      path: '$.name',
      message: `\`${spec.name}\` leaves no name once its suffix is gone, and the file declares ${listed(written.map((name) => `\`<Name>${name}\``))} — name the screen for what it shows`,
    })
    return
  }
  for (const name of written) {
    const module = declaredTypes.get(name)
    if (module !== undefined) {
      faults.push({
        path: '$.name',
        message: `the emitted file declares \`${name}\`, which \`types\` also names from \`${module}\` — name the screen something else`,
      })
    }
    if (PLATFORM_NAMES[platform].has(name)) {
      faults.push({
        path: '$.name',
        message: `the emitted file declares \`${name}\`, which it also uses from ${TOOLKIT[platform]} — name the screen something else`,
      })
    }
  }
}

/**
 * A grid member's `variant` and `tone` on a native platform: one lawful cell,
 * written as literals, that the two name between them. Given alone, a half
 * must pair with one tone or variant only.
 */
function checkCell(
  component: SpecMember,
  props: Record<string, SpecValue>,
  path: string,
  faults: SpecFault[],
): void {
  const grid = component.grid as Readonly<Record<string, readonly string[]>>
  const variant = props['variant']
  const tone = props['tone']
  for (const [name, value] of [
    ['variant', variant],
    ['tone', tone],
  ] as const) {
    if (value !== undefined && typeof value !== 'string') {
      faults.push({
        path: `${path}.props.${name}`,
        message: `\`${component.name}\`’s variant and tone are one lawful cell on a native screen, chosen in the spec — write \`${name}\` as a literal`,
      })
      return
    }
  }
  if ((variant === undefined) === (tone === undefined)) return
  const cells = Object.entries(grid).flatMap(([cellVariant, tones]) =>
    tones.map((cellTone) => ({ variant: cellVariant, tone: cellTone })),
  )
  const matches = cells.filter((cell) =>
    variant === undefined ? cell.tone === tone : cell.variant === variant,
  )
  if (matches.length <= 1) return
  const [given, missing] = variant === undefined ? ['tone', 'variant'] : ['variant', 'tone']
  faults.push({
    path: `${path}.props.${given}`,
    message: `\`${component.name}\`’s variant and tone are one lawful cell on a native screen, and \`${String(variant ?? tone)}\` pairs with ${matches.map((cell) => `\`${variant === undefined ? cell.variant : cell.tone}\``).join(', ')} — give \`${missing}\` too`,
  })
}

/* -------------------------------------------------------------------------- */
/* What a name resolves to                                                    */
/* -------------------------------------------------------------------------- */

interface Surface {
  props: Set<string>
  /** The full prop records by name: the types the values are checked against. */
  types: Map<string, SpecProp>
  /** Present for a vocabulary member; absent for an exception primitive. */
  component?: SpecMember
  primitive?: SpecPrimitive
  /** Present for a compound part: its name in its member (`Panel` for `Dashboard.Panel`). */
  part?: string
}

/** A member's own props by name. A part's props, which `props` lists with the part's name, are left out. */
function typesOf(props: readonly SpecProp[]): Map<string, SpecProp> {
  const map = new Map<string, SpecProp>()
  for (const prop of props) {
    if (!prop.name.includes('.')) map.set(prop.name, prop)
  }
  return map
}

/**
 * A component name, a compound part, or an exception primitive.
 *
 * A compound part is `SettingsRow.Group`, `Table.Row` or `Dashboard.Panel`:
 * a part the member's export carries, which the registry lists in `parts`
 * with the props its function takes. Whether the screen's framework or
 * platform carries the part is a second question, which `partFault` answers,
 * so a part React has is never reported as a name nobody knows.
 */
function surfaceOf(
  name: string,
  components: Map<string, SpecMember>,
  primitives: Map<string, SpecPrimitive>,
): Surface | null {
  const primitive = primitives.get(name)
  if (primitive) {
    const types = typesOf(primitive.props)
    return { props: new Set(types.keys()), types, primitive }
  }

  const direct = components.get(name)
  if (direct) {
    const types = typesOf(direct.props)
    return { props: new Set(types.keys()), types, component: direct }
  }

  // Exactly two segments. The name is printed as the element's tag, so anything
  // after a second dot would be unchecked text in a code position.
  const segments = name.split('.')
  const [owner, part] = segments
  const compound = owner === undefined ? undefined : components.get(owner)
  if (segments.length !== 2 || compound === undefined || part === undefined) return null

  const found = compound.parts.find((candidate) => candidate.name === part)
  if (found === undefined) return null
  const types = new Map(found.props.map((prop) => [prop.name, prop]))
  return { props: new Set(types.keys()), types, component: compound, part }
}

/**
 * The parts of a member a screen may compose where it is drawn: the ones the
 * framework or platform carries and the registry records the props of. The
 * registry reads a part's props from the React member, so a part only another
 * framework has (`Toast.Viewport`) has no record, and a spec cannot be checked
 * against it.
 */
function composableParts(
  component: SpecMember,
  platform: Platform,
  framework: Framework,
): string[] {
  const recorded = new Set(component.parts.map((part) => part.name))
  return shippedParts(component, platform, framework)
    .map((part) => part.name)
    .filter((name) => recorded.has(name))
}

/** `Table.Row`, `Table.Cell`: the parts of a member a screen may name, as a fault lists them. */
function partNames(component: SpecMember, platform: Platform, framework: Framework): string {
  const names = composableParts(component, platform, framework).map(
    (part) => `\`${component.name}.${part}\``,
  )
  return names.length === 0
    ? `\`${component.name}\` has no parts`
    : `\`${component.name}\`’s parts are ${names.join(', ')}`
}

/**
 * A compound part the screen's framework or platform does not carry, as the
 * fault's message, or `null`.
 *
 * The system card lists a member's parts by the same rule (`shippedParts`).
 * React carries every part. A generated vocabulary carries the parts its
 * shell's files declare. A native platform carries the parts its contract
 * declares, so a screen that named another would not compile. The fault lists
 * the parts the member has there, because a bare refusal leaves the author to
 * guess the next name.
 */
function partFault(
  name: string,
  known: Surface,
  platform: Platform,
  framework: Framework,
): string | null {
  const { component, part } = known
  if (component === undefined || part === undefined) return null
  if (composableParts(component, platform, framework).includes(part)) return null
  const where = platform === DEFAULT_PLATFORM ? `in ${framework}` : `on ${platform}`
  return `\`${name}\` is not a part ${where} — ${partNames(component, platform, framework)} there`
}

/**
 * What to say of a name that is a known member and a part it does not have:
 * the parts it does have. `null` when the name is not that.
 */
function partsOfOwner(
  name: string,
  components: Map<string, SpecMember>,
  platform: Platform,
  framework: Framework,
): string | null {
  const segments = name.split('.')
  const [owner, part] = segments
  const component = owner === undefined ? undefined : components.get(owner)
  if (segments.length !== 2 || component === undefined) return null
  if (shippedParts(component, platform, framework).some((shipped) => shipped.name === part)) {
    return (
      ` — it is a part in ${framework} whose props the registry does not record, so a spec ` +
      'cannot compose it'
    )
  }
  return ` — ${partNames(component, platform, framework)}`
}

/* -------------------------------------------------------------------------- */
/* The platform                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A member with no rendering on the screen's platform.
 *
 * The registry carries each member's entry on each platform, and an `absent`
 * entry names what to use instead. The fault names that substitute and gives
 * the entry's reason, because a fault that only said no would leave the author
 * to guess, and a guess is how a hand-built component starts. An `adapted`
 * member is lawful: it renders, only differently.
 *
 * A compound part answers through its owner, and only the owner is reported.
 * `Table.Row` sits inside a Table, so reporting every row of an absent Table
 * would repeat one fault once per row.
 */
function checkPlatform(
  element: SpecElement,
  known: Surface,
  platform: Platform,
  path: string,
  faults: SpecFault[],
): void {
  const owner = known.component ?? known.primitive
  if (owner === undefined || element.component !== owner.name) return

  const entry = owner.platforms[platform]
  if (entry.status !== 'absent') return

  const substitute = entry.substitute
  const instead =
    substitute === undefined || substitute === NO_SUBSTITUTE
      ? 'it has no substitute, so leave it out'
      : `use \`${substitute}\` instead`
  faults.push({
    path,
    message:
      `\`${owner.name}\` is absent on ${platform} — ${instead}` +
      (entry.reason === undefined ? '' : `. ${entry.reason}`),
  })
}

/**
 * A member the framework's vocabulary does not ship.
 *
 * The registry carries each member's entry in each web framework, and an
 * `absent` one says why. The fault gives that reason, so an author knows
 * whether to wait for a shell or compose something the framework has. As on a
 * platform, a compound part answers through its owner, once.
 */
function checkFramework(
  element: SpecElement,
  known: Surface,
  framework: Framework,
  path: string,
  faults: SpecFault[],
): void {
  const owner = known.component ?? known.primitive
  if (owner === undefined || element.component !== owner.name) return

  const entry = owner.frameworks[framework]
  if (entry.status !== 'absent') return
  faults.push({
    path,
    message:
      `\`${owner.name}\` is absent in ${framework}` +
      (entry.reason === undefined ? '' : ` — ${entry.reason}`),
  })
}

/* -------------------------------------------------------------------------- */
/* Values against printed types                                               */
/* -------------------------------------------------------------------------- */

/**
 * `null` when the value satisfies the printed type, or when the type is beyond
 * what a JSON validator can check. Otherwise the value, printed for the fault.
 *
 * Checkable parts: `string`/`number`/`boolean`, `null`, `true`/`false`, quoted
 * and numeric literals, and arrays of any of those. A structural print (parens,
 * braces, an arrow) or an unrecognised name (`ReactNode`) makes the whole union
 * uncheckable, so the value passes. Bindings, `$object`s and nested elements are
 * runtime shapes and pass through unchecked.
 *
 * **`null` is a value, not an absence.** If it were treated as a non-array
 * object, it would take the uncheckable-structure exit before the printed type
 * was consulted. Then `label: null` would validate against `string` on every
 * component in the vocabulary, and the emitted screen would render a Button
 * with no name. It is a scalar like any other, and it matches exactly one part:
 * `null`. `undefined` stays filtered out, because absence is the optional
 * flag's concern and the required-prop check above handles it. An explicit
 * `null` in a JSON document is something the author wrote.
 */
function valueFault(printed: string, value: SpecValue): string | null {
  const scalar =
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  if (!scalar) {
    if (!Array.isArray(value)) return null
    if (!value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) return null
  }
  if (/[(){}=>]/.test(printed)) return null

  const parts = printed
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== 'undefined')

  let checkable = 0
  for (const part of parts) {
    const arrayForm = /^(readonly\s+)?(.+)\[\]$/.exec(part)
    const element = arrayForm ? (arrayForm[2] as string) : null
    if (element !== null) {
      if (!partIsCheckable(element)) return null
      checkable += 1
      if (Array.isArray(value) && value.every((item) => scalarMatches(element, item))) return null
      continue
    }
    if (!partIsCheckable(part)) return null
    checkable += 1
    if (!Array.isArray(value) && scalarMatches(part, value)) {
      return null
    }
  }

  return checkable === 0 ? null : JSON.stringify(value)
}

function partIsCheckable(part: string): boolean {
  // `null` must be checkable. Otherwise a printed `string | null` could not check
  // its second part and would skip the *whole* union, which would open a wider
  // gap: `value: 42` on a nullable prop would pass.
  if (['string', 'number', 'boolean', 'null', 'true', 'false'].includes(part)) return true
  if (/^["'].*["']$/.test(part)) return true
  if (/^-?\d+(\.\d+)?$/.test(part)) return true
  return false
}

function scalarMatches(part: string, value: unknown): boolean {
  if (part === 'string') return typeof value === 'string'
  if (part === 'number') return typeof value === 'number'
  if (part === 'boolean') return typeof value === 'boolean'
  if (part === 'null') return value === null
  if (part === 'true') return value === true
  if (part === 'false') return value === false
  const quoted = /^["'](.*)["']$/.exec(part)
  if (quoted) return value === quoted[1]
  if (/^-?\d+(\.\d+)?$/.test(part)) return value === Number(part)
  return false
}

/* -------------------------------------------------------------------------- */
/* The grid                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The lawful cells, checked as data.
 *
 * A grid maps each variant to the tones lawful with it. Button has no neutral
 * *filled* cell, and at a call site that is a type error, not an ugly button. A
 * spec is not typechecked when it is written, so the same law is checked here.
 * This check is a main reason to validate a spec before emitting it, because
 * `variant: "solid", tone: "neutral"` is exactly the plausible combination an
 * agent invents.
 */
function checkGrid(
  component: SpecMember,
  props: Record<string, SpecValue>,
  path: string,
  faults: SpecFault[],
): void {
  const grid = component.grid
  if (!grid) return

  const variant = props['variant']
  const tone = props['tone']
  if (typeof variant !== 'string') return

  const tones = grid[variant]
  if (tones === undefined) {
    faults.push({
      path: `${path}.props.variant`,
      message: `\`${component.name}\` has no variant \`${variant}\` — it has ${Object.keys(grid).join(', ')}`,
    })
    return
  }

  if (typeof tone === 'string' && !tones.includes(tone)) {
    faults.push({
      path: `${path}.props.tone`,
      message: `\`${component.name}\` has no \`${variant}\` × \`${tone}\` cell — ${variant} takes ${tones.join(', ')}`,
    })
  }
}

/**
 * Icon roles, checked against the closed enum.
 *
 * This case is why the enum exists: *the closed role vocabulary kills a top
 * agent failure mode — hallucinated icon names become type errors*. In TSX they
 * are. In a spec they would be unchecked strings, and the screen would render
 * with a missing glyph. So the check must exist here too, or the guarantee
 * stops at the language boundary.
 *
 * The prop is found by the name `icon`, because every component that takes an
 * icon uses that name.
 */
function checkIcons(
  registry: SpecVocabulary,
  props: Record<string, SpecValue>,
  path: string,
  faults: SpecFault[],
): void {
  const icon = props['icon']
  if (typeof icon !== 'string') return

  const roles = registry.icons.roles.map((role) => role.name)
  if (roles.includes(icon)) return

  const near = roles.filter((role) => role.includes(icon) || icon.includes(role)).slice(0, 3)
  faults.push({
    path: `${path}.props.icon`,
    message:
      `\`${icon}\` is not an icon role — the set is closed` +
      (near.length === 0 ? '' : `, did you mean ${near.map((role) => `\`${role}\``).join(', ')}?`),
  })
}

/* -------------------------------------------------------------------------- */
/* The ladder                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Declared exceptions, checked in both directions.
 *
 * An *undeclared* exception is the fault the exception ladder cares about. A
 * scope, bespoke zone or patch without a written reason is invisible deviation,
 * which the ladder exists to prevent. The reverse is also a fault. An
 * `exception` on a node that takes none makes the inventory overstate how far a
 * codebase has climbed, and an inventory nobody trusts is not read.
 */
function checkException(
  element: SpecElement,
  known: Surface | null,
  path: string,
  faults: SpecFault[],
): void {
  const needed = known?.primitive?.rung ?? (element.props?.[PATCH_PROP] !== undefined ? 3 : null)
  const declared = element.exception

  if (declared === undefined) {
    if (needed !== null) {
      faults.push({
        path,
        message:
          `\`${element.component}\` is a rung-${needed} exception and is not declared — add ` +
          `"exception": { "rung": ${needed}, "because": "…" }`,
      })
    }
    return
  }

  if (needed === null) {
    faults.push({
      path: `${path}.exception`,
      message: `\`${element.component}\` takes no exception — nothing here deviates from the vocabulary`,
    })
    return
  }

  if (!SPEC_RUNGS.includes(declared.rung)) {
    faults.push({
      path: `${path}.exception.rung`,
      message: `rung ${declared.rung} is not something a screen can declare — ${SPEC_RUNGS.join(', ')} are`,
    })
  } else if (declared.rung !== needed) {
    faults.push({
      path: `${path}.exception.rung`,
      message: `\`${element.component}\` is rung ${needed}, declared as rung ${declared.rung}`,
    })
  }

  // A reason that says nothing is effectively an undeclared exception. The
  // threshold is deliberately low but above zero.
  if (declared.because.trim().split(/\s+/).length < 4) {
    faults.push({
      path: `${path}.exception.because`,
      message: 'say why the vocabulary was not enough — this is read by whoever finds it later',
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Corrections                                                                */
/* -------------------------------------------------------------------------- */

const fold = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase()

/**
 * The same approach as the MCP server's. An agent told "no" with no alternative
 * builds its own, and a home-built component is invisible deviation.
 *
 * There are two lookups, because a wrong name arrives in two ways. A near miss
 * (`VStack`, `Dialogue`) is a substring away from the right name. An *industry*
 * term (`Modal`, `Snackbar`) is not, since no edit distance connects `Modal` to
 * `Dialog`. The purpose text connects them, because Dialog's opens "Modal
 * interruption". So the purposes are searched too.
 */
function nearest(
  registry: SpecVocabulary,
  name: string,
  components: Map<string, SpecMember>,
  primitives: Map<string, SpecPrimitive>,
): string {
  const wanted = fold(name)

  const byName = [...components.keys(), ...primitives.keys()].filter(
    (candidate) => fold(candidate).includes(wanted) || wanted.includes(fold(candidate)),
  )
  const byPurpose = registry.components
    .filter((component) => component.purpose.toLowerCase().includes(name.toLowerCase()))
    .map((component) => component.name)

  const near = [...new Set([...byName, ...byPurpose])].slice(0, 3)
  return near.length === 0 ? '' : ` — did you mean ${near.map((n) => `\`${n}\``).join(', ')}?`
}

/**
 * Long enough that `as` is not offered as a correction for `className`, which is
 * what an unbounded substring match does: "classname" contains "as".
 */
const SUGGESTION_FLOOR = 4

function suggestProp(name: string, props: Set<string>): string {
  const wanted = fold(name)
  const near = [...props].filter((prop) => {
    const candidate = fold(prop)
    if (Math.min(candidate.length, wanted.length) < SUGGESTION_FLOOR) return false
    return candidate.includes(wanted) || wanted.includes(candidate)
  })
  return near.length === 0 ? '' : ` — did you mean \`${near[0] as string}\`?`
}
