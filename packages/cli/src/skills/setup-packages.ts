import type { Registry } from '@polymorph/registry'

import { commands, Facts } from './facts'

/** TODO: say what this reference holds and who reads it. */
export function packagesReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  return `
# The packages route, step by step

${commands(run, 'component Button --framework <framework>')}

${f.m('Button')}
`.trimStart()
}
