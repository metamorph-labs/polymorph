#!/usr/bin/env node
/**
 * `pnpm gate:no-build` is the static-page check. It serves the files a page
 * with no build loads (`packages/elements-ui/dist/cdn/`, at `/polymorph/`) and
 * the pages in `scripts/no-build-page/` as plain files, with no bundler and no
 * dev server between them and the browser, and checks on each engine what
 * only those files decide:
 *
 *  - the prepaint script runs as a classic script in `<head>` and applies a
 *    stored mode before the first paint;
 *  - before `polymorph.js` defines the tags, and after it has defined them
 *    while a member's code is still loading, a closed overlay's content stays
 *    hidden and a table's parts lay out as table rows and cells
 *    (`polymorph.css`'s rules for an element that has not rendered);
 *  - the members render from markup: attributes, slots, a table's parts,
 *    and an element added to a slot later, whose member's code was not loaded;
 *  - a form around the elements posts their values;
 *  - a Dialog opens from its trigger and closes on Escape, three times;
 *  - an htmx-style swap of an element's children and of its outer HTML, and a
 *    morphing swap that removes an attribute the server did not send;
 *  - a page snapshot (`innerHTML` saved and written back, as Turbo's cache and
 *    htmx's history do) renders as the page did when `restore` runs before it
 *    is saved, and renders a member inside itself when it does not;
 *  - an agent bridge the page loads with `loadAgentBridge` lists the members
 *    the page shows, fills, checks, chooses and presses them, and sends the
 *    form; the bridge's code is fetched only when the page asks for it;
 *  - a page's agent setting (`<html data-agent>`), with a stand-in for the
 *    browser's WebMCP API installed before the page loads, as no browser
 *    Playwright drives has one: without it nothing registers and neither the
 *    tools' definitions nor the bridge is fetched; `on-call` registers the
 *    three tools and fetches the bridge on the first call, which lists the
 *    page's members; `eager` fetches the bridge at load; an unknown value
 *    warns and registers nothing; without the API nothing is fetched;
 *  - `polymorph-all.js` renders the same elements with no chunk, and its
 *    bridge lists and presses them; with either setting it registers the
 *    tools at load and fetches nothing;
 *  - a `<poly-screen>` draws the document in its `<script
 *    type="application/json">` child, a press of its Button dispatches
 *    `poly-action` with the named Input's text in `values`, and `loadScreen`
 *    resolves to the functions a page draws, checks and prompts with; the
 *    screen's renderer is fetched only by a page that draws one, and its
 *    validator and card only when the page asks for them;
 *  - an attribute an element cannot read is reported in the console, by
 *    either script, and the element renders without that prop: the files
 *    name no `process`, which a browser does not have;
 *  - no page logs an error.
 *
 * `node scripts/gate-no-build.mjs [engine…] [stage…] [--no-build]`: an
 * engine's name (`chromium`, `firefox`, `webkit`) runs that engine alone, and
 * every engine runs when none is named; a stage's name (`rendered`, `screen`,
 * the names in `STAGES` below) runs that stage alone, and every stage runs when
 * none is named. `--no-build` skips building the two elements
 * packages, for a tree whose `pnpm build:packages` has just run. `pnpm gate`
 * runs it on Chromium after the builds, and `pnpm gate:engines` on Firefox and
 * WebKit. `docs/verification.md` has the check's place among the gates.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, URL, URLSearchParams } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CDN = join(ROOT, 'packages/elements-ui/dist/cdn')
const PAGES = join(ROOT, 'scripts/no-build-page')

/** The fixed order. */
const ENGINES = [
  { name: 'chromium', type: chromium },
  { name: 'firefox', type: firefox },
  { name: 'webkit', type: webkit },
]

/** The stages, in the order they run, by the names a command line gives them. */
const STAGE_NAMES = [
  'beforeDefinition',
  'whileLoading',
  'rendered',
  'posts',
  'agent',
  'setting',
  'reports',
  'all',
  'screen',
]

const args = process.argv.slice(2)
const named = args.filter((arg) => ENGINES.some(({ name }) => name === arg))
const stagesNamed = args.filter((arg) => STAGE_NAMES.includes(arg))
const unknown = args.filter(
  (arg) => !named.includes(arg) && !stagesNamed.includes(arg) && arg !== '--no-build',
)
if (unknown.length > 0) fail(`unknown argument ${unknown.join(' ')}`)
const selected = named.length > 0 ? ENGINES.filter(({ name }) => named.includes(name)) : ENGINES

function fail(message) {
  process.stderr.write(`gate:no-build: ${message}\n`)
  process.exit(1)
}

/** Whether Playwright's build of an engine is on this machine. */
function installed({ type }) {
  try {
    return existsSync(type.executablePath())
  } catch {
    return false
  }
}

const missing = selected.filter((engine) => !installed(engine)).map(({ name }) => name)
if (missing.length > 0) {
  fail(
    `${missing.join(' and ')} not installed for Playwright. Run:\n  pnpm exec playwright install ${missing.join(' ')}`,
  )
}

if (!args.includes('--no-build')) {
  for (const name of ['@polymorph/elements', '@polymorph/elements-ui']) {
    process.stderr.write(`gate:no-build: building ${name}\n`)
    const built = spawnSync('pnpm', ['--filter', name, 'build'], { cwd: ROOT, stdio: 'inherit' })
    if (built.status !== 0) fail(`the build of ${name} failed`)
  }
}
if (!existsSync(join(CDN, 'polymorph.js'))) {
  fail(
    'packages/elements-ui/dist/cdn is not built: run `pnpm build:packages`, or this without --no-build',
  )
}

/* -------------------------------------------------------------------------- */
/* The server                                                                 */
/* -------------------------------------------------------------------------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

/** A file under `root` for a request path, or `null` for a path outside it or no file. */
function fileUnder(root, path) {
  const file = normalize(join(root, decodeURIComponent(path)))
  if (!file.startsWith(root)) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

/** Every pair a form posted, in order, as the page that reads them prints them. */
function echo(body) {
  const pairs = [...new URLSearchParams(body)]
  return `<!doctype html><meta charset="utf-8"><title>Posted</title><pre id="posted">${JSON.stringify(pairs).replace(/</g, '\\u003c')}</pre>`
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (request.method === 'POST' && url.pathname === '/echo') {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      response.writeHead(200, { 'content-type': TYPES['.html'] })
      response.end(echo(body))
    })
    return
  }
  const file = url.pathname.startsWith('/polymorph/')
    ? fileUnder(CDN, url.pathname.slice('/polymorph/'.length))
    : fileUnder(PAGES, url.pathname === '/' ? 'index.html' : url.pathname.slice(1))
  if (file === null) {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  response.end(readFileSync(file))
})

await new Promise((listening) => server.listen(0, '127.0.0.1', listening))
const origin = `http://127.0.0.1:${server.address().port}`

/* -------------------------------------------------------------------------- */
/* The checks                                                                 */
/* -------------------------------------------------------------------------- */

/** One engine's run: its checks, by name, and the errors its pages logged. */
class Run {
  constructor(engine) {
    this.engine = engine
    this.passed = []
    this.failed = []
    this.errors = []
  }

  check(name, ok, detail = '') {
    if (ok) this.passed.push(name)
    else this.failed.push(detail === '' ? name : `${name}: ${detail}`)
  }

  /** A page whose errors and failed requests count against the run. */
  async page(context) {
    const page = await context.newPage()
    page.on('pageerror', (error) => this.errors.push(`${page.url()}: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(`${page.url()}: ${message.text()}`)
    })
    page.on('requestfailed', (request) => {
      // A request a test held back and the page abandoned by navigating is not a fault.
      if (request.failure()?.errorText.includes('abort')) return
      this.errors.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`)
    })
    return page
  }
}

/** Resolves once every element on the page has rendered or waited long enough. */
const settled = (page) =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll('body *')].every(
        (element) =>
          !element.localName.startsWith('poly-') ||
          // A structural part leaves the document when it renders, and an element held by a
          // closed overlay is not in it.
          element.matches(':state(poly-host)'),
      ),
    null,
    { timeout: 15_000 },
  )

const display = (page, selector) =>
  page.evaluate((selector) => {
    const element = document.querySelector(selector)
    return element === null ? null : getComputedStyle(element).display
  }, selector)

/** Before the tags are defined: the loader is held back. */
async function beforeDefinition(run, context) {
  const page = await run.page(context)
  let release = () => {}
  const held = new Promise((done) => {
    release = done
  })
  await page.route(/\/polymorph\/polymorph\.js$/, async (route) => {
    await held
    await route.continue()
  })
  // A module script defers `DOMContentLoaded`, so the page is read as soon as it is parsed and styled.
  await page.goto(`${origin}/`, { waitUntil: 'commit' })
  await page.waitForFunction(
    () =>
      document.querySelector('#snapshot') !== null &&
      [...document.styleSheets].filter((sheet) => sheet.href !== null).length === 2,
  )
  run.check(
    'before definition: no tag is defined',
    await page.evaluate(() => window.customElements.get('poly-dialog') === undefined),
  )
  run.check(
    "before definition: a closed Dialog's content is hidden",
    (await display(page, '#dialog-body')) === 'none',
    `display ${await display(page, '#dialog-body')}`,
  )
  run.check(
    "before definition: a Dialog's trigger shows",
    (await display(page, 'poly-dialog > [slot="trigger"]')) !== 'none',
  )
  run.check(
    "before definition: a table's row lays out as a row",
    (await display(page, '#row')) === 'table-row',
    `display ${await display(page, '#row')}`,
  )
  run.check(
    'before definition: the table lays out as a table',
    (await display(page, '#table')) === 'table',
  )
  release()
  await settled(page)
  run.check(
    'after definition: the table renders its rows',
    await page.evaluate(() => document.querySelector('table')?.rows.length === 2),
  )
  await page.close()
}

/** After the tags are defined, while a member's code loads: the Dialog's chunk is held back. */
async function whileLoading(run, context) {
  const page = await run.page(context)
  let release = () => {}
  const held = new Promise((done) => {
    release = done
  })
  let requested = false
  await page.route(/\/polymorph\/chunks\/Dialog-[\w-]+\.js$/, async (route) => {
    requested = true
    await held
    await route.continue()
  })
  // Firefox and WebKit hold the `load` event for a module the page is still importing.
  await page.goto(`${origin}/`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.customElements.get('poly-dialog') !== undefined)
  await page.waitForTimeout(300)
  run.check("while loading: the Dialog's code is requested", requested)
  run.check(
    "while loading: a defined Dialog's content stays hidden",
    (await display(page, '#dialog-body')) === 'none',
    `display ${await display(page, '#dialog-body')}`,
  )
  run.check(
    'while loading: an element waits for the code of an element beside it',
    await page.evaluate(() => !document.querySelector('#card').matches(':state(poly-host)')),
  )
  release()
  await settled(page)
  run.check(
    'after loading: the Dialog renders its trigger',
    (await page.getByRole('button', { name: 'Open the dialog' }).count()) === 1,
  )
  await page.close()
}

/** The page as it renders, its overlay, its swaps and its snapshots. */
async function rendered(run, context) {
  const page = await run.page(context)
  await page.addInitScript(() => localStorage.setItem('pm-mode', 'dark'))
  const chunks = []
  page.on('request', (request) => {
    if (request.url().includes('/polymorph/chunks/')) chunks.push(request.url())
  })
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await settled(page)

  run.check(
    'prepaint: the stored mode applies',
    (await page.evaluate(() => document.documentElement.dataset.mode)) === 'dark',
  )
  run.check(
    'polymorph.js: exports restore, toast and loadAgentBridge',
    await page.evaluate(
      () =>
        typeof window.polymorphPage?.restore === 'function' &&
        typeof window.polymorphPage?.toast === 'function' &&
        typeof window.polymorphPage?.loadAgentBridge === 'function',
    ),
  )
  run.check(
    'polymorph.js: loads no chunk of a member the page does not use',
    chunks.every((url) => !/\/(DataTable|LineChart|Calendar|Markdown)-/.test(url)),
    chunks.join(', '),
  )
  run.check(
    'render: the heading renders its text',
    (await page.getByRole('heading', { name: 'Orders', exact: true }).count()) === 1,
  )
  run.check(
    'render: a Card renders its slotted text',
    await page.evaluate(
      () =>
        document
          .querySelector('#card [data-member="card"]')
          ?.textContent?.includes('Three orders') === true,
    ),
  )
  run.check(
    "render: a table's row takes the part element's attributes",
    await page.evaluate(() => document.querySelector('tr#row')?.dataset.order === 'A-1'),
  )
  run.check('render: an element draws no box', (await display(page, '#card')) === 'contents')

  // An element added to a slot later, whose member's code nothing has loaded (htmx's beforeend).
  await page.evaluate(() =>
    document
      .querySelector('#card')
      .insertAdjacentHTML('beforeend', '<poly-badge id="late">Late</poly-badge>'),
  )
  await page
    .waitForFunction(
      () => document.querySelector('#card [data-member="badge"]')?.textContent === 'Late',
      null,
      { timeout: 10_000 },
    )
    .then(
      () => run.check('swap: an element added to a slot later renders there', true),
      () => run.check('swap: an element added to a slot later renders there', false),
    )

  // The Dialog, three times.
  const trigger = page.getByRole('button', { name: 'Open the dialog' })
  for (const time of [1, 2, 3]) {
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Confirm the order' })
    const opened = await dialog.waitFor({ state: 'visible', timeout: 5_000 }).then(
      () => true,
      () => false,
    )
    run.check(`dialog: opens from its trigger (${time})`, opened)
    run.check(
      `dialog: shows its content and footer (${time})`,
      (await dialog.getByText('The order ships today.').count()) === 1 &&
        (await dialog.getByRole('button', { name: 'Done' }).count()) === 1,
    )
    // The dialog takes focus a frame after it opens, and returns focus only from there. A key
    // pressed before that frame reaches the page, where WebKit leaves focus after a click.
    await page
      .waitForFunction(() => document.activeElement?.closest('[role="dialog"]') != null, null, {
        timeout: 5_000,
      })
      .then(
        () => run.check(`dialog: takes focus (${time})`, true),
        () => run.check(`dialog: takes focus (${time})`, false),
      )
    await page.keyboard.press('Escape')
    const closed = await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).then(
      () => true,
      () => false,
    )
    run.check(`dialog: closes on Escape (${time})`, closed)
    await page
      .waitForFunction(() => document.activeElement?.textContent === 'Open the dialog', null, {
        timeout: 5_000,
      })
      .then(
        () => run.check(`dialog: returns focus to its trigger (${time})`, true),
        () => run.check(`dialog: returns focus to its trigger (${time})`, false),
      )
  }

  // An htmx `innerHTML` swap of an element's children.
  await page.evaluate(() => {
    document.querySelector('#swap-card').innerHTML = '<poly-text>After the swap.</poly-text>'
  })
  await page
    .waitForFunction(
      () => {
        const card = document.querySelector('#swap-card [data-member="card"]')
        return card?.textContent?.includes('After the swap.') === true
      },
      null,
      { timeout: 5_000 },
    )
    .then(
      () => run.check('swap: innerHTML renders the new children', true),
      () => run.check('swap: innerHTML renders the new children', false),
    )
  run.check(
    'swap: innerHTML leaves one rendering',
    await page.evaluate(
      () =>
        document.querySelectorAll('#swap-card [data-member="card"]').length === 1 &&
        !document.querySelector('#swap-card').textContent.includes('Before the swap.'),
    ),
  )

  // An htmx `outerHTML` swap.
  await page.evaluate(() => {
    document.querySelector('#swap-button').outerHTML =
      '<poly-button id="swap-button" label="After"></poly-button>'
  })
  await page
    .waitForFunction(
      () => document.querySelector('#swap-button button')?.textContent === 'After',
      null,
      {
        timeout: 5_000,
      },
    )
    .then(
      () => run.check('swap: outerHTML renders the new element', true),
      () => run.check('swap: outerHTML renders the new element', false),
    )
  run.check(
    'swap: outerHTML leaves no button of the old element',
    (await page.getByRole('button', { name: 'Before' }).count()) === 0,
  )

  // A morphing swap: the server sends the element again without `disabled`.
  run.check(
    'morph: the button starts disabled',
    await page.evaluate(() => document.querySelector('#morph-button button')?.disabled === true),
  )
  await page.evaluate(() =>
    window.polymorphPage.morph(
      document.querySelector('#morph-button'),
      '<poly-button id="morph-button" label="Saved"></poly-button>',
    ),
  )
  await page
    .waitForFunction(
      () => document.querySelector('#morph-button button')?.textContent === 'Saved',
      null,
      {
        timeout: 5_000,
      },
    )
    .then(
      () => run.check('morph: the element renders the attributes sent', true),
      () => run.check('morph: the element renders the attributes sent', false),
    )
  run.check(
    'morph: an attribute the server did not send is removed',
    await page.evaluate(() => document.querySelector('#morph-button button')?.disabled === false),
  )
  run.check(
    'morph: the element keeps its host state',
    await page.evaluate(() => document.querySelector('#morph-button').matches(':state(poly-host)')),
  )

  // A page snapshot saved without `restore`: each element reads its member's rendering as children.
  const cards = () =>
    page.evaluate(() => document.querySelectorAll('#snapshot [data-member="card"]').length)
  const before = await cards()
  await page.evaluate(() => {
    const region = document.querySelector('#snapshot')
    const saved = region.innerHTML
    region.innerHTML = saved
  })
  await page.waitForTimeout(300)
  run.check(
    'snapshot without restore: a Card renders its own rendering inside itself',
    before === 1 && (await cards()) === 2,
    `${before} card(s) before, ${await cards()} after`,
  )

  // The same snapshot with `restore` first, as `turbo:before-cache` and `htmx:beforeHistorySave` run it.
  await page.evaluate(() => {
    const region = document.querySelector('#snapshot')
    region.innerHTML =
      '<poly-card title="Kept"><poly-text>Snapshot content.</poly-text></poly-card><poly-button label="Kept"></poly-button>'
  })
  await settled(page)
  await page.evaluate(() => {
    const region = document.querySelector('#snapshot')
    window.polymorphPage.restore(region)
    window.savedSnapshot = region.innerHTML
  })
  run.check(
    "snapshot with restore: the saved markup is the page's",
    await page.evaluate(
      () =>
        !window.savedSnapshot.includes('data-member') &&
        window.savedSnapshot.includes('Snapshot content.'),
    ),
  )
  await page.evaluate(() => {
    document.querySelector('#snapshot').innerHTML = window.savedSnapshot
  })
  await settled(page)
  run.check(
    'snapshot with restore: the restored page renders as it did',
    (await cards()) === 1 &&
      (await page.locator('#snapshot').getByRole('button', { name: 'Kept' }).count()) === 1,
    `${await cards()} card(s)`,
  )
  await page.close()
}

/** The form around the elements posts what the reader entered. */
async function posts(run, context) {
  const page = await run.page(context)
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await settled(page)
  await page.getByRole('textbox', { name: 'Name' }).fill('Ada Lovelace')
  await page.getByText('Agree to the terms').click()
  await page.getByRole('combobox', { name: 'Priority' }).click()
  await page.getByRole('option', { name: 'High' }).click()
  await Promise.all([
    page.waitForURL(`${origin}/echo`, { timeout: 10_000 }),
    page.getByRole('button', { name: 'Send' }).click(),
  ])
  const posted = Object.fromEntries(JSON.parse(await page.locator('#posted').textContent()))
  run.check('form: posts the Input', posted.name === 'Ada Lovelace', JSON.stringify(posted))
  run.check('form: posts the Checkbox', posted.agree === 'yes', JSON.stringify(posted))
  run.check('form: posts the Select', posted.priority === 'high', JSON.stringify(posted))
  await page.close()
}

/** `polymorph-all.js`: every element in one file. */
/**
 * An attribute a codec cannot read. The warning goes through the engine's
 * `devWarning`, which reads `process.env.NODE_ENV`: files that left it in place
 * would throw here, where a browser has no `process`, and the element would
 * render nothing.
 */
async function reports(run, context) {
  for (const [script, path] of [
    ['polymorph.js', '/'],
    ['polymorph-all.js', '/all.html'],
  ]) {
    const page = await run.page(context)
    const warnings = []
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text())
    })
    await page.goto(`${origin}${path}`, { waitUntil: 'load' })
    await settled(page)
    await page.evaluate(() => {
      const progress = document.createElement('poly-progress')
      progress.setAttribute('label', 'Upload')
      progress.setAttribute('value', 'lots')
      document.body.append(progress)
    })
    await settled(page)
    run.check(
      `${script}: an attribute an element cannot read is reported`,
      warnings.some(
        (text) => text.startsWith('polymorph: <poly-progress value>') && text.includes('"lots"'),
      ),
      warnings.join(' | '),
    )
    run.check(
      `${script}: the element renders without the prop it could not read`,
      (await page.getByRole('progressbar', { name: 'Upload', exact: true }).count()) === 1,
    )
    await page.close()
  }
}

async function all(run, context) {
  const page = await run.page(context)
  const chunks = []
  page.on('request', (request) => {
    if (request.url().includes('/polymorph/chunks/')) chunks.push(request.url())
  })
  await page.goto(`${origin}/all.html`, { waitUntil: 'load' })
  await settled(page)
  run.check(
    'polymorph-all.js: exports restore, toast and loadAgentBridge',
    await page.evaluate(
      () =>
        typeof window.polymorphPage?.restore === 'function' &&
        typeof window.polymorphPage?.toast === 'function' &&
        typeof window.polymorphPage?.loadAgentBridge === 'function',
    ),
  )
  await page.getByRole('button', { name: 'Open the dialog' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm the order' })
  run.check(
    'polymorph-all.js: a Dialog opens',
    await dialog.waitFor({ state: 'visible', timeout: 5_000 }).then(
      () => true,
      () => false,
    ),
  )

  // The bridge is in the one file, and reads the members that file rendered.
  const listed = await page.evaluate(async () => {
    const { createAgentBridge } = await window.polymorphPage.loadAgentBridge()
    window.bridge = createAgentBridge()
    return window.bridge.snapshot().members.map(({ member, name }) => `${member} ${name}`)
  })
  run.check(
    'polymorph-all.js: its bridge lists the open Dialog and its trigger',
    listed.includes('Dialog Confirm the order') && listed.includes('Button Open the dialog'),
    listed.join(', '),
  )
  const closing = await page.evaluate(() =>
    window.bridge.act([{ target: { member: 'Dialog' }, action: 'close' }]),
  )
  run.check(
    'polymorph-all.js: its bridge closes the Dialog',
    closing.results[0]?.ok === true &&
      (await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).then(
        () => true,
        () => false,
      )),
    JSON.stringify(closing.results),
  )
  run.check('polymorph-all.js: loads no chunk', chunks.length === 0, chunks.join(', '))
  await page.close()
}

/** A bridge the page loads reads and operates the members the page shows. */
async function agent(run, context) {
  const page = await run.page(context)
  const chunks = []
  page.on('request', (request) => {
    if (request.url().includes('/polymorph/chunks/')) chunks.push(request.url())
  })
  await page.goto(`${origin}/`, { waitUntil: 'load' })
  await settled(page)

  const before = chunks.length
  const tools = await page.evaluate(async () => {
    const { agentTools, createAgentBridge } = await window.polymorphPage.loadAgentBridge()
    window.bridge = createAgentBridge()
    return agentTools(window.bridge).map((tool) => tool.name)
  })
  run.check(
    'agent: the bridge is fetched when the page asks for it, and not before',
    chunks.length > before,
    `${chunks.length - before} chunk(s) after the call`,
  )
  run.check(
    'agent: the bridge is three tools',
    tools.join(' ') === 'polymorph_snapshot polymorph_query polymorph_act',
    tools.join(' '),
  )

  /** The listed member of that kind and name, as the snapshot holds it now. */
  const member = (kind, name) =>
    page.evaluate(
      ([kind, name]) =>
        window.bridge
          .snapshot()
          .members.find((listed) => listed.member === kind && listed.name === name) ?? null,
      [kind, name],
    )
  const input = await member('Input', 'Name')
  const select = await member('Select', 'Priority')
  run.check(
    'agent: the snapshot lists the page’s members with what they hold',
    input?.state.value === 'Ada' &&
      select?.state.value === 'low' &&
      (await member('Checkbox', 'Agree to the terms'))?.state.checked === false &&
      (await member('Button', 'Send')) !== null,
    JSON.stringify({ input, select }),
  )
  run.check(
    'agent: a closed Dialog is not listed',
    (await member('Dialog', 'Confirm the order')) === null,
  )

  const acted = await page.evaluate(() =>
    window.bridge.act([
      { target: { member: 'Input', name: 'Name' }, action: 'fill', value: 'Grace Hopper' },
      { target: { member: 'Checkbox', name: 'Agree to the terms' }, action: 'check' },
      { target: { member: 'Select', name: 'Priority' }, action: 'choose', value: 'high' },
    ]),
  )
  run.check(
    'agent: fills the Input, checks the Checkbox and chooses in the Select',
    acted.results.length === 3 && acted.results.every((result) => result.ok === true),
    JSON.stringify(acted.results),
  )
  run.check(
    'agent: the page shows what the agent entered',
    (await page.getByRole('textbox', { name: 'Name' }).inputValue()) === 'Grace Hopper' &&
      (await page.getByRole('checkbox', { name: 'Agree to the terms' }).isChecked()) &&
      (await page.getByRole('combobox', { name: 'Priority' }).textContent())?.includes('High') ===
        true,
  )
  const refused = await page.evaluate(() =>
    window.bridge.act([{ target: { member: 'Button', name: 'Save' }, action: 'press' }]),
  )
  run.check(
    'agent: a disabled Button refuses a press',
    refused.results[0]?.ok === false && refused.results[0]?.error?.code === 'disabled',
    JSON.stringify(refused.results),
  )

  const [, sent] = await Promise.all([
    page.waitForURL(`${origin}/echo`, { timeout: 10_000 }),
    page.evaluate(() =>
      window.bridge.act([{ target: { member: 'Button', name: 'Send' }, action: 'press' }]),
    ),
  ]).catch((error) => [null, { failed: error.message.split('\n')[0] }])
  const posted = await page
    .locator('#posted')
    .textContent({ timeout: 5_000 })
    .then(
      (text) => Object.fromEntries(JSON.parse(text)),
      () => ({}),
    )
  run.check(
    'agent: a press on the submit Button posts what the agent entered',
    posted.name === 'Grace Hopper' && posted.agree === 'yes' && posted.priority === 'high',
    JSON.stringify({ posted, sent }),
  )
  await page.close()
}

/**
 * The no-build chunks by what they hold: the bridge's (`polymorph:agentchange`, the event a step
 * dispatches) and the tools' definitions alone (`polymorph_snapshot`, a tool's name, in a chunk
 * without the bridge). The minifier keeps both strings.
 */
function agentChunks() {
  const bridge = new Set()
  const definitions = new Set()
  for (const name of readdirSync(join(CDN, 'chunks'))) {
    const text = readFileSync(join(CDN, 'chunks', name), 'utf8')
    if (text.includes('polymorph:agentchange')) bridge.add(name)
    else if (text.includes('polymorph_snapshot')) definitions.add(name)
  }
  return { bridge, definitions }
}

/**
 * A stand-in for the browser's WebMCP API, in an earlier build's shape (`navigator.modelContext`,
 * a tool unregistered by name), which refuses a name registered twice as the browser does. A page
 * runs it before any of its scripts. The registered tools are `window.webmcp`, by name.
 */
function standIn() {
  const tools = new Map()
  window.webmcp = tools
  Object.defineProperty(window.navigator, 'modelContext', {
    configurable: true,
    value: {
      registerTool(tool) {
        if (tools.has(tool.name)) {
          throw new window.DOMException(`${tool.name} is registered`, 'InvalidStateError')
        }
        tools.set(tool.name, tool)
      },
      unregisterTool(name) {
        tools.delete(name)
      },
    },
  })
}

/** Resolves true once `holds()` is true, or false after `ms`. */
async function until(holds, ms = 5_000) {
  for (const start = Date.now(); Date.now() - start < ms;) {
    if (await holds()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return holds()
}

const TOOLS = 'polymorph_snapshot polymorph_query polymorph_act'

/** A page's agent setting, `<html data-agent>`, on `polymorph.js` and on `polymorph-all.js`. */
async function setting(run, context) {
  const chunk = agentChunks()
  run.check(
    'setting: the bridge and the tools’ definitions are a chunk each',
    chunk.bridge.size === 1 && chunk.definitions.size === 1,
    JSON.stringify({ bridge: [...chunk.bridge], definitions: [...chunk.definitions] }),
  )

  /**
   * The page at `path`, served with `data-agent="value"` on its document element (none for
   * `null`) and with the stand-in for WebMCP unless `webmcp` is false: the chunks it fetched and
   * the warnings it logged, as they arrive.
   */
  async function open(path, value, { webmcp = true } = {}) {
    const page = await run.page(context)
    const fetched = []
    const warnings = []
    page.on('request', (request) => {
      const name = /\/polymorph\/chunks\/([^/?#]+)$/.exec(request.url())?.[1]
      if (name !== undefined) fetched.push(name)
    })
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text())
    })
    if (webmcp) await page.addInitScript(standIn)
    if (value !== null) {
      await page.route(`${origin}${path}`, async (route) => {
        const response = await route.fetch()
        const body = (await response.text()).replace('<html ', `<html data-agent="${value}" `)
        await route.fulfill({ response, body })
      })
    }
    await page.goto(`${origin}${path}`, { waitUntil: 'load' })
    await settled(page)
    const fetches = (kind) => fetched.filter((name) => chunk[kind].has(name)).length
    return { page, fetched, warnings, fetches }
  }
  const registered = (page) => page.evaluate(() => [...(window.webmcp?.keys() ?? [])].join(' '))
  const call = (page, name, input) =>
    page.evaluate(([name, input]) => window.webmcp.get(name).execute(input), [name, input])
  const listed = (read) => (read?.members ?? []).map(({ member, name }) => `${member} ${name}`)
  const quiet = (page) => page.waitForTimeout(300)

  {
    const { page, fetches } = await open('/', null)
    await quiet(page)
    run.check('setting absent: registers no tool', (await registered(page)) === '')
    run.check(
      'setting absent: fetches neither the tools’ definitions nor the bridge',
      fetches('definitions') === 0 && fetches('bridge') === 0,
    )
    await page.close()
  }

  {
    const { page, fetched, warnings, fetches } = await open('/', 'on-call')
    run.check(
      'on-call: registers the three tools at load',
      await until(async () => (await registered(page)) === TOOLS),
      await registered(page),
    )
    await quiet(page)
    run.check(
      'on-call: fetches the tools’ definitions and not the bridge before a call',
      fetches('definitions') === 1 && fetches('bridge') === 0,
      fetched.join(', '),
    )
    const read = await call(page, 'polymorph_snapshot', {})
    run.check('on-call: the first call fetches the bridge', fetches('bridge') === 1)
    run.check(
      'on-call: the first call lists the page’s members',
      ['Input Name', 'Checkbox Agree to the terms', 'Select Priority', 'Button Send'].every(
        (entry) => listed(read).includes(entry),
      ),
      listed(read).join(', '),
    )
    const acted = await call(page, 'polymorph_act', {
      steps: [{ target: { member: 'Input', name: 'Name' }, action: 'fill', value: 'Grace Hopper' }],
    })
    run.check(
      'on-call: a later call runs against the bridge the first one loaded',
      acted?.results?.[0]?.ok === true &&
        (await page.getByRole('textbox', { name: 'Name' }).inputValue()) === 'Grace Hopper' &&
        fetches('bridge') === 1,
      JSON.stringify(acted),
    )
    // The page's own script after the setting: the bridge the setting loaded, and its tools.
    const own = await page.evaluate(async () => {
      const agent = await window.polymorphPage.loadAgentBridge()
      const mine = agent.createAgentBridge()
      const held = [...window.webmcp.values()]
      const same = agent.agentTools(mine).every((tool) => {
        const registered = window.webmcp.get(tool.name)
        return (
          registered.title === tool.title &&
          registered.description === tool.description &&
          JSON.stringify(registered.inputSchema) === JSON.stringify(tool.inputSchema) &&
          JSON.stringify(registered.annotations) === JSON.stringify(tool.annotations)
        )
      })
      const ids = mine.snapshot().members.map(({ id }) => id)
      const theirs = (await window.webmcp.get('polymorph_snapshot').execute({})).members.map(
        ({ id }) => id,
      )
      agent.registerWebMCP(mine)
      const kept = [...window.webmcp.values()].every((tool, index) => tool === held[index])
      mine.dispose()
      return { same, shared: ids.length > 0 && ids.join() === theirs.join(), kept }
    })
    run.check('on-call: the tools carry the definitions agentTools gives', own.same)
    run.check(
      'on-call: loadAgentBridge resolves to the bridge the setting loaded',
      own.shared && fetches('bridge') === 1,
    )
    run.check(
      'on-call: the page’s own registerWebMCP registers nothing, and warns',
      own.kept &&
        warnings.some((text) =>
          text.includes('registerWebMCP registers nothing, because data-agent="on-call"'),
        ),
      warnings.join(' | '),
    )
    await page.close()
  }

  {
    const { page, fetched, fetches } = await open('/', 'eager')
    run.check(
      'eager: registers the three tools at load',
      await until(async () => (await registered(page)) === TOOLS),
      await registered(page),
    )
    run.check(
      'eager: fetches the bridge at load, before any call',
      await until(() => fetches('bridge') === 1),
      fetched.join(', '),
    )
    const read = await call(page, 'polymorph_snapshot', {})
    run.check(
      'eager: a call lists the page’s members',
      listed(read).includes('Input Name'),
      listed(read).join(', '),
    )
    await page.close()
  }

  {
    const { page, warnings, fetches } = await open('/', 'always')
    await quiet(page)
    run.check(
      'unknown setting: warns once',
      warnings.filter((text) => text.includes('data-agent="always" is neither on-call nor eager'))
        .length === 1,
      warnings.join(' | '),
    )
    run.check(
      'unknown setting: registers nothing and fetches neither the definitions nor the bridge',
      (await registered(page)) === '' && fetches('definitions') === 0 && fetches('bridge') === 0,
    )
    await page.close()
  }

  for (const value of ['on-call', 'eager']) {
    const { page, fetched, fetches } = await open('/', value, { webmcp: false })
    await quiet(page)
    run.check(
      `${value} without WebMCP: fetches neither the definitions nor the bridge`,
      fetches('definitions') === 0 && fetches('bridge') === 0,
      fetched.join(', '),
    )
    await page.close()
  }

  {
    const { page } = await open('/all.html', null)
    await quiet(page)
    run.check(
      'polymorph-all.js, setting absent: registers no tool',
      (await registered(page)) === '',
    )
    await page.close()
  }
  for (const value of ['on-call', 'eager']) {
    const { page, fetched } = await open('/all.html', value)
    run.check(
      `polymorph-all.js, ${value}: registers the three tools at load`,
      await until(async () => (await registered(page)) === TOOLS),
      await registered(page),
    )
    const read = await call(page, 'polymorph_snapshot', {})
    run.check(
      `polymorph-all.js, ${value}: a call lists the page’s members`,
      listed(read).includes('Button Open the dialog'),
      listed(read).join(', '),
    )
    run.check(
      `polymorph-all.js, ${value}: fetches no chunk`,
      fetched.length === 0,
      fetched.join(', '),
    )
    await page.close()
  }
}

/* -------------------------------------------------------------------------- */
/* A run-time screen                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The chunks of `dist/cdn/` that hold a part of the run-time screen, each
 * found by a string only that part holds, which the minifier keeps: the
 * renderer dispatches `poly-action`, the vocabulary table holds each member's
 * purpose (Alert's is "Inline status callout"), the validator suggests a name
 * ("did you mean"), and the card opens "# Writing a screen".
 */
function screenChunks() {
  const dir = join(CDN, 'chunks')
  const holding = (marker) =>
    readdirSync(dir)
      .filter((name) => marker.test(readFileSync(join(dir, name), 'utf8')))
      .map((name) => `/polymorph/chunks/${name}`)
  return {
    renderer: holding(/["'`]poly-action["'`]/),
    table: holding(/Inline status callout/),
    validator: holding(/did you mean/),
    card: holding(/# Writing a screen/),
  }
}

/**
 * A `<poly-screen>` on a page with no build: it draws the document a server
 * wrote in its script child, its Button's press reaches the page as
 * `poly-action`, and `loadScreen` gives the page's own script the rest. A page
 * with no `<poly-screen>` fetches none of the screen's code, and a page that
 * only draws one fetches neither the validator nor the card.
 */
async function screen(run, context) {
  const parts = screenChunks()
  run.check(
    'screen: the renderer, the table, the validator and the card are chunks',
    Object.values(parts).every((files) => files.length > 0),
    JSON.stringify(parts),
  )
  const read = readFileSync(join(CDN, 'polymorph.js'), 'utf8')
  run.check(
    'screen: polymorph.js holds none of the renderer, the table, the validator or the card',
    !/["'`]poly-action["'`]|Inline status callout|did you mean|# Writing a screen/.test(read),
  )
  const fetched = (requests, files) =>
    requests.filter((url) => files.some((file) => url.endsWith(file)))

  {
    const page = await run.page(context)
    const requests = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto(`${origin}/`, { waitUntil: 'load' })
    await settled(page)
    const any = Object.values(parts).flat()
    run.check(
      'screen: a page with no poly-screen fetches none of its code',
      fetched(requests, any).length === 0,
      fetched(requests, any).join(', '),
    )
    await page.close()
  }

  const page = await run.page(context)
  const requests = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto(`${origin}/screen.html`, { waitUntil: 'load' })
  await settled(page)
  const heading = page.getByRole('heading', { name: 'New contact', exact: true })
  run.check(
    'screen: draws the document in its script child',
    await heading.waitFor({ state: 'visible', timeout: 10_000 }).then(
      () => true,
      () => false,
    ),
  )
  run.check(
    'screen: draws no box of its own',
    (await display(page, 'poly-screen')) === 'contents',
    `display ${await display(page, 'poly-screen')}`,
  )
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
  await page.getByRole('button', { name: 'Save' }).click()
  const actions = await page.evaluate(() => window.screenPage.actions)
  run.check(
    'screen: a press dispatches poly-action with the named field in values and changed',
    JSON.stringify(actions) ===
      JSON.stringify([
        { name: 'onSave', args: [], values: { email: 'ada@example.com' }, changed: ['email'] },
      ]),
    JSON.stringify(actions),
  )
  run.check(
    'screen: a page that draws a screen fetches its renderer and table',
    fetched(requests, parts.renderer).length > 0 && fetched(requests, parts.table).length > 0,
  )
  run.check(
    'screen: a page that only draws fetches neither the validator nor the card',
    fetched(requests, [...parts.validator, ...parts.card]).length === 0,
    fetched(requests, [...parts.validator, ...parts.card]).join(', '),
  )
  const loaded = await page.evaluate(async () => {
    const screen = await window.screenPage.loadScreen()
    const document = JSON.parse(window.document.querySelector('#document').text)
    return {
      functions: [
        'drawScreen',
        'parsePartial',
        'checkScreen',
        'checkAnswer',
        'runtimeCard',
        'outputContract',
      ]
        .filter((name) => typeof screen[name] === 'function')
        .join(),
      lawful: screen.checkScreen(document).ok,
      unknown: screen.checkScreen({ ...document, root: { component: 'Buton' } }).faults.length,
      card: screen.runtimeCard({ members: ['Stack', 'Button'] }).includes('Button'),
      partial: screen.parsePartial(JSON.stringify(document).slice(0, 40)).complete,
      cut: screen.checkAnswer(JSON.stringify(document).slice(0, 40)).ok,
      answered: screen.checkAnswer(`Here it is.\n\`\`\`json\n${JSON.stringify(document)}\n\`\`\``),
    }
  })
  run.check(
    'screen: loadScreen resolves to drawScreen, parsePartial, checkScreen, checkAnswer, runtimeCard and outputContract',
    loaded.functions ===
      'drawScreen,parsePartial,checkScreen,checkAnswer,runtimeCard,outputContract',
    loaded.functions,
  )
  run.check(
    'screen: checkScreen passes the page’s document and faults an unknown member',
    loaded.lawful && loaded.unknown > 0,
    JSON.stringify(loaded),
  )
  run.check('screen: runtimeCard lists the members it is given', loaded.card)
  run.check('screen: parsePartial reads a cut as not complete', loaded.partial === false)
  run.check(
    'screen: checkAnswer faults an answer cut short, and passes the whole answer with its prose',
    loaded.cut === false && loaded.answered.ok && loaded.answered.prose === 'Here it is.',
    JSON.stringify({ cut: loaded.cut, ok: loaded.answered.ok, prose: loaded.answered.prose }),
  )
  run.check(
    'screen: loadScreen fetches the validator and the card',
    fetched(requests, parts.validator).length > 0 && fetched(requests, parts.card).length > 0,
  )
  const faults = await page.evaluate(() => window.screenPage.faults)
  run.check('screen: dispatches no fault', faults.length === 0, JSON.stringify(faults))
  await page.close()
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

const runs = []
for (const engine of selected) {
  const run = new Run(engine.name)
  runs.push(run)
  const browser = await engine.type.launch()
  try {
    const context = await browser.newContext()
    const stages = [
      beforeDefinition,
      whileLoading,
      rendered,
      posts,
      agent,
      setting,
      reports,
      all,
      screen,
    ]
    for (const stage of stages.filter(
      ({ name }) => stagesNamed.length === 0 || stagesNamed.includes(name),
    )) {
      try {
        await stage(run, context)
      } catch (error) {
        run.check(`${stage.name}: ran to the end`, false, error.message.split('\n')[0])
      }
    }
    await context.close()
  } finally {
    await browser.close()
  }
}
server.close()

let failures = 0
for (const run of runs) {
  const faults = [...run.failed, ...run.errors.map((error) => `logged an error: ${error}`)]
  failures += faults.length
  process.stderr.write(
    `gate:no-build: ${run.engine} — ${run.passed.length} passed, ${faults.length} failed\n`,
  )
  for (const fault of faults) process.stderr.write(`  ✗ ${fault}\n`)
}
process.exitCode = failures === 0 ? 0 : 1
