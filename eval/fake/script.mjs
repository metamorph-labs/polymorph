import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The scripted model's turns. `eval/fake/<brief>.<mode>.json` holds the turns
 * it plays, in order, whatever it is sent, and `<brief>.<mode>.<run>.json`
 * holds those of one run that differs. A value written `{ "$file": path }`
 * is replaced by that file's text (so a document lives in its own file, as
 * JSON or TSX, and goes to `validate` as text, the way a model sends it), and
 * a text block's `text` may be a list of strings and such values, joined.
 *
 * Both runners play the same turns: `eval/run.mjs` in place of the Messages
 * API, and `eval/fake/cli.mjs` in place of the Claude Code CLI.
 */

const FAKES = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(FAKES, '../..')

/**
 * A function that returns the next scripted message each time it is called,
 * as `{ content, stop_reason, usage }`, the way the Messages API returns one.
 * A turn may also carry fields of its own, which are passed on untouched.
 */
export function scriptedTurns(file) {
  const script = JSON.parse(readFileSync(file, 'utf8'))
  let turn = 0
  return () => {
    const scripted = script.turns[turn]
    if (scripted === undefined) {
      throw new Error(`${relative(ROOT, file)} ran out of turns before the run ended`)
    }
    turn += 1
    const content = (scripted.content ?? []).map((block, index) => {
      const resolved = materialise(block)
      if (resolved.type === 'text' && Array.isArray(resolved.text)) {
        resolved.text = resolved.text.join('')
      }
      if (resolved.type === 'tool_use') resolved.id ??= `toolu_fake_${turn}_${index}`
      return resolved
    })
    const calls = content.some((block) => block.type === 'tool_use')
    return {
      ...scripted,
      content,
      stop_reason: scripted.stop_reason ?? (calls ? 'tool_use' : 'end_turn'),
      usage: {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
        ...scripted.usage,
      },
    }
  }
}

function materialise(value) {
  if (Array.isArray(value)) return value.map(materialise)
  if (typeof value !== 'object' || value === null) return value
  if (typeof value.$file === 'string') return readFileSync(resolve(FAKES, value.$file), 'utf8')
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialise(item)]))
}
