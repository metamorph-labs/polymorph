#!/usr/bin/env node
/**
 * `pnpm gate:next` is the Next.js gate. It builds a Next.js App Router
 * application (`scripts/next-app/`) from the published builds of the engine,
 * the rules, the React foundation and the React vocabulary, and checks what
 * only a framework that renders on a server decides:
 *
 *  - the stylesheets of the members a page renders reach that page, whether a
 *    server component or a client component imported the member, and a page
 *    that renders one member does not load the vocabulary;
 *  - the client's first render matches the server's markup, so React reports
 *    no hydration error and the console stays empty;
 *  - a client member reads an element a server component passed it (a
 *    FormField's control, a Dialog's trigger), and a server component reads a
 *    compound member's parts;
 *  - the theme's pre-paint script and its hydration work from the root layout;
 *  - the red rules run under the application's own ESLint.
 *
 * It runs three stages, each against the same application: a production build
 * with Turbopack, a production build with webpack, and the development
 * server. The development server is a stage of its own because React's
 * development build hands a client component the elements a server component
 * passed in another form than a production build does, and reports a
 * hydration mismatch in full.
 *
 * The application is assembled the way `packages/cli/consumer-app.ts`
 * assembles one for the CLI's acceptance tests: each of our packages as npm
 * would publish it, from its `dist`, and every other dependency linked from
 * this repository's install, so the gate needs no network. It is assembled
 * under `scripts/next-app/dist/`, inside the repository, because Turbopack
 * reads no file outside its root and the linked dependencies are in the
 * repository's `node_modules`. The theme and the lint config are the ones
 * `polymorph add theme:plain` writes, which is the install path
 * `docs/consuming.md` gives a Next.js application. The CLI refuses to write
 * into a checkout of polymorph, so it runs on a copy of the fixture in a
 * temporary directory, and the result is copied into the repository. The
 * assembled application is left in place after a run, for reading a failure.
 *
 * `node scripts/gate-next.mjs [stage…] [--no-build]`: a stage's name
 * (`turbopack`, `webpack`, `dev`) runs that stage alone. `--no-build` skips
 * building the four packages, for a tree whose `pnpm build:packages` has just
 * run, which is how `pnpm gate` runs this as its last step.
 * `docs/verification.md` has what each stage checks.
 */

import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { chromium } from 'playwright'

import { installNodeModules } from '../packages/cli/consumer-app.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(ROOT, 'scripts/next-app')
const APP = join(FIXTURE, 'dist/app')
const CLI = join(ROOT, 'packages/cli/bin/polymorph.js')
const NEXT = join(APP, 'node_modules/next/dist/bin/next')
const ENV = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', POLYMORPH_REPOSITORY: ROOT }

/** The packages the application installs, in the order their builds depend on each other. */
const PACKAGES = ['engine', 'rules', 'react', 'react-ui']

/** The fixed order. A stage is a bundler, or the development server. */
const STAGES = ['turbopack', 'webpack', 'dev']

/** The routes of the application, and the file Next.js prerenders each to. */
const PAGES = { '/': 'index', '/elements': 'elements', '/tickets': 'tickets', '/one': 'one' }

const args = process.argv.slice(2)
const unknown = args.filter((arg) => !STAGES.includes(arg) && arg !== '--no-build')
if (unknown.length > 0) {
  process.stderr.write(
    `gate:next: unknown argument ${unknown.join(', ')}. Expected ${STAGES.join(', ')} or --no-build.\n`,
  )
  process.exit(1)
}
const named = STAGES.filter((stage) => args.includes(stage))
const selected = named.length > 0 ? named : STAGES

if (!existsSync(chromium.executablePath())) {
  process.stderr.write(
    'gate:next: chromium not installed for Playwright. Run:\n  pnpm exec playwright install chromium\n',
  )
  process.exit(1)
}

const say = (line) => process.stderr.write(`gate:next: ${line}\n`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Every check that failed, as `stage: what, and what was found instead`. */
const failures = []
let checks = 0

/** Records one check. `found` is what a failure prints beside the check's name. */
function check(stage, name, passed, found) {
  checks += 1
  if (passed === true) return
  const detail = found === undefined ? '' : `\n      ${String(found).split('\n').join('\n      ')}`
  failures.push(`${stage}: ${name}${detail}`)
}

/** A command run to its end, with its exit code and everything it printed. */
function run(command, commandArgs, cwd = APP) {
  const result = spawnSync(command, commandArgs, { cwd, env: ENV, encoding: 'utf8' })
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

const lastLines = (text, count = 30) => text.trim().split('\n').slice(-count).join('\n')

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

/* -------------------------------------------------------------------------- */
/* The application                                                            */
/* -------------------------------------------------------------------------- */

function buildPackages() {
  for (const name of PACKAGES) {
    say(`building @polymorph/${name}`)
    const built = run('pnpm', ['--filter', `@polymorph/${name}`, 'build'], ROOT)
    if (built.code !== 0) {
      process.stderr.write(`${lastLines(built.output)}\n`)
      process.exit(1)
    }
  }
}

/**
 * The fixture with its theme installed by the CLI, copied to `dist/app`, and
 * its `node_modules` assembled from the builds. The CLI runs first, because it
 * adds the theme's font packages to the manifest the assembly reads.
 */
function assemble() {
  const staged = mkdtempSync(join(tmpdir(), 'polymorph-next-'))
  try {
    for (const entry of readdirSync(FIXTURE)) {
      if (entry === 'dist' || entry === 'README.md') continue
      cpSync(join(FIXTURE, entry), join(staged, entry), { recursive: true })
    }
    const added = run(process.execPath, [CLI, 'add', 'theme:plain'], staged)
    if (added.code !== 0) {
      process.stderr.write(
        `gate:next: polymorph add theme:plain failed\n${lastLines(added.output)}\n`,
      )
      process.exit(1)
    }
    rmSync(join(FIXTURE, 'dist'), { recursive: true, force: true })
    mkdirSync(dirname(APP), { recursive: true })
    cpSync(staged, APP, { recursive: true })
  } finally {
    rmSync(staged, { recursive: true, force: true })
  }
  installNodeModules(APP, 'declared')
}

/**
 * Application code that breaks the red rules, one statement for each rule the
 * gate names below. It is written into the application, linted and removed.
 */
const UNLAWFUL = `import { Check } from 'lucide-react'

import { Button } from '@polymorph/react-ui'

import './unlawful.css'

export function Unlawful() {
  return (
    <div style={{ color: '#ff0000' }}>
      <button type="button">Save</button>
      <Button label="Save" className="mine" />
      <Check />
    </div>
  )
}
`

/**
 * The red rules, under the application's own ESLint and the config
 * `polymorph add` linked. The first run names the files ESLint read, because
 * ESLint passes a file no config matches.
 */
function lint() {
  const eslint = join(APP, 'node_modules/.bin/eslint')
  const lawful = run(eslint, ['.', '--format', 'json'])
  const results = lawful.code === 0 ? JSON.parse(lawful.output) : []
  const read = results
    .filter((result) => result.messages.length === 0)
    .map((result) => result.filePath.slice(APP.length + 1))
  check('lint', 'the red rules pass the application as written', lawful.code === 0, lawful.output)
  for (const file of ['app/layout.tsx', 'app/page.tsx', 'app/tickets/tickets.tsx']) {
    check('lint', `ESLint reads ${file}`, read.includes(file), read.join(' '))
  }

  writeFileSync(join(APP, 'app/unlawful.tsx'), UNLAWFUL)
  const seeded = run(eslint, ['app/unlawful.tsx'])
  rmSync(join(APP, 'app/unlawful.tsx'))
  check('lint', 'ESLint fails on unlawful application code', seeded.code !== 0, seeded.output)
  for (const rule of [
    'polymorph/no-raw-styles',
    'polymorph/no-raw-interactive',
    'polymorph/no-external-icons',
    'polymorph/no-app-css',
  ]) {
    check('lint', `reports ${rule}`, seeded.output.includes(rule), lastLines(seeded.output))
  }
}

/* -------------------------------------------------------------------------- */
/* What a build wrote                                                         */
/* -------------------------------------------------------------------------- */

/** The stylesheets the vocabulary and the foundation ship, by path under `dist/`. */
function publishedStylesheets() {
  return ['react-ui', 'react'].flatMap((name) => {
    const dist = join(ROOT, 'packages', name, 'dist')
    return files(dist)
      .filter((path) => path.endsWith('.css'))
      .map((path) => ({ path: path.slice(dist.length + 1), css: readFileSync(path, 'utf8') }))
  })
}

/** Every class a published stylesheet has a rule for. */
function publishedClasses() {
  const defined = new Set()
  for (const { css } of publishedStylesheets()) {
    for (const [selector] of css.matchAll(/\._[A-Za-z0-9]+_[a-z0-9]+_\d+/g)) {
      defined.add(selector.slice(1))
    }
  }
  return defined
}

/** A member's own class in its recipe (`_table_…` in `structure/table.css`), which no other recipe composes. */
function ownClass(stylesheet, name) {
  const sheet = publishedStylesheets().find(({ path }) => path === stylesheet)
  const found = sheet?.css.match(new RegExp(`\\._${name}_[a-z0-9]+_\\d+`))
  if (!found) throw new Error(`gate:next: no ._${name}_ class in ${stylesheet}`)
  return found[0].slice(1)
}

/** One prerendered page: its markup, and the stylesheets and scripts it names. */
function prerendered(name) {
  const html = readFileSync(join(APP, '.next/server/app', `${name}.html`), 'utf8')
  const asset = (path) =>
    readFileSync(join(APP, '.next', decodeURIComponent(path.replace(/^\/_next\//, ''))))
  const named = (pattern) => [...new Set([...html.matchAll(pattern)].map((match) => match[1]))]
  const stylesheets = named(/href="(\/_next\/static\/[^"]+\.css)"/g).map(asset)
  // A client component's chunk is named in the page's data as well as in a script tag.
  const scripts = named(/(\/_next\/static\/chunks\/[^"'\\\s]+\.js)/g).map(asset)
  const classes = new Set(
    [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)),
  )
  return {
    classes,
    css: stylesheets.map(String).join('\n'),
    js: scripts.map(String).join('\n'),
    weight: {
      js: scripts.reduce((sum, body) => sum + gzipSync(body, { level: 9 }).length, 0),
      css: stylesheets.reduce((sum, body) => sum + gzipSync(body, { level: 9 }).length, 0),
    },
  }
}

const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

/** What a production build wrote, read from disk. */
function inspect(stage) {
  const published = publishedClasses()
  for (const name of Object.values(PAGES)) {
    const page = prerendered(name)
    const members = [...page.classes].filter((value) => published.has(value))
    check(stage, `${name}: the markup carries the members' classes`, members.length > 0)
    const unstyled = members.filter((value) => !page.css.includes(`.${value}`))
    check(
      stage,
      `${name}: every member class in the markup has its rule in a stylesheet the page links`,
      unstyled.length === 0,
      unstyled.join(' '),
    )
  }

  // A page loads the members it renders. `/one` renders a Button, and
  // `/tickets` a DataTable, which draws a Table.
  const table = ownClass('structure/table.css', 'table')
  const button = ownClass('controls/button.css', 'button')
  const one = prerendered(PAGES['/one'])
  const tickets = prerendered(PAGES['/tickets'])
  check(stage, 'one: links Button’s stylesheet', one.css.includes(`.${button}`))
  check(stage, 'one: links no Table stylesheet', !one.css.includes(`.${table}`))
  check(stage, 'tickets: links Table’s stylesheet', tickets.css.includes(`.${table}`))
  // The name a member writes into `data-member` is in its module, and nowhere else.
  check(stage, 'one: loads no DataTable module', !one.js.includes('"DataTable"'))
  check(stage, 'tickets: loads the DataTable module', tickets.js.includes('"DataTable"'))
  say(
    `${stage}: a page with one Button loads ${kilobytes(one.weight.js)} of JavaScript and ` +
      `${kilobytes(one.weight.css)} of CSS, gzipped, with Next.js's own runtime`,
  )
}

/* -------------------------------------------------------------------------- */
/* A running server                                                           */
/* -------------------------------------------------------------------------- */

function freePort() {
  return new Promise((done, failed) => {
    const server = createServer()
    server.once('error', failed)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })
}

/** Every server this run started and has not stopped, so an interrupted run leaves none. */
const running = new Set()

/**
 * `next start` or `next dev` on a free port, in its own process group, because
 * the development server runs in a child of the command.
 */
async function serve(command) {
  const port = await freePort()
  const child = spawn(process.execPath, [NEXT, command, '-p', String(port)], {
    cwd: APP,
    env: ENV,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const exited = new Promise((done) => child.once('exit', done))
  const stop = async () => {
    running.delete(stop)
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // It has exited already.
    }
    await Promise.race([exited, sleep(5_000)])
  }
  running.add(stop)

  const origin = `http://localhost:${port}`
  const deadline = Date.now() + 120_000
  let answered = false
  while (!answered && Date.now() < deadline && child.exitCode === null) {
    answered = await fetch(`${origin}/one`).then(
      (response) => response.ok,
      () => false,
    )
    if (!answered) await sleep(250)
  }
  // The development server compiles a route when it is first asked for it.
  if (answered) for (const route of Object.keys(PAGES)) await fetch(`${origin}${route}`)
  return { origin, answered, output: () => output, stop }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    for (const stop of [...running]) await stop()
    process.exit(1)
  })
}

/* -------------------------------------------------------------------------- */
/* The application in a browser                                               */
/* -------------------------------------------------------------------------- */

/**
 * Drives the application in chromium. Every page opened here records the
 * console's errors and warnings and the page's uncaught errors, and each
 * scenario checks that it saw none: React reports a hydration mismatch there.
 */
async function drive(stage, origin, browser) {
  /** A page on `route`, in a context of its own with `stored` in its localStorage. */
  async function open(route, { stored = {}, scheme = 'light', scripts = true } = {}) {
    const context = await browser.newContext({ colorScheme: scheme })
    await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
    }, stored)
    const page = await context.newPage()
    const messages = []
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) messages.push(message.text().slice(0, 500))
    })
    page.on('pageerror', (error) => messages.push(`uncaught: ${error.message.slice(0, 500)}`))
    if (!scripts) await page.route('**/_next/static/**/*.js', (request) => request.abort())
    const response = await page.goto(`${origin}${route}`, {
      waitUntil: scripts ? 'networkidle' : 'domcontentloaded',
    })
    return { page, messages, status: response?.status(), close: () => context.close() }
  }

  const attribute = (page, name) =>
    page.evaluate((attr) => document.documentElement.getAttribute(attr), name)
  /** Whether `locator` becomes visible, or hidden with `state`, within a few seconds. */
  const settles = (locator, state = 'visible') =>
    locator.waitFor({ state, timeout: 5_000 }).then(
      () => true,
      () => false,
    )
  const quiet = (name, messages) =>
    check(stage, `${name}: the console is empty`, messages.length === 0, messages.join('\n'))

  /** One scenario. A step that throws, such as a click on a missing control, fails it by name. */
  async function scenario(name, route, options, steps) {
    const opened = await open(route, options)
    try {
      check(stage, `${name}: ${route} answers 200`, opened.status === 200, opened.status)
      await steps(opened.page, (what, passed, found) =>
        check(stage, `${name}: ${what}`, passed, found),
      )
      // A page whose scripts were blocked reports each blocked request.
      if (options.scripts !== false) quiet(name, opened.messages)
    } catch (error) {
      check(
        stage,
        `${name}: runs to its end`,
        false,
        `${error.message}\n${opened.messages.join('\n')}`,
      )
    } finally {
      await opened.close()
    }
  }

  // The pre-paint script alone: the page's own scripts never load.
  await scenario(
    'pre-paint',
    '/',
    { stored: { 'pm-mode': 'dark' }, scripts: false },
    async (page, expect) => {
      expect(
        'a stored dark mode is applied before any script loads',
        (await attribute(page, 'data-mode')) === 'dark',
      )
    },
  )
  await scenario(
    'pre-paint, system',
    '/',
    { scheme: 'dark', scripts: false },
    async (page, expect) => {
      expect(
        'the system’s dark setting is applied when nothing is stored',
        (await attribute(page, 'data-mode')) === 'dark',
      )
    },
  )

  // The theme after hydration.
  await scenario('theme', '/', { stored: { 'pm-mode': 'dark' } }, async (page, expect) => {
    expect('a stored dark mode survives hydration', (await attribute(page, 'data-mode')) === 'dark')
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect('the dark block of the theme applies', background !== 'rgb(255, 255, 255)', background)
    // The server rendered System checked. The scenario's empty console says hydration matched.
    const dark = page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', {
      name: 'Dark',
    })
    const chosen = await dark
      .and(page.locator('[aria-checked="true"]'))
      .waitFor({ timeout: 5_000 })
      .then(
        () => true,
        () => false,
      )
    expect('ModeSwitch shows the stored mode once the page has hydrated', chosen)
  })
  await scenario(
    'theme, stale',
    '/',
    { stored: { 'pm-system': 'gone', 'pm-palette': 'gone' } },
    async (page, expect) => {
      await page
        .waitForFunction(
          () => document.documentElement.getAttribute('data-system') === 'plain',
          null,
          { timeout: 5_000 },
        )
        .catch(() => {})
      expect(
        'hydration replaces a stale system',
        (await attribute(page, 'data-system')) === 'plain',
      )
      expect(
        'hydration replaces a stale palette',
        (await attribute(page, 'data-palette')) === 'neutral',
      )
      expect(
        'hydration clears the stale choice',
        (await page.evaluate(() => localStorage.getItem('pm-system'))) === null,
      )
    },
  )
  await scenario('theme, system', '/', {}, async (page, expect) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    const followed = await page
      .waitForFunction(() => document.documentElement.getAttribute('data-mode') === 'dark', null, {
        timeout: 5_000,
      })
      .then(
        () => true,
        () => false,
      )
    expect('the mode follows a change of the system’s setting', followed)
  })

  // One member: the theme, the base layer and the member's recipe all reached the page.
  await scenario('styles', '/one', {}, async (page, expect) => {
    const styles = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.setAttribute('aria-hidden', 'true')
      probe.style.cssText = 'background: var(--pm-accent-bg); font-family: var(--pm-text-md-family)'
      document.body.append(probe)
      const token = getComputedStyle(probe)
      const found = {
        accent: token.backgroundColor,
        family: token.fontFamily,
        button: getComputedStyle(document.querySelector('button')).backgroundColor,
        body: getComputedStyle(document.body).fontFamily,
        margin: getComputedStyle(document.body).marginTop,
      }
      probe.remove()
      return found
    })
    expect('the theme’s tokens resolve', styles.accent !== 'rgba(0, 0, 0, 0)', styles.accent)
    expect(
      'Button is filled with the accent token',
      styles.button === styles.accent,
      `${styles.button}, not ${styles.accent}`,
    )
    expect(
      'the base layer binds body type to the theme',
      styles.body === styles.family && styles.margin === '0px',
      JSON.stringify(styles),
    )
  })

  /** The members of `/elements`, which a server component renders with elements it passes. */
  async function elements(page, expect) {
    expect(
      'FormField labels and describes an Input',
      (await page
        .getByRole('textbox', { name: 'Subject', description: 'A short summary.' })
        .count()) === 1,
    )
    expect(
      'FormField reads a Switch’s kind and gives it the one label',
      (await page.getByRole('switch', { name: 'Notify me' }).count()) === 1 &&
        (await page.getByText('Notify me', { exact: true }).count()) === 1,
    )
    expect(
      'FormField names a RadioGroup by association',
      (await page.getByRole('radiogroup', { name: 'Priority' }).count()) === 1,
    )
    await page.getByRole('button', { name: 'Delete' }).click()
    expect(
      'Dialog opens from the trigger it was passed',
      await settles(page.getByRole('dialog', { name: 'Delete ticket' })),
    )
    await page.keyboard.press('Escape')
    expect('Dialog closes on Escape', await settles(page.getByRole('dialog'), 'hidden'))
    expect(
      'SettingsRow names and describes its control',
      (await page
        .getByRole('switch', { name: 'Daily digest', description: 'One summary each morning.' })
        .count()) === 1,
    )
    const group = page.getByRole('group', { name: 'Assignees' })
    expect(
      'Avatar.Group labels its members and counts the rest',
      (await group.getByRole('img', { name: 'Ada Lovelace' }).count()) === 1 &&
        (await group.getByText('+1').count()) === 1,
    )
    await page.getByRole('button', { name: 'Copy' }).hover()
    expect('Tooltip opens from its trigger', await settles(page.getByRole('tooltip')))
    await page.mouse.move(0, 0)
    await page.getByRole('button', { name: 'Filter' }).click()
    expect('Popover opens from its trigger', await settles(page.getByText('Filter controls.')))
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Ada' }).hover()
    expect(
      'HoverCard opens from its trigger',
      await settles(page.getByText('Ada Lovelace, support lead.')),
    )
    await page.mouse.move(0, 0)
    expect(
      'Table renders the parts a server component read from it',
      (await page.getByRole('cell', { name: 'Printer is on fire' }).count()) === 1,
    )
    await page.getByRole('tab', { name: 'Closed' }).click()
    expect(
      'Tabs shows the panel a server component read from it',
      await settles(page.getByText('No closed tickets.')),
    )
  }

  await scenario('home', '/', {}, async (page, expect) => {
    await page.getByRole('button', { name: 'Delete' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete ticket' })
    expect('Dialog opens from a trigger a server component passed', await settles(dialog))
    await page.keyboard.press('Escape')
    expect('Dialog closes on Escape', await settles(dialog, 'hidden'))
    await page.getByRole('tab', { name: /Closed/ }).click()
    expect(
      'Tabs switches its panel in a client component',
      await settles(page.getByText('No closed tickets.')),
    )
    expect('FormField labels its Input', (await page.getByLabel('Subject').count()) === 1)
    expect(
      'LineChart draws its marks',
      (await page.locator('[data-member="line-chart"] svg path').count()) > 0,
    )
  })

  await scenario('elements', '/elements', {}, elements)

  // The same page reached through the router: the elements arrive in a
  // response the client reads while the page's modules load.
  await scenario('navigation', '/', {}, async (page, expect) => {
    await page.evaluate(() => (window.loadedOnce = true))
    await page.getByRole('link', { name: 'Elements' }).click()
    await page.waitForURL('**/elements')
    expect(
      'Link navigates through the router, without a new document',
      (await page.evaluate(() => window.loadedOnce)) === true,
    )
    await elements(page, expect)
  })

  await scenario('tickets', '/tickets', {}, async (page, expect) => {
    expect('ListPage and DataTable render the rows', (await page.getByRole('row').count()) === 3)
    const row = page.getByRole('checkbox').nth(1)
    await row.click()
    expect('a DataTable row selects', (await row.isChecked()) === true)
    // The provider is in the root layout, which a server component imported,
    // and the Tooltip in a client component. Two copies of the member's module
    // would be two contexts, and the Tooltip would find no provider.
    await page.getByRole('button', { name: 'New ticket' }).hover()
    expect(
      'a Tooltip in a client component finds the layout’s provider',
      await settles(page.getByRole('tooltip')),
    )
  })
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

/** One stage: its build when it has one, then the application served and driven. */
async function stage(name, browser) {
  if (name !== 'dev') {
    say(`${name}: next build`)
    rmSync(join(APP, '.next'), { recursive: true, force: true })
    const built = run(process.execPath, [
      NEXT,
      'build',
      ...(name === 'webpack' ? ['--webpack'] : []),
    ])
    check(name, 'next build succeeds', built.code === 0, lastLines(built.output))
    if (built.code !== 0) return
    inspect(name)
  }

  say(`${name}: ${name === 'dev' ? 'next dev' : 'next start'}`)
  const server = await serve(name === 'dev' ? 'dev' : 'start')
  try {
    check(name, 'the server answers', server.answered, lastLines(server.output()))
    if (server.answered) await drive(name, server.origin, browser)
  } finally {
    await server.stop()
  }
}

if (!args.includes('--no-build')) buildPackages()
say('assembling the application in scripts/next-app/dist/app')
assemble()
lint()

const browser = await chromium.launch()
try {
  for (const name of selected) {
    const before = failures.length
    await stage(name, browser)
    say(`${name}: ${failures.length === before ? 'passed' : `${failures.length - before} failed`}`)
  }
} finally {
  await browser.close()
}

if (failures.length > 0) {
  process.stderr.write(`\ngate:next: ${failures.length} of ${checks} checks failed\n\n`)
  for (const failure of failures) process.stderr.write(`  ✗ ${failure}\n`)
  process.exit(1)
}
say(`${checks} checks passed`)
