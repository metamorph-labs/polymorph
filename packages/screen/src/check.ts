import { validateSpec, type SpecFault } from '@polymorph/spec/validate'

import { tooDeep, TOO_DEEP } from './depth'
import {
  allowedMembers,
  formPropOf,
  INHERITED_NAMES,
  inheritedNameFault,
  memberFault,
  sharedNameFault,
  surfaceOf,
  type MemberOptions,
  type ScreenVocabulary,
} from './members'
import { addressFaults, ADDRESS_KEYS } from './urls'
import { VOCABULARY } from './vocabulary'

/**
 * Whether a document is a screen a host may draw at run time.
 *
 * It is `validateSpec` (`packages/spec/src/validate.ts`) bound to the
 * run-time vocabulary table, so a page gets the faults the registry would
 * give with no registry in it, and two faults the run-time adds in the same
 * shape and voice:
 *
 *  - a member the host does not allow (`members`), with the reason when it
 *    is one that hosts another library's code;
 *  - an address a screen may not hold (`urls.ts`), at a prop or an object
 *    key that takes one, by the walk's rule: text, or a flat list of text;
 *  - a control's name that the screen's `values` cannot hold: one a control
 *    before it has, or one every object has (`__proto__`).
 *
 * A document nested deeper than `MAX_DEPTH` (`depth.ts`) is one fault, and is
 * not validated, as the validator reads it by recursion.
 *
 * It runs in a page and in Node alike. It reads only the document, and never
 * runs or inserts anything it holds.
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
    ),
  ]
  return { ok: all.length === 0, faults: all }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
): SpecFault[] {
  const faults: SpecFault[] = []

  /**
   * A value at a key that takes an address, by the walk's rule (`addressFaults`): text that is an
   * address a screen may hold, or a flat list of such text. A binding is the host's data, which
   * the walk checks when it draws, and a value the validator faults already (one of the wrong
   * type) is not faulted twice.
   */
  const address = (key: string, value: unknown, path: string): void => {
    if (isRecord(value) && typeof value['$'] === 'string') return
    for (const fault of addressFaults(key, value, path)) {
      if (!validated.has(fault.path)) faults.push(fault)
    }
  }

  /** Where the control that holds each name is, as the walk reaches them. */
  const named = new Map<string, string>()

  /**
   * A control's name, by the walk's rule: a name every object has is a fault, and so is a name a
   * control before it has. A name the host's data gives is the walk's to check.
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

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`))
      return
    }
    if (!isRecord(value)) return
    if (typeof value['component'] === 'string') {
      const fault = memberFault(vocabulary, value['component'], allowed)
      if (fault !== null) faults.push({ path, message: fault })
      const props = value['props']
      if (isRecord(props)) {
        for (const [key, item] of Object.entries(props)) {
          const at = `${path}.props.${key}`
          if (ADDRESS_KEYS.has(key)) address(key, item, at)
          visit(item, at)
        }
        name(value['component'], props, path)
      }
      visit(value['children'], `${path}.children`)
      return
    }
    const fields = value['$object']
    if (isRecord(fields)) {
      for (const [key, item] of Object.entries(fields)) {
        const at = `${path}.${key}`
        if (ADDRESS_KEYS.has(key)) address(key, item, at)
        visit(item, at)
      }
    }
  }

  if (isRecord(document)) visit(document['root'], '$.root')
  return faults
}
