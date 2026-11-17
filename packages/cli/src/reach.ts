import { readdirSync, readFileSync } from 'node:fs'
import { posix, resolve } from 'node:path'

/**
 * Which vendored files the application's own code imports.
 *
 * `update` re-plans an install from the members the manifest asked for, and
 * deletes a vendored file the plan no longer carries. A member that came along
 * with another one stops being carried when that one stops needing it, and the
 * application may still import it by path: a brand mark rendered inside a
 * vendored `Bespoke`, or a `Toaster` mounted at the root. Deleting that file
 * breaks the application's build, so `update` asks this module first.
 *
 * It reads text, not a program. A specifier is any quoted string after `from`,
 * `import`, `import(` or `require(`, which covers every static and dynamic
 * import a bundler resolves, and a CSS Module's `composes … from`. A relative
 * specifier is resolved against its file. A bare one is read as a path alias
 * (`@/polymorph/exceptions/Bespoke`, `src/polymorph/…`) when it names the
 * install directory's last segment, and it then names the file below that
 * segment. A specifier computed at run time is not seen.
 */

/** Directories the application's source is never in. */
const NOT_SOURCE = new Set(['node_modules', 'dist', 'build', 'coverage', 'out'])

/** The files an application imports modules from. */
const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/

const SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(['"])([^'"\n]+)\1/g

/** What a specifier with no extension, or a directory, can name. */
const ENDINGS = ['', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '/index.tsx', '/index.ts']

/** The repository-relative paths a specifier in `from` can name. */
function candidates(from: string, specifier: string, dir: string): string[] {
  const path = specifier.replace(/[?#].*$/, '')
  let base: string
  if (path.startsWith('./') || path.startsWith('../')) {
    base = posix.normalize(posix.join(posix.dirname(from), path))
  } else {
    const segment = `/${posix.basename(dir)}/`
    const at = `/${path}`.lastIndexOf(segment)
    if (at === -1) return []
    base = `${dir}/${`/${path}`.slice(at + segment.length)}`
  }
  // A TypeScript ESM import names `./Button.js` for `Button.tsx`.
  const stem = base.replace(/\.jsx?$/, '')
  return [
    ...new Set([...ENDINGS.map((ending) => base + ending), stem, `${stem}.ts`, `${stem}.tsx`]),
  ]
}

/**
 * Every file in the application whose name `pattern` matches, as a
 * repository-relative path: below `from` (the root when empty), outside the
 * vendored directory `dir`, dot-directories and the directories source is
 * never in. `update` reads the source files; `check` reads the files the red
 * rules read.
 */
export function applicationFiles(
  root: string,
  dir: string | null,
  pattern: RegExp = SOURCE,
  from = '',
): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(resolve(root, at), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || NOT_SOURCE.has(entry.name)) continue
      const path = at === '' ? entry.name : `${at}/${entry.name}`
      if (entry.isDirectory()) {
        if (path !== dir) walk(path)
      } else if (entry.isFile() && pattern.test(entry.name)) {
        found.push(path)
      }
    }
  }
  walk(from)
  return found
}

/**
 * Of `targets`, the vendored paths `update` is about to delete, the ones the
 * application reaches, each with the file that imports it. That file is
 * either the application's own, outside `dir`, or a target already reached,
 * so a kept file keeps the vendored files it imports.
 */
export function importedBy(
  root: string,
  dir: string,
  targets: readonly string[],
): Map<string, string> {
  const wanted = new Set(targets)
  const reached = new Map<string, string>()
  if (wanted.size === 0) return reached

  const queue: string[] = []
  const read = (file: string): void => {
    const text = readFileSync(resolve(root, file), 'utf8')
    for (const match of text.matchAll(SPECIFIER)) {
      for (const path of candidates(file, match[2] as string, dir)) {
        if (!wanted.has(path) || reached.has(path)) continue
        reached.set(path, file)
        queue.push(path)
      }
    }
  }

  for (const file of applicationFiles(root, dir)) read(file)
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) read(next)
  return reached
}
