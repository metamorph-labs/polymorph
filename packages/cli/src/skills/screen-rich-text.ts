import type { Registry } from '@polymorph/registry'

import { commands, Facts } from './facts'

/** TODO: say what this reference holds and who reads it. */
export function richTextReference(registry: Registry, run: string): string {
  const f = new Facts(registry)
  return `
# Rich text: a field, a document and comments on words

${commands(run, 'component Button --framework <framework>')}

${f.m('Button')}
`.trimStart()
}
