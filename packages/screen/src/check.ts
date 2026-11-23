import { validateSpec, type SpecFault } from '@polymorph/spec/validate'

import { allowedMembers, memberFault, type MemberOptions, type ScreenVocabulary } from './members'
import { addressFault, addressMessage, ADDRESS_KEYS } from './urls'
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
 *    key that takes one.
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
    ...runTimeFaults(vocabulary, document, allowedMembers(vocabulary, options)),
  ]
  return { ok: all.length === 0, faults: all }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The run-time faults of a document, in document order, by the validator's
 * paths (`$.root.props.emptyState.href`). It reads plain JSON, as a document
 * that fails the shape check is still read.
 */
function runTimeFaults(
  vocabulary: ScreenVocabulary,
  document: unknown,
  allowed: ReadonlySet<string>,
): SpecFault[] {
  const faults: SpecFault[] = []

  /** Every address at a key that takes one: a string, or each string of a list. */
  const address = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      const why = addressFault(value)
      if (why !== null) faults.push({ path, message: addressMessage(value, why) })
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => address(item, `${path}[${index}]`))
    }
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
        for (const [name, item] of Object.entries(props)) {
          const at = `${path}.props.${name}`
          if (ADDRESS_KEYS.has(name)) address(item, at)
          visit(item, at)
        }
      }
      visit(value['children'], `${path}.children`)
      return
    }
    const fields = value['$object']
    if (isRecord(fields)) {
      for (const [key, item] of Object.entries(fields)) {
        const at = `${path}.${key}`
        if (ADDRESS_KEYS.has(key)) address(item, at)
        visit(item, at)
      }
    }
  }

  if (isRecord(document)) visit(document['root'], '$.root')
  return faults
}
