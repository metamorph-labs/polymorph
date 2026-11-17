import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import ts from 'typescript'

import { matchesAny } from './glob.js'
import { markupTags, vueTagName, writtenAttribute } from './markup.js'

/**
 * `pnpm inventory`: every deviation from the vocabulary, in one table.
 *
 * The exception ladder (`docs/rules.md`) is useful only if you can see how often
 * a codebase uses it. A system with four declared exceptions is healthy. A
 * system with forty has a vocabulary problem, and one command should show that
 * without a code review.
 *
 * It is plain JS, like `glob.js` and the Stylelint plugin, because node runs it
 * directly and a reporting script does not justify a build step.
 *
 * Two kinds of finding:
 *
 *  - **Declared**: rung 2 (`DensityScope` / `ToneScope`), rung 3 (`patch`),
 *    rung 4 (`Bespoke`, and `ThirdParty` with the library it hosts). These
 *    exceptions work as designed. They are reported and never fail the run.
 *  - **Undeclared**: a bare `eslint-disable` naming a `polymorph/` rule that is
 *    not inside a `<Bespoke>`. That bypasses the ladder, and the run exits
 *    non-zero. A `<ThirdParty>` does not account for a disable: it lifts what
 *    hosting a library needs and nothing else, and a disable inside it would
 *    widen it without saying so. A `<ThirdParty>` that writes no `library`
 *    out is undeclared too: it names nothing a reviewer can check, so it has
 *    no rung and the run exits non-zero.
 *
 * A template is read tag by tag (`markup.js`), by the names and the attributes
 * the lint rules read. The two then agree on which tag is a zone or a boundary
 * and on the library a boundary names. The inventory reads what a boundary
 * writes and not the file's imports: whether the file imports a binding from
 * that library is lint's check (`no-raw-styles`).
 */

/** Rungs, numbered as the exception ladder numbers them. */
export const RUNGS = {
  scope: 2,
  patch: 3,
  bespoke: 4,
  undeclared: null,
}

const SCOPE_ELEMENTS = new Set(['DensityScope', 'ToneScope'])
const BESPOKE_ELEMENT = 'Bespoke'
/** The rung-4 boundary around another library's component. It names the library. */
const THIRD_PARTY_ELEMENT = 'ThirdParty'

/**
 * The kind of a `<ThirdParty>` that writes no `library` out: it has none, an
 * empty one or a computed one. It hosts nothing and lint reports it
 * (`no-raw-styles`), so it is listed with no rung and no library, and the run
 * fails on it as it fails on an undeclared disable. A placeholder or the
 * expression's text in the library column would read as a hosted library.
 */
export const NAMELESS_BOUNDARY = `${THIRD_PARTY_ELEMENT} with no library`

/**
 * What this scanner looks for at each declared rung, keyed by rung number.
 *
 * Exported because the registry publishes the ladder and would otherwise copy
 * these three strings. A catalogue that told an agent to use a marker this file
 * does not recognise would be worse than one that said nothing. The rung number
 * is the shared key, and this file owns the markers.
 */
export const RUNG_MARKERS = {
  [RUNGS.scope]: [...SCOPE_ELEMENTS].sort().join(' | '),
  [RUNGS.patch]: 'patch',
  [RUNGS.bespoke]: `${BESPOKE_ELEMENT} | ${THIRD_PARTY_ELEMENT}`,
}

/**
 * Application code, which is what the ladder applies to: TypeScript and TSX
 * (React and Solid screens, and Angular components with their inline
 * templates), Vue's and Svelte's single-file components, and Angular's external
 * templates. Exceptions are made from the vocabulary, so its own internals are
 * not deviations.
 */
export const DEFAULT_INCLUDE = [
  'apps/**/*.ts',
  'apps/**/*.tsx',
  'apps/**/*.vue',
  'apps/**/*.svelte',
  'apps/**/*.html',
]

/**
 * The dev harness, which is exempt from the red rules and so from the ladder.
 * It is declared here, in `eslint.config.ts` and in `repo-laws.test.ts`, so
 * widening it takes three edits.
 */
export const DEFAULT_IGNORE = ['apps/*/src/harness/**', '**/node_modules/**', '**/dist/**']

/** Any `eslint-disable` form that names a rule from this plugin. */
const DISABLE_COMMENT = /eslint-disable(?:-next-line|-line)?\s+([^\n*]*)/g

/**
 * @typedef {{ file: string, line: number, rung: number | null, kind: string, reason: string, library?: string }} Exception
 */

function walk(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(root, full, out)
    } else {
      out.push(relative(root, full).split(sep).join('/'))
    }
  }
}

/** Every file the ladder applies to, relative to the repo root and slash-separated. */
export function inventoryFiles(root, include = DEFAULT_INCLUDE, ignore = DEFAULT_IGNORE) {
  const found = []
  for (const top of new Set(include.map((pattern) => pattern.split('/')[0]))) {
    const dir = join(root, top)
    try {
      if (statSync(dir).isDirectory()) walk(root, dir, found)
    } catch {
      // A workspace that does not have that directory yet is not an error.
    }
  }
  return found.filter((file) => matchesAny(file, include) && !matchesAny(file, ignore)).sort()
}

function jsxName(node) {
  const name = node.tagName
  return ts.isIdentifier(name) ? name.text : name.getText()
}

/** The literal text of a string-valued JSX attribute, when it has one. */
function attributeText(opening, attributeName) {
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue
    if (attribute.name.getText() !== attributeName) continue
    const value = attribute.initializer
    if (!value) return ''
    if (ts.isStringLiteral(value)) return value.text
    if (ts.isJsxExpression(value) && value.expression) {
      const inner = value.expression
      if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text
      return inner.getText()
    }
  }
  return ''
}

/**
 * The text a JSX attribute writes out (`library="leaflet"`,
 * `library={'leaflet'}`), or `null` when the element computes it or has none.
 * The lint rules read a boundary's `library` the same way.
 */
function writtenText(opening, attributeName) {
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute)) continue
    if (attribute.name.getText() !== attributeName) continue
    const value = attribute.initializer
    const written = value && ts.isJsxExpression(value) ? value.expression : value
    return written && (ts.isStringLiteral(written) || ts.isNoSubstitutionTemplateLiteral(written))
      ? written.text
      : null
  }
  return null
}

/**
 * A `<ThirdParty>` as a finding. `library` is the name its attribute writes
 * out, or `null`. With a name it is a rung-4 exception that hosts that
 * library, and with none it is a `NAMELESS_BOUNDARY`.
 *
 * @param {string} file
 * @param {number} line
 * @param {string | null} library
 * @param {string | null} reason
 * @returns {Exception}
 */
function boundary(file, line, library, reason) {
  const named = library?.trim() ?? ''
  const shown = reason || '(no reason given)'
  return named === ''
    ? { file, line, rung: RUNGS.undeclared, kind: NAMELESS_BOUNDARY, reason: shown }
    : { file, line, rung: RUNGS.bespoke, kind: THIRD_PARTY_ELEMENT, library: named, reason: shown }
}

function hasAttribute(opening, attributeName) {
  return opening.attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === attributeName,
  )
}

/**
 * Reads one file's deviations. Exported so the tests can run it on a fixture
 * instead of the repo.
 *
 * @param {string} file
 * @param {string} source
 * @returns {Exception[]}
 */
export function scanSource(file, source) {
  /** @type {Exception[]} */
  const found = []
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lineOf = (pos) => ast.getLineAndCharacterOfPosition(pos).line + 1

  /** Bespoke zones, as position ranges, so a disable inside one is accounted for. */
  const bespokeRanges = []

  /** String ranges. A disable comment inside one of these is ignored. */
  const stringRanges = []

  const visit = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteral(node)) {
      stringRanges.push([node.getStart(), node.getEnd()])
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = jsxName(node)

      if (name === BESPOKE_ELEMENT) {
        // An opening tag's zone is the element it opens. A self-closing tag has
        // no children, so its zone is the tag itself. Reading `.parent` for both
        // would give a childless `<Bespoke />` the whole surrounding element. A
        // disable on a sibling would then count as declared, which is exactly
        // what this tool must catch.
        const zone = ts.isJsxSelfClosingElement(node) ? node : node.parent
        bespokeRanges.push([zone.getStart(), zone.getEnd()])
        found.push({
          file,
          line: lineOf(node.getStart()),
          rung: RUNGS.bespoke,
          kind: 'Bespoke',
          reason: attributeText(node, 'reason') || '(no reason given)',
        })
      } else if (name === THIRD_PARTY_ELEMENT) {
        found.push(
          boundary(
            file,
            lineOf(node.getStart()),
            writtenText(node, 'library'),
            attributeText(node, 'reason'),
          ),
        )
      } else if (SCOPE_ELEMENTS.has(name)) {
        found.push({
          file,
          line: lineOf(node.getStart()),
          rung: RUNGS.scope,
          kind: name,
          reason: attributeText(node, 'value') || '(no value)',
        })
      }

      if (hasAttribute(node, 'patch')) {
        found.push({
          file,
          line: lineOf(node.getStart()),
          rung: RUNGS.patch,
          kind: `${name} patch`,
          reason: attributeText(node, 'patch') || '(empty patch)',
        })
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(ast)

  // Disables that name one of this plugin's rules and are not inside a zone.
  const within = (ranges, at) => ranges.some(([start, end]) => at >= start && at <= end)

  for (const match of source.matchAll(DISABLE_COMMENT)) {
    const rules = match[1] ?? ''
    if (!rules.includes('polymorph/')) continue

    const at = match.index ?? 0
    // A disable is a comment. The same text inside a string is documentation
    // about the ladder, and failing the build on it would discourage writing
    // that documentation.
    if (within(stringRanges, at)) continue
    if (within(bespokeRanges, at)) continue

    found.push({
      file,
      line: lineOf(at),
      rung: RUNGS.undeclared,
      kind: 'undeclared disable',
      reason: rules.trim().replace(/\s*--.*$/, ''),
    })
  }

  return found.sort((a, b) => a.line - b.line)
}

/** A `<script>` or `<style>` block of a single-file component, with its contents. */
const BLOCK = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi

/** An HTML comment, which is where a disable is written in markup. */
const MARKUP_COMMENT = /<!--([\s\S]*?)-->/g

/** `density-scope` is `DensityScope`. */
const pascal = (kebab) =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

/** The selector prefix of every member in an Angular template: `pm-bespoke`. */
const SELECTOR_PREFIX = 'pm-'

/** Svelte and Angular resolve no tag by what the script imports. */
const NO_IMPORTS = new Set()

/**
 * The member a template's tag names, as the syntax's lint rules read it. Vue
 * resolves a tag against the script's imports (`vueTagName`): `<third-party>`
 * is `ThirdParty`, and `<bespoke>` is `Bespoke` where the script imports it.
 * Angular names a member by its selector: `<pm-bespoke>` is `Bespoke`. Svelte
 * reads a tag as written.
 *
 * @param {string} tag the tag's name as written
 * @param {'vue' | 'svelte' | 'angular'} syntax
 * @param {ReadonlySet<string>} imports the names a Vue component's scripts import
 */
function memberOf(tag, syntax, imports) {
  if (syntax === 'vue') return vueTagName(tag, imports)
  if (syntax === 'angular' && tag.startsWith(SELECTOR_PREFIX)) {
    return pascal(tag.slice(SELECTOR_PREFIX.length))
  }
  return tag
}

/** How each syntax spells an attribute it binds to an expression. Svelte's is `name={…}`. */
const BOUND = {
  vue: (name) => [`:${name}`, `v-bind:${name}`],
  svelte: () => [],
  angular: (name) => [`[${name}]`],
}

/**
 * What a tag gives the attribute `name`, as the table shows it: a static
 * value's text, or a bound one's expression with a string literal's quotes
 * removed. `''` for a bare name, and `null` when the tag has no such
 * attribute.
 *
 * It is how a `reason`, a `value` and a `patch` are shown. A `library` is read
 * by `writtenAttribute`, which gives a bound one no name.
 */
function shownAttribute(tag, name, syntax) {
  const bound = BOUND[syntax](name)
  const attribute = tag.attributes.find(
    (candidate) => candidate.name === name || bound.includes(candidate.name),
  )
  if (attribute === undefined) return null
  const value = (attribute.value ?? '').trim()
  if (attribute.name === name && !attribute.braced) return value
  const literal = /^(['"`])([\s\S]*)\1$/.exec(value)
  return literal ? (literal[2] ?? '') : value
}

/**
 * Adds the names a script imports to `into`. A Vue template's tags resolve to
 * them, and the lint rules read the same names from the parsed script.
 *
 * @param {string} file
 * @param {string} script
 * @param {Set<string>} into
 */
function importedNames(file, script, into) {
  const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const { name, namedBindings } = statement.importClause
    if (name) into.add(name.text)
    if (namedBindings && ts.isNamespaceImport(namedBindings)) into.add(namedBindings.name.text)
    else if (namedBindings)
      for (const element of namedBindings.elements) into.add(element.name.text)
  }
}

/**
 * Reads one template's deviations: its `<DensityScope>`, `<ToneScope>`,
 * `patch`, `<Bespoke>` and `<ThirdParty>`, and the disables in its HTML
 * comments outside every `<Bespoke>`. `markup` is a template's text, or a
 * single-file component's with its scripts and styles blanked.
 *
 * @param {string} file
 * @param {string} markup
 * @param {'vue' | 'svelte' | 'angular'} syntax
 * @param {ReadonlySet<string>} imports the names a Vue component's scripts import
 * @returns {Exception[]}
 */
function scanTemplate(file, markup, syntax, imports) {
  /** @type {Exception[]} */
  const found = []
  const lineOf = (at) => markup.slice(0, at).split('\n').length

  /** Bespoke zones, as position ranges, so a disable inside one is accounted for. */
  const bespokeRanges = []
  /** Where each zone still open starts. An end tag closes the innermost one. */
  const open = []
  for (const tag of markupTags(markup)) {
    const name = memberOf(tag.name, syntax, imports)
    if (tag.close) {
      if (name === BESPOKE_ELEMENT && open.length > 0) bespokeRanges.push([open.pop(), tag.end])
      continue
    }
    const shown = (attribute) => shownAttribute(tag, attribute, syntax)
    if (name === BESPOKE_ELEMENT) {
      // A self-closing tag has no children, so its zone is the tag itself.
      if (tag.selfClosing) bespokeRanges.push([tag.start, tag.end])
      else open.push(tag.start)
      found.push({
        file,
        line: lineOf(tag.start),
        rung: RUNGS.bespoke,
        kind: 'Bespoke',
        reason: shown('reason') || '(no reason given)',
      })
    } else if (name === THIRD_PARTY_ELEMENT) {
      found.push(
        boundary(
          file,
          lineOf(tag.start),
          writtenAttribute(tag, 'library', syntax),
          shown('reason'),
        ),
      )
    } else if (SCOPE_ELEMENTS.has(name)) {
      found.push({
        file,
        line: lineOf(tag.start),
        rung: RUNGS.scope,
        kind: name,
        reason: shown('value') || '(no value)',
      })
    }
    const patch = shown('patch')
    if (patch !== null) {
      found.push({
        file,
        line: lineOf(tag.start),
        rung: RUNGS.patch,
        kind: `${name} patch`,
        reason: patch || '(empty patch)',
      })
    }
  }
  // A zone the text never closes runs to its end.
  for (const start of open) bespokeRanges.push([start, markup.length])

  const within = (at) => bespokeRanges.some(([start, end]) => at >= start && at <= end)
  for (const comment of markup.matchAll(MARKUP_COMMENT)) {
    for (const match of (comment[1] ?? '').matchAll(DISABLE_COMMENT)) {
      const rules = match[1] ?? ''
      if (!rules.includes('polymorph/')) continue
      const at = (comment.index ?? 0) + 4 + (match.index ?? 0)
      if (within(at)) continue
      found.push({
        file,
        line: lineOf(at),
        rung: RUNGS.undeclared,
        kind: 'undeclared disable',
        reason: rules.trim().replace(/\s*--.*$/, ''),
      })
    }
  }

  return found
}

/**
 * Reads one Vue or Svelte component's deviations: its scripts as
 * `scanSource` reads TypeScript, and its markup as `scanTemplate` reads a
 * template. A Vue tag is read by the name Vue resolves it to, so
 * `<third-party>` and `<bespoke>` are found where lint finds them. Exported
 * so the tests can run it on a fixture.
 *
 * @param {string} file
 * @param {string} source
 * @returns {Exception[]}
 */
export function scanMarkup(file, source) {
  /** @type {Exception[]} */
  const found = []
  const lineOf = (at) => source.slice(0, at).split('\n').length
  const syntax = file.endsWith('.svelte') ? 'svelte' : 'vue'
  /** @type {Set<string>} */
  const imports = new Set()

  // The scripts, each read as TypeScript, with its lines counted from the file's start.
  let markup = source
  for (const match of source.matchAll(BLOCK)) {
    const start = (match.index ?? 0) + match[0].indexOf('>') + 1
    if ((match[1] ?? '').toLowerCase() === 'script') {
      const offset = lineOf(start) - 1
      for (const exception of scanSource(file, match[2] ?? '')) {
        found.push({ ...exception, line: exception.line + offset })
      }
      if (syntax === 'vue') importedNames(file, match[2] ?? '', imports)
    }
    // Blanked, keeping its line breaks, so the markup scan never reads a script as tags.
    markup =
      markup.slice(0, match.index ?? 0) +
      match[0].replace(/[^\n]/g, ' ') +
      markup.slice((match.index ?? 0) + match[0].length)
  }

  found.push(...scanTemplate(file, markup, syntax, imports))
  return found.sort((a, b) => a.line - b.line)
}

/**
 * The inline templates of a module's Angular components, each with the line
 * its text starts on.
 *
 * @param {string} file
 * @param {string} source
 * @returns {{ text: string, line: number }[]}
 */
function inlineTemplates(file, source) {
  if (!source.includes('@Component')) return []
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  /** @type {{ text: string, line: number }[]} */
  const found = []
  const visit = (node) => {
    if (
      ts.isDecorator(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Component'
    ) {
      const [metadata] = node.expression.arguments
      const template =
        metadata && ts.isObjectLiteralExpression(metadata)
          ? metadata.properties.find(
              (property) =>
                ts.isPropertyAssignment(property) && property.name.getText() === 'template',
            )
          : undefined
      const value = template && ts.isPropertyAssignment(template) ? template.initializer : null
      if (
        value &&
        (ts.isStringLiteral(value) ||
          ts.isNoSubstitutionTemplateLiteral(value) ||
          ts.isTemplateExpression(value))
      ) {
        const start = value.getStart(sourceFile) + 1
        found.push({
          text: source.slice(start, value.getEnd() - 1),
          line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

/**
 * Reads one Angular template's deviations, external (`.html`) or inline, as
 * `scanTemplate` reads a template: each member by its selector
 * (`<pm-bespoke>`, `<pm-third-party>`, `<pm-density-scope>`) and a `patch`
 * static or bound (`[patch]="…"`). Exported so the tests can run it on a
 * fixture.
 *
 * @param {string} file
 * @param {string} template
 * @param {number} [line] the line of the file the template starts on
 * @returns {Exception[]}
 */
export function scanAngularTemplate(file, template, line = 1) {
  return scanTemplate(file, template, 'angular', NO_IMPORTS)
    .sort((a, b) => a.line - b.line)
    .map((exception) => ({ ...exception, line: exception.line + line - 1 }))
}

/**
 * Reads one Angular component module's deviations: the module as
 * `scanSource` reads TypeScript, and each inline template as
 * `scanAngularTemplate` reads it, at its lines in the module. Exported so the
 * tests can run it on a fixture.
 *
 * @param {string} file
 * @param {string} source
 * @returns {Exception[]}
 */
export function scanAngularComponent(file, source) {
  return [
    ...scanSource(file, source),
    ...inlineTemplates(file, source).flatMap(({ text, line }) =>
      scanAngularTemplate(file, text, line),
    ),
  ].sort((a, b) => a.line - b.line)
}

/**
 * @param {string} root
 * @returns {Exception[]}
 */
export function collectExceptions(root, include = DEFAULT_INCLUDE, ignore = DEFAULT_IGNORE) {
  return inventoryFiles(root, include, ignore).flatMap((file) => {
    /*
     * A file may be deleted between the listing and the read, and the inventory
     * skips it. This happens in practice: `transcript.test.ts` writes a probe
     * under `apps/` (the path is needed for its lint comparison to be accurate)
     * and then deletes it, and this walk runs alongside it in the same project.
     * Any other read error is still thrown.
     */
    let source
    try {
      source = readFileSync(join(root, file), 'utf8')
    } catch (error) {
      if (
        error instanceof Error &&
        /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
      ) {
        return []
      }
      throw error
    }
    if (/\.(vue|svelte)$/.test(file)) return scanMarkup(file, source)
    if (file.endsWith('.html')) return scanAngularTemplate(file, source)
    return file.endsWith('.ts') ? scanAngularComponent(file, source) : scanSource(file, source)
  })
}

/**
 * The console table, as a string so the tests can read it.
 *
 * @param {Exception[]} exceptions
 */
export function formatTable(exceptions) {
  if (exceptions.length === 0) return 'No exceptions. Every screen is vocabulary.\n'

  const rows = exceptions.map((exception) => [
    exception.rung === null ? '—' : `rung ${exception.rung}`,
    `${exception.file}:${exception.line}`,
    exception.library === undefined ? exception.kind : `${exception.kind} ${exception.library}`,
    exception.reason.length > 60 ? `${exception.reason.slice(0, 57)}…` : exception.reason,
  ])
  const headers = ['RUNG', 'WHERE', 'WHAT', 'WHY']
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length)),
  )
  const line = (cells) =>
    cells
      .map((cell, column) => cell.padEnd(widths[column]))
      .join('  ')
      .trimEnd()

  return [
    line(headers),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map(line),
    '',
  ].join('\n')
}

/**
 * The libraries an application hosts, each once, sorted: what its
 * `<ThirdParty>` boundaries name. It is the list of components the vocabulary
 * does not draw and the theme reaches only through the boundary's route.
 *
 * @param {Exception[]} exceptions
 * @returns {string[]}
 */
export function hostedLibraries(exceptions) {
  return [
    ...new Set(exceptions.flatMap((exception) => (exception.library ? [exception.library] : []))),
  ].sort()
}
