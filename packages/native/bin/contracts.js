#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `pnpm native:contracts [--check]` writes the native contracts for both
 * platforms:
 *
 * - Swift, into `platforms/ios/Sources/PolymorphUI/Generated/`: every native or
 *   adapted member's props and rendering protocol, the icon roles with their SF
 *   Symbols (the `ios` of each role in `design/icons.json`), the catalogue, the
 *   props the mapping cannot express, the states fixtures the member files
 *   declare, the defaults the specs name (`PMStrings`), the numbers the recipes
 *   write that the members read (`PMRecipe`) and the providers' brand marks.
 * - Kotlin, into `platforms/android/ui/src/generated/kotlin/dev/polymorph/ui/`:
 *   the same for Android, with each role's Material Symbols name (its
 *   `android`) and the vector that draws it, a composable for every member
 *   with a rendering, the defaults the specs name (`PMStrings`), the numbers
 *   the recipes write that the members read (`PMRecipe`) and the providers'
 *   brand marks.
 *
 * `--check` writes nothing and exits non-zero when a file on disk differs, for
 * either platform; the freshness laws (`packages/native/src/contracts.test.ts`,
 * `packages/native/src/kotlin.test.ts`) run the same comparison inside the
 * suite.
 *
 * Plain JS loaded through `jiti`, like `packages/registry/bin/registry.js`, so
 * node runs it directly while the generators stay TypeScript.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const args = process.argv.slice(2)
const check = args.includes('--check')
if (args.some((arg) => arg !== '--check')) {
  console.error('usage: pnpm native:contracts [--check]')
  process.exit(1)
}

const jiti = createJiti(import.meta.url)
const { buildRegistry } = await jiti.import(resolve(ROOT, 'packages/registry/src/build.ts'))
const { fixturesIn, generateContracts, GENERATED } = await jiti.import(
  resolve(ROOT, 'packages/native/src/contracts.ts'),
)
const { generateKotlinContracts, KOTLIN_GENERATED } = await jiti.import(
  resolve(ROOT, 'packages/native/src/kotlin.ts'),
)
const {
  readDeclaredTypes,
  readIconSymbols,
  readKotlinDeclaredTypes,
  readKotlinMembers,
  readMaterialSymbols,
  readMemberSources,
  readRecipes,
  staleFiles,
  writeGenerated,
} = await jiti.import(resolve(ROOT, 'packages/native/src/disk.ts'))

const registry = buildRegistry(ROOT)
const targets = [
  {
    dir: GENERATED,
    set: generateContracts(
      registry,
      fixturesIn(readMemberSources(ROOT)),
      readIconSymbols(ROOT),
      readDeclaredTypes(ROOT),
      readRecipes(ROOT),
    ),
  },
  {
    dir: KOTLIN_GENERATED,
    set: generateKotlinContracts(
      registry,
      readKotlinMembers(ROOT),
      readMaterialSymbols(ROOT),
      readKotlinDeclaredTypes(ROOT),
      readRecipes(ROOT),
    ),
  },
]

if (check) {
  const stale = targets.flatMap(({ dir, set }) => staleFiles(ROOT, set.files, dir))
  if (stale.length > 0) {
    console.error(
      `native-contracts: stale, run \`pnpm native:contracts\`:\n  ${stale.join('\n  ')}`,
    )
    process.exit(1)
  }
  console.error('native-contracts: every generated file is current')
} else {
  for (const { dir, set } of targets) {
    writeGenerated(ROOT, set.files, dir)
    console.error(
      `native-contracts: ${set.members.length} members, ${set.unsupported.length} unsupported props, ` +
        `${Object.keys(set.files).length} files written to ${dir}`,
    )
  }
}
