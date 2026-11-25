import { Buffer } from 'node:buffer'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * `pnpm agents [--check] [--icons]` writes the repository's plugin for coding
 * agents and the MCP Registry's entry, from `packages/cli/src/plugin.ts`:
 *
 * - `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`,
 *   the marketplaces Claude Code and Codex add this repository as;
 * - `plugins/polymorph/`, the plugin both read: its two manifests, its two MCP
 *   configs, the skills `polymorph agents` writes into a project, a README, and
 *   the icon, copied from the site's favicon;
 * - `packages/tools/server.json`, the published tools' entry in the MCP
 *   Registry.
 *
 * JSON is formatted with the repository's Prettier settings, as `pnpm lint`
 * checks it. The plugin directory belongs to this script: write mode removes a
 * file there that it no longer writes, apart from the drawn icons.
 *
 * `--check` writes nothing, and exits 1 naming each file that is missing,
 * stale or no longer written, and each drawn icon that is missing or the wrong
 * size. The freshness law (`packages/cli/src/plugin.test.ts`) runs the same
 * comparison inside the suite.
 *
 * `--icons` also draws the PNG icons from the favicon, in Playwright's
 * Chromium, at the sizes `ICON_SIZES` names: the favicon in its light colours
 * and in its dark ones, on a transparent ground.
 */

export const ROOT = resolve(import.meta.dirname, '..')

/** The site's favicon, the plugin's icon. */
export const FAVICON = 'apps/docs/public/favicon.svg'

/**
 * Every file the script writes, as `Map<path, contents>`, formatted.
 * `importModule` loads a TypeScript module by absolute path (jiti from the
 * command line, the test runner's own `import` inside the suite).
 */
export async function pluginOutput(importModule) {
  const { buildRegistry } = await importModule(resolve(ROOT, 'packages/registry/src/build.ts'))
  const { pluginFiles, PLUGIN_DIR, PLUGIN_ICONS } = await importModule(
    resolve(ROOT, 'packages/cli/src/plugin.ts'),
  )
  const prettier = (await import('prettier')).default
  const registry = buildRegistry(ROOT)
  const files = new Map()
  for (const { path, contents } of pluginFiles(registry)) {
    const file = resolve(ROOT, path)
    files.set(
      path,
      path.endsWith('.json')
        ? await prettier.format(contents, {
            ...((await prettier.resolveConfig(file)) ?? {}),
            filepath: file,
          })
        : contents,
    )
  }
  files.set(`${PLUGIN_DIR}/${PLUGIN_ICONS.svg}`, readFileSync(resolve(ROOT, FAVICON), 'utf8'))
  return files
}

/** The drawn icons, as `[path, size]` from the root. */
export async function drawnIcons(importModule) {
  const { ICON_SIZES, PLUGIN_DIR, PLUGIN_ICONS } = await importModule(
    resolve(ROOT, 'packages/cli/src/plugin.ts'),
  )
  return Object.entries(ICON_SIZES).map(([key, size]) => [
    `${PLUGIN_DIR}/${PLUGIN_ICONS[key]}`,
    size,
  ])
}

/** Every file below `dir`, relative to the root, or none when it does not exist. */
function filesBelow(dir) {
  const found = []
  const walk = (at) => {
    let entries
    try {
      entries = readdirSync(resolve(ROOT, at), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = `${at}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else found.push(path)
    }
  }
  walk(dir)
  return found
}

/** A PNG's width and height, from its header, or `null` when the bytes are not a PNG. */
export function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * The differences between disk and the output: each file that is missing,
 * different or no longer written in the plugin's directory, and each drawn icon
 * that is missing or not the size it is drawn at.
 */
export function staleFiles(files, icons, pluginDir = 'plugins/polymorph') {
  const stale = []
  for (const [path, contents] of files) {
    let current = null
    try {
      current = readFileSync(resolve(ROOT, path), 'utf8')
    } catch {
      // Missing.
    }
    if (current !== contents) stale.push(path)
  }
  const drawn = new Map(icons)
  for (const path of filesBelow(pluginDir)) {
    if (!files.has(path) && !drawn.has(path)) stale.push(`${path} (no longer written)`)
  }
  for (const [path, size] of icons) {
    let found = null
    try {
      found = pngSize(readFileSync(resolve(ROOT, path)))
    } catch {
      // Missing.
    }
    if (found === null || found.width !== size || found.height !== size) {
      stale.push(`${path} (a ${size} by ${size} PNG; \`pnpm agents --icons\` draws it)`)
    }
  }
  return stale.sort()
}

/** Draws each icon from the favicon in Chromium: the light colours, or the dark ones for a `-dark` file. */
async function draw(icons) {
  const { chromium } = await import('playwright')
  const svg = readFileSync(resolve(ROOT, FAVICON), 'utf8')
  const browser = await chromium.launch()
  try {
    for (const [path, size] of icons) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        colorScheme: path.includes('-dark') ? 'dark' : 'light',
      })
      const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      await page.setContent(
        `<html><body style="margin:0;background:transparent">` +
          `<img src="${url}" width="${size}" height="${size}" style="display:block"></body></html>`,
      )
      await page.waitForFunction(() => document.images[0]?.complete === true)
      const picture = await page.screenshot({ omitBackground: true, type: 'png' })
      mkdirSync(dirname(resolve(ROOT, path)), { recursive: true })
      writeFileSync(resolve(ROOT, path), picture)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function main(args) {
  const unknown = args.filter((arg) => arg !== '--check' && arg !== '--icons')
  if (unknown.length > 0) {
    console.error('usage: pnpm agents [--check] [--icons]')
    process.exit(1)
  }
  const { createJiti } = await import('jiti')
  const jiti = createJiti(import.meta.url)
  const importModule = (path) => jiti.import(path)
  const files = await pluginOutput(importModule)
  const icons = await drawnIcons(importModule)
  const { PLUGIN_DIR } = await importModule(resolve(ROOT, 'packages/cli/src/plugin.ts'))

  if (args.includes('--check')) {
    const stale = staleFiles(files, icons, PLUGIN_DIR)
    if (stale.length > 0) {
      console.error(`agents: stale, run \`pnpm agents\`:\n  ${stale.join('\n  ')}`)
      process.exit(1)
    }
    console.error(`agents: ${files.size} generated files and ${icons.length} icons are current`)
    return
  }

  for (const [path, contents] of files) {
    mkdirSync(dirname(resolve(ROOT, path)), { recursive: true })
    writeFileSync(resolve(ROOT, path), contents)
  }
  const drawn = new Set(icons.map(([path]) => path))
  for (const path of filesBelow(PLUGIN_DIR)) {
    if (!files.has(path) && !drawn.has(path)) {
      rmSync(resolve(ROOT, path))
      console.error(`agents: removed ${path}, which nothing writes any more`)
    }
  }
  if (args.includes('--icons')) await draw(icons)
  console.error(
    `agents: wrote ${files.size} files${args.includes('--icons') ? ` and drew ${icons.length} icons` : ''}`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.argv.slice(2))
}
