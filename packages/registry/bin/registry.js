#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

/**
 * `pnpm registry` builds the catalogue and the system card for publishing.
 *
 * The output is **never committed**. Git holds no generated file that can go
 * stale, so the repo needs no freshness test and no CI step for it. What ships
 * is what the publishing tree produces, and the tests assert that the same tree
 * always produces the same bytes.
 *
 * This file is plain JS loaded through `jiti`, like `bin/inventory.js`, so node
 * runs it directly. The generator is TypeScript because the CLI, the MCP server
 * and the spec emitter import it as a library. `jiti` is the TS loader the repo
 * already uses to read the ESLint flat config.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const OUT = resolve(ROOT, 'registry')

const jiti = createJiti(import.meta.url)
const { buildRegistry, renderRegistry } = await jiti.import(
  resolve(ROOT, 'packages/registry/src/build.ts'),
)
const { renderSystemCard, estimateTokens } = await jiti.import(
  resolve(ROOT, 'packages/registry/src/card.ts'),
)
const { REGISTRY_SHAPE } = await jiti.import(resolve(ROOT, 'packages/registry/src/schema.ts'))
const { assertResolvable, assertWeightsShipped, fontLoaders, renderFontLoaders } =
  await jiti.import(resolve(ROOT, 'packages/registry/src/fonts-gen.ts'))
const { readSystems } = await jiti.import(resolve(ROOT, 'packages/registry/src/theme.ts'))
const { jsonSchema, validate } = await jiti.import(resolve(ROOT, 'packages/registry/src/shape.ts'))
const { compactTable, renderTableModule } = await jiti.import(
  resolve(ROOT, 'packages/registry/src/screen-table.ts'),
)

const registry = buildRegistry(ROOT)

// Validate before writing, so that a registry that fails its own schema never
// reaches a disk that someone might publish from.
const faults = validate(REGISTRY_SHAPE, registry)
if (faults.length > 0) {
  console.error('registry: the generated document does not match its own schema:\n')
  console.error(faults.map((fault) => `  ${fault}`).join('\n'))
  process.exit(1)
}

const card = renderSystemCard(registry)

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'registry.json'), renderRegistry(registry))
writeFileSync(
  resolve(OUT, 'registry.schema.json'),
  `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...jsonSchema(REGISTRY_SHAPE) }, null, 2)}\n`,
)
writeFileSync(resolve(OUT, 'system-card.md'), card)

/*
 * The apps' font-loader maps, derived from the same system files (fonts-gen.ts).
 * They are written into each app's src because a bare fontsource specifier
 * resolves from its importer, and only the apps declare the font packages.
 * `assertWeightsShipped` fails here on a heading weight a system file sets that
 * its family does not ship, and `assertResolvable` on an uninstalled face with
 * the command to run, so the app never falls back to another font silently.
 */
const loaders = fontLoaders(readSystems(ROOT).map(({ system }) => system))
const fontsModule = renderFontLoaders(loaders)
for (const app of ['apps/docs', 'apps/workbench']) {
  const dir = resolve(ROOT, app)
  const name = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).name
  assertWeightsShipped(dir, name, loaders)
  assertResolvable(dir, name, loaders)
  writeFileSync(resolve(dir, 'src/fonts.gen.ts'), fontsModule)
}

/*
 * The run-time vocabulary table, derived from the same catalogue
 * (screen-table.ts): what a screen is checked and drawn with at run time, in
 * the package that ships it. Like the font maps, it is written on every
 * install and never committed.
 */
const SCREEN_TABLE = 'packages/screen/src/vocabulary.gen.ts'
const tableModule = renderTableModule(compactTable(registry))
writeFileSync(resolve(ROOT, SCREEN_TABLE), tableModule)

const components = registry.components.length
const properties = registry.theme.customProperties.length
console.log(
  `registry: ${components} components, ${registry.theme.systems.length} systems, ` +
    `${registry.theme.palettes.length} palettes, ${properties} custom properties`,
)
console.log(`registry: system card ${card.length} chars (~${estimateTokens(card)} tokens)`)
console.log(`registry: ${loaders.length} font loaders → apps/{docs,workbench}/src/fonts.gen.ts`)
console.log(`registry: run-time vocabulary table ${tableModule.length} chars → ${SCREEN_TABLE}`)
console.log(`registry: written to ${resolve(OUT)}/ — not committed, by design`)
