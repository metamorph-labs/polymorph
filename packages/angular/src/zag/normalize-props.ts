import { createNormalizer, type PropTypes } from '@zag-js/types'

/**
 * A machine's props as a description reads them, and as an Angular element
 * takes them through `Spread` (`[pmSpread]`).
 *
 * A description reads a machine's props in one spelling, whatever the
 * framework: a handler is `on` and the DOM event's name with its first letter
 * capitalised (`onClick`, `onKeydown`, `onFocusin`), React's `htmlFor`,
 * `className`, `defaultValue` and `defaultChecked` are `for`, `class`, `value`
 * and `checked`, and `style` is an object, so an expression can read one
 * property of it (`Object(api.getContentProps().style)['--height']`). The
 * description also writes that spelling when it overrides a handler
 * (`{ ...api.getInputProps(), onKeydown: fieldKeyDown }`).
 *
 * An Angular template cannot spread an object of attributes and listeners
 * onto an element, so `normalizeProps` gives the machine's props that spelling
 * and the `Spread` directive writes them onto the element, as Vue writes a
 * spread object: an attribute, a DOM property, a style property, a class or a
 * listener each.
 */

const RENAMED: Readonly<Record<string, string>> = {
  htmlFor: 'for',
  className: 'class',
  onDoubleClick: 'onDblclick',
  onChange: 'onInput',
  onFocus: 'onFocusin',
  onBlur: 'onFocusout',
  defaultValue: 'value',
  defaultChecked: 'checked',
}

/** SVG attributes whose camelCase the DOM keeps. */
const KEPT = new Set([
  'viewBox',
  'className',
  'preserveAspectRatio',
  'fillRule',
  'clipPath',
  'clipRule',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
])

function described(name: string): string {
  const renamed = RENAMED[name]
  if (renamed !== undefined) return renamed
  if (/^on[A-Z]/.test(name)) return `on${name.charAt(2)}${name.slice(3).toLowerCase()}`
  if (KEPT.has(name)) return name
  return name.toLowerCase()
}

/** The normalizer a member connects its machine with: the description's spelling. */
export const normalizeProps = createNormalizer<PropTypes>((props: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (name === 'children') {
      if (typeof value === 'string') normalized['textContent'] = value
      continue
    }
    normalized[described(name)] = value
  }
  return normalized
})

const isHandler = (name: string) => /^on[A-Z]/.test(name)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Several attribute objects on one element, in the description's spelling,
 * merged as Vue merges props: handlers for the same event all run, in order,
 * and an `undefined` handler leaves the one before it; styles combine, and
 * classes are kept together; any other attribute takes the last value, even
 * an `undefined` one, so a description takes an attribute away from a machine
 * (`hidden: undefined` while a panel plays its exit).
 */
export function mergeParts(...parts: readonly object[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const part of parts) {
    for (const [name, value] of Object.entries(part)) {
      const before = merged[name]
      if (isHandler(name)) {
        if (typeof value !== 'function') {
          if (value !== undefined || before === undefined) merged[name] = value
          continue
        }
        merged[name] =
          typeof before === 'function'
            ? (...args: unknown[]) => {
                ;(before as (...args: unknown[]) => unknown)(...args)
                ;(value as (...args: unknown[]) => unknown)(...args)
              }
            : value
      } else if (name === 'style' && isRecord(before) && isRecord(value)) {
        merged[name] = { ...before, ...value }
      } else if (name === 'class' && typeof before === 'string' && typeof value === 'string') {
        merged[name] = `${before} ${value}`
      } else merged[name] = value
    }
  }
  return merged
}
