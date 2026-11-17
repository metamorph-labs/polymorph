import { createNormalizer, type PropTypes } from '@zag-js/types'

/**
 * A machine's props as a description reads them, and as a Svelte element
 * takes them.
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
 * `normalizeProps` is the normalizer a member connects its machine with, so
 * `api`'s getters return that spelling. `attributes` turns an object in that
 * spelling into Svelte's: a handler's name lowercased (`onkeydown`) and the
 * style written as text. A member spreads every machine prop through it.
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

/** SVG attributes whose DOM name is camelCase. */
const KEPT = new Set(['viewBox', 'preserveAspectRatio'])

function described(name: string): string {
  const renamed = RENAMED[name]
  if (renamed !== undefined) return renamed
  if (name.startsWith('on'))
    return `on${name.charAt(2).toUpperCase()}${name.slice(3).toLowerCase()}`
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

/** A style object as declarations: `{ '--height': '4px', zIndex: 2 }` -> `--height:4px;z-index:2;`. */
export function styleText(style: Readonly<Record<string, unknown>>): string {
  let text = ''
  for (const [property, value] of Object.entries(style)) {
    if (value === null || value === undefined || value === '') continue
    const name = property.startsWith('--')
      ? property
      : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    text += `${name}:${String(value)};`
  }
  return text
}

/**
 * Several attribute objects on one element, in the description's spelling,
 * merged as Vue merges props: handlers for the same event all run, in order,
 * and an `undefined` handler leaves the one before it; styles combine, and
 * classes are kept together; any other attribute takes the last value.
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
      } else if (name === 'class' && before !== undefined && value !== undefined) {
        merged[name] = [before, value]
      } else merged[name] = value
    }
  }
  return merged
}

/**
 * An object in the description's spelling as Svelte's attributes: every
 * handler's name lowercased, as Svelte names an event attribute, and a style
 * object written as text.
 */
export function attributes(props: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (isHandler(name)) out[name.toLowerCase()] = value
    else if (name === 'style' && isRecord(value)) out['style'] = styleText(value)
    else out[name] = value
  }
  return out
}

/**
 * A callback a parent hands to a member in its slot (`pass`), run after the
 * member's own, as Vue runs both: Dialog's trigger opens the panel and still
 * calls the caller's `onClick`.
 */
export function chainHandlers<Callback extends (...args: never[]) => unknown>(
  own: Callback | undefined,
  passed: unknown,
): Callback | undefined {
  if (typeof passed !== 'function') return own
  if (own === undefined) return passed as Callback
  return ((...args: Parameters<Callback>) => {
    own(...args)
    ;(passed as Callback)(...args)
  }) as Callback
}
