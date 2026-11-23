import { unionParts } from '@polymorph/registry/frameworks'
import type { TableDataType } from '@polymorph/registry/screen-table'
import { EVENT_HANDLER_ALIAS, unwrap } from '@polymorph/spec/action-type'

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

/** A type a member reads as one element (a trigger it clones), as `childrenKind` reads it. */
const ELEMENT = /^(?:React\.)?ReactElement\b/

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
  /** What each reading below found for a type, by the reading's name and the type. */
  read: Map<string, unknown>
}

const INDEXES = new WeakMap<ScreenVocabulary, Index>()

function indexOf(vocabulary: ScreenVocabulary): Index {
  let index = INDEXES.get(vocabulary)
  if (index === undefined) {
    index = {
      dataTypes: new Map((vocabulary.dataTypes ?? []).map((type) => [type.name, type])),
      read: new Map(),
    }
    INDEXES.set(vocabulary, index)
  }
  return index
}

/** A reading of a vocabulary's type, made once for each vocabulary and type. */
function remembered<Value>(
  vocabulary: ScreenVocabulary,
  reading: string,
  type: string,
  read: () => Value,
): Value {
  const cache = indexOf(vocabulary).read
  const key = `${reading}\u0000${type}`
  if (!cache.has(key)) cache.set(key, read())
  return cache.get(key) as Value
}

/** The text without `readonly` and the parentheses around all of it. */
const bare = (text: string): string => unwrap(unwrap(text).replace(/^readonly\s+/, ''))

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
  return remembered(vocabulary, 'item', type, () => {
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
  const { dataTypes } = indexOf(vocabulary)
  return remembered(vocabulary, 'object', type, () => {
    const types: TableDataType[] = []
    let record: string | null = null
    const seen = new Set<string>()
    const read = (text: string): boolean => {
      for (const part of partsOf(text)) {
        if (SCALAR.test(part) || listItem(part) !== null) continue
        const named = NAMED.exec(part)
        if (named === null) return false
        const [, name, args = ''] = named
        // `Readonly<T>` has `T`'s fields.
        if (name === 'Readonly') {
          if (!read(args)) return false
          continue
        }
        // `Record<K, V>` takes any key, each with a `V`; a key type with commas or brackets is
        // not read.
        if (name === 'Record') {
          const value = /^[^,<>()]*,(.*)$/s.exec(args)?.[1]?.trim()
          if (value === undefined) return false
          record = record === null ? value : `${record} | ${value}`
          continue
        }
        const known = dataTypes.get(name as string)
        if (known === undefined) return false
        if (seen.has(known.name)) continue
        seen.add(known.name)
        if (known.union !== undefined && known.union.length > 0) {
          if (!read(known.union.join(' | '))) return false
        } else types.push(known)
      }
      return true
    }
    return read(type) && (types.length > 0 || record !== null) ? { types, record } : null
  })
}

/** A field of a structured object: the type that receives its value, and whether it may be left out. */
export interface Field {
  type: string
  optional: boolean
}

/**
 * A structured object's field, where the object is written at `type`: its type
 * in each data type the object can be, `undefined` where the object's type is
 * known and declares no such field, and `null` where the object's type is not
 * known (`objectOf`). It is optional only where every data type that declares
 * it marks it so; a record's value may not be left out.
 */
export function fieldOf(
  vocabulary: ScreenVocabulary,
  type: Receiver,
  key: string,
): Field | undefined | null {
  if (type === null) return null
  const object = objectOf(vocabulary, type)
  if (object === null) return null
  const found = new Set<string>()
  let optional = object.record === null
  for (const dataType of object.types) {
    for (const field of dataType.fields) {
      if (field.name !== key) continue
      found.add(field.type)
      optional &&= field.optional
    }
  }
  if (object.record !== null) found.add(object.record)
  return found.size === 0 ? undefined : { type: [...found].join(' | '), optional }
}

/**
 * Whether a structured object's field takes data only, so nothing below it may
 * be an element: a field its type does not declare, or one whose type, and its
 * items', are text, numbers, booleans and their literals. A field of an object
 * type the vocabulary names is read field by field, and one of a type it does
 * not name may hold elements, as a host's row may.
 */
export function holdsData(vocabulary: ScreenVocabulary, field: Field | undefined): boolean {
  if (field === undefined) return true
  const item = itemOf(vocabulary, field.type) ?? ''
  return partsOf(item).every((part) => SCALAR.test(part))
}

/**
 * A value without the elements in it, at any depth through lists and
 * structured objects, and whether it held any. What else it holds is kept: a
 * list loses only its elements, and an object only its fields that were one.
 */
export function withoutElements(value: unknown, depth = 0): { value: unknown; removed: boolean } {
  if (depth > MAX_DEPTH || typeof value !== 'object' || value === null) {
    return { value, removed: false }
  }
  if (Array.isArray(value)) {
    let removed = false
    const kept: unknown[] = []
    for (const item of value) {
      const inner = withoutElements(item, depth + 1)
      removed ||= inner.removed
      if (inner.value !== undefined) kept.push(inner.value)
    }
    return removed ? { value: kept, removed } : { value, removed }
  }
  const record = value as Record<string, unknown>
  if (typeof record['component'] === 'string') return { value: undefined, removed: true }
  const fields = record['$object']
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    return { value, removed: false }
  }
  let removed = false
  const kept: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(fields)) {
    const inner = withoutElements(item, depth + 2)
    removed ||= inner.removed
    if (inner.value !== undefined) {
      Object.defineProperty(kept, key, {
        value: inner.value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
  }
  return removed ? { value: { $object: kept }, removed } : { value, removed }
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
  return remembered(vocabulary, 'node', type, () =>
    partsOf(type).some((part) => NODE.test(part) || NODE.test(bare(listItem(part) ?? ''))),
  )
}

/**
 * Whether a prop takes exactly one element, which its member reads (a
 * SettingsRow's control, a Dialog's trigger, each cloned with props of its
 * own), rather than any node. Such a member cannot take a fault in its place.
 */
export function takesElement(vocabulary: ScreenVocabulary, type: Receiver): boolean {
  if (type === null) return false
  return remembered(vocabulary, 'element', type, () => {
    const parts = partsOf(type)
    return parts.length > 0 && parts.every((part) => ELEMENT.test(part))
  })
}

/**
 * What a callback receiver at `type` is handed: the action where every
 * function the type allows returns nothing, a question's stub where one
 * returns a value, and `null` where the type is no callback or is not known.
 */
export function callbackOf(vocabulary: ScreenVocabulary, type: Receiver): CallbackKind | null {
  if (type === null) return null
  return remembered(vocabulary, 'callback', type, () => {
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

/** The fault's words for a value that is no drawn element where a prop takes one element. */
export const notOneElement = (prop: string): string =>
  `\`${prop}\` takes one element, which its member reads, and this is not one; it is left out`

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
