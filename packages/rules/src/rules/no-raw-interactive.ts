import type { Rule } from 'eslint'

import { fit, memberSpan, ZONE, type MemberCall } from './advice'
import {
  angularAttribute,
  angularElementName,
  angularHandler,
  angularInput,
  angularLiteral,
  angularMember,
  angularReporterFor,
  angularText,
  isPlainAngularElement,
  meaningfulAngularChildren,
  startTagLoc,
  withAngularTemplate,
  type AngularElement,
  type AngularNode,
} from './angular'
import { enter, entranceFor, holdsComment, shadowedAt } from './fix'
import {
  elementName,
  hasAttribute,
  insideBespoke,
  isSolidFile,
  type JsxOpeningElement,
} from './jsx'
import {
  isPlainSvelteElement,
  meaningfulSvelteChildren,
  reportedMarkup,
  svelteAttribute,
  svelteElementName,
  svelteHandler,
  svelteLiteral,
  svelteText,
  withMarkup,
  type SvelteElement,
  type SvelteNode,
} from './svelte'
import {
  importsOf,
  isPlainVueElement,
  listenedEvent,
  meaningfulChildren,
  reported,
  reporterFor,
  vueAttribute,
  vueElementName,
  vueLiteral,
  vueText,
  withTemplate,
  type VueDirectiveKey,
  type VueElement,
} from './vue'

/**
 * Stage 2: application code composes the vocabulary and does not rebuild it.
 *
 * A hand-rolled `<button>` has no hover, focus, disabled, loading or pressed
 * state unless someone writes them, and no motion at all. Every rebuilt control
 * is a source of drift (`docs/concepts.md`).
 *
 * **What it says.** Each report names the member for what was written: an
 * `<input>` by its `type` (`search` is `SearchInput`, `email` is `Input` with
 * `type="email"`), a `<select>` as `Select`, or `Combobox` when it has many
 * options, and a handler on a plain element as `Link` when it has an `href` and
 * as a ghost `Button` when it does not.
 *
 * **What it fixes.** Three raw controls have a single rewrite:
 *
 *  - A `<button>` whose whole content is text becomes `Button` with that text
 *    as its `label`: `<button type="button" onClick={save}>Save</button>`
 *    becomes `<Button label="Save" onClick={save} />`.
 *  - An `<input type="checkbox">` with its label beside it becomes `Checkbox`
 *    with that label: `<label><input type="checkbox" name="terms" /> Accept
 *    terms</label>` becomes `<Checkbox label="Accept terms" name="terms" />`.
 *    So does an input followed by `<label htmlFor>` naming its `id`. An
 *    `onChange` that takes no arguments becomes `onCheckedChange`; one that
 *    reads its event is left for the author, because `onCheckedChange` is
 *    called with the checked state instead.
 *  - A `<textarea>` becomes `Textarea`. Its `onChange` is called with the value
 *    first, so a handler that reads only `event.target.value` is rewritten to
 *    take the value: `(e) => setText(e.target.value)` becomes
 *    `(value) => setText(value)`. Any other handler is left for the author.
 *
 * A `function` handler that reads `arguments` sees the member's arguments
 * instead of the native ones, whatever its parameters say, so it stops both
 * handler rewrites. An arrow has no `arguments` of its own.
 *
 * Anything the rewrite cannot keep unchanged leaves the element reported and
 * unchanged: content that is not plain text, a `className` or a `style`
 * (someone styled it, and choosing the intended variant is a decision), or any
 * prop the member has no equivalent for. The other raw controls have no single
 * rewrite. A text `<input>` has no label of its own, a `<select>` becomes an
 * `options` array, and a clickable `<div>` could be any of several members.
 *
 * **A `<button>` with no `type` is a submit button**, and the member's default
 * is not. One file cannot tell whether a form encloses it, because the form may
 * be a member or a parent in another module. The fix therefore writes
 * `type="submit"` whenever the original had no `type`, which keeps the same
 * behaviour explicitly. Where there is no form it has no effect, and the author
 * can see it and delete it.
 *
 * The fixes need to know which module the vocabulary is imported from, and run
 * only when the `vocabulary` option is set. The rule groups leave it unset, so
 * nothing is rewritten until a config that imports members from one module
 * opts in.
 *
 * **In a Vue template** the same elements are reported with the same answers,
 * and a listener (`@click`, `v-on:keydown`) on a plain element is a handler.
 * Nothing in a template is rewritten: the three fixes write TSX.
 *
 * **In Svelte markup** the same elements are reported with the same answers,
 * and an event attribute (`onclick`) or an `on:click` directive on a plain
 * element is a handler. Nothing in a `.svelte` file is rewritten either.
 *
 * **In an Angular template** the same elements are reported with the same
 * answers, written in template syntax, and a listener (`(click)`,
 * `(keydown.enter)`) on a plain element is a handler; one on `window` or
 * `document` (`(window:keydown)`) is not the element's. Nothing in a template
 * is rewritten.
 *
 * **In Solid TSX** (`isSolidFile`) a handler is also written in lowercase
 * (`onclick`, a native listener) or as a directive (`on:click`,
 * `oncapture:click`), and is reported as written. A React file is read as
 * before. The fixes run as in React, with two differences. A
 * `<label for="…">` names its checkbox as `htmlFor` does. A `<textarea>` is not
 * rewritten, because its `onChange` there is the native change event, which
 * fires when the field loses focus, and `Textarea` calls its `onChange` on
 * every input.
 */

interface Options {
  /** Elements that are interactive by nature. */
  elements?: string[]
  /** Elements that become interactive once given a handler. */
  interactiveWhenHandled?: string[]
  /** The handler props that make the above interactive. */
  handlers?: string[]
  /** The module members are imported from. When set, a raw `<button>` is fixable. */
  vocabulary?: string
}

const DEFAULT_ELEMENTS = ['button', 'input', 'select', 'textarea', 'option', 'optgroup']
const DEFAULT_WHEN_HANDLED = ['a', 'div', 'span', 'li', 'tr', 'td', 'img', 'label', 'p', 'section']
const DEFAULT_HANDLERS = ['onClick', 'onKeyDown', 'onKeyUp', 'onPointerDown', 'onMouseDown']

/* -------------------------------------------------------------------------- */
/* The fix: a text-only `<button>`, as the member                             */
/* -------------------------------------------------------------------------- */

const MEMBER = 'Button'

/**
 * The props that mean the same on `Button` as on `<button>`, so they are kept
 * as written. The member declares them in `design/components/button.md`, and
 * `fix-api.test.ts` checks this list against that table.
 */
export const BUTTON_CARRIES = [
  'onClick',
  'disabled',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
] as const

/** `key` belongs to React, not to either element. It is kept too. */
const CARRIED = new Set<string>([...BUTTON_CARRIES, 'key'])

/** The `type` values `Button` has. `reset` is not one of them. */
export const BUTTON_TYPES = ['button', 'submit'] as const

interface TextNode {
  type: string
  value?: unknown
  raw?: string
  expression?: { type: string; value?: unknown; quasis?: unknown[]; expressions?: unknown[] }
}

interface AttributeNode {
  type: string
  name?: { type: string; name?: string }
  value?: (Rule.Node & { type: string; value?: unknown }) | null
}

interface ElementNode {
  type: string
  openingElement: { attributes: AttributeNode[] }
  children: TextNode[]
}

/**
 * JSX text as React reads it: each line trimmed of the spaces and tabs around
 * its line break, blank lines dropped, and the rest joined by one space. Space
 * inside a line is kept as written, and so is any character that is not a space
 * or a tab. A non-breaking space is content.
 */
function jsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/)
  return lines
    .map((line, index) => {
      let text = line.replace(/\t/g, ' ')
      if (index !== 0) text = text.replace(/^ +/, '')
      if (index !== lines.length - 1) text = text.replace(/ +$/, '')
      return text
    })
    .filter((line) => line !== '')
    .join(' ')
}

/**
 * The `label` attribute a button's content becomes, or `null` when the content
 * is anything other than one piece of plain text. A string in braces stays in
 * its braces, because that is how the author quoted it.
 */
function labelFrom(
  children: TextNode[],
  sourceCode: Rule.RuleContext['sourceCode'],
): string | null {
  const meaningful = children.filter(
    (child) => !(child.type === 'JSXText' && jsxText(String(child.raw ?? child.value)) === ''),
  )
  const [only] = meaningful
  if (meaningful.length !== 1 || only === undefined) return null

  if (only.type === 'JSXText') {
    const text = jsxText(String(only.raw ?? only.value))
    // A double quote cannot be written inside a double-quoted attribute.
    return text.includes('"') ? null : `label="${text}"`
  }

  if (only.type !== 'JSXExpressionContainer' || !only.expression) return null
  const { expression } = only
  const literal =
    (expression.type === 'Literal' && typeof expression.value === 'string') ||
    (expression.type === 'TemplateLiteral' && expression.expressions?.length === 0)
  return literal ? `label=${sourceCode.getText(only as unknown as Rule.Node)}` : null
}

/* -------------------------------------------------------------------------- */
/* What each raw control is in the vocabulary                                 */
/* -------------------------------------------------------------------------- */

/**
 * `<input type>` -> the member that is that field. `fix-api.test.ts` checks
 * every member and attribute here against `design/components/`.
 */
export const INPUT_MEMBERS: Record<string, MemberCall> = {
  text: { member: 'Input' },
  email: { member: 'Input', attributes: { type: '"email"' } },
  tel: { member: 'Input', attributes: { type: '"tel"' } },
  url: { member: 'Input', attributes: { type: '"url"' } },
  search: { member: 'SearchInput' },
  password: { member: 'PasswordInput', attributes: { toggleLabel: '"…"' } },
  number: { member: 'NumberInput' },
  checkbox: { member: 'Checkbox', attributes: { label: '"…"' } },
  radio: { member: 'RadioGroup', attributes: { options: '{…}' } },
  date: { member: 'DatePicker' },
  'datetime-local': { member: 'DatePicker', attributes: { granularity: '"minute"' } },
  time: { member: 'TimeInput' },
  color: { member: 'ColorInput', attributes: { pickerLabel: '"…"' } },
  file: { member: 'FileUpload' },
  range: { member: 'Slider' },
  submit: { member: 'Button', attributes: { type: '"submit"', label: '"…"' } },
  button: { member: 'Button', attributes: { label: '"…"' } },
  image: { member: 'Button', attributes: { label: '"…"' } },
  reset: { member: 'Button', attributes: { label: '"…"' } },
}

/**
 * `<input type>` values no member picks. `DatePicker` picks a day, an hour or
 * a minute (its `granularity`), never a whole month or week, so naming it
 * would send the reader to a member that cannot hold the value.
 */
const UNPICKED_INPUTS: Record<string, string> = { month: 'month', week: 'week' }

/** More options than this and a reader would rather type than scroll. */
const COMBOBOX_FROM = 10

/** The member a clickable plain element is, by what the element is. */
export const HANDLED_MEMBERS = {
  link: { member: 'Link', attributes: { href: '"…"' } },
  row: { member: 'Table.Row', attributes: { interactive: '' } },
  control: { member: 'Button', attributes: { variant: '"ghost"', label: '"…"' } },
} satisfies Record<string, MemberCall>

/* -------------------------------------------------------------------------- */
/* The fix: a checkbox and its label, as the member                           */
/* -------------------------------------------------------------------------- */

const CHECKBOX = 'Checkbox'

/**
 * The props that mean the same on `Checkbox` as on `<input type="checkbox">`.
 * The member declares them in `design/components/checkbox.md`, and
 * `fix-api.test.ts` checks this list against that table. `checked` widens from
 * a boolean to `boolean | 'indeterminate'`, so every value the input took
 * still means the same.
 */
export const CHECKBOX_CARRIES = [
  'checked',
  'defaultChecked',
  'disabled',
  'name',
  'value',
  'id',
] as const

/* -------------------------------------------------------------------------- */
/* The fix: a textarea, as the member                                         */
/* -------------------------------------------------------------------------- */

const TEXTAREA = 'Textarea'

/**
 * The props that mean the same on `Textarea` as on `<textarea>`, checked
 * against `design/components/textarea.md` by `fix-api.test.ts`. `onChange` is
 * not here, because the member calls it with the value first: it is carried
 * only as the rewrite below.
 */
export const TEXTAREA_CARRIES = [
  'value',
  'placeholder',
  'disabled',
  'readOnly',
  'maxLength',
  'name',
  'id',
  'rows',
  'autoFocus',
  'onBlur',
  'onFocus',
] as const

interface FunctionNode extends AstNode {
  params: AstNode[]
  body: AstNode
  range: [number, number]
}

interface AstNode {
  type: string
  [key: string]: unknown
}

interface Ranged {
  range: [number, number]
}

/** A checkbox's label, found: what the rewrite replaces, the label, and props the label held. */
interface Shape {
  range: [number, number]
  text: string
  extra: string[]
}

/** Type-only wrappers, which leave the expression inside them in the same place. */
const TYPE_WRAPPERS = new Set([
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
])

/**
 * Whether an expression is written to rather than read: assigned, updated,
 * deleted, or a target of destructuring or a `for…in`/`for…of` head. Replacing
 * it with a parameter would change what the write reaches.
 */
function written(node: AstNode): boolean {
  const parent = node['parent'] as AstNode | undefined
  if (parent === undefined) return false
  if (TYPE_WRAPPERS.has(parent.type)) return written(parent)
  switch (parent.type) {
    case 'AssignmentExpression':
    case 'AssignmentPattern':
    case 'ForInStatement':
    case 'ForOfStatement':
      return parent['left'] === node
    case 'UpdateExpression':
    case 'ArrayPattern':
    case 'RestElement':
      return true
    case 'UnaryExpression':
      return parent['operator'] === 'delete'
    case 'Property':
      return (
        parent['value'] === node &&
        (parent['parent'] as AstNode | undefined)?.type === 'ObjectPattern'
      )
    default:
      return false
  }
}

/** `event.target.value` or `event.currentTarget.value` read, for one parameter name. */
function readsValue(identifier: AstNode, name: string): boolean {
  const member = identifier['parent'] as AstNode | undefined
  if (member?.type !== 'MemberExpression' || member['object'] !== identifier) return false
  if (member['computed']) return false
  const target = member['property'] as { name?: string }
  if (target.name !== 'target' && target.name !== 'currentTarget') return false
  const outer = member['parent'] as AstNode | undefined
  if (outer?.type !== 'MemberExpression' || outer['object'] !== member || outer['computed']) {
    return false
  }
  if (written(outer)) return false
  return (outer['property'] as { name?: string }).name === 'value' && name !== 'value'
}

export const noRawInteractive: Rule.RuleModule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: { description: 'Interactive elements come from the vocabulary, never from raw HTML.' },
    schema: [
      {
        type: 'object',
        properties: {
          elements: { type: 'array', items: { type: 'string' } },
          interactiveWhenHandled: { type: 'array', items: { type: 'string' } },
          handlers: { type: 'array', items: { type: 'string' } },
          vocabulary: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawButton: 'Unexpected <button>. {{advice}}',
      rawInput: 'Unexpected <input{{typed}}>. {{advice}}',
      rawSelect: 'Unexpected <select>. {{advice}}',
      rawOption:
        'Unexpected <{{element}}>. Options are data, not elements: pass them as ' +
        '`<Select options={…}>` or `<Combobox options={…}>` (rung 1).',
      rawTextarea:
        'Unexpected <textarea>. Use `<Textarea>` (rung 1); its `onChange` receives the value ' +
        'first, then the event.',
      rawElement:
        'Unexpected <{{element}}>. Use the vocabulary control (rung 1): it carries every state, ' +
        `its keyboard path and its motion.`,
      handledElement: 'Unexpected `{{handler}}` on <{{element}}>. {{advice}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as Options
    const elements = new Set(options.elements ?? DEFAULT_ELEMENTS)
    const whenHandled = new Set(options.interactiveWhenHandled ?? DEFAULT_WHEN_HANDLED)
    const handlers = options.handlers ?? DEFAULT_HANDLERS
    const vocabulary = options.vocabulary
    const sourceCode = context.sourceCode
    /** The DOM events the handlers listen to: `click` for `onClick`. */
    const events = new Set(handlers.map((handler) => handler.slice(2).toLowerCase()))
    // Only the fixes read it, and they run only with a vocabulary to import from.
    const solid = vocabulary !== undefined && isSolidFile(context)

    /**
     * The handler a plain element has, as written: a handler prop
     * (`onClick`), and in a Solid file the same name in lowercase, which
     * Solid reads as a native listener (`onclick`), or a Solid listener
     * directive (`on:click`, `oncapture:click`). `undefined` when it has none.
     */
    function jsxHandler(opening: JsxOpeningElement): string | undefined {
      const named = handlers.find((prop) => hasAttribute(opening, prop))
      if (named !== undefined || !isSolidFile(context)) return named
      for (const attribute of opening.attributes) {
        if (attribute.type !== 'JSXAttribute') continue
        const name = attribute.name as
          { type: string; name?: unknown; namespace?: { name?: unknown } } | undefined
        if (name?.type === 'JSXIdentifier' && typeof name.name === 'string') {
          if (/^on/i.test(name.name) && events.has(name.name.slice(2).toLowerCase())) {
            return name.name
          }
          continue
        }
        if (name?.type !== 'JSXNamespacedName') continue
        const namespace = name.namespace?.name
        const event = (name.name as { name?: unknown } | undefined)?.name
        if (
          (namespace === 'on' || namespace === 'oncapture') &&
          typeof event === 'string' &&
          events.has(event.toLowerCase())
        ) {
          return `${namespace}:${event}`
        }
      }
      return undefined
    }

    /** An attribute's text when it is a string literal, `null` when it is anything else. */
    function literal(opening: JsxOpeningElement, name: string): string | null | undefined {
      const attribute = (opening.attributes as unknown as AttributeNode[]).find(
        (candidate) => candidate.type === 'JSXAttribute' && candidate.name?.name === name,
      )
      if (attribute === undefined) return undefined
      const value = attribute.value
      if (value?.type === 'Literal' && typeof value.value === 'string') return value.value
      return null
    }

    /**
     * Whether a handler reads `arguments`. In a `function` it holds what the
     * caller passed, which on the member is not the native event, so no
     * rewrite of the parameters keeps its meaning. An arrow has no
     * `arguments` of its own; one it names belongs to an enclosing function
     * and is unchanged by the rewrite.
     */
    function readsArguments(handler: FunctionNode): boolean {
      if (handler.type !== 'FunctionExpression') return false
      const scope = sourceCode.scopeManager.acquire(handler as unknown as Rule.Node)
      if (!scope) return true
      return (scope.set.get('arguments')?.references.length ?? 0) > 0
    }

    /** The children React renders, without the whitespace JSX drops. */
    function meaningful(children: TextNode[]): TextNode[] {
      return children.filter(
        (child) => !(child.type === 'JSXText' && jsxText(String(child.raw ?? child.value)) === ''),
      )
    }

    /** The whole `<button>…</button>` rewritten as the member, or `null`. */
    function buttonFix(node: Rule.Node): Rule.ReportFixer | null {
      if (vocabulary === undefined) return null
      const element = node.parent as unknown as ElementNode
      if (element.type !== 'JSXElement') return null
      const whole = element as unknown as Rule.Node

      // Replacing the element replaces everything written inside it.
      if (holdsComment(sourceCode, whole)) return null
      // `Button` means something else at this position.
      if (shadowedAt(sourceCode, whole, MEMBER)) return null

      const label = labelFrom(element.children, sourceCode)
      if (label === null) return null

      const props: string[] = [label]
      let type: string | null = null
      for (const attribute of element.openingElement.attributes) {
        const name = attribute.name?.type === 'JSXIdentifier' ? attribute.name.name : undefined
        // A spread could contain anything, including `children`.
        if (attribute.type !== 'JSXAttribute' || name === undefined) return null
        if (name === 'type') {
          const value = attribute.value?.type === 'Literal' ? attribute.value.value : undefined
          if (!(BUTTON_TYPES as readonly unknown[]).includes(value)) return null
          type = String(value)
          continue
        }
        // A class, a style, an id or a ref has no place on the member. It cannot
        // be kept, so the element is not rewritten.
        if (!CARRIED.has(name)) return null
        props.push(sourceCode.getText(attribute as unknown as Rule.Node))
      }

      // No `type` means `submit`. The member's default is `button`, so that is
      // the only value the rewrite can omit.
      if (type !== 'button') props.push('type="submit"')

      const entrance = entranceFor(sourceCode, MEMBER, [vocabulary], vocabulary)
      if (entrance === null) return null

      return (fixer) => [
        ...enter(sourceCode, fixer, MEMBER, entrance),
        fixer.replaceText(whole, `<${MEMBER} ${props.join(' ')} />`),
      ]
    }

    /**
     * The checkbox's own props, rewritten for `Checkbox`, or `null` when one has
     * no equivalent there. `type="checkbox"` is what the member is, so it goes.
     */
    function checkboxProps(element: ElementNode): string[] | null {
      if (meaningful(element.children).length > 0) return null
      const props: string[] = []
      for (const attribute of element.openingElement.attributes) {
        const name = attribute.name?.type === 'JSXIdentifier' ? attribute.name.name : undefined
        if (attribute.type !== 'JSXAttribute' || name === undefined) return null
        if (name === 'type') continue
        if (name === 'onChange') {
          // A handler that takes no arguments does the same whatever it is
          // called with. One that reads the event would get the checked state.
          const handler = (attribute.value as { expression?: FunctionNode } | null)?.expression
          const blind =
            (handler?.type === 'ArrowFunctionExpression' ||
              handler?.type === 'FunctionExpression') &&
            handler.params.length === 0 &&
            !readsArguments(handler)
          if (!blind || !handler) return null
          props.push(`onCheckedChange={${sourceCode.getText(handler as unknown as Rule.Node)}}`)
          continue
        }
        if (name !== 'key' && !(CHECKBOX_CARRIES as readonly string[]).includes(name)) return null
        props.push(sourceCode.getText(attribute as unknown as Rule.Node))
      }
      return props
    }

    /** The plain text of a label, or `null` when it holds anything else. */
    function labelText(children: TextNode[]): string | null {
      const parts = meaningful(children)
      const [only] = parts
      if (parts.length !== 1 || only?.type !== 'JSXText') return null
      const text = jsxText(String(only.raw ?? only.value)).trim()
      return text === '' || text.includes('"') || /[{}<>]/.test(text) ? null : text
    }

    /** Whether any comment sits inside `range`, which a rewrite of it would delete. */
    function commentInside([start, end]: [number, number]): boolean {
      return sourceCode.getAllComments().some((comment) => {
        const [from, to] = comment.range as [number, number]
        return from >= start && to <= end
      })
    }

    /**
     * `<label><input type="checkbox" /> Accept terms</label>`: the label's
     * range, its text, and its `key`, or `null` for any other shape. The text
     * must come after the box, because the member draws the box first.
     */
    function wrappingLabel(input: ElementNode, label: ElementNode & Ranged): Shape | null {
      const kept = meaningful(label.children)
      if (kept.length !== 2 || kept[0] !== (input as unknown as TextNode)) return null
      const attributes = label.openingElement.attributes
      if (attributes.some((a) => a.type !== 'JSXAttribute' || a.name?.name !== 'key')) return null
      const text = labelText([kept[1] as TextNode])
      if (text === null) return null
      const extra = attributes.map((a) => sourceCode.getText(a as unknown as Rule.Node))
      return { range: label.range, text, extra }
    }

    /**
     * `<input type="checkbox" id="terms" />` and then `<label htmlFor="terms">`:
     * both elements' range and the label's text, or `null`. Only a line break
     * may separate them, because JSX drops it; a space on one line renders.
     */
    function followingLabel(input: ElementNode & Ranged, siblings: TextNode[]): Shape | null {
      const at = siblings.indexOf(input as unknown as TextNode)
      const between = siblings[at + 1]
      const raw = String(between?.raw ?? between?.value ?? '')
      const dropped = between?.type === 'JSXText' && /\n/.test(raw) && jsxText(raw) === ''
      const label = (dropped ? siblings[at + 2] : between) as unknown as
        (ElementNode & Ranged) | undefined
      if (label?.type !== 'JSXElement') return null
      const opening = label.openingElement as unknown as JsxOpeningElement
      if (elementName(opening) !== 'label' || opening.attributes.length !== 1) return null
      const id = literal(input.openingElement as unknown as JsxOpeningElement, 'id')
      // Solid writes the attribute as HTML does.
      const target = literal(opening, 'htmlFor') ?? (solid ? literal(opening, 'for') : undefined)
      if (typeof id !== 'string' || target !== id) return null
      const text = labelText(label.children)
      return text === null ? null : { range: [input.range[0], label.range[1]], text, extra: [] }
    }

    /**
     * An `<input type="checkbox">` and its label rewritten as one `Checkbox`,
     * in either shape above. Either way the member draws the same row: the
     * box, then its label, the whole row its hit target.
     */
    function checkboxFix(node: Rule.Node): Rule.ReportFixer | null {
      if (vocabulary === undefined) return null
      const input = node.parent as unknown as ElementNode & Ranged & { parent?: unknown }
      if (input.type !== 'JSXElement') return null
      const props = checkboxProps(input)
      if (props === null) return null

      const parent = input.parent as (ElementNode & Ranged) | undefined
      if (parent?.type !== 'JSXElement') return null
      const wraps = elementName(parent.openingElement as unknown as JsxOpeningElement) === 'label'
      const shape = wraps ? wrappingLabel(input, parent) : followingLabel(input, parent.children)
      if (shape === null || commentInside(shape.range)) return null
      // A `key` on both the label and the input has no single place to go.
      if (shape.extra.length > 0 && props.some((prop) => prop.startsWith('key='))) return null
      if (shadowedAt(sourceCode, node, CHECKBOX)) return null
      const entrance = entranceFor(sourceCode, CHECKBOX, [vocabulary], vocabulary)
      if (entrance === null) return null

      const attributes = [...props, ...shape.extra].map((prop) => ` ${prop}`).join('')
      return (fixer) => [
        ...enter(sourceCode, fixer, CHECKBOX, entrance),
        fixer.replaceTextRange(shape.range, `<${CHECKBOX} label="${shape.text}"${attributes} />`),
      ]
    }

    /**
     * `onChange` rewritten for `Textarea`, which passes the value first. A
     * handler that reads only `event.target.value` takes the value instead;
     * one that takes nothing is kept as written. `null` for anything else.
     */
    function textareaChange(attribute: AttributeNode): string | null {
      const handler = (attribute.value as { expression?: FunctionNode } | null)?.expression
      if (handler?.type !== 'ArrowFunctionExpression' && handler?.type !== 'FunctionExpression') {
        return null
      }
      // `arguments[0]` would be the value, not the event, whatever the
      // parameters are rewritten to.
      if (readsArguments(handler)) return null
      if (handler.params.length === 0)
        return `onChange={${sourceCode.getText(handler as unknown as Rule.Node)}}`
      const [param] = handler.params
      if (handler.params.length !== 1 || param?.type !== 'Identifier' || param['typeAnnotation']) {
        return null
      }
      const name = String(param['name'])
      const scope = sourceCode.scopeManager.acquire(handler as unknown as Rule.Node)
      const variable = scope?.set.get(name)
      if (!scope || !variable) return null
      // Every use must be `name.target.value`, and `value` must not already
      // mean something inside the handler.
      if (
        !variable.references.every((ref) => readsValue(ref.identifier as unknown as AstNode, name))
      ) {
        return null
      }
      const declaresValue = (current: typeof scope): boolean =>
        current.set.has('value') || current.childScopes.some(declaresValue)
      if (declaresValue(scope) || scope.through.some((ref) => ref.identifier.name === 'value')) {
        return null
      }

      const text = sourceCode.getText(handler as unknown as Rule.Node)
      const [start] = handler.range
      const edits = [
        { range: param.range as [number, number], text: 'value' },
        ...variable.references.map((ref) => {
          const outer = (ref.identifier as unknown as AstNode)['parent'] as AstNode
          return { range: (outer['parent'] as AstNode)['range'] as [number, number], text: 'value' }
        }),
      ].sort((a, b) => b.range[0] - a.range[0])
      let rewritten = text
      for (const edit of edits) {
        rewritten =
          rewritten.slice(0, edit.range[0] - start) +
          edit.text +
          rewritten.slice(edit.range[1] - start)
      }
      return `onChange={${rewritten}}`
    }

    /** The whole `<textarea />` rewritten as the member, or `null`. */
    function textareaFix(node: Rule.Node): Rule.ReportFixer | null {
      if (vocabulary === undefined) return null
      // Solid's `onChange` on a raw `<textarea>` is the native change event,
      // and the member's is called on every input, so no handler keeps its
      // meaning.
      if (solid) return null
      const element = node.parent as unknown as ElementNode
      if (element.type !== 'JSXElement') return null
      const whole = element as unknown as Rule.Node
      if (holdsComment(sourceCode, whole)) return null
      if (shadowedAt(sourceCode, whole, TEXTAREA)) return null
      // React reads a textarea's value from `value`, never from children.
      if (meaningful(element.children).length > 0) return null

      const props: string[] = []
      for (const attribute of element.openingElement.attributes) {
        const name = attribute.name?.type === 'JSXIdentifier' ? attribute.name.name : undefined
        if (attribute.type !== 'JSXAttribute' || name === undefined) return null
        if (name === 'onChange') {
          const change = textareaChange(attribute)
          if (change === null) return null
          props.push(change)
          continue
        }
        if (name !== 'key' && !(TEXTAREA_CARRIES as readonly string[]).includes(name)) return null
        props.push(sourceCode.getText(attribute as unknown as Rule.Node))
      }

      const entrance = entranceFor(sourceCode, TEXTAREA, [vocabulary], vocabulary)
      if (entrance === null) return null
      const attributes = props.map((prop) => ` ${prop}`).join('')
      return (fixer) => [
        ...enter(sourceCode, fixer, TEXTAREA, entrance),
        fixer.replaceText(whole, `<${TEXTAREA}${attributes} />`),
      ]
    }

    /**
     * What a `<button>` becomes: its text as the label, and an `<Icon>` inside
     * it as the member's `icon`, which is where a button's glyph goes.
     */
    function buttonAdvice(node: Rule.Node): string {
      const element = node.parent as unknown as ElementNode
      const children = element.type === 'JSXElement' ? meaningful(element.children) : []
      const icons = children.filter((child) => {
        const nested = child as unknown as ElementNode
        return (
          child.type === 'JSXElement' &&
          elementName(nested.openingElement as unknown as JsxOpeningElement) === 'Icon'
        )
      })
      const glyph =
        icons.length === 1
          ? literal(
              (icons[0] as unknown as ElementNode).openingElement as unknown as JsxOpeningElement,
              'name',
            )
          : undefined
      const rest = children.filter((child) => !icons.includes(child))
      const label = labelFrom(rest, sourceCode)
      // The space between a glyph and its text is the member's to draw.
      const text = label?.startsWith('label="')
        ? `label="${label.slice(7, -1).trim()}"`
        : 'label="…"'
      return buttonAdviceFor(glyph, rest.length, text)
    }

    /**
     * What a `<button>` becomes, from what it holds: the glyph an `<Icon>`
     * inside it names, how many other children it has, and their text as a
     * `label` attribute.
     */
    function buttonAdviceFor(
      glyph: string | null | undefined,
      rest: number,
      label: string,
    ): string {
      const call =
        typeof glyph === 'string'
          ? rest === 0
            ? `\`<Button iconOnly icon="${glyph}" label="…" />\``
            : `\`<Button icon="${glyph}" ${label} />\``
          : `\`<Button ${label} />\``
      return fit('Unexpected <button>.', [
        `Use ${call} (rung 1): it carries every state, its keyboard path and its motion.`,
      ])
    }

    /** A text a `label` attribute can hold, or the placeholder. */
    const labelAttribute = (text: string | null): string =>
      text !== null && text !== '' && !text.includes('"') ? `label="${text}"` : 'label="…"'

    /** What an `<input>` becomes, by its `type`. */
    function inputReport(opening: JsxOpeningElement): { typed: string; advice: string } {
      return inputReportFor(literal(opening, 'type'))
    }

    /** As above, from the `type` as written: its text, `null` when it is code, `undefined` when absent. */
    function inputReportFor(type: string | null | undefined): { typed: string; advice: string } {
      const typed = typeof type === 'string' ? ` type="${type}"` : ''
      const head = `Unexpected <input${typed}>.`
      const key = type === undefined ? 'text' : (type ?? '').toLowerCase()
      // Own keys only: `type="constructor"` is not a field.
      const call = Object.hasOwn(INPUT_MEMBERS, key) ? INPUT_MEMBERS[key] : undefined
      const unpicked = Object.hasOwn(UNPICKED_INPUTS, key) ? UNPICKED_INPUTS[key] : undefined

      if (unpicked !== undefined) {
        return {
          typed,
          advice: fit(head, [
            `No member picks a whole ${unpicked} (DatePicker picks a day, an hour or a minute), ` +
              `so a ${unpicked} picker goes in a ${ZONE} zone (rung 4).`,
          ]),
        }
      }
      if (key === 'hidden') {
        return {
          typed,
          advice: fit(head, [
            `Every vocabulary field posts its own value through \`name="…"\`; a hidden field ` +
              `outside one goes in a ${ZONE} zone.`,
          ]),
        }
      }
      if (call === undefined) {
        return {
          typed,
          advice: fit(head, [
            'Use the field member for its type (rung 1): `<Input>`, `<Checkbox label="…">`, ' +
              '`<DatePicker>` or `<Slider>`.',
          ]),
        }
      }
      const span = memberSpan(call)
      const why =
        key === 'checkbox'
          ? `Use ${span} (rung 1); it draws its own label row, so a wrapping <label> goes too.`
          : key === 'radio'
            ? `One ${span} replaces the set of radios and their labels (rung 1).`
            : key === 'reset'
              ? `Use ${span} (rung 1) and clear the fields in its \`onClick\`; a Button has no reset.`
              : `Use ${span} (rung 1): it carries the field's states, its label wiring and its keyboard path.`
      return { typed, advice: fit(head, [why]) }
    }

    /** `<select>` as `Select`, or `Combobox` when the list is long, or `MultiSelect`. */
    function selectAdvice(node: Rule.Node, opening: JsxOpeningElement): string {
      if (hasAttribute(opening, 'multiple')) return selectAdviceFor(true, null)
      const element = node.parent as unknown as ElementNode
      const children = element.type === 'JSXElement' ? meaningful(element.children) : []
      const options = children.flatMap((child) => {
        const nested = child as unknown as ElementNode
        if (child.type !== 'JSXElement') return [child]
        const name = elementName(nested.openingElement as unknown as JsxOpeningElement)
        return name === 'optgroup' ? meaningful(nested.children) : [child]
      })
      const counted = options.every((child) => child.type === 'JSXElement')
      return selectAdviceFor(false, counted ? options.length : null)
    }

    /**
     * As above, from whether it is `multiple` and how many options it lists,
     * `null` when the options are not all written out.
     */
    function selectAdviceFor(multiple: boolean, count: number | null): string {
      const head = 'Unexpected <select>.'
      if (multiple) {
        return fit(head, [
          'Use `<MultiSelect options={…}>` (rung 1); options are data, not elements.',
        ])
      }
      const counted = count !== null
      const many = counted && count > COMBOBOX_FROM
      return fit(head, [
        many
          ? `With ${count} options, use \`<Combobox options={…}>\` so the reader can type to filter (rung 1).`
          : 'Use `<Select options={…}>` (rung 1); options are data, not elements.',
        counted && !many
          ? ''
          : many
            ? 'A short list is `<Select options={…}>`.'
            : 'A long list is `<Combobox options={…}>`, which filters as the reader types.',
      ])
    }

    /** A handler on a plain element: a link if it has somewhere to go, a control if not. */
    function handledAdvice(element: string, handler: string, opening: JsxOpeningElement): string {
      return handledAdviceFor(element, handler, hasAttribute(opening, 'href'))
    }

    /** As above, from whether the element has an `href`. */
    function handledAdviceFor(element: string, handler: string, linked: boolean): string {
      const head = `Unexpected \`${handler}\` on <${element}>.`
      if (linked) {
        return fit(head, [
          `A link that also runs code is still ${memberSpan(HANDLED_MEMBERS.link)} (rung 1); work that changes data is a \`<Button>\`.`,
        ])
      }
      if (element === 'tr' || element === 'td') {
        return fit(head, [
          `A clickable row is ${memberSpan(HANDLED_MEMBERS.row)} with its \`onClick\` (rung 1).`,
        ])
      }
      return fit(head, [
        `A clickable <${element}> has no control's states or keyboard path: use ` +
          `${memberSpan(HANDLED_MEMBERS.control)} (rung 1), or a ${ZONE} zone.`,
      ])
    }

    /**
     * A Vue `<button>`: its text as the label, and an `<Icon>` inside it as the
     * member's `icon`, as in TSX.
     */
    function vueButtonAdvice(element: VueElement): string {
      const children = meaningfulChildren(element.children)
      const icons = children.filter(
        (child): child is VueElement =>
          child.type === 'VElement' && vueElementName(child, importsOf(context)) === 'Icon',
      )
      const glyph = icons.length === 1 ? vueLiteral(icons[0] as VueElement, 'name') : undefined
      const rest = children.filter((child) => !icons.includes(child as VueElement))
      const text = rest.length === 0 ? null : vueText(rest)
      return buttonAdviceFor(glyph, rest.length, labelAttribute(text))
    }

    /** The options a Vue `<select>` writes out, or `null` when any is generated. */
    function vueOptionCount(element: VueElement): number | null {
      const options = meaningfulChildren(element.children).flatMap((child) =>
        child.type === 'VElement' && child.rawName === 'optgroup'
          ? meaningfulChildren(child.children)
          : [child],
      )
      // A `v-for` writes one option for many, so the list is not counted.
      const counted = options.every(
        (child) =>
          child.type === 'VElement' &&
          !child.startTag.attributes.some(
            (attribute) =>
              attribute.directive && (attribute.key as VueDirectiveKey).name.name === 'for',
          ),
      )
      return counted ? options.length : null
    }

    // A report on a `.vue` file writes its answer in template syntax.
    const vueReport = reporterFor(context)
    const template = {
      VElement(element: VueElement) {
        if (!isPlainVueElement(element, importsOf(context))) return
        const name = element.rawName
        const node = reported(element.startTag)
        if (insideBespoke(context, node)) return

        if (elements.has(name)) {
          if (name === 'button') {
            vueReport({
              node,
              messageId: 'rawButton',
              data: { advice: vueButtonAdvice(element) },
            })
          } else if (name === 'input') {
            vueReport({
              node,
              messageId: 'rawInput',
              data: inputReportFor(vueLiteral(element, 'type')),
            })
          } else if (name === 'select') {
            const multiple = vueAttribute(element, 'multiple') !== undefined
            vueReport({
              node,
              messageId: 'rawSelect',
              data: {
                advice: selectAdviceFor(multiple, multiple ? null : vueOptionCount(element)),
              },
            })
          } else if (name === 'option' || name === 'optgroup') {
            vueReport({ node, messageId: 'rawOption', data: { element: name } })
          } else if (name === 'textarea') {
            vueReport({ node, messageId: 'rawTextarea' })
          } else {
            vueReport({ node, messageId: 'rawElement', data: { element: name } })
          }
          return
        }

        if (!whenHandled.has(name)) return
        // `@click` listens for what `onClick` handles; `:onClick` binds it outright.
        const listener = element.startTag.attributes.find((attribute) => {
          const event = listenedEvent(attribute)
          return event !== null && events.has(event.toLowerCase())
        })
        const bound = handlers.find((handler) => vueAttribute(element, handler) !== undefined)
        const handler = listener ? `@${listenedEvent(listener) as string}` : bound
        if (handler === undefined) return
        const linked = vueAttribute(element, 'href') !== undefined
        vueReport({
          node,
          messageId: 'handledElement',
          data: { element: name, handler, advice: handledAdviceFor(name, handler, linked) },
        })
      },
    }

    /** A Svelte `<button>`: its text as the label, and an `<Icon>` inside it as the member's `icon`. */
    function svelteButtonAdvice(element: SvelteElement): string {
      const children = meaningfulSvelteChildren(element.children)
      const icons = children.filter(
        (child): child is SvelteElement =>
          child.type === 'SvelteElement' &&
          (child as SvelteElement).kind === 'component' &&
          svelteElementName(child as SvelteElement) === 'Icon',
      )
      const glyph =
        icons.length === 1 ? svelteLiteral(icons[0] as SvelteElement, 'name') : undefined
      const rest = children.filter((child) => !icons.includes(child as SvelteElement))
      const text = rest.length === 0 ? null : svelteText(rest)
      return buttonAdviceFor(glyph, rest.length, labelAttribute(text))
    }

    /** The options a Svelte `<select>` writes out, or `null` when any is generated. */
    function svelteOptionCount(element: SvelteElement): number | null {
      const options = meaningfulSvelteChildren(element.children).flatMap((child): SvelteNode[] =>
        child.type === 'SvelteElement' && svelteElementName(child as SvelteElement) === 'optgroup'
          ? meaningfulSvelteChildren((child as SvelteElement).children)
          : [child],
      )
      // An `{#each}` writes one option for many and an `{#if}` some of them,
      // so the list is not counted.
      return options.every((child) => child.type === 'SvelteElement') ? options.length : null
    }

    /** An Angular `<button>`: its text as the label, and a `<pm-icon>` inside it as the member's `icon`. */
    function angularButtonAdvice(element: AngularElement): string {
      const children = meaningfulAngularChildren(element.children)
      const icons = children.filter(
        (child): child is AngularElement =>
          child.type === 'Element' && angularMember(child as AngularElement) === 'Icon',
      )
      const glyph =
        icons.length === 1 ? angularLiteral(icons[0] as AngularElement, 'name') : undefined
      const rest = children.filter((child) => !icons.includes(child as AngularElement))
      const text = rest.length === 0 ? null : angularText(rest)
      return buttonAdviceFor(glyph, rest.length, labelAttribute(text))
    }

    /** The options an Angular `<select>` writes out, or `null` when any is generated. */
    function angularOptionCount(element: AngularElement): number | null {
      const options = meaningfulAngularChildren(element.children).flatMap((child): AngularNode[] =>
        child.type === 'Element' && angularElementName(child as AngularElement) === 'optgroup'
          ? meaningfulAngularChildren((child as AngularElement).children)
          : [child],
      )
      // A `@for` or `*ngFor` writes one option for many and an `@if` some of
      // them, so the list is not counted.
      return options.every((child) => child.type === 'Element') ? options.length : null
    }

    // A report on an Angular template writes its answer in template syntax.
    const angularReport = angularReporterFor(context, noRawInteractive.meta?.messages)
    const angularTemplate = {
      Element(element: AngularElement) {
        if (!isPlainAngularElement(element)) return
        if (insideBespoke(context, element as unknown as Rule.Node)) return
        const name = angularElementName(element)
        const loc = startTagLoc(context, element)

        if (elements.has(name)) {
          if (name === 'button') {
            angularReport({
              loc,
              messageId: 'rawButton',
              data: { advice: angularButtonAdvice(element) },
            })
          } else if (name === 'input') {
            angularReport({
              loc,
              messageId: 'rawInput',
              data: inputReportFor(angularLiteral(element, 'type')),
            })
          } else if (name === 'select') {
            const multiple =
              angularAttribute(element, 'multiple') !== undefined ||
              angularInput(element, 'multiple') !== undefined
            angularReport({
              loc,
              messageId: 'rawSelect',
              data: {
                advice: selectAdviceFor(multiple, multiple ? null : angularOptionCount(element)),
              },
            })
          } else if (name === 'option' || name === 'optgroup') {
            angularReport({ loc, messageId: 'rawOption', data: { element: name } })
          } else if (name === 'textarea') {
            angularReport({ loc, messageId: 'rawTextarea' })
          } else {
            angularReport({ loc, messageId: 'rawElement', data: { element: name } })
          }
          return
        }

        if (!whenHandled.has(name)) return
        const handler = angularHandler(context.sourceCode, element, events)
        if (handler === undefined) return
        const linked =
          angularAttribute(element, 'href') !== undefined ||
          angularInput(element, 'href') !== undefined ||
          angularAttribute(element, 'routerLink') !== undefined ||
          angularInput(element, 'routerLink') !== undefined
        angularReport({
          loc,
          messageId: 'handledElement',
          data: { element: name, handler, advice: handledAdviceFor(name, handler, linked) },
        })
      },
    }

    const markup = {
      SvelteElement(element: SvelteElement) {
        if (!isPlainSvelteElement(element)) return
        const name = svelteElementName(element)
        const node = reportedMarkup(element.startTag)
        if (insideBespoke(context, node)) return

        if (elements.has(name)) {
          if (name === 'button') {
            context.report({
              node,
              messageId: 'rawButton',
              data: { advice: svelteButtonAdvice(element) },
            })
          } else if (name === 'input') {
            context.report({
              node,
              messageId: 'rawInput',
              data: inputReportFor(svelteLiteral(element, 'type')),
            })
          } else if (name === 'select') {
            const multiple = svelteAttribute(element, 'multiple') !== undefined
            context.report({
              node,
              messageId: 'rawSelect',
              data: {
                advice: selectAdviceFor(multiple, multiple ? null : svelteOptionCount(element)),
              },
            })
          } else if (name === 'option' || name === 'optgroup') {
            context.report({ node, messageId: 'rawOption', data: { element: name } })
          } else if (name === 'textarea') {
            context.report({ node, messageId: 'rawTextarea' })
          } else {
            context.report({ node, messageId: 'rawElement', data: { element: name } })
          }
          return
        }

        if (!whenHandled.has(name)) return
        const handler = svelteHandler(element, events)
        if (handler === undefined) return
        const linked = svelteAttribute(element, 'href') !== undefined
        context.report({
          node,
          messageId: 'handledElement',
          data: { element: name, handler, advice: handledAdviceFor(name, handler, linked) },
        })
      },
    }

    const script: Rule.RuleListener = {
      JSXOpeningElement(node: Rule.Node) {
        const opening = node as unknown as JsxOpeningElement
        const name = elementName(opening)
        // Capitalised names are components. Only intrinsic elements are raw.
        if (!name || !/^[a-z]/.test(name)) return
        if (insideBespoke(context, node)) return

        if (elements.has(name)) {
          const report = (
            descriptor: { messageId: string; data?: Record<string, string> },
            fix: Rule.ReportFixer | null,
          ) => context.report({ node, ...descriptor, ...(fix ? { fix } : {}) })

          if (name === 'button') {
            report(
              { messageId: 'rawButton', data: { advice: buttonAdvice(node) } },
              buttonFix(node),
            )
          } else if (name === 'input') {
            const checkbox = literal(opening, 'type')?.toLowerCase() === 'checkbox'
            report(
              { messageId: 'rawInput', data: inputReport(opening) },
              checkbox ? checkboxFix(node) : null,
            )
          } else if (name === 'select') {
            report({ messageId: 'rawSelect', data: { advice: selectAdvice(node, opening) } }, null)
          } else if (name === 'option' || name === 'optgroup') {
            report({ messageId: 'rawOption', data: { element: name } }, null)
          } else if (name === 'textarea') {
            report({ messageId: 'rawTextarea' }, textareaFix(node))
          } else {
            report({ messageId: 'rawElement', data: { element: name } }, null)
          }
          return
        }

        if (!whenHandled.has(name)) return
        const handler = jsxHandler(opening)
        if (handler) {
          context.report({
            node,
            messageId: 'handledElement',
            data: { element: name, handler, advice: handledAdvice(name, handler, opening) },
          })
        }
      },
    }

    return withAngularTemplate(
      context,
      withMarkup(context, withTemplate(context, script, template), markup),
      angularTemplate,
    )
  },
}
