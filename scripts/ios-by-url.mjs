#!/usr/bin/env node
/**
 * `node scripts/ios-by-url.mjs` checks that an app can add the Swift package by
 * the repository's URL, as `docs/consuming.md` tells it to: it resolves the
 * package at a release tag and builds both libraries.
 *
 * It copies the root `Package.swift` and every directory its targets name into
 * a new git repository, tags the commit `v` and the release's version, and
 * builds an app package that depends on that repository by a `file://` URL at
 * exactly that version. SwiftPM resolves a URL dependency only from the
 * repository's root and only at a tag it reads as a version, so the check fails
 * when either is wrong: a manifest that is missing or names a path that does not
 * exist, or a tag SwiftPM does not accept. The working tree is what is copied,
 * so the check runs before a commit as well as after; a file the libraries need
 * that git does not track would pass here and be missing from the real tag.
 *
 * `pnpm gate:ios` runs it after `swift build` of `platforms/ios`.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = JSON.parse(
  readFileSync(resolve(ROOT, 'packages/native/package.json'), 'utf8'),
).version

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`\`${command} ${args.join(' ')}\` failed`)
}

const manifest = readFileSync(resolve(ROOT, 'Package.swift'), 'utf8')
const paths = [...manifest.matchAll(/path: "([^"]+)"/g)].map((match) => match[1])

const work = mkdtempSync(resolve(tmpdir(), 'ios-by-url-'))
try {
  // The repository an app would clone, holding what the root manifest reads.
  const repo = resolve(work, 'polymorph')
  mkdirSync(repo)
  cpSync(resolve(ROOT, 'Package.swift'), resolve(repo, 'Package.swift'))
  for (const path of paths) cpSync(resolve(ROOT, path), resolve(repo, path), { recursive: true })
  const git = [
    '-c',
    'user.name=gate',
    '-c',
    'user.email=gate@localhost',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
  ]
  run('git', ['init', '--quiet'], repo)
  run('git', ['add', '--all'], repo)
  run('git', [...git, 'commit', '--quiet', '-m', 'release'], repo)
  run('git', [...git, 'tag', `v${release}`], repo)

  // An app that adds the package by URL at the release, and imports both libraries.
  const app = resolve(work, 'app')
  mkdirSync(resolve(app, 'Sources/App'), { recursive: true })
  writeFileSync(
    resolve(app, 'Package.swift'),
    `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "App",
  platforms: [.iOS(.v17), .macOS(.v14)],
  dependencies: [.package(url: "${pathToFileURL(repo).href}", exact: "${release}")],
  targets: [
    .target(
      name: "App",
      dependencies: [
        .product(name: "PolymorphTokens", package: "polymorph"),
        .product(name: "PolymorphUI", package: "polymorph"),
      ]
    )
  ]
)
`,
  )
  writeFileSync(
    resolve(app, 'Sources/App/Root.swift'),
    `import PolymorphTokens
import PolymorphUI
import SwiftUI

public struct Root: View {
  public var body: some View { EmptyView().pmTheme(PMTheme.terminal_petrol) }
}
`,
  )
  // A cache of its own, so the temporary repository's clone does not stay in
  // SwiftPM's shared cache after the run.
  run('swift', ['build', '--package-path', app, '--cache-path', resolve(work, 'cache')], work)
  console.error(
    `ios-by-url: an app resolves the package by URL at v${release} and builds both libraries`,
  )
} catch (error) {
  console.error(`ios-by-url: ${error.message}`)
  process.exitCode = 1
} finally {
  rmSync(work, { recursive: true, force: true })
}
