import ts from 'typescript'

import type { Expr } from './dsl'

/**
 * Rewrites the free identifiers of a description's expression.
 *
 * A description writes `loading ? 'loading' : undefined` over the member's
 * scope. A Vue script reads a prop as `props.loading` and a computed value as
 * `state.value`, and another framework spells each differently, so each
 * renderer maps the scope's names and this function applies the map. It
 * parses the expression with TypeScript, so a property name (`api.open`'s
 * `open`), an object key and a name an arrow function binds are left alone,
 * and a shorthand property (`{ checked }`) keeps its key.
 */
export function rewrite(expr: Expr, map: (name: string) => string | null): string {
  const text = `(${expr})`
  const source = ts.createSourceFile('expr.ts', text, ts.ScriptTarget.ESNext, true)
  const statement = source.statements[0]
  if (
    statement === undefined ||
    !ts.isExpressionStatement(statement) ||
    source.statements.length !== 1
  ) {
    throw new Error(`shells: "${expr}" is not one expression`)
  }
  const diagnostics = (source as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics
  if (diagnostics && diagnostics.length > 0) {
    throw new Error(
      `shells: "${expr}" does not parse: ${ts.flattenDiagnosticMessageText(diagnostics[0]?.messageText ?? '', ' ')}`,
    )
  }

  const edits: { start: number; end: number; text: string }[] = []

  const bindingNames = (name: ts.BindingName, into: Set<string>) => {
    if (ts.isIdentifier(name)) into.add(name.text)
    else
      for (const element of name.elements)
        if (!ts.isOmittedExpression(element)) bindingNames(element.name, into)
  }

  const visit = (node: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const inner = new Set(bound)
      for (const parameter of node.parameters) bindingNames(parameter.name, inner)
      for (const parameter of node.parameters) {
        if (parameter.initializer) visit(parameter.initializer, bound)
        // A type a parameter or the result names is read too (`(event: RichTextEditorEvent) => …`),
        // so a renderer imports it.
        if (parameter.type) visit(parameter.type, bound)
      }
      if (node.type) visit(node.type, bound)
      visit(node.body, inner)
      return
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      const name = node.name.text
      const mapped = bound.has(name) ? null : map(name)
      if (mapped !== null && mapped !== name) {
        edits.push({
          start: node.name.getStart(source),
          end: node.name.getEnd(),
          text: `${name}: ${mapped}`,
        })
      }
      return
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) return
      // A qualified type name's right side (`CalendarDate` in `zag.CalendarDate`) names a member of its left.
      if (ts.isQualifiedName(parent) && parent.right === node) return
      if (ts.isPropertyAssignment(parent) && parent.name === node) return
      // A member of an object type (`{ toString: … }`) names no value.
      if ((ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node)
        return
      if (ts.isParameter(parent) && parent.name === node) return
      if (bound.has(node.text)) return
      const mapped = map(node.text)
      if (mapped !== null && mapped !== node.text) {
        edits.push({ start: node.getStart(source), end: node.getEnd(), text: mapped })
      }
      return
    }
    ts.forEachChild(node, (child) => visit(child, bound))
  }
  visit(statement.expression, new Set())

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out.slice(1, -1)
}

/** The free identifiers an expression reads, so a renderer can tell which values it needs. */
export function freeNames(expr: Expr): Set<string> {
  const names = new Set<string>()
  rewrite(expr, (name) => {
    names.add(name)
    return null
  })
  return names
}
