#!/usr/bin/env node
/**
 * `pnpm site` builds the website as static files: `apps/docs/dist`, with every
 * page written out as HTML.
 *
 * The docs site is one React application, and its build alone is one HTML file
 * with an empty `<div id="root">`. A search engine, a link preview and a reader
 * on a slow connection would all get that empty file. This step opens the built
 * site in Chromium, follows every link from the landing page, and saves each
 * page it reaches as the HTML the application drew: `dist/components/button.html`
 * for `/components/button`. A static host serves that file for the address, and
 * the application then starts over the markup already on screen
 * (`apps/docs/src/pages.ts`).
 *
 * It finds the pages by following links, so the list of routes is not kept
 * twice, and a page nothing links to is not published. That also makes it the
 * site's link check: a link to an address the site has no page for fails the
 * run with the page that holds it. So does a page that throws or logs an error.
 * A link inside a state that a component's page draws live is not followed: it
 * is the fixture's sample content, and the page marks the box it is drawn in.
 *
 * Besides the pages it writes:
 *
 *  - `404.html`, the page for an unknown address, which static hosts serve for
 *    one;
 *  - `assets/themes-<hash>.css`, the pairings' token blocks, which the
 *    application computes at startup. Linked from every page so the saved
 *    markup is themed before any script runs;
 *  - `og.png`, the picture a link preview shows;
 *  - `robots.txt`, and `sitemap.xml` when the address is known.
 *
 * The site's address is `VITE_SITE_URL`, read by the build
 * (`apps/docs/src/site.ts`) and here. Without it the canonical links, the
 * preview image's URL and the sitemap are left out, and the run says so.
 *
 *   pnpm site                # build apps/docs, then write the pages
 *   pnpm site --no-build     # write the pages from the dist that is there
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { availableParallelism } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'apps/docs/dist')
const SITE_URL = process.env.VITE_SITE_URL?.replace(/\/$/, '') ?? null

/** Pages drawn at once. Each is a tab of one browser. */
const WORKERS = Math.max(1, Math.min(4, availableParallelism() - 1))

/** The address the unknown-address page is saved from. Nothing links to it. */
const NOT_FOUND = '/404'

/** The mark a saved page carries, so a later run can tell it from the application's document. */
const SAVED = '<meta name="generator" content="pnpm site">'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function fail(message) {
  console.error(`site: ${message}`)
  process.exit(1)
}

if (!process.argv.includes('--no-build')) {
  execFileSync('pnpm', ['--filter', '@polymorph/docs', 'build'], { cwd: ROOT, stdio: 'inherit' })
}
if (!existsSync(join(DIST, 'index.html'))) {
  fail('apps/docs/dist is missing. Run `pnpm site` without --no-build.')
}

/**
 * The application's own document, as the build wrote it. Every route is drawn
 * from it, and it is read before any page is written, because the landing
 * page's saved HTML replaces the file. A `dist` this step has already written
 * no longer holds that document, so it is refused: drawing every route from
 * the saved landing page would give each page the landing page's links.
 */
const TEMPLATE = readFileSync(join(DIST, 'index.html'))
if (TEMPLATE.includes(SAVED)) {
  fail('apps/docs/dist already holds saved pages. Run `pnpm site` without --no-build.')
}

/**
 * Serves `dist` as a single-page host does: a file when the path names one,
 * and the application's document for a path that names a page. A path with an
 * extension that names no file is answered 404, so a page that asks for a
 * script, picture or font the build lacks logs an error and fails the step.
 */
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const file = normalize(join(DIST, path))
  const asset =
    file.startsWith(DIST) &&
    extname(file) !== '' &&
    extname(file) !== '.html' &&
    existsSync(file) &&
    statSync(file).isFile()
  // `frame.html` is the fixture specimen document, a second real entry.
  const frame = path === '/frame.html'
  if (asset || frame) {
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
    return
  }
  if (extname(path) !== '' && extname(path) !== '.html') {
    response.writeHead(404, { 'Content-Type': TYPES['.txt'] })
    response.end('Not found')
    return
  }
  response.writeHead(200, { 'Content-Type': TYPES['.html'] })
  response.end(TEMPLATE)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const ORIGIN = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
})

/**
 * Draws one route and returns its HTML, the site links it holds and what went
 * wrong on it.
 */
async function draw(route) {
  const page = await context.newPage()
  const faults = []
  page.on('pageerror', (error) => faults.push(`threw: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') faults.push(`logged an error: ${message.text()}`)
  })
  try {
    await page.goto(`${ORIGIN}${route}`, { waitUntil: 'networkidle' })
    // The page has drawn once its heading is in the content region. Every page
    // has exactly one `h1`, or the unknown-address page's message.
    await page.waitForSelector('main h1, main [data-member="empty-state"]', { timeout: 30_000 })
    await page.evaluate(() => document.fonts.ready)

    const result = await page.evaluate(() => {
      // A component's page draws the member's states live, and a state may
      // hold a sample link (`/reset` under a password field). Such a link is
      // the fixture's content, not the site's, and the page marks the box it
      // is drawn in.
      const links = [...document.querySelectorAll('a[href^="/"]')]
        .filter((anchor) => anchor.closest('[data-specimen]') === null)
        .map((anchor) => anchor.getAttribute('href') ?? '')
        .filter((href) => !href.startsWith('//'))
      const themes = [...document.querySelectorAll('style')].filter(
        (style) => style.id === 'pm-themes' || style.hasAttribute('data-pm-pairing'),
      )
      const css = themes.map((style) => style.textContent ?? '').join('\n')
      for (const style of themes) style.remove()
      return {
        links,
        css,
        noindex: document.querySelector('meta[name="robots"][content="noindex"]') !== null,
        html: `<!doctype html>\n${document.documentElement.outerHTML}\n`,
      }
    })
    return { ...result, faults }
  } catch (error) {
    return { links: [], css: '', noindex: false, html: '', faults: [...faults, String(error)] }
  } finally {
    await page.close()
  }
}

/** A site link as a route: no fragment, no query, no trailing slash. A file's address is not one. */
function routeOf(href) {
  const path = href
    .split('#')[0]
    .split('?')[0]
    .replace(/(.)\/+$/, '$1')
  if (path === '' || extname(path) !== '') return null
  return path
}

const pages = new Map()
const linkedFrom = new Map([['/', 'the start']])
const queue = ['/']
const problems = []
let themeCss = ''

async function worker() {
  for (;;) {
    const route = queue.shift()
    if (route === undefined) {
      if (active === 0) return
      await new Promise((done) => setTimeout(done, 50))
      continue
    }
    active += 1
    const drawn = await draw(route)
    for (const fault of drawn.faults) problems.push(`${route} ${fault}`)
    if (drawn.noindex && route !== NOT_FOUND) {
      problems.push(`${linkedFrom.get(route)} links to ${route}, and the site has no page there`)
    } else if (drawn.html !== '') {
      pages.set(route, drawn.html)
      themeCss ||= drawn.css
      for (const href of drawn.links) {
        const next = routeOf(href)
        if (next === null || linkedFrom.has(next)) continue
        linkedFrom.set(next, route)
        queue.push(next)
      }
    }
    active -= 1
  }
}
let active = 0
await Promise.all(Array.from({ length: WORKERS }, worker))

const notFound = await draw(NOT_FOUND)
for (const fault of notFound.faults) problems.push(`${NOT_FOUND} ${fault}`)

// The picture a link preview shows: the top of the landing page, at the size
// the preview formats ask for.
const card = await context.newPage()
await card.setViewportSize({ width: 1200, height: 630 })
await card.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
await card.waitForSelector('main h1')
await card.evaluate(() => document.fonts.ready)
const preview = await card.screenshot({ type: 'png' })
await card.close()

await browser.close()
server.close()

if (problems.length > 0) {
  fail(`${problems.length} fault(s):\n${problems.map((problem) => `  ${problem}`).join('\n')}`)
}
if (themeCss === '') fail('no page held the theme stylesheet, so the saved pages would be unthemed')

/**
 * The pairings' token blocks as a file. The application computes them at
 * startup and installs them as a `<style>`, which the saved pages do not keep,
 * because it is the same text on every page. A linked file is fetched once.
 */
const themeFile = `assets/themes-${createHash('sha256').update(themeCss).digest('hex').slice(0, 8)}.css`
writeFileSync(join(DIST, themeFile), themeCss)
const themeLink = `<link rel="stylesheet" href="/${themeFile}">`
/**
 * The application adds a link for each chunk and stylesheet it loads, and the
 * browser serialises those with the address of the server that served the
 * crawl. A saved page names them from the root, so they resolve on the host that serves the site.
 */
const finish = (html) =>
  html.replaceAll(`${ORIGIN}/`, '/').replace('</head>', `${SAVED}${themeLink}</head>`)

for (const [route, html] of pages) {
  const file = join(DIST, route === '/' ? 'index.html' : `${route.slice(1)}.html`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, finish(html))
}
writeFileSync(join(DIST, '404.html'), finish(notFound.html))
writeFileSync(join(DIST, 'og.png'), preview)

const robots = ['User-agent: *', 'Allow: /']
if (SITE_URL !== null) {
  const urls = [...pages.keys()].sort().map((route) => `${SITE_URL}${route === '/' ? '' : route}`)
  writeFileSync(
    join(DIST, 'sitemap.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
      '</urlset>',
      '',
    ].join('\n'),
  )
  robots.push(`Sitemap: ${SITE_URL}/sitemap.xml`)
}
writeFileSync(join(DIST, 'robots.txt'), `${robots.join('\n')}\n`)

console.log(`site: ${pages.size} pages written to apps/docs/dist`)
if (SITE_URL === null) {
  console.log(
    'site: VITE_SITE_URL is not set, so the pages carry no canonical link or preview image URL and there is no sitemap',
  )
}
