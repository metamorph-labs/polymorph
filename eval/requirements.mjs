import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

/**
 * Whether a screen meets its brief (`docs/verification.md`, "The agent eval").
 *
 * `lawful` says a document breaks no rule. It does not say the screen does
 * what was asked: a lawful page with no way to delete an incident is still
 * lawful. Each brief therefore has requirements (`eval/requirements/<brief>.json`,
 * shaped by `eval/requirements-shape.ts`), and the harness checks the final
 * document against them, whatever the model claimed.
 *
 * A requirement is checked against the document, never by a model's opinion.
 * The document is read into its elements: which member each one is, what each
 * prop is given, and what is inside it. A spec is read as the JSON it is, and
 * a TSX module through the TypeScript parser, so the same requirement reads
 * both modes.
 *
 * A requirement is evidence that a part the brief asks for is in the
 * document. It does not run the screen, and it cannot see what the container
 * supplies. A requirement about what each row or each turn shows is left out
 * for that reason: a spec has no loop, so it hands its rows to an input.
 */

const DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), 'requirements')
const KINDS_FILE = 'kinds.json'

/* -------------------------------------------------------------------------- */
/* Reading a document into elements                                           */
/* -------------------------------------------------------------------------- */

/**
 * A node is what a prop holds or what a child is:
 *
 * - `literal`: a fixed value.
 * - `binding`: a declared input, or a path into one.
 * - `expression`: anything a TSX module computes. `inside` holds the nodes
 *   found in it, so an element inside a condition or a loop is still read.
 * - `element`, `list` and `object`: as written. An object's `unnamed` holds
 *   what a module writes in it without a name a reader can use: a method, a
 *   spread, a computed key.
 *
 * An element is `repeated` when a module writes it inside a loop over data,
 * and `spread` when it is given props by a spread. A spec has neither.
 */
const literal = (value) => ({ kind: 'literal', value })

const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const mapValues = (record, map) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, map(value)]))

/** A spec's value. The four object forms are told apart as the spec's schema tells them. */
function specNode(value) {
  if (Array.isArray(value)) return { kind: 'list', items: value.map(specNode) }
  if (!isPlain(value)) return literal(value)
  if (typeof value.$ === 'string') return { kind: 'binding' }
  if (typeof value.component === 'string') {
    return {
      kind: 'element',
      element: {
        component: value.component,
        props: mapValues(isPlain(value.props) ? value.props : {}, specNode),
        children: (Array.isArray(value.children) ? value.children : []).map(specNode),
        repeated: false,
        spread: false,
      },
    }
  }
  return {
    kind: 'object',
    fields: mapValues(isPlain(value.$object) ? value.$object : {}, specNode),
  }
}

/** The root of a spec, as a list of one node, or `null` when the document is not a spec. */
function specRoots(document) {
  let spec = document
  if (typeof document === 'string') {
    try {
      spec = JSON.parse(document)
    } catch {
      return null
    }
  }
  if (!isPlain(spec) || !isPlain(spec.root) || typeof spec.root.component !== 'string') return null
  return [specNode(spec.root)]
}

/** Wrappers the parser keeps and a reader looks through: `(x)`, `x as T`, `x!`, `x satisfies T`. */
const isWrapper = (node) =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isSatisfiesExpression(node)

/** Whether an expression is a name, or names joined by dots: what a spec calls a binding. */
const isPath = (node) =>
  ts.isIdentifier(node) ||
  node.kind === ts.SyntaxKind.ThisKeyword ||
  (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name) && isPath(node.expression))

/**
 * Every outermost JSX element of a TSX module, as nodes, or `null` when the
 * module does not parse. A module may hold helper components, so there can be
 * several.
 */
function tsxRoots(code) {
  if (typeof code !== 'string') return null
  // Parent pointers are kept: a name is resolved by walking out through the scopes around it.
  const file = ts.createSourceFile(
    'screen.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  if (file.parseDiagnostics.length > 0) return null

  /**
   * What the module's imports rename. `import { Button as Action }` makes
   * `Action` the member `Button`, and `import * as UI` makes `UI.Button` it.
   */
  const renamed = new Map()
  const namespaces = new Set()
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined) continue
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    else {
      for (const { name, propertyName } of bindings.elements) {
        if (propertyName !== undefined) renamed.set(name.text, propertyName.text)
      }
    }
  }

  /** The member a tag names, with the module's own renaming undone. */
  const memberOf = (tag) => {
    const [first, ...rest] = tag.getText(file).split('.')
    if (namespaces.has(first) && rest.length > 0) return rest.join('.')
    return [renamed.get(first) ?? first, ...rest].join('.')
  }

  const isJsx = (node) =>
    ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)

  /** How many loops over data the node being read is inside. */
  let loops = 0

  /** Runs `body` as inside a loop when `node` is a `map` or `flatMap` call: what it returns is written once per item. */
  const looping = (node, body) => {
    const loop =
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['map', 'flatMap'].includes(node.expression.name.text)
    if (!loop) return body()
    loops += 1
    try {
      return body()
    } finally {
      loops -= 1
    }
  }

  /** The outermost JSX below a node. */
  const within = (node) => {
    const found = []
    const visit = (child) => {
      if (isJsx(child)) found.push(read(child))
      else looping(child, () => ts.forEachChild(child, visit))
    }
    ts.forEachChild(node, visit)
    return found
  }

  const children = (nodes) =>
    nodes.flatMap((child) => {
      if (ts.isJsxText(child)) {
        return child.containsOnlyTriviaWhiteSpaces ? [] : [literal(child.text.trim())]
      }
      if (ts.isJsxExpression(child))
        return child.expression === undefined ? [] : [read(child.expression)]
      return [read(child)]
    })

  const element = (opening, inner) => {
    const props = []
    let spread = false
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) {
        spread = true
        continue
      }
      const value = attribute.initializer
      props.push([
        attribute.name.getText(file),
        value === undefined
          ? literal(true)
          : ts.isJsxExpression(value)
            ? value.expression === undefined
              ? literal(undefined)
              : read(value.expression)
            : read(value),
      ])
    }
    return {
      kind: 'element',
      element: {
        component: memberOf(opening.tagName),
        props: Object.fromEntries(props),
        children: children(inner),
        repeated: loops > 0,
        spread,
      },
    }
  }

  function read(node) {
    if (isWrapper(node)) return read(node.expression)
    if (ts.isJsxElement(node)) return element(node.openingElement, node.children)
    if (ts.isJsxSelfClosingElement(node)) return element(node, [])
    if (ts.isJsxFragment(node)) return { kind: 'list', items: children(node.children) }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      return literal(node.text)
    if (ts.isNumericLiteral(node)) return literal(Number(node.text))
    if (node.kind === ts.SyntaxKind.TrueKeyword) return literal(true)
    if (node.kind === ts.SyntaxKind.FalseKeyword) return literal(false)
    if (node.kind === ts.SyntaxKind.NullKeyword) return literal(null)
    if (ts.isIdentifier(node) && node.text === 'undefined') return literal(undefined)
    const constant = fixed(node)
    if (constant !== undefined) return constant
    if (isPath(node)) return { kind: 'binding' }
    if (ts.isArrayLiteralExpression(node)) return { kind: 'list', items: node.elements.map(read) }
    if (ts.isObjectLiteralExpression(node)) {
      const fields = []
      const unnamed = []
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          fields.push([property.name.text, read(property.name)])
        } else if (ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)) {
          fields.push([property.name.text, read(property.initializer)])
        } else unnamed.push({ kind: 'expression', inside: within(property) })
      }
      return { kind: 'object', fields: Object.fromEntries(fields), unnamed }
    }
    return looping(node, () => ({ kind: 'expression', inside: within(node) }))
  }

  /** Whether a binding name, which may be a destructuring pattern, declares `name`. */
  const declares = (binding, name) =>
    ts.isIdentifier(binding)
      ? binding.text === name
      : binding.elements.some((item) => !ts.isOmittedExpression(item) && declares(item.name, name))

  const declaredIn = (list, name) =>
    list !== undefined &&
    ts.isVariableDeclarationList(list) &&
    list.declarations.some((declaration) => declares(declaration.name, name))

  /** The value each `const` was read as, or `null` for one that is not fixed. */
  const constants = new Map()

  /**
   * The value a `const` declaration fixes, or `undefined`: it is not `const`,
   * it is destructured, it is computed, or it holds an element. A constant
   * that holds an element stays a name, because its element is already read
   * where the module declares it.
   */
  function constantOf(declaration, list) {
    if ((list.flags & ts.NodeFlags.Const) === 0) return undefined
    if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined)
      return undefined
    if (!constants.has(declaration)) {
      // Set first, so a constant defined in terms of itself ends here.
      constants.set(declaration, null)
      const value = read(declaration.initializer)
      if (!isDynamic(value) && elementsIn([value]).length === 0) constants.set(declaration, value)
    }
    return constants.get(declaration) ?? undefined
  }

  /**
   * The fixed value a name stands for, or a path into a constant object, and
   * `undefined` for any other. `title={TITLE}` is as fixed as the string
   * `TITLE` holds. The name is resolved in the scopes around it, innermost
   * first, so a parameter or a loop variable of the same name is not the
   * constant.
   */
  function fixed(node) {
    if (ts.isPropertyAccessExpression(node)) {
      const owner = fixed(node.expression)
      return owner?.kind === 'object' && Object.hasOwn(owner.fields, node.name.text)
        ? owner.fields[node.name.text]
        : undefined
    }
    if (!ts.isIdentifier(node)) return undefined
    const name = node.text
    for (let scope = node.parent; scope !== undefined; scope = scope.parent) {
      if (ts.isFunctionLike(scope)) {
        if (scope.parameters.some((parameter) => declares(parameter.name, name))) return undefined
      } else if (
        ts.isForStatement(scope) ||
        ts.isForOfStatement(scope) ||
        ts.isForInStatement(scope)
      ) {
        if (declaredIn(scope.initializer, name)) return undefined
      } else if (ts.isCatchClause(scope)) {
        if (
          scope.variableDeclaration !== undefined &&
          declares(scope.variableDeclaration.name, name)
        )
          return undefined
      } else if (ts.isSourceFile(scope) || ts.isBlock(scope)) {
        for (const statement of scope.statements) {
          if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
            if (statement.name?.text === name) return undefined
          }
          if (!ts.isVariableStatement(statement)) continue
          const found = statement.declarationList.declarations.find((declaration) =>
            declares(declaration.name, name),
          )
          if (found !== undefined) return constantOf(found, statement.declarationList)
        }
      }
    }
    return undefined
  }

  return within(file)
}

/** The nodes directly inside a node. */
function nodesIn(node) {
  switch (node.kind) {
    case 'element':
      return [...Object.values(node.element.props), ...node.element.children]
    case 'list':
      return node.items
    case 'object':
      return [...Object.values(node.fields), ...(node.unnamed ?? [])]
    case 'expression':
      return node.inside
    default:
      return []
  }
}

/** Every element at or below these nodes, in the order the document writes them. */
function elementsIn(nodes) {
  return nodes.flatMap((node) => [
    ...(node.kind === 'element' ? [node.element] : []),
    ...elementsIn(nodesIn(node)),
  ])
}

/**
 * Every element of a document, or `null` when it cannot be read: a spec that
 * is not JSON or has no root element, or a module that does not parse.
 */
export function elementsOf(mode, document) {
  const roots = mode === 'spec' ? specRoots(document) : tsxRoots(document)
  return roots === null ? null : elementsIn(roots)
}

/* -------------------------------------------------------------------------- */
/* Checking                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether a value changes with the data: it is bound or computed, or it is a
 * list, an object or an element that holds such a value. An element counts
 * because a module may hand a prop its words as an element around a binding.
 */
const isDynamic = (node) =>
  node.kind === 'binding' || node.kind === 'expression' || nodesIn(node).some(isDynamic)

/** The words a node holds when every part of it is fixed: a literal, or a list of literals. */
function wordsOf(node) {
  if (node.kind === 'literal') {
    return ['string', 'number'].includes(typeof node.value) ? String(node.value) : null
  }
  if (node.kind !== 'list') return null
  const parts = node.items.map(wordsOf)
  return parts.includes(null) ? null : parts.join(' ')
}

const BOUND = { kind: 'binding' }

/**
 * Whether a prop holds the items a requirement asks for. A prop handed to the
 * data whole passes: the items are the container's, and cannot be read. A
 * list written out has to hold `min` items, and each item written as an
 * object has to pass the field tests.
 */
function passesItems(node, { min = 1, fields = {}, anyField }) {
  if (node.kind === 'binding' || node.kind === 'expression') return true
  if (node.kind !== 'list' || node.items.length < min) return false
  return node.items.every((item) => {
    if (item.kind !== 'object') return item.kind === 'binding' || item.kind === 'expression'
    // An object a module spreads into may get the field from the spread.
    const absent = (item.unnamed ?? []).length > 0 ? BOUND : undefined
    const holds = ([name, test]) =>
      passes(Object.hasOwn(item.fields, name) ? item.fields[name] : absent, test)
    return (
      Object.entries(fields).every(holds) &&
      (anyField === undefined || Object.entries(anyField).some(holds))
    )
  })
}

/** Whether a prop's node passes a value test (`eval/requirements-shape.ts`). */
function passes(node, test) {
  if (node === undefined) return false
  if (test === 'given') {
    return !(node.kind === 'literal' && [false, null, undefined, ''].includes(node.value))
  }
  if (test === 'dynamic') return isDynamic(node)
  if (Object.hasOwn(test, 'items')) return passesItems(node, test.items)
  if (Object.hasOwn(test, 'is')) return node.kind === 'literal' && node.value === test.is
  const words = wordsOf(node)
  return words !== null && new RegExp(test.matches, 'i').test(words)
}

/**
 * What an element's prop holds. `children` is also what is written between
 * the element's tags. A prop an element does not write, when the element is
 * given props by a spread, is taken as bound: the spread may carry it, and
 * the reader cannot see which props it carries.
 */
function prop(element, name) {
  if (Object.hasOwn(element.props, name)) return element.props[name]
  if (name === 'children' && element.children.length > 0) {
    return element.children.length === 1
      ? element.children[0]
      : { kind: 'list', items: element.children }
  }
  return element.spread ? BOUND : undefined
}

function matches(element, pattern) {
  if (!pattern.component.includes(element.component)) return false
  const holds = ([name, test]) => passes(prop(element, name), test)
  if (!Object.entries(pattern.props ?? {}).every(holds)) return false
  if (pattern.anyProp !== undefined && !Object.entries(pattern.anyProp).some(holds)) return false
  if (pattern.has === undefined) return true
  const inside = elementsIn([...Object.values(element.props), ...element.children])
  return inside.some((inner) => matches(inner, pattern.has))
}

function holds(check, elements) {
  if (check.any !== undefined) return check.any.some((inner) => holds(inner, elements))
  if (check.all !== undefined) return check.all.every((inner) => holds(inner, elements))
  if (check.element !== undefined) return elements.some((item) => matches(item, check.element))
  const patterns = [check.count].flat()
  const counted = elements.filter((item) => patterns.some((pattern) => matches(item, pattern)))
  // An element a module writes inside a loop stands for as many as the data holds.
  return counted.some((item) => item.repeated) || counted.length >= check.min
}

/**
 * The requirements a document does not meet, by id, in the order the brief
 * lists them. A document that cannot be read meets none.
 */
export function unmet(requirements, mode, document) {
  const elements = elementsOf(mode, document)
  return requirements
    .filter((requirement) => elements === null || !holds(requirement.check, elements))
    .map((requirement) => requirement.id)
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/** Every member and compound part of the registry, with the props it takes. */
function surfaceOf(registry) {
  const surface = new Map()
  for (const component of registry.components) {
    surface.set(component.name, new Set(component.props.map((entry) => entry.name)))
    for (const part of component.parts ?? []) {
      surface.set(`${component.name}.${part.name}`, new Set(part.props.map((entry) => entry.name)))
    }
  }
  return surface
}

/**
 * What is wrong with one brief's requirements beyond their shape, as
 * sentences. A requirement that names a member or a prop the vocabulary does
 * not have would never match, and would count against every model that met
 * the brief, so it is refused before any run.
 *
 * It also resolves each pattern in place: `kind` becomes the list of members
 * it names, and `component` is always a list afterwards.
 */
export function resolveRequirements(document, kinds, registry) {
  const surface = surfaceOf(registry)
  const faults = []
  const seen = new Set()

  /** A value test, and the tests on the fields of the items it reads. */
  const resolveTest = (name, test, where) => {
    if (typeof test !== 'object') return
    if (test.matches !== undefined) {
      try {
        new RegExp(test.matches, 'i')
      } catch {
        faults.push(`${where}: \`${name}\` is matched by a pattern that does not compile`)
      }
    }
    if (test.items === undefined) return
    if (test.items.min !== undefined && test.items.min < 1) {
      faults.push(`${where}: \`min\` is at least 1`)
    }
    const fields = { ...test.items.fields, ...test.items.anyField }
    for (const [field, inner] of Object.entries(fields)) resolveTest(field, inner, where)
  }

  const resolvePattern = (pattern, where) => {
    const named = pattern.component !== undefined
    if (named === (pattern.kind !== undefined)) {
      faults.push(`${where}: a pattern names \`component\` or \`kind\`, and not both`)
      pattern.component = []
    } else if (named) pattern.component = [pattern.component].flat()
    else if (!Object.hasOwn(kinds, pattern.kind)) {
      faults.push(`${where}: no kind called \`${pattern.kind}\``)
      pattern.component = []
    } else pattern.component = [...kinds[pattern.kind]]
    delete pattern.kind

    const props = [...Object.entries(pattern.props ?? {}), ...Object.entries(pattern.anyProp ?? {})]
    for (const component of pattern.component) {
      if (!surface.has(component)) {
        faults.push(`${where}: no member called \`${component}\``)
        continue
      }
      for (const [name] of props) {
        if (!surface.get(component).has(name)) {
          faults.push(`${where}: \`${component}\` has no prop \`${name}\``)
        }
      }
    }
    for (const [name, test] of props) resolveTest(name, test, where)
    if (pattern.has !== undefined) resolvePattern(pattern.has, where)
  }

  const resolveCheck = (check, where) => {
    for (const inner of check.any ?? check.all ?? []) resolveCheck(inner, where)
    if (check.element !== undefined) resolvePattern(check.element, where)
    if (check.count !== undefined) {
      if (check.min < 1) faults.push(`${where}: \`min\` is at least 1`)
      for (const pattern of [check.count].flat()) resolvePattern(pattern, where)
    }
  }

  // A brief that requires nothing would be met by every screen, and by none at all.
  if (document.requirements.length === 0) faults.push('there is no requirement')
  for (const requirement of document.requirements) {
    if (seen.has(requirement.id)) faults.push(`${requirement.id}: the id is used twice`)
    seen.add(requirement.id)
    resolveCheck(requirement.check, requirement.id)
  }
  return faults
}

/**
 * Every brief's requirements, by the brief's name, each with a digest of the
 * checks as they were resolved, by id. A results file records the digest, so
 * two runs judged by different checks can be told apart. A requirement's
 * sentence is left out of it: rewording one changes no verdict.
 *
 * `shapes` holds the two shape checks, which the caller supplies because the
 * shapes are TypeScript (`eval/toolbox.mjs` loads them for the harness). Any
 * fault, of shape or of vocabulary, throws with every fault listed.
 */
export function loadRequirements({ registry, shapes, directory = DIRECTORY }) {
  const read = (file) => JSON.parse(readFileSync(resolve(directory, file), 'utf8'))
  const surface = surfaceOf(registry)
  const faults = []

  const kinds = read(KINDS_FILE)
  faults.push(...shapes.kinds(kinds).map((fault) => `${KINDS_FILE}: ${fault}`))
  if (faults.length === 0) {
    for (const [kind, members] of Object.entries(kinds)) {
      for (const member of members.filter((name) => !surface.has(name))) {
        faults.push(`${KINDS_FILE}: ${kind}: no member called \`${member}\``)
      }
    }
  }

  const briefs = new Map()
  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith('.json') || file === KINDS_FILE) continue
    const document = read(file)
    const shapeFaults = shapes.requirements(document)
    const found =
      shapeFaults.length > 0 ? shapeFaults : resolveRequirements(document, kinds, registry)
    faults.push(...found.map((fault) => `${file}: ${fault}`))
    briefs.set(basename(file, '.json'), {
      requirements: document.requirements,
      digest: createHash('sha256')
        .update(JSON.stringify(document.requirements.map(({ id, check }) => ({ id, check }))))
        .digest('hex')
        .slice(0, 12),
    })
  }

  if (faults.length > 0) {
    throw new Error(`the requirements do not match the vocabulary:\n${faults.join('\n')}`)
  }
  return briefs
}
