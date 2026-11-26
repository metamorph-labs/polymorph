import type { Registry } from '@polymorph/registry'

import { commands, Facts } from './facts'

/** TODO: say what this reference holds and who reads it. */
export function codeReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  return `
# A screen written in code, and the container of an emitted one

${commands(run, 'component Button --framework <framework>')}

${f.m('Button')}
`.trimStart()
}
