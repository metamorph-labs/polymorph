import ts from 'typescript'

/**
 * Checks whether a string is exactly one TypeScript type, using the compiler's
 * own parser.
 *
 * An input's `type` is the one field of a spec that is TypeScript by design,
 * such as `Ticket[]` or `(value: string) => void`. The emitter writes it
 * verbatim into the middle of an interface. So it must be a type, the whole
 * string, and nothing else. A string that closes the interface and starts a
 * statement is not a faulty type. It is a second program, and the emitted file
 * would run it.
 *
 * **Parsed, not scanned.** Only the parser can decide whether a bracket closes
 * a type or sits inside a string inside a template inside a type. A
 * hand-written scanner that disagreed with it even once would be a way to
 * inject code. So the text goes to the same parser that will read the emitted
 * file, as the right-hand side of an alias. The result must meet three
 * conditions: it parsed, it is one statement, and every node in it is type
 * syntax.
 *
 * The third condition is needed. The parser is deliberately lenient. It accepts
 * a default value on a function type's parameter, an expression in a computed
 * key and a body on an accessor, and leaves the error to the checker. In each
 * of those places an expression can sit inside something that parses as a
 * type. So the tree is walked against a list of what a type is made of, and
 * anything else is rejected by name.
 *
 * This is node-only, which is why it is a separate module. `validate.ts` is the
 * half the browser runs, and a compiler does not belong in a page.
 */

const ALIAS = 'type T = '

/** The syntax a type is made of, beyond the type nodes themselves and the tokens. */
const PARTS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.QualifiedName,
  ts.SyntaxKind.TypeParameter,
  ts.SyntaxKind.Parameter,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.CallSignature,
  ts.SyntaxKind.ConstructSignature,
  ts.SyntaxKind.IndexSignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  // `({ id, title }: Ticket) => void`: a parameter may be a pattern.
  ts.SyntaxKind.ObjectBindingPattern,
  ts.SyntaxKind.ArrayBindingPattern,
  ts.SyntaxKind.BindingElement,
  ts.SyntaxKind.OmittedExpression,
])

function isTypeSyntax(node: ts.Node): boolean {
  const { kind } = node
  if (kind <= ts.SyntaxKind.LastToken) return true
  if (kind >= ts.SyntaxKind.FirstTypeNode && kind <= ts.SyntaxKind.LastTypeNode) return true
  // A negative number literal type (`-1`, `-1n`) is the only type that
  // parses as a non-token expression, a prefix-unary node.
  if (ts.isPrefixUnaryExpression(node)) {
    return ts.isNumericLiteral(node.operand) || ts.isBigIntLiteral(node.operand)
  }
  return PARTS.has(kind)
}

/** The first node that is not type syntax, or `undefined` when all of it is. */
function stray(node: ts.Node): ts.Node | undefined {
  if (!isTypeSyntax(node)) return node
  // A default value is the one expression the parts above can hold. The parser
  // also reads one on a property signature, to report it later, so the field
  // exists at run time even where the typings do not declare it.
  const { initializer } = node as { initializer?: ts.Node }
  if (initializer) return initializer
  return ts.forEachChild(node, stray)
}

const abbreviated = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= 40 ? flat : `${flat.slice(0, 37)}…`
}

/** Why `type` is not one TypeScript type, as the end of a sentence, or `null`. */
export function inputTypeFault(type: string): string | null {
  const file = ts.createSourceFile(
    // TSX, because that is the file the type is written into.
    'input-type.tsx',
    `${ALIAS}${type}`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  )

  // The parser's own errors. This field is not in the public typings, but it is
  // the only place syntax errors exist without building a whole program.
  const [syntax] = (file as unknown as { parseDiagnostics: readonly ts.Diagnostic[] })
    .parseDiagnostics
  if (syntax) {
    return `is not a type — ${ts.flattenDiagnosticMessageText(syntax.messageText, ' ')}`
  }

  const [alias, ...more] = file.statements
  if (!alias || !ts.isTypeAliasDeclaration(alias) || more.length > 0) {
    return 'runs on past the end of one type'
  }

  const code = stray(alias.type)
  if (code) {
    return `holds \`${abbreviated(code.getText(file))}\`, which is code rather than part of a type`
  }

  return null
}
