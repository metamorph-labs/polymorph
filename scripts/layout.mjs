#!/usr/bin/env node
/**
 * `pnpm layout` measures the workbench's own pages for layout faults.
 *
 * It opens every member's gallery, the Relay screens and the sample pages in
 * Chromium, each at a phone's width and at a desktop's, and runs the layout
 * measure on it: the one `render_screen` answers with
 * (`apps/workbench/src/screen/measure.ts`). A fault on any page fails the run:
 * a page that scrolls sideways, text its box cuts, a control a box hides, a
 * control under the touch-target floor beside another. So does a page that
 * throws, and a gallery that does not draw.
 *
 * The galleries draw every state a member's fixture declares, so this is the
 * check that a member holds its layout in a narrow window and in a wide one,
 * which a component test only makes for the cases its author thought of. A
 * fault is fixed where it is decided: the member's recipe, the fixture that
 * draws the member in a way no screen does, or the measure when the report is
 * false (`packages/mcp/src/measure.test.ts` holds a page for each).
 *
 * It measures the built workbench (`apps/workbench/dist`, so run `pnpm build`
 * first) and serves it itself, on a port the system picks, so two runs on one
 * machine do not meet. `pnpm gate` runs it after the apps' builds.
 *
 * `node scripts/layout.mjs [pattern…]`: a pattern is a regular expression, and
 * only the routes one of them matches are measured, so
 * `pnpm layout breadcrumbs '^/pages/'` measures one gallery and the sample
 * pages.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { availableParallelism } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { createJiti } from 'jiti'
import { chromium } from 'playwright'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'apps/workbench/dist')

/** The two windows: the narrowest phone the system supports, and a desktop. */
const WINDOWS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
]

/** Pages measured at once. Each is a tab of one browser. */
const WORKERS = Math.max(1, Math.min(4, availableParallelism() - 1))

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('layout: apps/workbench/dist is missing. Run `pnpm build` first.')
  process.exit(1)
}

const jiti = createJiti(import.meta.url)
const source = (path) => jiti.import(resolve(ROOT, path))

/**
 * The routes, read from where the workbench declares them. A member is in the
 * catalogue once it has a spec and a component, and its gallery's address is
 * its slug. Relay's screens are addressed inside `RelayApp`, which draws them,
 * so their paths are restated here: the inbox, the form, the settings and one
 * ticket.
 */
const { buildRegistry } = await source('packages/registry/src/build.ts')
const { memberSlug } = await source('packages/registry/src/exceptions.ts')
const { PAGES_ROOT, EXEMPLAR_SLUGS } = await source('apps/workbench/src/pages/routes.ts')
const { RELAY_ROOT } = await source('apps/workbench/src/relay/routes.ts')

const members = buildRegistry(ROOT).components.map((component) => component.name)
const names = Object.fromEntries(members.map((name) => [memberSlug(name), name]))

const routes = [
  ...members.map((name) => ({ path: `/gallery/${memberSlug(name)}`, gallery: name })),
  ...['', '/new', '/settings', '/t/T-2041'].map((rest) => ({ path: `${RELAY_ROOT}${rest}` })),
  ...EXEMPLAR_SLUGS.map((slug) => ({ path: `${PAGES_ROOT}/${slug}` })),
]

const patterns = process.argv.slice(2).map((pattern) => new RegExp(pattern))
const chosen = routes.filter(
  (route) => patterns.length === 0 || patterns.some((pattern) => pattern.test(route.path)),
)
if (chosen.length === 0) {
  console.error('layout: no route matches.')
  process.exit(1)
}

/**
 * The measure as a script. The module imports nothing, so its functions are
 * the page's globals once the `export` keywords are removed, as the measure's
 * own test loads it.
 */
const MEASURE = ts
  .transpileModule(readFileSync(resolve(ROOT, 'apps/workbench/src/screen/measure.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  .outputText.replace(/^export /gm, '')

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * The built workbench, served as its host serves it: a file where one exists,
 * and the application's one document for every route.
 */
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname))
  const file = join(DIST, path)
  const found = file.startsWith(DIST) && existsSync(file) && statSync(file).isFile()
  const served = found ? file : join(DIST, 'index.html')
  response.writeHead(200, {
    'content-type': TYPES[extname(served)] ?? 'application/octet-stream',
  })
  response.end(readFileSync(served))
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const origin = `http://127.0.0.1:${server.address().port}`

/** One page, drawn and settled, then measured. Returns what is wrong with it, as lines. */
async function measure(page, route) {
  const errors = []
  const onError = (error) => errors.push(`It threw: ${error.message}`)
  page.on('pageerror', onError)
  try {
    await page.goto(`${origin}${route.path}`, { waitUntil: 'networkidle' })
    // Layout is final once the fonts are in and a frame has been drawn with them.
    await page.evaluate(async () => {
      const frame = () => new Promise((drawn) => globalThis.requestAnimationFrame(() => drawn()))
      await frame()
      await document.fonts.ready
      await frame()
      await document.fonts.ready
      await frame()
    })
    await page.waitForTimeout(300)

    if (route.gallery !== undefined) {
      // Read from the document, not by role: an open dialog in a gallery hides
      // the page behind it from the accessibility tree.
      const titled = await page.evaluate(
        (name) => [...document.querySelectorAll('h1')].some((h1) => h1.textContent === name),
        route.gallery,
      )
      if (!titled) errors.push(`The gallery did not draw: no heading "${route.gallery}".`)
    }

    await page.addScriptTag({ content: MEASURE })
    const measured = await page.evaluate((map) => globalThis.measureLayout(map), names)
    for (const fault of measured.faults) {
      errors.push(`[${fault.kind}] ${fault.element}: ${fault.message}`)
    }
  } catch (error) {
    errors.push(`It could not be measured: ${error.message}`)
  } finally {
    page.off('pageerror', onError)
  }
  return errors
}

const started = Date.now()
const failures = []
const browser = await chromium.launch()
try {
  for (const window of WINDOWS) {
    // Reduced motion draws every state at rest, so nothing is measured in mid-flight.
    const context = await browser.newContext({ viewport: window, reducedMotion: 'reduce' })
    const queue = [...chosen]
    await Promise.all(
      Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
        const page = await context.newPage()
        for (let route = queue.shift(); route !== undefined; route = queue.shift()) {
          const errors = await measure(page, route)
          if (errors.length > 0) failures.push({ route: route.path, width: window.width, errors })
        }
        await page.close()
      }),
    )
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
}

failures.sort((a, b) => a.route.localeCompare(b.route) || a.width - b.width)
for (const failure of failures) {
  console.error(`\n${failure.route} at ${failure.width}px`)
  for (const error of failure.errors) console.error(`  ${error}`)
}

const seconds = Math.round((Date.now() - started) / 1000)
const views = chosen.length * WINDOWS.length
if (failures.length > 0) {
  console.error(`\nlayout: ${failures.length} of ${views} views have a fault (${seconds}s).`)
  process.exit(1)
}
console.log(`layout: ${views} views, no fault (${seconds}s).`)
