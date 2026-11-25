/**
 * The no-build stylesheet with each repeated rule written once.
 *
 * A recipe composes the conventions' classes (`composes: focusRing from
 * '../conventions/focus.module.css'`), and the bundler writes the composed
 * module's rules into the output once for every recipe that composes it. With
 * the stylesheet in one file, `polymorph.css` then holds one copy of the focus
 * and motion conventions per recipe.
 *
 * Of two rules with the same text, the later one decides the cascade: it has
 * the same selector, specificity and declarations as the earlier one, and it
 * comes after everything the earlier one came after. So removing every copy
 * but the last changes what no element computes. Keeping the first instead
 * would move a convention's rules before a recipe that today comes before a
 * later copy.
 *
 * Only blocks are compared: a statement that ends in `;` (`@import`,
 * `@charset`, a layer order) and an `@layer` block act by where they first
 * appear, so they are left as they are.
 */
export function dedupeStylesheet(css: string): string {
  const statements = topLevelStatements(css)
  const seen = new Set<string>()
  const kept: string[] = []
  for (const statement of statements.reverse()) {
    const text = statement.trim()
    const block = text.endsWith('}') && !text.startsWith('@layer')
    if (block && seen.has(text)) continue
    if (block) seen.add(text)
    kept.push(statement)
  }
  return kept.reverse().join('')
}

/**
 * A stylesheet's top-level statements, in order, which join back to the
 * stylesheet. A statement ends at the `}` that closes its block or at a `;`
 * outside any block. Braces and semicolons inside a string, a comment or an
 * escape are text.
 */
export function topLevelStatements(css: string): string[] {
  const statements: string[] = []
  let start = 0
  let depth = 0
  let index = 0
  while (index < css.length) {
    const char = css[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"' || char === "'") {
      index++
      while (index < css.length && css[index] !== char) index += css[index] === '\\' ? 2 : 1
      index++
      continue
    }
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      index = end === -1 ? css.length : end + 2
      continue
    }
    if (char === '{') depth++
    if (char === '}') depth--
    index++
    if (depth === 0 && (char === '}' || char === ';')) {
      statements.push(css.slice(start, index))
      start = index
    }
  }
  if (start < css.length) statements.push(css.slice(start))
  return statements
}
