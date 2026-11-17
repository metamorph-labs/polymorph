import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { checkAgent } from '../common'
import type { MemberShell } from '../dsl'

/**
 * Every described member: one file per member in this directory, each
 * exporting its description as the default. A description is found by its
 * file, so adding a member edits no list. The order is the registry's (the
 * React gallery's), which `orderMembers` applies, with the ladder's primitives
 * after the vocabulary. A description's agent block is checked as it is read
 * (`checkAgent`).
 *
 * A member described here is generated for each framework, and its framework
 * map entry is `native` (`design/frameworks/vue.json`); the Vue vocabulary's
 * map law holds the two to each other.
 */
export async function loadMembers(): Promise<MemberShell[]> {
  const dir = import.meta.dirname
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts' && !name.endsWith('.test.ts'))
    .sort()
  const shells: MemberShell[] = []
  for (const file of files) {
    const module = (await import(pathToFileURL(resolve(dir, file)).href)) as {
      default?: MemberShell
    }
    if (module.default === undefined)
      throw new Error(`shells: members/${file} exports no description`)
    checkAgent(module.default)
    shells.push(module.default)
  }
  return shells
}

/** The descriptions in the order the registry lists their members, primitives last by name. */
export function orderMembers(
  shells: readonly MemberShell[],
  order: readonly string[],
): MemberShell[] {
  const rank = (name: string) => {
    const at = order.indexOf(name)
    return at === -1 ? order.length : at
  }
  return [...shells].sort(
    (a, b) => rank(a.member) - rank(b.member) || a.member.localeCompare(b.member),
  )
}
