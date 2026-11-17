import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Registry } from '@polymorph/registry'

import { applyPlan, type ApplyResult } from './apply'
import { generatedFiles } from './emit'
import { digest, readManifest, writeManifest, type Manifest } from './manifest'
import {
  absenceReason,
  membersAt,
  nearestName,
  planInstall,
  shipped,
  successor,
  vendoredText,
  type InstallPlan,
} from './plan'
import { importedBy } from './reach'

/**
 * `polymorph diff` and `polymorph update`.
 *
 * Vendored source is the consumer's code, so "has this changed?" is two
 * questions. An installer that answers only one of them overwrites the
 * consumer's work:
 *
 *   **theirs**   disk ≠ what we installed. An edit. Never overwritten unless
 *                asked, and the reason `add` records a hash.
 *   **upstream** what we installed ≠ what the registry ships now. A change on
 *                our side, and the only thing `update` is for.
 *
 * When both are true, the consumer has edited a file we have also changed.
 * `diff` reports it as `diverged` and `update` refuses it. A person resolves it
 * by reading both files, because merging the consumer's design decision with
 * ours cannot be done mechanically.
 *
 * A third state: the file no longer exists on our side. `diff` reports it as
 * `removed`. `update` deletes it only where the consumer's copy is still
 * byte-for-byte what was installed. A file the consumer has edited is kept.
 */

export type FileState =
  'clean' | 'edited' | 'upstream' | 'diverged' | 'missing' | 'removed' | 'generated'

export interface FileStatus {
  path: string
  state: FileState
  source: string | null
}

export interface DiffReport {
  manifest: Manifest
  /** The version the install is pinned to, and the one the registry ships. */
  installed: string
  available: string
  files: FileStatus[]
}

export function diffInstall(root: string, source: string, registry: Registry): DiffReport {
  const manifest = readManifest(root)
  if (!manifest) {
    throw new Error('polymorph: no polymorph.json here — nothing has been installed')
  }

  const files = Object.entries(manifest.files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, record]): FileStatus => {
      const full = resolve(root, path)
      if (!existsSync(full)) return { path, state: 'missing', source: record.source }

      // Generated files are outputs that every install rewrites, so an edit to
      // one is not a decision to protect. Reporting it would add a warning that
      // never clears.
      if (record.source === null) {
        return { path, state: 'generated', source: null }
      }

      // The source no longer exists on our side. The recorded hash cannot stand
      // in for it: the file would compare equal to itself and report as
      // unchanged, which is wrong for a file we have dropped.
      const upstreamPath = resolve(source, record.source)
      if (!existsSync(upstreamPath)) {
        return { path, state: 'removed', source: record.source }
      }

      const theirs = digest(readFileSync(full))
      // What an install of the upstream file writes now, recipe imports rewritten. A file
      // with nothing to rewrite is hashed as its bytes, as an elements install copies it,
      // so a file that is not text compares as it was written.
      const upstream = readFileSync(upstreamPath)
      const text = upstream.toString('utf8')
      const rewritten = vendoredText(registry, record.source, text)
      const ours = digest(rewritten === text ? upstream : rewritten)
      const edited = theirs !== record.hash
      const moved = ours !== record.hash

      return {
        path,
        state: edited && moved ? 'diverged' : edited ? 'edited' : moved ? 'upstream' : 'clean',
        source: record.source,
      }
    })

  return { manifest, installed: manifest.version, available: registry.version, files }
}

export interface UpdateResult extends ApplyResult {
  report: DiffReport
  /** Vendored files deleted because the install no longer carries them. */
  removed: string[]
}

/**
 * Re-vendors everything the install asked for, at the registry's current state.
 *
 * The plan is rebuilt from the manifest's list of *requested* items, not from
 * its file list. An update then picks up files that did not exist at install
 * time, such as a component's new stylesheet or a new convention in a closure.
 * Replaying the file list would keep the install at its original shape.
 */
export function updateInstall(
  root: string,
  source: string,
  registry: Registry,
  options: { force?: boolean } = {},
): UpdateResult {
  const manifest = readManifest(root)
  if (!manifest) {
    throw new Error('polymorph: no polymorph.json here — nothing has been installed')
  }

  // Systems and palettes, each in its own item form. A system re-adds the
  // palette it declares, so naming that palette again is a no-op, not a
  // duplicate. Listing palettes separately keeps a palette the consumer added on
  // its own when no system declares it.
  const items = [
    ...manifest.components,
    ...manifest.systems.map((name) => `theme:${name}`),
    ...manifest.palettes.map((name) => `palette:${name}`),
  ]

  // A member is shipped in the install's framework or not at all: one the
  // framework's map now marks absent is dropped as a removed one is.
  const framework = manifest.framework ?? 'react'
  const gone = items.filter((item) => !shipped(registry, item, framework))

  // A system or palette the registry records as renamed moves to its current
  // name. Its files change paths, so they are written and pruned under the
  // same hash checks as any other: the old copy is deleted where it is as
  // installed, and kept and reported where it is edited.
  const moves = new Map<string, string>()
  for (const item of gone) {
    const current = successor(registry, item)
    if (current !== null && shipped(registry, current, framework)) moves.set(item, current)
  }
  const wanted = [
    ...new Set([...items.filter((item) => shipped(registry, item, framework)), ...moves.values()]),
  ]

  const notes = gone.map((item) => {
    const current = moves.get(item)
    if (current !== undefined) {
      const bare = (entry: string) => entry.slice(entry.indexOf(':') + 1)
      return (
        `${item} is now ${current}, the same document renamed — the install moves to it; ` +
        `change "${bare(item)}" to "${bare(current)}" wherever your code names it`
      )
    }
    const absence = absenceReason(registry, item, framework)
    if (absence !== null) {
      return `${item} no longer ships in ${framework} — ${absence}; its files are on their way out`
    }
    const nearest = nearestName(registry, item)
    return nearest === null
      ? `${item} no longer ships — its files are on their way out`
      : `${item} no longer ships — did you mean ${nearest}?`
  })

  // Remove the names from the manifest before the apply reads it. The apply
  // unions what was installed with what this plan requested, which makes a
  // second `add` additive, so it would otherwise add the names back.
  if (gone.length > 0) {
    dropGone(manifest, gone)
    writeManifest(root, manifest)
  }

  // A file the registry still names but the tree no longer ships cannot be
  // copied. Passing it to the apply would fail the whole update because of a
  // file that is being removed. The base layer follows the same rule, because
  // it is a vendored file like any other.
  const missing = (file: { from: string }) => !existsSync(resolve(source, file.from))
  const planned = (requested: string[]): InstallPlan => {
    const resolved = planInstall(registry, requested, {
      dir: manifest.dir,
      ...(manifest.framework === undefined ? {} : { framework: manifest.framework }),
    })
    return {
      ...resolved,
      base: resolved.base && missing(resolved.base) ? null : resolved.base,
      files: resolved.files.filter((file) => !missing(file)),
    }
  }

  // A vendored file the plan no longer carries is deleted by `prune`. Where the
  // application imports one, that import is a decision the manifest has not
  // recorded. A member whose source the application reaches is adopted: added
  // to the members asked for and planned again, so it stays and keeps being
  // updated. Any other file it reaches is kept by `prune` (`imports`).
  let plan = planned(wanted)
  const imports = importedBy(root, manifest.dir, leaving(root, manifest, plan))
  const owners = membersAt(registry, manifest.dir, framework)
  const adopted = new Map<string, string>()
  for (const [path, importer] of imports) {
    for (const name of owners.get(path) ?? []) {
      if (!wanted.includes(name) && !adopted.has(name)) adopted.set(name, importer)
    }
  }
  if (adopted.size > 0) {
    plan = planned([...wanted, ...adopted.keys()])
    for (const [name, importer] of adopted) {
      notes.push(
        `${name} is no longer brought by the members polymorph.json lists, and ${importer} ` +
          'imports it — kept, and added to its components',
      )
    }
  }

  const result = applyPlan(root, source, registry, plan, options)
  result.notes.push(...notes)
  const removed = prune(root, result.manifest, plan, result.notes, options.force ?? false, imports)

  return { ...result, removed, report: diffInstall(root, source, registry) }
}

/** Every path the plan writes or generates: what `prune` leaves alone. */
function carried(plan: InstallPlan, dir: string): Set<string> {
  return new Set([
    ...(plan.base ? [plan.base.to] : []),
    ...plan.files.map((file) => file.to),
    ...plan.systems.map((system) => system.file.to),
    ...plan.palettes.map((palette) => palette.file.to),
    ...Object.keys(generatedFiles(plan, dir)),
  ])
}

/** The vendored files on disk that the plan does not carry: what `prune` would delete. */
function leaving(root: string, manifest: Manifest, plan: InstallPlan): string[] {
  const kept = carried(plan, manifest.dir)
  return Object.keys(manifest.files).filter(
    (path) =>
      path.startsWith(`${manifest.dir}/`) && !kept.has(path) && existsSync(resolve(root, path)),
  )
}

/**
 * Removes the names the registry no longer ships.
 *
 * Only the names. The *files* they brought stay in the manifest on purpose, so
 * `prune` handles them like every other file the vocabulary has dropped:
 * deleted where the consumer's copy is untouched, kept and reported where it
 * is not, and deleted anyway under `--force`. A dropped file and a dropped
 * component therefore leave the install in the same way.
 */
function dropGone(manifest: Manifest, gone: string[]): void {
  const names = new Set(gone)
  manifest.components = manifest.components.filter((name) => !names.has(name))
  manifest.systems = manifest.systems.filter((name) => !names.has(`theme:${name}`))
  manifest.palettes = manifest.palettes.filter((name) => !names.has(`palette:${name}`))
}

/**
 * Deletes what the install no longer carries.
 *
 * An update that only writes would leave a dropped stylesheet on disk, imported
 * by nothing and still recorded as installed. The recorded hash makes deleting
 * safe in the same way it makes overwriting safe. A file that is byte-for-byte
 * what we installed is removed. A file the consumer has edited is kept where it
 * is and reported.
 *
 * Scoped to the vendored directory. Above it are files the consumer owns and
 * generated files that every install rewrites. A tree left by an install into a
 * different `--dir` is not this command's to remove.
 *
 * This also handles an older install in which a theme is one preset file. Its
 * preset is at `themes/<name>.json` and the plan carries
 * `themes/systems/<name>.json`, so the old file is pruned like any other file
 * the vocabulary no longer carries: removed if untouched, kept and reported if
 * edited.
 *
 * A file the application imports, or one a kept file imports, is kept and
 * reported, under `--force` too: deleting it breaks the application's build,
 * and `--force` decides between their edit and ours, not whether the
 * application may lose a module it imports. Remove the import, and the next
 * update deletes it.
 *
 * Runs after the apply, not before it, so a failure partway through leaves
 * files present and recorded instead of deleted and missing.
 */
function prune(
  root: string,
  manifest: Manifest,
  plan: InstallPlan,
  notes: string[],
  force: boolean,
  imports: ReadonlyMap<string, string>,
): string[] {
  const kept = carried(plan, manifest.dir)
  const removed: string[] = []

  for (const [path, record] of Object.entries(manifest.files)) {
    if (kept.has(path) || !path.startsWith(`${manifest.dir}/`)) continue

    const full = resolve(root, path)
    const importer = imports.get(path)
    if (importer !== undefined && existsSync(full)) {
      notes.push(`${path} is no longer part of the vocabulary, and ${importer} imports it — kept`)
      continue
    }
    if (existsSync(full)) {
      if (!force && digest(readFileSync(full)) !== record.hash) {
        notes.push(`${path} is no longer part of the vocabulary, and you have edited it — kept`)
        continue
      }
      rmSync(full)
    }

    delete manifest.files[path]
    removed.push(path)
  }

  if (removed.length > 0) writeManifest(root, manifest)

  return removed
}
