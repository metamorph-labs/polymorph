/**
 * Minimal glob → RegExp, shared by the ESLint rules (TS) and the Stylelint
 * plugin (plain JS). Node loads Stylelint's config natively, so this module
 * must not be TypeScript. It supports `**`, `*` and `?`, which is all the owner
 * map needs. Matching is anchored at the end, so absolute paths match
 * repo-relative globs.
 */

/** @param {string} glob */
export function globToRegExp(glob) {
  let out = ''
  let i = 0
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      out += '(?:[^/]+/)*'
      i += 3
      continue
    }
    if (glob.startsWith('**', i)) {
      out += '.*'
      i += 2
      continue
    }
    const ch = glob[i]
    if (ch === '*') out += '[^/]*'
    else if (ch === '?') out += '[^/]'
    else if ('\\^$.|+()[]{}'.includes(ch)) out += '\\' + ch
    else out += ch
    i += 1
  }
  return new RegExp('(?:^|/)' + out + '$')
}

/**
 * @param {string} filePath absolute or relative; `\` normalised to `/`
 * @param {string[]} globs
 */
export function matchesAny(filePath, globs) {
  const p = filePath.replaceAll('\\', '/')
  return globs.some((glob) => globToRegExp(glob).test(p))
}
