import { validateSpec, type SpecFault } from '@polymorph/spec/validate'

import { isCallback, MAX_TYPE_LENGTH, typeTooLong } from './actions'
import { tooDeep, TOO_DEEP } from './depth'
import {
  allowedMembers,
  formPropOf,
  INHERITED_NAMES,
  inheritedNameFault,
  keyTooLong,
  MAX_KEY_LENGTH,
  memberFault,
  sharedNameFault,
  surfaceOf,
  type AddressPolicy,
  type MemberOptions,
  type ScreenVocabulary,
} from './members'
import {
  callbackOf,
  dataField,
  elementIn,
  fieldOf,
  holdsData,
  itemOf,
  notOneElement,
  objectName,
  takesElement,
  takesNode,
  undeclaredField,
  unreceivedCallback,
  withoutElements,
  type Receiver,
} from './receivers'
import { parsePartial } from './partial'
import { addressFaults, ADDRESS_KEYS, refusedAddress } from './urls'
import { VOCABULARY } from './vocabulary'

/**
 * Whether a document is a screen a host may draw at run time.
 *
 * It is `validateSpec` (`packages/spec/src/validate.ts`) bound to the
 * run-time vocabulary table, so a page gets the faults the registry would
 * give with no registry in it, and the faults the walk adds for the document,
 * in the same shape and voice:
 *
 *  - a member the host does not allow (`members`), with the reason when it
 *    is one that hosts another library's code, or one a host that refuses
 *    addresses cannot draw;
 *  - an address a screen may not hold (`urls.ts`), at a prop or an object
 *    key that takes one, by the walk's rule: text, or a flat list of text;
 *    and under `addresses: 'refused'`, any value at such a key, a binding
 *    included;
 *  - a control's name that the screen's `values` cannot hold: one a control
 *    before it in document order has, or one every object has (`__proto__`);
 *  - an input type longer than `MAX_TYPE_LENGTH`;
 *  - a callback input bound where no callback receives it, and an element in
 *    a structured object's field that takes no node (`receivers.ts`).
 *
 * What the walk checks of the host's data (an address, a function) it checks
 * when it draws, as this reads only the document.
 *
 * A document nested deeper than `MAX_DEPTH` (`depth.ts`) is one fault, and is
 * not validated, as the validator reads it by recursion.
 *
 * It runs in a page and in Node alike. It reads only the document, and never
 * runs or inserts anything it holds.
 *
 * `checkAnswer` checks a model's whole answer as text: it reads the document
 * with `parsePartial` and reports an answer that ends before its document
 * does, which `checkScreen` cannot see in the document it read.
 */

export interface ScreenCheckOptions extends MemberOptions {
  /** The vocabulary to check against. The generated table when absent. */
  vocabulary?: ScreenVocabulary
}

export interface ScreenCheck {
  ok: boolean
  faults: SpecFault[]
}

export function checkScreen(document: unknown, options: ScreenCheckOptions = {}): ScreenCheck {
  // The validator reads a document by recursion, so one nested deeper than any screen is refused
  // before it is read (`depth.ts`).
  const deep = tooDeep(document)
  if (deep !== null) return { ok: false, faults: [{ path: deep, message: TOO_DEEP }] }
  const vocabulary = options.vocabulary ?? VOCABULARY
  const { faults } = validateSpec(
    vocabulary,
    document,
    {},
    {
      ...(options.framework === undefined ? {} : { framework: options.framework }),
    },
  )
  const all = [
    ...faults,
    ...runTimeFaults(
      vocabulary,
      document,
      allowedMembers(vocabulary, options),
      new Set(faults.map(({ path }) => path)),
      options.addresses ?? 'allowed',
    ),
  ]
  return { ok: all.length === 0, faults: all }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a value the document writes is an element. */
const isElementValue = (value: unknown): boolean =>
  isRecord(value) && typeof value['component'] === 'string'

/**
 * The run-time faults of a document, in document order, by the validator's
 * paths (`$.root.props.emptyState.href`). It reads plain JSON, as a document
 * that fails the shape check is still read. `validated` holds the paths the
 * validator faults.
 */
function runTimeFaults(
  vocabulary: ScreenVocabulary,
  document: unknown,
  allowed: ReadonlySet<string>,
  validated: ReadonlySet<string>,
  addresses: AddressPolicy,
): SpecFault[] {
  const faults: SpecFault[] = []

  /**
   * A value at a key that takes an address, by the walk's rule (`addressFaults`): text that is an
   * address a screen may hold, or a flat list of such text. A binding is the host's data, which
   * the walk checks when it draws, and a value the validator faults already (one of the wrong
   * type) is not faulted twice. Under a host that refuses addresses, any value is a fault, a
   * binding included: the document asks for an address there, whatever the host's data holds.
   */
  const address = (key: string, value: unknown, path: string): void => {
    if (addresses === 'refused') {
      if (!validated.has(path)) faults.push({ path, message: refusedAddress(key) })
      return
    }
    if (isRecord(value) && typeof value['$'] === 'string') return
    for (const fault of addressFaults(key, value, path)) {
      if (!validated.has(fault.path)) faults.push(fault)
    }
  }

  /** Where the control that holds each name is, in document order. */
  const named = new Map<string, string>()

  /**
   * A control's name, by the walk's rule: a name every object has is a fault, and so is a name a
   * control before it in document order has. A name the host's data gives is the walk's to check.
   */
  const name = (component: string, props: Record<string, unknown>, path: string): void => {
    const surface = surfaceOf(vocabulary, component)
    const given = props['name']
    if (surface === null || formPropOf(surface) === null) return
    if (typeof given !== 'string' || given === '') return
    const at = `${path}.props.name`
    if (INHERITED_NAMES.has(given)) {
      faults.push({ path: at, message: inheritedNameFault(given) })
      return
    }
    const before = named.get(given)
    if (before !== undefined) faults.push({ path: at, message: sharedNameFault(given, before) })
    named.set(given, path)
  }

  /** A run-time fault, unless the validator faults the same path already. */
  const fault = (path: string, message: string): void => {
    if (!validated.has(path)) faults.push({ path, message })
  }

  // The callback inputs, which the walk hands only to a callback receiver (`receivers.ts`), and
  // the types too long to read, which are data with no value.
  const callbacks = new Set<string>()
  const inputs = isRecord(document) ? document['inputs'] : undefined
  if (Array.isArray(inputs)) {
    inputs.forEach((input, at) => {
      if (!isRecord(input) || typeof input['name'] !== 'string') return
      const type = input['type']
      if (typeof type !== 'string') return
      if (type.length > MAX_TYPE_LENGTH) {
        fault(`$.inputs[${at}].type`, typeTooLong(input['name'], type.length))
      } else if (isCallback(type)) callbacks.add(input['name'])
    })
  }

  /** A value written at `path`, where `receiver` is the type that receives it. */
  /**
   * A value written at `path`, where `receiver` is the type that receives it. `unnamed` is set
   * below an element the walk does not draw for a prop it requires and was never written, whose
   * controls hold no name in `values`.
   */
  const visit = (value: unknown, path: string, receiver: Receiver, unnamed = false): void => {
    if (Array.isArray(value)) {
      const item = itemOf(vocabulary, receiver)
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`, item, unnamed))
      return
    }
    if (!isRecord(value)) return
    if (typeof value['$'] === 'string') {
      const binding = value['$']
      if (callbacks.has(binding) && callbackOf(vocabulary, receiver) === null) {
        fault(path, unreceivedCallback(binding))
      }
      return
    }
    if (typeof value['component'] === 'string') {
      const component = value['component']
      const member = memberFault(vocabulary, component, allowed, addresses)
      if (member !== null) faults.push({ path, message: member })
      const surface = surfaceOf(vocabulary, component)
      const types = new Map((surface?.props ?? []).map((prop) => [prop.name, prop.type]))
      const props = isRecord(value['props']) ? value['props'] : {}
      // The walk does not draw an element that lacks a required data prop or a required prop
      // that takes one element (a SettingsRow's control).
      const lacks = (surface?.props ?? []).some(
        (prop) =>
          !prop.optional &&
          prop.name !== 'children' &&
          !isCallback(prop.type) &&
          (!takesNode(vocabulary, prop.type) || takesElement(vocabulary, prop.type)) &&
          !Object.prototype.hasOwnProperty.call(props, prop.name),
      )
      const silent = unnamed || lacks
      // In document order an element comes before what its props and children hold.
      if (!silent) name(component, props, path)
      for (const [key, item] of Object.entries(props)) {
        if (key.length > MAX_KEY_LENGTH) {
          fault(path, keyTooLong(key.length))
          continue
        }
        const at = `${path}.props.${key}`
        // A prop that takes one element is handed only an element; the walk leaves anything else
        // out, a binding included, as the host's data holds no element.
        if (takesElement(vocabulary, types.get(key) ?? null) && !isElementValue(item)) {
          fault(at, notOneElement(key))
        }
        if (ADDRESS_KEYS.has(key)) address(key, item, at)
        visit(item, at, types.get(key) ?? null, silent)
      }
      visit(value['children'], `${path}.children`, types.get('children') ?? null, silent)
      return
    }
    const fields = value['$object']
    if (isRecord(fields)) {
      for (const [key, item] of Object.entries(fields)) {
        if (key.length > MAX_KEY_LENGTH) {
          fault(path, keyTooLong(key.length))
          continue
        }
        const at = `${path}.${key}`
        const field = fieldOf(vocabulary, receiver, key)
        let held: unknown = item
        if (field !== null && !takesNode(vocabulary, field?.type ?? 'never')) {
          const type = objectName(vocabulary, receiver)
          const message = field === undefined ? undeclaredField(key, type) : dataField(key, type)
          if (holdsData(vocabulary, field)) {
            const kept = withoutElements(item)
            if (kept.removed) fault(at, message)
            if (kept.value === undefined) continue
            held = kept.value
          } else if (elementIn(item)) {
            fault(at, message)
            continue
          }
        }
        if (ADDRESS_KEYS.has(key)) address(key, held, at)
        visit(held, at, field?.type ?? null, unnamed)
      }
    }
  }

  if (isRecord(document)) visit(document['root'], '$.root', null)
  return faults
}

/** What `checkAnswer` says of a model's whole answer. */
export interface AnswerCheck extends ScreenCheck {
  /** The document the answer holds, whole or as far as it got; `undefined` when it holds none. */
  document: unknown
  /** Whether the answer holds the whole of its document: its outermost brace closed. */
  complete: boolean
  /** The answer's text outside the document's fenced block (`parsePartial`'s `prose`). */
  prose: string
}

/**
 * The fault of an answer that ended before its document did: the model
 * stopped in the middle, most often at its output limit. Its words carry what
 * a retry needs.
 */
export const cutAnswer = (where: string | null): string =>
  `the answer ends before its document does${where === null ? ', inside the fenced block that holds it' : `, inside \`${where}\``}: ` +
  'it was cut off, as at an output limit. Answer with the whole document, with fewer elements if it was long'

/**
 * Whether a model's whole answer is a screen a host may draw: the answer as
 * text, read with `parsePartial`, then its document checked with
 * `checkScreen` and the same options.
 *
 * Call it once the answer has ended. An answer that ends before its document
 * does is a fault at `$` (`cutAnswer`), and so is text that stops being JSON;
 * the document such an answer holds is returned as far as it got, with no
 * other fault, as what is missing from it is the cut's and not the model's
 * choice. An answer with no document is prose, which is lawful: `document` is
 * `undefined` and `ok` is `true`, and a host that needs a screen asks again.
 * While the answer streams, a document that has not closed is what has
 * arrived so far and is no fault: read it with `parsePartial`.
 */
export function checkAnswer(text: string, options: ScreenCheckOptions = {}): AnswerCheck {
  const read = parsePartial(text)
  const answered = { document: read.document, complete: read.complete, prose: read.prose }
  if (read.error !== null) {
    const message = `the answer stops being JSON at character ${read.error.at}: ${read.error.message}`
    return { ok: false, faults: [{ path: '$', message }], ...answered }
  }
  if (!read.complete && (read.document !== undefined || read.fence === 'open')) {
    return { ok: false, faults: [{ path: '$', message: cutAnswer(read.cut) }], ...answered }
  }
  if (read.document === undefined) return { ok: true, faults: [], ...answered }
  return { ...checkScreen(read.document, options), ...answered }
}
