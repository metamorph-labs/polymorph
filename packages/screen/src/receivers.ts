import { unionParts } from '@polymorph/registry/frameworks'
import type { TableDataType } from '@polymorph/registry/screen-table'
import { EVENT_HANDLER_ALIAS } from '@polymorph/spec/action-type'

import { isAction, isCallback } from './actions'
import { MAX_DEPTH } from './depth'
import type { ScreenVocabulary } from './members'

/**
 * What receives a value at each place in a document: the printed type of the
 * prop, the list item or the structured object's field the value is written
 * at, read from the vocabulary's props and named data types.
 *
 * A member calls a prop by the prop's type and draws a field by the field's
 * type, whatever the document put there. So the walk decides by the receiver
 * what a value may be there: a function the screen made only where a callback
 * receives it, and an element in a structured object only where the field
 * takes a node.
 *
 * Every type read here is the vocabulary's own, never a document's, and each
 * is read once for each vocabulary.
 */

/** The printed type that receives a value at a place, or `null` where the vocabulary does not say. */
export type Receiver = string | null

/** What a callback receiver is handed: the action, or a question's stub. */
export type CallbackKind = 'action' | 'question'

/** A type a member draws as a node. */
const NODE = /^(?:React\.)?(?:ReactNode|ReactElement|ReactPortal)\b|^JSX\.Element\b/

/** A type no structured object can be: text, a number, a boolean, a literal of one. */
const SCALAR =
  /^(?:string|number|boolean|true|false|null|void|never|-?\d+(?:\.\d+)?|"[^"]*"|'[^']*')$/

/** A named type and its arguments: `DataTableColumn<Row>`. */
const NAMED = /^([A-Za-z_$][\w$]*)(?:<(.*)>)?$/s

/** The parts of a structured object's type: its named data types and a record's value type. */
interface ObjectType {
  types: readonly TableDataType[]
  /** The value type of a `Record<K, V>` part, which takes any key. */
  record: string | null
}

interface Index {
  dataTypes: Map<string, TableDataType>
  items: Map<string, Receiver>
  objects: Map<string, ObjectType | null>
  callbacks: Map<string, CallbackKind | null>
  nodes: Map<string, boolean>
}

const INDEXES = new WeakMap<ScreenVocabulary, Index>()

function indexOf(vocabulary: ScreenVocabulary): Index {
  let index = INDEXES.get(vocabulary)
  if (index === undefined) {
    index = {
      dataTypes: new Map((vocabulary.dataTypes ?? []).map((type) => [type.name, type])),
      items: new Map(),
      objects: new Map(),
      callbacks: new Map(),
      nodes: new Map(),
    }
    INDEXES.set(vocabulary, index)
  }
  return index
}

function remembered<Value>(cache: Map<string, Value>, key: string, read: () => Value): Value {
  if (cache.has(key)) return cache.get(key) as Value
  const value = read()
  cache.set(key, value)
  return value
}

/** The text without the parentheses around all of it. The vocabulary's types are short. */
function bare(text: string): string {
  let inner = text.trim().replace(/^readonly\s+/, '')
  for (;;) {
    if (!inner.startsWith('(')) return inner
    let depth = 0
    let end = -1
    for (let at = 0; at < inner.length; at += 1) {
      const char = inner[at] as string
      if ('(<{['.includes(char)) depth += 1
      else if (')}]'.includes(char) || (char === '>' && inner[at - 1] !== '=')) {
        depth -= 1
        if (depth === 0) {
          end = at
          break
        }
      }
    }
    if (end !== inner.length - 1) return inner
    inner = inner.slice(1, -1).trim()
  }
}

/** A type's parts other than `null` and `undefined`, each without the parentheses around it. */
function partsOf(type: string): string[] {
  return unionParts(type)
    .filter((part) => part !== 'null')
    .flatMap((part) => {
      const inner = bare(part)
      // A union in parentheses (`(SelectOption | SelectOptionGroup)`) is its parts.
      return inner !== part && unionParts(inner).length > 1 ? partsOf(inner) : [inner]
    })
}

/** The item type of a list part (`X[]`, `Array<X>`), or `null` for a part that is no list. */
function listItem(part: string): string | null {
  if (part.endsWith('[]')) return part.slice(0, -2)
  const named = NAMED.exec(part)
  return named !== null && (named[1] === 'Array' || named[1] === 'ReadonlyArray')
    ? (named[2] ?? null)
    : null
}

/**
 * The type of an item of a list written where `type` receives a value: the
 * list's item type, a node where a node goes, and the type itself where the
 * type is no list, as a member reads each item as one.
 */
export function itemOf(vocabulary: ScreenVocabulary, type: Receiver): Receiver {
  if (type === null) return null
  return remembered(indexOf(vocabulary).items, type, () => {
    const parts = partsOf(type)
    if (parts.some((part) => NODE.test(part))) return type
    const items = parts.flatMap((part) => {
      const item = listItem(part)
      return item === null ? [] : [item]
    })
    return items.length === 0 ? type : items.join(' | ')
  })
}

/**
 * The named data types, and a record's value type, that a structured object
 * written where `type` receives a value can be; `null` where the type names
 * one the vocabulary does not have (a row of the host's own type, an object
 * type written out) or no object at all.
 */
function objectOf(vocabulary: ScreenVocabulary, type: string): ObjectType | null {
  const index = indexOf(vocabulary)
  return remembered(index.objects, type, () => {
    const types: TableDataType[] = []
    let record: string | null = null
    const seen = new Set<string>()
    const read = (text: string): boolean => {
      for (const part of partsOf(text)) {
        if (SCALAR.test(part) || listItem(part) !== null) continue
        const named = NAMED.exec(part)
        if (named === null) return false
        const name = named[1] as string
        if (name === 'Record') {
          // `Record<K, V>` takes any key, each with a `V`.
          const value = splitArguments(named[2] ?? '')[1]
          if (value === undefined) return false
          record = record === null ? value : `${record} | ${value}`
          continue
        }
        // `Readonly<T>` and `Partial<T>` have `T`'s fields.
        if (name === 'Readonly' || name === 'Partial') {
          if (!read(named[2] ?? '')) return false
          continue
        }
        const known = index.dataTypes.get(name)
        if (known === undefined) return false
        if (seen.has(name)) continue
        seen.add(name)
        if (known.union !== undefined && known.union.length > 0) {
          if (!read(known.union.join(' | '))) return false
        } else types.push(known)
      }
      return true
    }
    if (!read(type) || (types.length === 0 && record === null)) return null
    return { types, record }
  })
}

/** A type's arguments, split at the commas outside brackets: `K, V` of `Record<K, V>`. */
function splitArguments(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string
    if ('(<{['.includes(char)) depth += 1
    else if (')}]'.includes(char) || (char === '>' && text[at - 1] !== '=')) depth -= 1
    else if (char === ',' && depth === 0) {
      out.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  out.push(text.slice(start).trim())
  return out
}

/**
 * The type of a structured object's field, where the object is written at
 * `type`: the field's type in each data type the object can be, `undefined`
 * where the object's type is known and declares no such field, and `null`
 * where the object's type is not known (`objectOf`).
 */
export function fieldOf(
  vocabulary: ScreenVocabulary,
  type: Receiver,
  key: string,
): Receiver | undefined {
  if (type === null) return null
  const object = objectOf(vocabulary, type)
  if (object === null) return null
  const found = new Set<string>()
  for (const dataType of object.types) {
    for (const field of dataType.fields) if (field.name === key) found.add(field.type)
  }
  if (object.record !== null) found.add(object.record)
  return found.size === 0 ? undefined : [...found].join(' | ')
}

/** The name of the data type a structured object at `type` is, for a fault's words. */
export function objectName(vocabulary: ScreenVocabulary, type: Receiver): string {
  const object = type === null ? null : objectOf(vocabulary, type)
  const names = object?.types.map((dataType) => `\`${dataType.name}\``) ?? []
  return names.length === 0 ? 'its type' : names.join(' or ')
}

/** Whether a member draws a node received at `type`. Where the vocabulary does not say, it may. */
export function takesNode(vocabulary: ScreenVocabulary, type: Receiver): boolean {
  if (type === null) return true
  return remembered(indexOf(vocabulary).nodes, type, () =>
    partsOf(type).some((part) => NODE.test(part) || NODE.test(bare(listItem(part) ?? ''))),
  )
}

/**
 * What a callback receiver at `type` is handed: the action where every
 * function the type allows returns nothing, a question's stub where one
 * returns a value, and `null` where the type is no callback or is not known.
 */
export function callbackOf(vocabulary: ScreenVocabulary, type: Receiver): CallbackKind | null {
  if (type === null) return null
  return remembered(indexOf(vocabulary).callbacks, type, () => {
    if (!isCallback(type)) return null
    // A handler alias (`ReactEventHandler<T>`) is a function of one event that returns nothing.
    const parts = partsOf(type).filter((part) => !EVENT_HANDLER_ALIAS.test(part))
    const functions = parts.filter((part) => part.includes('=>'))
    // A part that is no function is a function's own return type split off at its `|`:
    // `() => void | Promise<void>` is one function, which returns either.
    if (functions.length !== parts.length) return isAction(type) ? 'action' : 'question'
    return functions.every((part) => isAction(part)) ? 'action' : 'question'
  })
}

/** The fault's words for a callback input bound where no callback receives it. */
export const unreceivedCallback = (input: string): string =>
  `\`${input}\` is a callback input, and no callback receives it here: a member would hand it ` +
  'on as text or data, or call it while it draws — bind it to a prop or a field whose type is a ' +
  'function'

/** The fault's words for a binding whose value in the host's data is a function. */
export const functionInData = (binding: string): string =>
  `the host's data holds a function at \`${binding}\`, which a member would call without the ` +
  'host being told — bind a callback input instead'

/** The fault's words for an element in a field its data type does not declare. */
export const undeclaredField = (key: string, type: string): string =>
  `${type} has no field \`${key}\`, so no member draws an element there; it is left out`

/** The fault's words for an element in a field its data type declares as data. */
export const dataField = (key: string, type: string): string =>
  `\`${key}\` of ${type} is data, not a node, so no member draws an element there; it is left out`

/**
 * Whether a value is an element, or a list (of lists) with an element among
 * its items, down to `MAX_DEPTH` levels. A structured object's own fields are
 * read when the walk reaches it.
 */
export function elementIn(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false
  if (Array.isArray(value)) return value.some((item) => elementIn(item, depth + 1))
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['component'] === 'string'
  )
}
