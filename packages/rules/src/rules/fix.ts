/**
 * Code shared by the fixable rules: removing an attribute from an element,
 * bringing a vocabulary member into scope, and the checks that decide whether a
 * rewrite is safe.
 *
 * **A red rule fixes only a violation with exactly one lawful rewrite.** Most
 * violations have several. A `style` on a `<div>` can be replaced by a variant,
 * a layout primitive, a patch or a zone. Choosing between them is the design
 * decision the exception ladder makes visible, and a fixer that chose would
 * hide it. The fixes cover the cases with no choice: a prop the member ignores,
 * a glyph the role map already names, a button whose whole content is its
 * label. Everything else stays a report with its rungs (`docs/rules.md`).
 *
 * **A fix keeps everything else, or does not run.** A rewrite that replaces an
 * element must not drop anything that had an effect on it, such as a prop the
 * member has no equivalent for, or a comment someone left inside it. A fix
 * removes only what the rule reports, and only where that was already inert.
 * When the element holds more than the rewrite can keep, the violation is
 * reported as before and the code is left unchanged, because the author decides
 * what to do with the rest.
 */
import type { Rule, SourceCode } from 'eslint'

type Range = [number, number]

interface Ranged {
  range?: Range
}

export interface ImportSpecifierNode extends Ranged {
  type: string
  local: { name: string }
  imported?: { name?: string; value?: unknown }
  importKind?: string
}

export interface ImportDeclarationNode extends Ranged {
  type: 'ImportDeclaration'
  source: { value: unknown; raw?: string }
  importKind?: string
  specifiers: ImportSpecifierNode[]
}

interface AstNode extends Ranged {
  type: string
  [key: string]: unknown
}

const rangeOf = (node: Ranged): Range => node.range as Range

/* -------------------------------------------------------------------------- */
/* Attributes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Removes an attribute together with the whitespace before it.
 *
 * `<Button className="x" label="Save" />` loses the attribute and the space
 * before it, so the result looks as if it had never been there. A comment
 * between the two is kept, and then only the attribute is removed.
 */
export function removeAttribute(
  sourceCode: SourceCode,
  fixer: Rule.RuleFixer,
  attribute: Rule.Node,
): Rule.Fix {
  const before = sourceCode.getTokenBefore(attribute)
  if (before && !sourceCode.commentsExistBetween(before, attribute)) {
    return fixer.removeRange([before.range[1], rangeOf(attribute)[1]])
  }
  return fixer.remove(attribute)
}

/**
 * Whether a node contains a comment. A rewrite that replaces the node's text
 * would delete the comment, and a fix must not delete comments.
 */
export function holdsComment(sourceCode: SourceCode, node: Rule.Node): boolean {
  return sourceCode.getCommentsInside(node).length > 0
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/** The module scope, or the global one in a file that is not a module. */
function moduleScope(sourceCode: SourceCode) {
  const scopes = sourceCode.scopeManager.scopes
  return scopes.find((candidate) => candidate.type === 'module') ?? scopes[0]
}

/**
 * Whether, at `node`, `name` refers to something declared in an inner scope,
 * such as a parameter or a local.
 *
 * A fix that writes `<Icon …>` inside `function Row({ icon: Icon })` refers to
 * the prop, not to the `Icon` component. There, the name does not mean the
 * import at the top of the file.
 */
export function shadowedAt(sourceCode: SourceCode, node: Rule.Node, name: string): boolean {
  const top = moduleScope(sourceCode)
  for (
    let scope: typeof top | null = sourceCode.getScope(node);
    scope && scope !== top && scope.type !== 'global';
    scope = scope.upper
  ) {
    if (scope.set.has(name)) return true
  }
  return false
}

/** Whether any scope below the top of the file declares `name` for itself. */
export function redeclared(sourceCode: SourceCode, name: string): boolean {
  const top = moduleScope(sourceCode)
  return sourceCode.scopeManager.scopes.some(
    (scope) => scope !== top && scope.type !== 'global' && scope.set.has(name),
  )
}

/**
 * Every place a name appears, with its parent node. It reads the AST, not the
 * scope analysis.
 *
 * The configured parser decides whether a JSX element's name counts as a
 * reference to its import. With a parser that does not track JSX, a fix that
 * trusted "no references" would delete an import still in use. The AST gives
 * the same answer under every parser.
 */
export function occurrences(
  sourceCode: SourceCode,
  name: string,
): { node: AstNode; parent: AstNode }[] {
  const found: { node: AstNode; parent: AstNode }[] = []
  const keys = sourceCode.visitorKeys
  const pending: { node: AstNode; parent: AstNode }[] = [
    { node: sourceCode.ast as unknown as AstNode, parent: sourceCode.ast as unknown as AstNode },
  ]

  while (pending.length > 0) {
    const { node, parent } = pending.pop() as { node: AstNode; parent: AstNode }
    if ((node.type === 'Identifier' || node.type === 'JSXIdentifier') && node['name'] === name) {
      found.push({ node, parent })
    }
    for (const key of keys[node.type] ?? []) {
      const value = node[key]
      for (const child of Array.isArray(value) ? value : [value]) {
        if (child && typeof (child as AstNode).type === 'string') {
          pending.push({ node: child as AstNode, parent: node })
        }
      }
    }
  }

  return found
}

/* -------------------------------------------------------------------------- */
/* Imports                                                                    */
/* -------------------------------------------------------------------------- */

/** The file's import declarations, in order. Imports are always top-level. */
export function importsOf(sourceCode: SourceCode): ImportDeclarationNode[] {
  return (sourceCode.ast.body as unknown as ImportDeclarationNode[]).filter(
    (node) => node.type === 'ImportDeclaration',
  )
}

const importedName = (specifier: ImportSpecifierNode): string | undefined =>
  specifier.type === 'ImportSpecifier'
    ? (specifier.imported?.name ?? String(specifier.imported?.value))
    : undefined

/** The file's line ending, so an inserted line matches the lines around it. */
function eol(sourceCode: SourceCode): string {
  return sourceCode.text.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * Where a new line can go after a node: the end of the line the node ends on,
 * or `null` when a line cannot safely go there.
 *
 * The position is after the node's own text, so a trailing comment stays on its
 * line instead of moving to the inserted one. This works only when the rest of
 * the line holds nothing but comments. Code that follows on the same line may
 * continue onto the next (`import a from 'a'; export function App() {`), and so
 * may a block comment or a template literal. A line inserted at the line break
 * would then land inside a function body, a comment or a string. Those files
 * are left unchanged.
 */
function afterLineOf(sourceCode: SourceCode, node: Ranged): number | null {
  const text = sourceCode.text
  const newline = text.indexOf('\n', rangeOf(node)[1])
  const end = newline === -1 ? text.length : newline

  for (
    let next = sourceCode.getTokenAfter(node as unknown as Rule.Node, { includeComments: true });
    next && rangeOf(next)[0] < end;
    next = sourceCode.getTokenAfter(next, { includeComments: true })
  ) {
    const comment = next.type === 'Line' || next.type === 'Block'
    if (!comment || rangeOf(next)[1] > end) return null
  }

  return text[end - 1] === '\r' ? end - 1 : end
}

/**
 * How a member is brought into scope, decided before anything is rewritten.
 *
 *  - `present`: the file already imports it under its own name.
 *  - `append`: the file imports other members from a module that exports it,
 *    so one more name is added to that list.
 *  - `declare`: there is no import to add to, so a new declaration goes at `at`.
 *  - `null`: every option would require a decision, so there is no fix. The
 *    name already means something else in this file, or no line can safely
 *    take a new declaration, because the file opens with a comment the import
 *    would be placed against or code shares a line with the last import.
 */
export type Entrance =
  | { kind: 'present' }
  | { kind: 'append'; after: ImportSpecifierNode }
  | { kind: 'declare'; module: string; at: number; lead: string; trail: string }

export function entranceFor(
  sourceCode: SourceCode,
  name: string,
  /** Modules that export the member, in the order to prefer an existing import. */
  modules: readonly string[],
  /** The module a new declaration names, when no existing import can be joined. */
  declare: string,
): Entrance | null {
  const all = importsOf(sourceCode)
  const declarations = all.filter(
    (node) => modules.includes(String(node.source.value)) && node.importKind !== 'type',
  )

  for (const declaration of declarations) {
    for (const specifier of declaration.specifiers) {
      if (importedName(specifier) !== name || specifier.importKind === 'type') continue
      // Imported under another name: `import { Icon as Glyph }`. The fix would
      // have to choose which name to use.
      return specifier.local.name === name ? { kind: 'present' } : null
    }
  }

  if (moduleScope(sourceCode)?.set.has(name)) return null

  for (const module of modules) {
    const joinable = declarations.find(
      (node) =>
        String(node.source.value) === module &&
        node.specifiers.some((specifier) => specifier.type === 'ImportSpecifier'),
    )
    if (!joinable) continue
    const named = joinable.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier')
    return { kind: 'append', after: named[named.length - 1] as ImportSpecifierNode }
  }

  const line = eol(sourceCode)
  const last = all[all.length - 1]
  // After the last import, at the end of its line rather than the end of its text.
  if (last) {
    const at = afterLineOf(sourceCode, last)
    return at === null ? null : { kind: 'declare', module: declare, at, lead: line, trail: '' }
  }

  const body = sourceCode.ast.body as unknown as (AstNode & { directive?: string })[]
  const directives = body.filter((statement) => typeof statement.directive === 'string')
  const directive = directives[directives.length - 1]
  // `'use client'` is only a directive while nothing comes before it.
  if (directive) {
    const at = afterLineOf(sourceCode, directive)
    return at === null
      ? null
      : { kind: 'declare', module: declare, at, lead: `${line}${line}`, trail: '' }
  }

  // A file that opens with a comment: a `@ts-nocheck` that must stay first, a
  // licence, or the doc comment of the first declaration. The kind of comment
  // decides which side of it the import belongs on, and the fix does not guess.
  if (sourceCode.getAllComments().some((comment) => rangeOf(comment)[0] < firstCode(body))) {
    return null
  }

  return { kind: 'declare', module: declare, at: 0, lead: '', trail: `${line}${line}` }
}

/** Where the first statement starts, or infinity in a file with none. */
function firstCode(body: AstNode[]): number {
  const [first] = body
  return first ? rangeOf(first)[0] : Number.POSITIVE_INFINITY
}

/**
 * A new import declaration in the file's own style: the quote its first import
 * uses, and a semicolon if that import ends with one. A file with no imports
 * gets single quotes and no semicolon, which is this repository's style.
 */
export function importText(sourceCode: SourceCode, name: string, module: string): string {
  const [first] = importsOf(sourceCode)
  const quote = first?.source.raw?.startsWith('"') ? '"' : "'"
  const semicolon = first && sourceCode.getText(first as unknown as Rule.Node).endsWith(';')
  return `import { ${name} } from ${quote}${module}${quote}${semicolon ? ';' : ''}`
}

/** The edits that carry out an `Entrance`. `present` needs none. */
export function enter(
  sourceCode: SourceCode,
  fixer: Rule.RuleFixer,
  name: string,
  entrance: Entrance,
): Rule.Fix[] {
  if (entrance.kind === 'present') return []
  if (entrance.kind === 'append') {
    return [fixer.insertTextAfterRange(rangeOf(entrance.after), `, ${name}`)]
  }
  const text = importText(sourceCode, name, entrance.module)
  return [
    fixer.insertTextBeforeRange(
      [entrance.at, entrance.at],
      `${entrance.lead}${text}${entrance.trail}`,
    ),
  ]
}

/** Removes a whole line: a node and the line break after it. */
export function removeLine(
  sourceCode: SourceCode,
  fixer: Rule.RuleFixer,
  node: Rule.Node,
): Rule.Fix {
  const [start, end] = rangeOf(node)
  const text = sourceCode.text
  const after = text.startsWith('\r\n', end) ? end + 2 : text.startsWith('\n', end) ? end + 1 : end
  return fixer.removeRange([start, after])
}
