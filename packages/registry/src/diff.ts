/**
 * Returns where two renderings of the same artifact first differ.
 *
 * The determinism law uses it so that its failure can be acted on. "Expected a
 * 400 KB string to equal a 400 KB string" gives no lead. The first differing
 * line usually shows the cause: an unsorted `Object.keys`, a path with an
 * absolute prefix, or a `Date` in a field.
 */
export function firstDifference(a: string, b: string): string | null {
  if (a === b) return null

  const left = a.split('\n')
  const right = b.split('\n')
  for (let line = 0; line < Math.max(left.length, right.length); line += 1) {
    if (left[line] === right[line]) continue
    return [
      `line ${line + 1}:`,
      `  first:  ${left[line] ?? '(absent)'}`,
      `  second: ${right[line] ?? '(absent)'}`,
    ].join('\n')
  }
  return `identical line by line, but ${a.length} characters against ${b.length}`
}
