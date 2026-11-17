import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { MAPPED_FRAMEWORKS, type MappedFramework } from '@polymorph/registry'

import { DEFAULT_DIR, escapes, EscapingDirError } from './plan'

/**
 * `polymorph.json` records what was installed and its contents at install time.
 *
 * `diff` and `update` use it to tell three states apart:
 *
 *   installed and untouched   — safe to overwrite on update
 *   edited by the consumer    — the consumer's file; update must not overwrite it
 *   changed upstream          — the reason to update
 *
 * A hash of the bytes at install time separates them. **Disk vs recorded**
 * detects the consumer's edit. **Recorded vs registry** detects an upstream
 * change. An installer that stored only a version number could detect the
 * upstream change but would silently overwrite the edit.
 *
 * The file lives in the consumer's repository and is meant to be committed. The
 * registry is different: it is generated at publish time and never committed.
 * This file is committed because it records a decision somebody made.
 */

export const MANIFEST_FILE = 'polymorph.json'

export interface ManifestFile {
  /** SHA-256 of the bytes written at install time. */
  hash: string
  /** The source path in this repository, or `null` when this file was generated. */
  source: string | null
}

export interface Manifest {
  /** The registry version this install was resolved against. */
  version: string
  /** Where vendored source lives, relative to the consumer's root. */
  dir: string
  /**
   * Members asked for by name. Everything else in `files` came in as a
   * dependency. The exception ladder's primitives are recorded here when asked
   * for, because the install treats a `Bespoke` like a `Button`: source asked
   * for by name and owned once installed. The registry lists them separately
   * for a reason that concerns the catalogue, not this tree.
   */
  components: string[]
  /**
   * Systems and palettes are recorded separately, matching the data model. An
   * older manifest's combined `themes` list is **not** migrated. Its names and
   * paths are preset names and paths, and building a pairing from one would be
   * a guess. The consumer can restate the decision with
   * `polymorph add theme:<system>`. Instead, an update prunes the old file like
   * any other file the vocabulary no longer carries: removed if untouched, kept
   * and reported if edited.
   */
  systems: string[]
  palettes: string[]
  files: Record<string, ManifestFile>
  /**
   * `vue`, `svelte`, `solid` or `angular` when the vendored members are that
   * framework's vocabulary's components, so `update` and `diff` re-plan the
   * same files. `elements` when the install is a page's: the files it loads
   * the elements from, copied into `dir`, and its theme sheet. Absent for React.
   */
  framework?: MappedFramework
  /**
   * `true` when the application installs its themes itself, from its own
   * module, instead of calling the generated `installThemes()`. `add` and
   * `update` then leave the application's entry as it is. Without it, every
   * install that has a system or palette adds the import and the call back to
   * an entry that removed them. Set by hand; absent means `false`.
   */
  appInstallsThemes?: boolean
}

export function digest(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex')
}

export function emptyManifest(version: string, dir = DEFAULT_DIR): Manifest {
  return { version, dir, components: [], systems: [], palettes: [], files: {} }
}

export function manifestPath(root: string): string {
  return resolve(root, MANIFEST_FILE)
}

/**
 * Reads the manifest, and rejects the whole file if any path in it leaves the
 * repository.
 *
 * `polymorph.json` is a file in somebody else's repository. It is committed,
 * hand-editable, and arrives through pull requests like any other file. Every
 * path in it is later resolved against the consumer's root, and one of those
 * uses is `rmSync`. A key such as `src/polymorph/../../../x` could therefore
 * delete a file outside the repository, and it passes any prefix test against
 * the install directory.
 *
 * The check runs here, at the read, instead of at each use. `diff`, `update`
 * and `add` all call this function, so the code below can resolve every path
 * without checking again. The error also names the offending key, instead of
 * leaving an unexplained deletion. The whole file is rejected, not filtered,
 * because a manifest edited to point outside the repository is not a manifest
 * with one bad line.
 *
 * It applies the same check and throws the same error as `--dir` on purpose.
 * `escapes` is the only containment check in this package.
 */
export function readManifest(root: string): Manifest | null {
  const path = manifestPath(root)
  if (!existsSync(path)) return null

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Manifest>
  if (typeof parsed.dir !== 'string' || typeof parsed.files !== 'object') {
    throw new Error(`polymorph: ${MANIFEST_FILE} is not a polymorph manifest`)
  }

  const files = parsed.files ?? {}
  if (escapes(parsed.dir)) {
    throw new EscapingDirError(parsed.dir, `the "dir" in ${MANIFEST_FILE}`)
  }
  for (const key of Object.keys(files)) {
    if (escapes(key)) throw new EscapingDirError(key, `every path in ${MANIFEST_FILE}`)
  }

  return {
    version: parsed.version ?? '0.0.0',
    dir: parsed.dir,
    components: parsed.components ?? [],
    systems: parsed.systems ?? [],
    palettes: parsed.palettes ?? [],
    files,
    ...((MAPPED_FRAMEWORKS as readonly unknown[]).includes(parsed.framework)
      ? { framework: parsed.framework as MappedFramework }
      : {}),
    ...(parsed.appInstallsThemes === true ? { appInstallsThemes: true } : {}),
  }
}

/** Sorts keys before writing, so a second install does not produce a key-order diff. */
export function writeManifest(root: string, manifest: Manifest): void {
  const ordered: Manifest = {
    version: manifest.version,
    dir: manifest.dir,
    components: [...manifest.components].sort(),
    systems: [...manifest.systems].sort(),
    palettes: [...manifest.palettes].sort(),
    files: Object.fromEntries(
      Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)),
    ),
    ...(manifest.framework === undefined ? {} : { framework: manifest.framework }),
    ...(manifest.appInstallsThemes === true ? { appInstallsThemes: true } : {}),
  }
  writeFileSync(manifestPath(root), `${JSON.stringify(ordered, null, 2)}\n`)
}
