/**
 * The addresses a screen holds, and which of them a run-time screen may hold.
 *
 * A document a model writes reaches a page as data, and a string at a prop
 * that takes an address becomes a link the reader follows or a file the page
 * loads. `javascript:` runs code there, and `data:` and `vbscript:` carry
 * code or content the host did not choose. So an address is relative, a
 * fragment, or one of four schemes, and any other is a fault whose value is
 * not passed.
 *
 * The address law in `packages/screen/src/parity.test.ts` holds `ADDRESS_KEYS`
 * to the vocabulary: every prop and data type field the registry types as
 * text that is named for an address in HTML, or whose documentation says it
 * holds a URL or a picture, is one of them.
 */

/** The props and object keys that take an address: a link's target, a picture or a recording. */
export const ADDRESS_KEYS: ReadonlySet<string> = new Set(['avatar', 'href', 'src'])

/** The schemes an address may name. Anything else, and anything without a scheme that is not relative, is refused. */
export const ADDRESS_SCHEMES: readonly string[] = ['http:', 'https:', 'mailto:', 'tel:']

/** The last C0 control character's code. A URL parser strips these and the space from an address's ends. */
const LAST_CONTROL = 0x1f
const SPACE = 0x20
const DELETE = 0x7f

/** Whether the text holds a C0 control character or DEL anywhere. */
function holdsControl(text: string): boolean {
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at)
    if (code <= LAST_CONTROL || code === DELETE) return true
  }
  return false
}

/** The text without what a URL parser strips from either end of an address: C0 controls and the space. */
function stripped(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && text.charCodeAt(start) <= SPACE) start += 1
  while (end > start && text.charCodeAt(end - 1) <= SPACE) end -= 1
  return text.slice(start, end)
}

/** A scheme, as a URL parser reads one at the start of an address. */
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

/**
 * Why a text is not an address a screen may hold, as the end of a sentence,
 * or `null` when it is one.
 *
 * A parser removes tabs and line breaks from inside an address and strips
 * controls and spaces from its ends, so `java\tscript:` is `javascript:`
 * where it is followed. An address that holds a control character is refused
 * whole, and a scheme is read after the ends are stripped. A colon after a
 * `/`, `?` or `#` names no scheme: `/a:b` and `#x:y` are relative.
 */
export function addressFault(text: string): string | null {
  if (holdsControl(text)) return 'holds a control character, which hides what the address names'
  const scheme = SCHEME.exec(stripped(text))?.[1]
  if (scheme === undefined) return null
  if (ADDRESS_SCHEMES.includes(`${scheme.toLowerCase()}:`)) return null
  return `names the scheme \`${scheme.toLowerCase()}:\``
}

/** The fault's message, in the validator's voice: what was written, why it is refused, and what is lawful. */
export function addressMessage(text: string, why: string): string {
  const shown = JSON.stringify(text.length <= 60 ? text : `${text.slice(0, 57)}…`)
  const schemes = ADDRESS_SCHEMES.map((scheme) => `\`${scheme}\``)
  return (
    `${shown} is not an address a screen may hold: it ${why} — an address is relative, a ` +
    `fragment (\`#id\`), or ${schemes.slice(0, -1).join(', ')} or ${schemes.at(-1) ?? ''}`
  )
}

/** What a value that is not text is, in a fault's words. */
function described(value: unknown): string {
  if (value === null) return '`null`'
  if (Array.isArray(value)) return 'a list'
  if (typeof value !== 'object') return `a ${typeof value}`
  const record = value as Record<string, unknown>
  if (typeof record['component'] === 'string') return 'an element'
  if ('$object' in record) return 'a structured object'
  return 'an object'
}

/**
 * The faults of a value at a key that takes an address, with their paths:
 * none when it is text that is an address a screen may hold, or a flat list of
 * such text. Anything else is refused whole, as a renderer may write any value
 * into an attribute as text: `[["javascript:…"]]` is written `javascript:…`,
 * and an object writes whatever its `toString` answers.
 */
export function addressFaults(
  key: string,
  value: unknown,
  path: string,
): { path: string; message: string }[] {
  const shape = (item: unknown, at: string) => ({
    path: at,
    message: `\`${key}\` takes an address as text, or a list of text, and this is ${described(item)}`,
  })
  const text = (item: string, at: string) => {
    const why = addressFault(item)
    return why === null ? [] : [{ path: at, message: addressMessage(item, why) }]
  }
  if (typeof value === 'string') return text(value, path)
  if (!Array.isArray(value)) return [shape(value, path)]
  return value.flatMap((item, index) =>
    typeof item === 'string' ? text(item, `${path}[${index}]`) : [shape(item, `${path}[${index}]`)],
  )
}
