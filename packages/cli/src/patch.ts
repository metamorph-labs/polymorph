/**
 * Edits to files the consumer already owns.
 *
 * Every function here takes a string and returns a string, and every one is
 * idempotent. Running `polymorph add` twice must not produce two pre-paint
 * scripts or two spread lines. They are pure functions instead of file
 * operations because idempotence is a property of text, and it is tested as
 * one.
 *
 * The module's rule: **change as little as possible, and fail loudly instead of
 * guessing.** The worst outcome is an installer that half-edits somebody's
 * ESLint config and reports success, because the rules are then not installed
 * and nothing says so.
 */

export class PatchError extends Error {
  constructor(
    readonly file: string,
    readonly instruction: string,
  ) {
    super(`polymorph: cannot edit ${file} automatically.\n\n${instruction}`)
    this.name = 'PatchError'
  }
}

/* -------------------------------------------------------------------------- */
/* package.json                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Adds dependencies without changing anything else.
 *
 * `wanted` goes to `dependencies` and `wantedDev` to `devDependencies`. A name
 * already in either map counts as present, so a package the consumer keeps in
 * the other map is not added a second time.
 *
 * A range already present is left as it is, even when it differs from the
 * registry's. The consumer may have pinned Radix on purpose, and that decision
 * is not the installer's to change. The difference is reported instead.
 */
export function addDependencies(
  source: string,
  wanted: Record<string, string>,
  wantedDev: Record<string, string> = {},
): { text: string; added: string[]; conflicts: { name: string; theirs: string; ours: string }[] } {
  const manifest = JSON.parse(source) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const dependencies = { ...manifest.dependencies }
  const devDependencies = { ...manifest.devDependencies }
  const added: string[] = []
  const conflicts: { name: string; theirs: string; ours: string }[] = []

  const take = (into: Record<string, string>, name: string, range: string): void => {
    const existing = dependencies[name] ?? devDependencies[name]
    if (existing === undefined) {
      into[name] = range
      added.push(name)
    } else if (existing !== range) {
      conflicts.push({ name, theirs: existing, ours: range })
    }
  }
  for (const [name, range] of Object.entries(wanted)) take(dependencies, name, range)
  for (const [name, range] of Object.entries(wantedDev)) take(devDependencies, name, range)

  const sorted = (ranges: Record<string, string>) =>
    Object.fromEntries(Object.entries(ranges).sort(([a], [b]) => a.localeCompare(b)))

  // Two spaces and a trailing newline: npm's own formatting, so the write does
  // not show up as a whole-file diff in the consumer's next commit. A map the
  // manifest did not have is added only when something goes into it.
  const next: Record<string, unknown> = { ...manifest, dependencies: sorted(dependencies) }
  if (manifest.devDependencies !== undefined || Object.keys(devDependencies).length > 0) {
    next['devDependencies'] = sorted(devDependencies)
  }
  return { text: `${JSON.stringify(next, null, 2)}\n`, added, conflicts }
}

/* -------------------------------------------------------------------------- */
/* index.html                                                                 */
/* -------------------------------------------------------------------------- */

const PREPAINT_MARK = 'data-polymorph="prepaint"'

/**
 * Inlines the pre-paint script as the first element in `<head>`.
 *
 * It is first, inline and not deferred for one reason: it must run before the
 * first stylesheet resolves. Otherwise the page paints once in the wrong theme
 * and then corrects itself. The script exists to prevent that flash, so placing
 * it anywhere else would make it useless.
 *
 * It is found by a data attribute instead of by content. A second install then
 * replaces it instead of adding another, and a consumer who moved it keeps
 * their placement.
 */
export function injectPrepaint(html: string, script: string): string {
  const tag = `    <script ${PREPAINT_MARK}>${script}</script>\n`

  const existing = new RegExp(
    `[^\\n]*<script[^>]*${PREPAINT_MARK}[^>]*>.*?</script>[^\\n]*\\n?`,
    's',
  )
  if (existing.test(html)) return html.replace(existing, tag)

  const head = /<head[^>]*>\n?/i.exec(html)
  if (!head) {
    throw new PatchError(
      'index.html',
      `Add this as the first element inside <head>:\n\n${tag.trim()}`,
    )
  }

  const at = head.index + head[0].length
  return html.slice(0, at) + tag + html.slice(at)
}

/* -------------------------------------------------------------------------- */
/* The lint configs                                                           */
/* -------------------------------------------------------------------------- */

export const ESLINT_FRAGMENT = 'polymorph.eslint.js'
export const STYLELINT_FRAGMENT = 'polymorph.stylelint.js'

/**
 * The name the generated array is imported under: `polymorph`, unless the
 * config binds that name already. A config that takes the rules from
 * `@polymorph/rules/eslint` by hand imports the plugin as `polymorph`
 * (`docs/consuming.md`), and a second binding of the name is a syntax error.
 */
function fragmentName(source: string): string {
  const taken =
    /\bimport\s+polymorph\b|\bas\s+polymorph\b|\b(?:const|let|var|function)\s+polymorph\b/.test(
      source,
    )
  return taken ? 'polymorphInstall' : 'polymorph'
}

/**
 * Whether a config already loads a generated fragment: the fragment's file
 * named as a module, inside quotes. A comment that mentions the file is not a
 * link, and a config that only mentions it still needs one.
 */
const names = (source: string, fragment: string): boolean =>
  new RegExp(`['"][^'"\\n]*${fragment.replaceAll('.', '\\.')}['"]`).test(source)

const eslintImport = (name: string) => `import ${name} from './${ESLINT_FRAGMENT}'`
const eslintSpread = (name: string) => `...${name},`

/**
 * Splices the generated flat-config array into an existing flat config,
 * `file`, which the error names.
 *
 * The insertion point is the first `[` or `(` after `export default`. This
 * covers the three shapes of a flat config (a bare array, `tseslint.config(…)`
 * and `defineConfig([…])`), because all three take the config objects first
 * inside that bracket. Any other shape throws with the two lines to paste.
 * Throwing is correct here, because the failure to avoid is an installer that
 * reports success when the rules were not installed.
 */
export function linkEslintConfig(source: string, file = 'eslint.config.js'): string {
  if (names(source, ESLINT_FRAGMENT)) return source

  const marker = /export\s+default\s+/.exec(source)
  const opening = marker ? /[[(]/.exec(source.slice(marker.index)) : null
  if (!marker || !opening) {
    throw new PatchError(
      file,
      `Add the import, then spread it into your exported config:\n\n` +
        `  ${eslintImport('polymorph')}\n  export default [${eslintSpread('polymorph')} /* yours */]`,
    )
  }

  const name = fragmentName(source)
  const at = marker.index + opening.index + 1
  const withSpread = `${source.slice(0, at)}\n  ${eslintSpread(name)}${source.slice(at)}`
  return prependImport(withSpread, eslintImport(name))
}

const STYLELINT_EXTEND = `'./${STYLELINT_FRAGMENT}'`

/**
 * Adds the generated config to the consumer's `extends`.
 *
 * Stylelint has no array form, so `extends` is its only composition point. That
 * makes this the narrower and safer of the two patches: one string added to one
 * list, or a new list that contains it.
 */
export function linkStylelintConfig(source: string): string {
  if (names(source, STYLELINT_FRAGMENT)) return source

  const list = /extends\s*:\s*\[/.exec(source)
  if (list) {
    const at = list.index + list[0].length
    return `${source.slice(0, at)}${STYLELINT_EXTEND}, ${source.slice(at)}`
  }

  const single = /extends\s*:\s*(['"][^'"]+['"])/.exec(source)
  if (single) {
    return source.replace(single[0], `extends: [${single[1] as string}, ${STYLELINT_EXTEND}]`)
  }

  const object = /export\s+default\s*\{/.exec(source)
  if (object) {
    const at = object.index + object[0].length
    return `${source.slice(0, at)}\n  extends: [${STYLELINT_EXTEND}],${source.slice(at)}`
  }

  throw new PatchError(
    'stylelint.config.js',
    `Add the generated config to your \`extends\`:\n\n  extends: [${STYLELINT_EXTEND}],`,
  )
}

/**
 * An import statement from its first line to its last. One with a list of
 * names is often written over several lines, and it ends on the line that
 * names its module, so the match runs to the first line that ends with a
 * quoted specifier. `import(` is a call, not a statement.
 */
const IMPORT_STATEMENT = /^import\b(?!\s*\()[\s\S]*?['"][^'"\n]+['"][ \t]*;?[ \t]*$/gm

/** After the last top-level import, or at the top when there are none. */
function prependImport(source: string, statement: string): string {
  const imports = [...source.matchAll(IMPORT_STATEMENT)]
  const last = imports[imports.length - 1]
  if (!last) return `${statement}\n\n${source}`

  const at = (last.index as number) + last[0].length
  return `${source.slice(0, at)}\n${statement}${source.slice(at)}`
}

/* -------------------------------------------------------------------------- */
/* The entry module                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Imports the generated theme module from the app's entry, once.
 *
 * A theme install includes its fonts and its pre-paint script, because a theme
 * that renders in fallback fonts on first install is a broken install. A
 * generated module that nothing imports causes exactly that: the fonts are on
 * disk, the stylesheet is never built, and the page paints in Helvetica while
 * the manifest says the theme is installed. So the entry gets one import, at
 * the top, where a side-effecting font import must be anyway.
 */
export function importThemes(source: string, specifier: string): string {
  const statement = `import { installThemes } from '${specifier}'`
  if (source.includes(specifier)) return source

  const call = 'installThemes()'
  const withImport = prependImport(source, statement)
  return withImport.includes(call)
    ? withImport
    : withImport.replace(
        statement,
        `${statement}\n\n// Themes before the app mounts, so the first frame is already themed.\n${call}`,
      )
}
