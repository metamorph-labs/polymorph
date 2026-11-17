import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createJiti } from 'jiti'

/**
 * `pnpm emit:theme <system> <palette> [out.css]` writes the emitted sheet to a
 * file, without a UI. The studio's Share card produces the same output with a
 * UI.
 *
 * The output is for handoff and inspection, never an install path, and the
 * banner in it says so. Products consume the two design/*.json documents and
 * emit at runtime (`polymorph add`), so the sheet re-derives when a decision
 * changes. A pasted copy of this file is a fork that no longer re-derives. This
 * script exists because reviewing a sheet, diffing two pairings and attaching
 * CSS to a handoff all need a file, which runtime emission alone cannot give.
 */

const [systemName, paletteName, outPath] = process.argv.slice(2)

if (!systemName || !paletteName) {
  console.error('usage: pnpm emit:theme <system> <palette> [out.css]')
  console.error('       names as design/systems/<system>.json and design/palettes/<palette>.json')
  process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const jiti = createJiti(import.meta.url)
const { composeTheme, emitThemeCSS, parsePalette, parseSystem, resolveTheme } = await jiti.import(
  resolve(root, 'packages/theme/src/index.ts'),
)

const read = (kind, name) => {
  const path = resolve(root, `design/${kind}/${name}.json`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    console.error(`emit-theme: could not read ${path} — ${error.message}`)
    process.exit(1)
  }
}

const system = parseSystem(read('systems', systemName))
const palette = parsePalette(read('palettes', paletteName))

const banner = `/* polymorph — emitted sheet for ${system.name}/${palette.name}.
 * A HANDOFF AND INSPECTION ARTIFACT, never an install path: products consume
 * the two design/*.json documents and emit at runtime (polymorph add), so the
 * sheet re-derives when a decision changes. A pasted copy of this file is a
 * fork that has already stopped re-deriving. */
`

const css = banner + emitThemeCSS(resolveTheme(composeTheme(system, palette)))

if (outPath) {
  writeFileSync(resolve(process.cwd(), outPath), css, 'utf8')
  console.error(`emit-theme: wrote ${outPath} (${(css.length / 1024).toFixed(1)}KB)`)
} else {
  process.stdout.write(css)
}
