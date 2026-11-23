import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

/**
 * The editor's entry imported on a server. It lives at the package root, not
 * in `src/`, because `src/**` is the engine's browser project and this test
 * needs a runtime with no document.
 *
 * A server renders the field before any editor runs, so importing the entry
 * must not need a `window`, a `document` or a `navigator`. A module evaluates
 * once per process, so an import in this test's own process proves nothing:
 * the editing library is already loaded. The check runs in a new Node process
 * instead, in two steps:
 *
 *  1. With no `window`, no `document` and no `navigator`, as an older runtime
 *     and a server have, it imports the editing library. The library looks
 *     for a `navigator` and a `document` when it loads, behind a `typeof`
 *     test, and must load without them.
 *  2. Then each of the three is a global that throws when it is read, and it
 *     imports the editor's entry and the document model's. The library is
 *     loaded already, so what runs now is this package's own modules, and any
 *     read of the three would throw.
 *
 * What is checked: the editing library loads without the three, and this
 * package's own modules read none of them when they load. What is not: the
 * library does read `navigator` and `document` when a runtime has them, which
 * is harmless and not this package's to change.
 *
 * The child reads the TypeScript sources with Node's own type stripping, and
 * a resolve hook adds the `.ts` that the sources' imports leave off.
 */

const LIBRARY = [
  'prosemirror-model',
  'prosemirror-state',
  'prosemirror-view',
  'prosemirror-transform',
  'prosemirror-commands',
  'prosemirror-history',
  'prosemirror-inputrules',
  'prosemirror-keymap',
  'prosemirror-schema-list',
]

const CHILD = `
import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context)
      throw error
    }
  },
})
delete globalThis.navigator
const absent = ['window', 'document', 'navigator'].filter((name) => typeof globalThis[name] === 'undefined')
for (const name of ${JSON.stringify(LIBRARY)}) await import(name)
const reads = []
for (const name of ['window', 'document', 'navigator'])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      reads.push(name)
      throw new Error('read ' + name)
    },
  })
const editor = await import('./src/rich-text-editor/index.ts')
const model = await import('./src/rich-text/index.ts')
const ours = [...reads]
// The trap catches a module that does read one, so an empty list means something.
let caught = false
try {
  await import('data:text/javascript,export const agent = navigator.userAgent')
} catch {
  caught = true
}
process.stdout.write(JSON.stringify({
  absent,
  editor: typeof editor.createRichTextEditor,
  model: typeof model.parseRichText,
  reads: ours,
  trap: caught && reads.includes('navigator'),
}))
`

describe('the editor entry on a server', () => {
  it('imports in a new process with no window, document or navigator, and reads none of them', () => {
    const child = spawnSync(
      process.execPath,
      ['--no-warnings', '--input-type=module', '-e', CHILD],
      { cwd: import.meta.dirname, encoding: 'utf8', timeout: 60_000 },
    )
    expect(child.stderr).toBe('')
    expect(JSON.parse(child.stdout)).toEqual({
      absent: ['window', 'document', 'navigator'],
      editor: 'function',
      model: 'function',
      reads: [],
      trap: true,
    })
  })
})
