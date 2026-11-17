// The pure subpaths, so the browser can check a document against this shape
// without loading the registry builder's node dependencies. The root re-exports
// the same objects, so every importer of the root sees the same shapes.
import { PLATFORMS, type Platform } from '@polymorph/registry/platforms'
import {
  arr,
  bool,
  defs,
  nullable,
  num,
  obj,
  rec,
  ref,
  str,
  union,
  type Shape,
} from '@polymorph/registry/shape'

/**
 * The screen spec, described once.
 *
 * The format is *declarative and LLM-friendly (JSON, not a TSX subset). Specs
 * express composition, variants, bindings, and declared exceptions — never
 * style, never motion.* This file is that sentence as a schema, and the last
 * clause matters most.
 *
 * **There is no field for a style.** Styles are not rejected, because there is
 * no place to write one. A prop is a name and a value, and `validate.ts` checks
 * the name against the registry's prop surface for that component. So
 * `className` and `style` fail for the same reason `titel` fails: no component
 * has that prop. The law is not a denylist that a new CSS-in-JS prop could get
 * past. There is no place to write one.
 *
 * **There is no field for logic either.** A binding names an *input the screen
 * declares*, such as `{"$": "onSave"}`, and that is all the behaviour a spec
 * has. A spec cannot write a handler body, a condition or a loop. This is
 * deliberate. A spec format with an expression language becomes a programming
 * language with worse tools, and the properties it should guarantee can no
 * longer be checked. Data and callbacks come from the component that renders
 * the emitted view.
 *
 * The schema is recursive, so it needs `$defs`, which is why the registry's
 * Shape DSL has them. An element tree contains element trees, and a schema that
 * could not refer to itself could not express that.
 */

export const SPEC_ID = 'polymorph-screen/1'

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A binding: the value comes from an input the screen declares.
 *
 * Dotted paths are allowed (`draft.subject`) because a screen receives objects,
 * not fifty scalars. The head of the path must be a declared input, and every
 * segment must be a name. `validate.ts` checks both. Whether the path exists on
 * the input's type is left to the emitted TypeScript, which `tsc` checks.
 *
 * **A path, and only a path.** The emitter prints a binding verbatim. A binding
 * that could hold a call, an index or an element would be the expression
 * language this format excludes. It would also let a spec write, in a field
 * that looks harmless, every raw control and style the rest of the document
 * has no field for.
 */
/**
 * What a binding's `$` must be: names joined by dots. It is a pattern in the
 * schema, so the published JSON Schema also rejects an expression. It is also
 * exported as a RegExp for the validator, which explains the fault in words.
 */
const BINDING_PATH_SOURCE = '^[A-Za-z_$][A-Za-z0-9_$]*(\\.[A-Za-z_$][A-Za-z0-9_$]*)*$'
export const BINDING_PATH = new RegExp(BINDING_PATH_SOURCE)

const BINDING = obj(
  {
    $: str({
      pattern: BINDING_PATH_SOURCE,
      description:
        'A declared input, optionally with a dotted path of names into it: `onSave`, ' +
        '`draft.subject`. Not an expression — no calls, indexes, operators or elements.',
    }),
  },
  { description: 'The value comes from the screen’s own inputs.' },
)

/**
 * A plain object prop, marked with a discriminator on purpose.
 *
 * Without `$object`, an element with a mistyped `component` key would validate
 * as an ordinary object and reach the semantic pass looking like data. So every
 * object form in this format has a required key that names the form. That lets
 * the union be checked strictly instead of loosely.
 */
const OBJECT_VALUE = obj(
  { $object: rec(ref('Value')) },
  { description: 'A structured prop value — `emptyState`, a column, an option.' },
)

const VALUE = union(
  [
    str(),
    num(),
    bool(),
    // `null` is a value a prop can take. `value={null}` on a clearable control
    // means "nothing is chosen", which differs from the prop being absent.
    nullable(str()),
    ref('Binding'),
    ref('Element'),
    ref('ObjectValue'),
    arr(ref('Value')),
  ],
  {
    description:
      'A literal, a binding, an element, a structured object, or a list of those. There is no ' +
      'expression form: a spec composes and binds, it does not compute.',
  },
)

/* -------------------------------------------------------------------------- */
/* Exceptions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A declared exception, at the rung it is taken at.
 *
 * The exception ladder (`docs/rules.md`) holds that *exceptions are not
 * forbidden; undeclared exceptions are*. A declared, bounded, inventoried
 * exception is itself a design decision, with an owner and a visible cost. In
 * a spec this becomes mechanical. A node that patches a token or opens a scope
 * or a bespoke zone must have this field, a node that does not must not, and
 * `because` must say something real. The spec validator checks this. It
 * enforces the ladder where the deviation is *authored*, instead of counting
 * it afterwards as `pnpm inventory` does.
 */
const EXCEPTION = obj({
  rung: num({
    integer: true,
    description:
      'Which rung of the exception ladder (docs/rules.md) this is: 2 a contextual scope, ' +
      '3 an instance patch, 4 a bespoke zone. Rung 1 is not an exception and rung 5 is a ' +
      'promotion, not a screen.',
  }),
  because: str({
    description: 'Written for the reviewer who finds this in the inventory a year from now.',
  }),
})

/* -------------------------------------------------------------------------- */
/* Elements                                                                   */
/* -------------------------------------------------------------------------- */

const ELEMENT = obj(
  {
    component: str({
      description:
        'A vocabulary member, or a compound part like `SettingsRow.Group`. Checked against the ' +
        'registry — an invented name is a fault here rather than a runtime surprise.',
    }),
    props: rec(ref('Value'), {
      description: 'Every prop must exist on that component. That is what makes style unsayable.',
    }),
    children: arr(ref('Value')),
    exception: ref('Exception'),
  },
  { optional: ['props', 'children', 'exception'] },
)

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

const INPUT = obj(
  {
    name: str({ pattern: '^[a-z][A-Za-z0-9]*$' }),
    type: str({
      description:
        'The TypeScript type, verbatim — `Ticket[]`, `(value: string) => void`. One type: its ' +
        'brackets balance and it holds no comment. The emitter writes it into the props ' +
        'interface and `tsc` is what checks it.',
    }),
    doc: str(),
  },
  { optional: ['doc'] },
)

export const SCREEN_SHAPE: Shape = defs(
  {
    Value: VALUE,
    Binding: BINDING,
    ObjectValue: OBJECT_VALUE,
    Element: ELEMENT,
    Exception: EXCEPTION,
  },
  obj(
    {
      spec: str({
        enum: [SPEC_ID],
        description: 'Identifies the shape. Bumped by a breaking change.',
      }),
      name: str({
        pattern: '^[A-Z][A-Za-z0-9]*$',
        description: 'The component the emitter writes.',
      }),
      purpose: str({ description: 'One sentence. Becomes the emitted file’s doc comment.' }),
      platform: str({
        enum: PLATFORMS,
        description:
          'The platform the screen is for; `web` when absent. A member the registry marks absent ' +
          'on it is a fault that names the substitute.',
      }),
      types: rec(arr(str()), {
        description:
          'Module -> the type names the inputs mention. A screen is handed its own domain’s types ' +
          '(`Ticket`) and some of the vocabulary’s (`DataTableColumn`), and neither can be derived ' +
          'from the tree — the emitter writes `import type` lines from this and `tsc` checks them. ' +
          'Each key is a module specifier and each name an identifier.',
      }),
      inputs: arr(INPUT, {
        description:
          'What the screen is handed: data and callbacks. Everything a binding can name, and the ' +
          'only way behaviour enters a spec.',
      }),
      root: ref('Element'),
    },
    { optional: ['platform', 'types'] },
  ),
  {
    description:
      'A screen, as composition rather than code. Carries no style and no motion, because there ' +
      'is nowhere in this document to write either, and emits TSX that is held to the red rules.',
  },
)

/* -------------------------------------------------------------------------- */
/* The types the emitter and the validator work in                            */
/* -------------------------------------------------------------------------- */

export interface Binding {
  $: string
}

export interface ObjectValue {
  $object: Record<string, SpecValue>
}

export interface SpecException {
  rung: number
  because: string
}

export interface SpecElement {
  component: string
  props?: Record<string, SpecValue>
  children?: SpecValue[]
  exception?: SpecException
}

export type SpecValue =
  string | number | boolean | null | Binding | ObjectValue | SpecElement | SpecValue[]

export interface ScreenInput {
  name: string
  type: string
  doc?: string
}

export interface ScreenSpec {
  spec: typeof SPEC_ID
  name: string
  purpose: string
  /** The platform the screen is for. `web` when absent. */
  platform?: Platform
  /** Module -> type names, for the `import type` lines the inputs need. */
  types?: Record<string, string[]>
  inputs: ScreenInput[]
  root: SpecElement
}

/* ---- narrowing, shared by the validator and the emitter ------------------ */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isBinding = (value: SpecValue): value is Binding =>
  isObject(value) && typeof value['$'] === 'string'

export const isObjectValue = (value: SpecValue): value is ObjectValue =>
  isObject(value) && '$object' in value

export const isElement = (value: SpecValue): value is SpecElement =>
  isObject(value) && typeof value['component'] === 'string'
