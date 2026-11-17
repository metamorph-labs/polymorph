import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, extname, resolve } from 'node:path'

import { buildRegistry, type Registry } from '@polymorph/registry'
// The engine's, the React foundation's and the rules' own locks over their
// `dist`. Each package's `packaging.test.ts` and `init.test.ts` build the same
// trees. See the note on `beforeAll` below.
import { buildEngine, lockEngineDist } from '../engine/dist-lock'
import { buildReact, lockReactDist } from '../react/dist-lock'
import { buildRules, lockRulesDist } from '../rules/dist-lock'
// Type-only, so Playwright stays a repository test tool and not a dependency of
// the installer. `thin-front.test.ts` holds that package to three dependencies.
import type * as Playwright from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { installNodeModules, read, ROOT, runIn, write } from './consumer-app'
import { applyPlan } from './src/apply'
// The shell helper below is also called `run`, and both names fit: one runs a
// command in the scratch app, the other *is* the command. The alias keeps the
// difference visible at every call.
import { run as cli } from './src/cli'
import { digest, readManifest } from './src/manifest'
import { planInstall } from './src/plan'
import { diffInstall } from './src/status'

/**
 * The installer's acceptance test, run for real.
 *
 * The requirement: *a scratch Vite app in CI installs button + dialog + a
 * theme, builds green with the theme's real fonts, and a seeded violation in
 * the scratch app fails under the installed rules.* The test does exactly that,
 * in a real directory outside the workspace, with a real Vite build.
 *
 * A second install goes into the same app, because the CLI has a second item
 * form. `polymorph add palette:orchid` is a palette with no system of its own.
 * An install that wrote the file without making it reachable would be as
 * broken as a theme with no fonts.
 *
 * The first install also includes the exception ladder's rung 4. The rules
 * installed with Button answer a style decision with "declare a `<Bespoke>`
 * zone", and a consumer who vendors has no package root to import one from.
 * So `polymorph add bespoke` installs it, and the red-rules section below
 * tests that path: a `style` that fails in application code passes inside the
 * vendored zone.
 *
 * The app's `node_modules` holds the published `dist` of `@polymorph/engine`,
 * `@polymorph/react` and `@polymorph/rules`, and only what the install
 * declared (`consumer-app.ts` has the two decisions behind that). An install
 * that under-declares therefore fails here, as it would for the consumer. The
 * rules are an example: the lint configs the install generates import
 * `@polymorph/rules`, so an install that did not declare it, as a dependency or
 * a dev dependency, fails to lint here.
 */

let app: string
let registry: Registry

/**
 * This file tests the published shape, so the builds run here instead of
 * relying on someone having run them. The engine's, the React foundation's and
 * the rules' builds run under their locks, because each package's
 * `packaging.test.ts` and `init.test.ts` build the same trees and vitest runs
 * the files in parallel workers. Without the locks, two builds empty `dist/`
 * under each other. `packages/engine/dist-lock.ts` has the details. The locks
 * are taken in the order every holder takes them (engine, React foundation,
 * rules), so two holders never wait on each other.
 *
 * The locks are held for the whole hook, not only the builds, and released at
 * the end. `installNodeModules` copies each `dist` into the app's
 * `node_modules`, and that copy is this file's last read of the tree.
 * Everything after the hook reads the app's own copy, which nothing else can
 * touch.
 */
beforeAll(async () => {
  const releases: (() => void)[] = []
  try {
    releases.push(await lockEngineDist('scratch.test.ts'))
    releases.push(await lockReactDist('scratch.test.ts'))
    releases.push(await lockRulesDist('scratch.test.ts'))
    buildEngine()
    buildReact()
    buildRules()

    registry = buildRegistry(ROOT)
    app = mkdtempSync(resolve(tmpdir(), 'polymorph-scratch-'))
    scaffold(app)

    applyPlan(
      app,
      ROOT,
      registry,
      planInstall(registry, ['button', 'dialog', 'theme:pastel', 'bespoke']),
    )
    // A second `polymorph add` on the same app, as a consumer would run it. The
    // palette is installed beside the existing pairing.
    applyPlan(app, ROOT, registry, planInstall(registry, ['palette:orchid']))

    installNodeModules(app)
    // Vite must be told which React runtime to use for `.tsx`. Everything else is
    // default.
    write(
      app,
      'vite.config.js',
      `import react from '@vitejs/plugin-react'\n\nexport default { plugins: [react()] }\n`,
    )
  } finally {
    for (const release of releases.reverse()) release()
  }
}, 900_000)

afterAll(() => {
  if (app) rmSync(app, { recursive: true, force: true })
})

/* -------------------------------------------------------------------------- */
/* The scratch app                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What `create-vite` creates, and nothing more.
 *
 * No ESLint config, no Stylelint config, no theme, no components. Any of those
 * that exists afterwards was created by `polymorph add`.
 */
function scaffold(root: string): void {
  // React is a peer of everything and therefore in no closure. A Vite React app
  // has it before `polymorph add` runs, so the scaffold does too.
  write(
    root,
    'package.json',
    `${JSON.stringify(
      {
        name: 'scratch',
        private: true,
        type: 'module',
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      },
      null,
      2,
    )}\n`,
  )

  write(
    root,
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Scratch</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  )

  write(
    root,
    'src/main.tsx',
    `import { createRoot } from 'react-dom/client'

import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)
`,
  )

  // A screen written the way a consumer writes one: composition and content
  // from the vendored vocabulary, with no style decision in it.
  //
  // A *page*, not a fragment: one `<main>` landmark and one `<h1>`. The
  // vocabulary's own axe pass turns off `region` and `page-has-heading-one`,
  // because it audits one component at a time and those rules are about the
  // page around it. This is a page, so they stay on here, and the accessibility
  // gate below is the stricter of the two. Both elements are lawful application
  // code. The red rules forbid a screen its own *style decisions* and its own
  // controls, never its own structure and content.
  write(
    root,
    'src/App.tsx',
    `import { useState } from 'react'

import { Button } from './polymorph/controls/Button'
import { Stack } from './polymorph/layout/Stack'
import { Dialog } from './polymorph/overlays/Dialog'

export function App() {
  const [open, setOpen] = useState(false)

  return (
    <main>
      <Stack gap={4}>
        <h1>Scratch</h1>
        <Button variant="solid" tone="accent" label="Open" onClick={() => setOpen(true)} />
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="A modal"
          description="Installed by polymorph add."
        >
          <Button variant="outline" tone="neutral" label="Close" onClick={() => setOpen(false)} />
        </Dialog>
      </Stack>
    </main>
  )
}
`,
  )

  write(
    root,
    'tsconfig.json',
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          lib: ['ES2023', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          verbatimModuleSyntax: true,
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  )
}

/* -------------------------------------------------------------------------- */
/* The built page, served and opened                                          */
/* -------------------------------------------------------------------------- */

/**
 * Serves `dist/` over HTTP, because the build output requires it.
 *
 * Vite emits absolute asset paths and `<script type="module">`. The browser's
 * origin rules block a module script loaded from `file://`, so a page opened
 * from disk would fail to boot for a reason unrelated to the assertions. A
 * dozen lines of static server put the built output in a browser the way a
 * consumer's would be.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

async function serve(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const full = resolve(root, `.${path === '/' ? '/index.html' : path}`)

    if (!full.startsWith(root) || !existsSync(full)) {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(full)] ?? 'application/octet-stream',
    })
    response.end(readFileSync(full))
  })

  await new Promise<void>((ready) => {
    server.listen(0, '127.0.0.1', ready)
  })

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections()
        server.close(() => {
          done()
        })
      }),
  }
}

/** Playwright belongs to the repository, not the scratch app. A consumer needs none. */
const playwright = createRequire(resolve(ROOT, 'package.json'))('playwright') as typeof Playwright

/**
 * Opens the built page in a browser, at a chosen viewport.
 *
 * Three laws open it: the base layer's foundation, the accessibility pass, and
 * the phone fit. Each needs the same four things: `dist/` on an origin, a
 * browser, a page that has mounted, and any errors the page threw while
 * loading. One shared opener means "the app booted" is asserted one way, and a
 * browser is never left running when an expectation fails.
 */
async function openBuiltPage(
  visit: (page: Playwright.Page, failures: string[]) => Promise<void>,
  viewport?: { width: number; height: number },
): Promise<void> {
  const server = await serve(resolve(app, 'dist'))
  const browser = await playwright.chromium.launch()

  try {
    const page = await browser.newPage(viewport ? { viewport } : {})
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))

    await page.goto(server.url)
    // Wait for the app to mount, so the checks below measure a rendered page
    // and not an empty body that happens to have no margin.
    await page.waitForSelector('#root button')

    await visit(page, failures)
  } finally {
    await browser.close()
    await server.close()
  }
}

/* -------------------------------------------------------------------------- */
/* The laws                                                                   */
/* -------------------------------------------------------------------------- */

const run = (command: string, args: string[]) => runIn(app, command, args)

describe('a scratch app installs the vocabulary', () => {
  it('has a working install and nothing it did not ask for', () => {
    expect(existsSync(resolve(app, 'src/polymorph/controls/Button.tsx'))).toBe(true)
    expect(existsSync(resolve(app, 'src/polymorph/overlays/Dialog.tsx'))).toBe(true)
    // Both halves of the pairing: `theme:pastel` is the system file plus the
    // palette it declares, and a system with neither resolves to nothing.
    expect(existsSync(resolve(app, 'src/polymorph/themes/systems/pastel.json'))).toBe(true)
    expect(existsSync(resolve(app, 'src/polymorph/themes/palettes/amethyst.json'))).toBe(true)
    // The base layer, which no component imports and every page needs.
    expect(read(app, 'src/polymorph/base.css')).toContain('box-sizing: border-box')
    // The ladder's rung 4, vendored beside the members whose rules point at it.
    expect(existsSync(resolve(app, 'src/polymorph/exceptions/Bespoke.tsx'))).toBe(true)
    expect(existsSync(resolve(app, 'src/polymorph/exceptions/bespoke.module.css'))).toBe(true)
    // Not asked for, so not installed. The vocabulary has 89 members, and
    // copying the whole catalogue would defeat the purpose of vendoring.
    expect(existsSync(resolve(app, 'src/polymorph/controls/DatePicker.tsx'))).toBe(false)
    expect(existsSync(resolve(app, 'src/polymorph/themes/systems/pop.json'))).toBe(false)
  })

  it('installed the palette the second install asked for, and made it reachable', () => {
    // `polymorph add palette:orchid` installs the colour half on its own: one
    // file, no fonts (a palette declares none), and a line in the generated
    // module. Without that line, the install would be a JSON file nobody can
    // select.
    const orchid = resolve(app, 'src/polymorph/themes/palettes/orchid.json')
    expect(existsSync(orchid)).toBe(true)
    expect(JSON.parse(read(app, 'src/polymorph/themes/palettes/orchid.json'))).toMatchObject({
      name: 'orchid',
    })

    const module_ = read(app, 'src/polymorph/themes/index.ts')
    expect(module_).toContain("'pastel/orchid': () => import('./pairings/pastel--orchid')")
    expect(module_).toContain('export function ensurePairing')
    // Lazy, not eager. The load-time sheet keeps one block per system, so its
    // size does not grow with the palette count.
    expect(read(app, 'src/polymorph/themes/theme.css')).not.toContain('[data-palette="orchid"]')
    // The application derives nothing: the module it runs contains no engine.
    expect(module_).not.toMatch(/resolveTheme|composeTheme|parseSystem/)

    const manifest = JSON.parse(read(app, 'polymorph.json')) as {
      systems: string[]
      palettes: string[]
    }
    expect(manifest.systems).toEqual(['pastel'])
    expect(manifest.palettes).toEqual(['amethyst', 'orchid'])
  })

  it('typechecks, which is what the ambient declaration is for', () => {
    const result = run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'])
    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  }, 120_000)
  it('builds', () => {
    const result = run('npx', ['vite', 'build', '--logLevel', 'warn'])
    expect(result.code, result.output).toBe(0)
    expect(existsSync(resolve(app, 'dist/index.html'))).toBe(true)
  }, 120_000)
  it('builds with the theme’s real fonts, not its fallback stack', () => {
    // The rule: a theme that renders in fallback fonts on first install is a
    // broken install. So the check looks for the font *files* in the output, not
    // the family name in a stylesheet. A family name still resolves to Helvetica
    // when nothing was bundled.
    const assets = readdirSync(resolve(app, 'dist/assets'))
    const fonts = assets.filter((name) => name.endsWith('.woff2'))
    expect(fonts.length).toBeGreaterThan(0)

    const css = assets
      .filter((name) => name.endsWith('.css'))
      .map((name) => read(app, `dist/assets/${name}`))
      .join('\n')
    expect(css).toContain('@font-face')
    expect(css).toContain('Plus Jakarta Sans')
    expect(css).toContain('Fira Code')
  })

  it('put the pre-paint script in the built HTML, ahead of the stylesheet', () => {
    const html = read(app, 'dist/index.html')
    expect(html).toContain('data-polymorph="prepaint"')
    expect(html.indexOf('data-polymorph')).toBeLessThan(html.indexOf('stylesheet'))
  })

  /**
   * The acceptance test, opened in a browser instead of only compiled.
   *
   * Every check above passes for an install that builds, and building is not
   * enough. A vendored app can compile green, produce a stylesheet and bundle
   * the fonts, and still render on user-agent defaults if the base layer is
   * missing. Package consumers get the base layer through
   * `@polymorph/react-ui`'s root. Vendored consumers get it only because the install writes and
   * imports it. Reading the output cannot catch a gap there. Only a browser
   * reporting its computed styles can.
   *
   * So the three values asserted here are the three the base layer sets, and
   * each has a specific wrong value: `8px` body margin, `content-box`, and the
   * UA serif instead of the theme's family.
   */
  it('computes the vocabulary’s foundation in a browser, not the user agent’s', async () => {
    await openBuiltPage(async (page, failures) => {
      const foundation = await page.evaluate(() => {
        const body = getComputedStyle(document.body)
        const box = document.querySelector('#root div')
        return {
          margin: [body.marginTop, body.marginRight, body.marginBottom, body.marginLeft].join(' '),
          boxSizing: box === null ? null : getComputedStyle(box).boxSizing,
          family: body.fontFamily,
        }
      })

      expect(failures).toEqual([])
      // Not the user agent's 8px, which adds to every layout inside the body.
      expect(foundation.margin).toBe('0px 0px 0px 0px')
      // Not `content-box`, under which a padded, bordered box is wider than its
      // set width.
      expect(foundation.boxSizing).toBe('border-box')
      // Body type is bound to the theme, not the UA serif. `builds with the
      // theme's real fonts` checks this in the bundle. This checks what the page
      // resolved.
      expect(foundation.family).toContain('Plus Jakarta Sans')
      expect(foundation.family).not.toMatch(/Times|^serif$/)
    })
  }, 120_000)
})

/* -------------------------------------------------------------------------- */
/* The accessibility pass                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `axe-core`'s minified build, from this repository's own `node_modules`,
 * injected into the page.
 *
 * The vocabulary's suite (`packages/react-ui/src/laws.test.tsx`) calls
 * `axeCore.run` as a module, because those tests already run *inside* a
 * browser. This test drives a browser from node, at a page built by Vite and
 * served over HTTP, so the audit must run in that page. Injecting the script
 * keeps the same engine. A Playwright integration package would add a
 * dependency to replace one `<script>` tag.
 */
const AXE = resolve(
  dirname(createRequire(resolve(ROOT, 'packages/react-ui/package.json')).resolve('axe-core')),
  'axe.min.js',
)

/**
 * The one rule turned off, with the reason the vocabulary's suite gives.
 *
 * "Elements must meet minimum color contrast ratio thresholds" is WCAG 2.1's
 * luminance ratio. The system's contrast law is APCA, enforced over every
 * preset × mode × lawful pairing in `packages/theme/src/laws.test.ts`. It is a
 * different model with different numbers, and much stricter than this rule.
 * Leaving this rule on would create two contradictory contrast laws, and the
 * gate would enforce the WCAG ratio over the APCA law the system chose.
 *
 * Every other rule stays on, including the two the vocabulary's suite must
 * disable: `region` and `page-has-heading-one`. Those rules are about what a
 * *page* has around its content, and a suite that audits one component at a
 * time cannot satisfy them. This is a real page with one `<main>` and one
 * `<h1>`, so here they apply: a consumer's first screen, built and served, is
 * checked as a page.
 */
const AXE_RULES = { 'color-contrast': { enabled: false } }

/**
 * One more rule is off while a modal is open. Radix hides the page behind a
 * dialog with `aria-hidden`, and that page still contains buttons. The focus
 * trap makes that safe, and axe cannot see the trap. `dialog.test.tsx` tests it
 * directly by tabbing six times and asserting focus never leaves the panel. The
 * vocabulary's own suite makes the same exception for the same reason.
 */
const AXE_RULES_MODAL = { ...AXE_RULES, 'aria-hidden-focus': { enabled: false } }

interface AxeViolation {
  id: string
  help: string
  nodes: { html: string }[]
}

async function audit(page: Playwright.Page, rules: Record<string, unknown>): Promise<string[]> {
  return page.evaluate(async (options) => {
    const axe = (
      window as unknown as {
        axe: {
          run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }>
        }
      }
    ).axe
    const results = await axe.run(document, { rules: options })
    return results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.length} node(s)) — ` +
        `${violation.nodes[0]?.html ?? ''}`,
    )
  }, rules)
}

describe('the built page passes the accessibility gate', () => {
  /**
   * A build cannot show this: a vendored install renders an accessible page in
   * a real browser.
   *
   * Upstream, every fixture in the vocabulary is audited one component at a
   * time. That is a different check. Landmarks, heading order, duplicate ids
   * and the relationships between components exist only on a page, and none of
   * them are visible from inside one component. This test covers the page, with
   * the same engine, at the composition a consumer ships.
   */
  it('has no violations on the page as it loads', async () => {
    await openBuiltPage(async (page, failures) => {
      await page.addScriptTag({ path: AXE })
      expect(await audit(page, AXE_RULES)).toEqual([])
      expect(failures).toEqual([])
    })
  }, 120_000)

  it('has none with the modal open, where the overlay laws apply', async () => {
    await openBuiltPage(async (page, failures) => {
      await page.addScriptTag({ path: AXE })

      // Opened by clicking the trigger, not rendered open. The dialog a consumer
      // ships is the one the trigger opens, and an audit of a static render would
      // miss the aria wiring between them.
      await page.click('#root button')
      await page.waitForSelector('[role="dialog"]')

      expect(await audit(page, AXE_RULES_MODAL)).toEqual([])
      expect(failures).toEqual([])
    })
  }, 120_000)

  it('reports a violation added to the same page, under the same audit', async () => {
    // Zero violations means something only if the audit can find one. An image
    // with no alternative text is the standard failure. It is added to the built
    // page, not to a fixture, so the test shows that *this* engine, run over
    // *this* document, reports it.
    await openBuiltPage(async (page) => {
      await page.addScriptTag({ path: AXE })
      await page.evaluate(() => {
        const host = document.createElement('div')
        host.innerHTML = '<img src="data:," />'
        document.querySelector('main')?.append(host)
      })

      expect((await audit(page, AXE_RULES)).join('\n')).toContain('image-alt')
    })
  }, 120_000)
})

/* -------------------------------------------------------------------------- */
/* The phone                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * "No horizontal viewport scroll, no clipped control", measured instead of
 * checked by eye. This is the proof lane's `fitsThePhone` (proof/run.mjs),
 * pointed at the built scratch app instead of the workbench.
 *
 * Three measurements. The document does not scroll sideways. No visible
 * element runs past either edge. An element that *pans* (a Table, which the
 * layout rules allow to overflow inside its own port) must declare it with
 * `data-overflowing`, or it is a layout fault like any other. Anything inside a
 * pannable port is reachable by panning, so it is not measured against the
 * viewport.
 */
async function fitsThePhone(page: Playwright.Page): Promise<string[]> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const width = doc.clientWidth
    const faults: string[] = []

    if (doc.scrollWidth > width + 1) {
      faults.push(`the document scrolls sideways — ${doc.scrollWidth}px of content in ${width}px`)
    }

    const PANS = new Set(['auto', 'scroll'])
    const visible = (node: Element) =>
      node.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
        contentVisibilityAuto: true,
      })
    const name = (node: Element) => {
      const classes =
        typeof node.className === 'string' && node.className.trim().length > 0
          ? `.${node.className.trim().split(/\s+/).join('.')}`
          : ''
      return `${node.tagName.toLowerCase()}${classes}`.slice(0, 90)
    }

    const over: string[] = []
    for (const node of document.querySelectorAll('*')) {
      if (!visible(node)) continue
      const style = getComputedStyle(node)

      if (PANS.has(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
        if (!node.hasAttribute('data-overflowing')) {
          over.push(
            `${name(node)} pans sideways — ${node.scrollWidth}px in ${node.clientWidth}px, and it is not a table`,
          )
        }
        // Content inside a pannable port is reachable by panning, which is how
        // the layout rules handle a table. The port itself was measured above.
        continue
      }

      let ported = false
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (PANS.has(getComputedStyle(parent).overflowX)) {
          ported = true
          break
        }
      }
      if (ported) continue

      const box = node.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      if (box.right > width + 1) {
        over.push(`${name(node)} runs past the right edge — ${box.right.toFixed(1)} > ${width}`)
      } else if (box.left < -1) {
        over.push(`${name(node)} starts off the left edge — ${box.left.toFixed(1)}`)
      }
    }

    faults.push(...over.slice(0, 6))
    if (over.length > 6) faults.push(`…and ${over.length - 6} more elements over an edge`)
    return faults
  })
}

describe('the built page fits a phone', () => {
  /**
   * 375×812, the proof lane's viewport, on the app a consumer would ship.
   *
   * Upstream, the vocabulary is measured at this width over the workbench's
   * scenes. This test checks something different, which only the installer can
   * answer: that everything the *install* brings (the base layer, the theme's
   * type scale, the vendored components' own CSS) still produces a page that
   * fits, in a repository without any of the workbench's CSS.
   */
  it('puts nothing over an edge, closed or with the modal open', async () => {
    await openBuiltPage(
      async (page, failures) => {
        expect(await fitsThePhone(page), 'the page as it loads').toEqual([])

        // At 375 the panel fills the screen, which is where a dialog is most
        // likely to overflow. It is the one component whose width is not set by
        // the column it sits in.
        await page.click('#root button')
        await page.waitForSelector('[role="dialog"]')
        expect(await fitsThePhone(page), 'the page with the modal open').toEqual([])

        expect(failures).toEqual([])
      },
      { width: 375, height: 812 },
    )
  }, 120_000)

  it('reports a box wider than the phone as a fault, with its measurement', async () => {
    // The same measurement, on the same page, with an element over the edge. A
    // check that returns an empty list for every input checks nothing.
    await openBuiltPage(
      async (page) => {
        await page.evaluate(() => {
          const wide = document.createElement('div')
          wide.style.width = '900px'
          wide.style.height = '10px'
          document.querySelector('main')?.append(wide)
        })

        const faults = await fitsThePhone(page)
        expect(faults.join('\n')).toContain('runs past the right edge')
        expect(faults.join('\n')).toContain('the document scrolls sideways')
      },
      { width: 375, height: 812 },
    )
  }, 120_000)
})

describe('the red rules run in the scratch app', () => {
  it('passes clean application code', () => {
    const result = run('npx', ['eslint', 'src/App.tsx'])
    expect(result.output, 'a screen of pure composition should be lawful').toBe('')
    expect(result.code).toBe(0)
  }, 120_000)
  it('goes red on a style decision in application code', () => {
    write(
      app,
      'src/Seeded.tsx',
      `export function Seeded() {\n  return <div style={{ padding: 12, color: 'rebeccapurple' }} />\n}\n`,
    )

    const result = run('npx', ['eslint', 'src/Seeded.tsx'])
    expect(result.code).toBe(1)
    expect(result.output).toContain('polymorph/no-raw-styles')
    // The report names the step, not only the family (`p={…}`), because the
    // install wrote the theme's values into the config the rule reads.
    expect(result.output).toContain('`<Stack p={4}>`')

    rmSync(resolve(app, 'src/Seeded.tsx'))
  }, 120_000)
  it('lets the same decision through inside the zone the install vendored', () => {
    // The rule that went red above names rung 4 as its highest answer. Rung 4
    // is a `<Bespoke>`, imported from the vendored tree, not from a package root
    // the consumer does not have. The rules recognise the zone by its element
    // name, so the vendored copy is a declared zone like the original, and
    // `pnpm inventory` would count it the same way.
    write(
      app,
      'src/Zone.tsx',
      `import { Bespoke } from './polymorph/exceptions/Bespoke'

export function Zone() {
  return (
    <Bespoke reason="A promo illustration the vocabulary has no shape for.">
      <div style={{ padding: 'var(--pm-space-4)', background: 'var(--pm-accent-subtle)' }} />
    </Bespoke>
  )
}
`,
    )

    const result = run('npx', ['eslint', 'src/Zone.tsx'])
    expect(result.output, 'a declared zone is the lawful home for a style decision').toBe('')
    expect(result.code).toBe(0)

    rmSync(resolve(app, 'src/Zone.tsx'))
  }, 120_000)
  it('goes red on a stylesheet in application code', () => {
    write(app, 'src/seeded.css', '.thing {\n  transition: opacity 200ms ease;\n}\n')

    const result = run('npx', ['stylelint', 'src/seeded.css'])
    // Stylelint exits 2 for lint problems. It exits 1 for a usage error and 78
    // for a bad config, which are also non-zero but are not this rule firing.
    expect(result.code).toBe(2)
    expect(result.output).toContain('polymorph/no-motion-outside-vocabulary')

    rmSync(resolve(app, 'src/seeded.css'))
  }, 120_000)
  it('goes red on a stylesheet that re-makes the theme’s decisions', () => {
    // The vendored theme sheet does each of these, and passes (below). The
    // application's own stylesheet may do none of them.
    write(
      app,
      'src/register.css',
      ':root {\n  font-size: 81.25%;\n}\n' +
        "[data-palette='orchid'] {\n  --pm-accent-bg: #0b7a75;\n}\n" +
        "[data-member='button']:hover {\n  background: var(--pm-accent-bg);\n}\n",
    )

    const result = run('npx', ['stylelint', 'src/register.css'])
    expect(result.code).toBe(2)
    for (const rule of [
      'polymorph/no-root-font-size',
      'polymorph/no-app-theme-selectors',
      'polymorph/no-token-declarations',
      'polymorph/no-app-member-selectors',
    ]) {
      expect(result.output).toContain(rule)
    }

    rmSync(resolve(app, 'src/register.css'))
  }, 120_000)
  it('goes red on a token that does not exist, and names the one that does', () => {
    /*
     * The vocabulary-integrity law, on the consumer's own stylesheet outside
     * the vendored tree. Stylelint governs every `.css` file in the app, so a
     * token read from any of them is checked. (Such a file does not come from a
     * `<Bespoke>` zone: a zone styles itself through `style` props, and
     * `no-app-css` has no zone exemption.)
     *
     * This is the failure the law exists for. `--pm-accnet-bg` resolves to
     * nothing, and CSS handles an unresolvable custom property by dropping the
     * *whole declaration*. The padding beside it disappears too, on every theme,
     * and the element renders as if it had no styles. No other installed rule
     * catches it: the name has the right prefix, so `token-values-only` is
     * satisfied.
     *
     * Upstream this is a repository law (`token-references.test.ts`) that walks
     * a corpus and cannot be installed elsewhere. What is installed is this
     * rule, and the install writes the token list it checks against into
     * `polymorph.stylelint.js`.
     */
    write(
      app,
      'src/zone.css',
      '.zone {\n  color: var(--pm-accnet-bg);\n  padding: var(--pm-space-4);\n}\n',
    )

    const result = run('npx', ['stylelint', 'src/zone.css'])
    expect(result.code).toBe(2)
    expect(result.output).toContain('polymorph/no-ghost-tokens')
    expect(result.output).toContain('--pm-accnet-bg')
    // The message offers the correction, because no ladder rung applies to a
    // name that resolves to nothing.
    expect(result.output).toContain('Did you mean `--pm-accent-bg`?')
    // The real token beside it is not reported, or the rule would be unusable.
    expect(result.output).not.toContain('var(--pm-space-4)')

    rmSync(resolve(app, 'src/zone.css'))
  }, 120_000)
  it('contains the token list it checks against, written by the install', () => {
    // The list is data the *registry* published. It is written into the
    // generated config because at lint time nothing in the consumer's repository
    // can compute it: the vendored theme data is values, and the module that
    // turns them into a sheet is TypeScript.
    const config = read(app, 'polymorph.stylelint.js')
    expect(config).toContain("'--pm-accent-bg'")
    expect(config).toContain("'--pm-space-4'")
    expect(config).toContain('[RULE_NAMES.noGhostTokens]: [true, { tokens: TOKENS }]')
    expect(config).toContain('polymorph update')
    // Every property the vocabulary's own stylesheets read is in it. Otherwise
    // the vendored tree would fail on its own CSS as soon as it was linted.
    expect(config.match(/'--pm-[a-z0-9-]+'/g)?.length ?? 0).toBeGreaterThan(150)

    // Beside it, the installed theme's values, read from the sheet the install
    // compiled, which `token-values-only` and the ESLint half's raw-value rules
    // compare a raw value with to name the nearest token.
    expect(config).toContain('[RULE_NAMES.tokenValuesOnly]: [true, { values: VALUES }]')
    expect(config).toMatch(/'--pm-accent-bg': '[^']+',/)
    expect(read(app, 'polymorph.eslint.js')).toContain("['error', { values: VALUES }]")
  })
  it('allows design decisions in the vendored vocabulary', () => {
    // The other half of "open code, closed usage", which a rule applied
    // everywhere would break. The vendored tree is the vocabulary now, and a
    // component that could not declare a transition or use a token would be
    // useless.
    const result = run('npx', ['stylelint', 'src/polymorph/**/*.css'])
    expect(result.output, 'the vendored CSS is lawful under the rules that travelled').toBe('')
    expect(result.code).toBe(0)
  }, 120_000)
  it('holds the vendored tree to the boundary it was vendored under', () => {
    const path = 'src/polymorph/controls/Escape.tsx'
    write(
      app,
      path,
      `import { thing } from '../../elsewhere/thing'\n\nexport const escape = thing\n`,
    )

    const result = run('npx', ['eslint', path])
    expect(result.code).toBe(1)
    expect(result.output).toContain('polymorph/vendorable-imports')

    rmSync(resolve(app, path))
  }, 120_000)
})

/* -------------------------------------------------------------------------- */
/* The second day                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `polymorph update`, run in the app that was actually installed, against a
 * vocabulary that has actually changed, followed by another build.
 *
 * `install.test.ts` tests the *semantics* of an update on a synthetic consumer:
 * the consumer's edit survives, our change is applied, a divergence is
 * refused. This test asks what only a real install can answer: **does the app
 * still build afterwards?** An update that re-vendors correctly but leaves a
 * tree that no longer compiles does as much damage as one that overwrote the
 * consumer's file.
 *
 * ### What "upstream moved" is made of
 *
 * A second source tree: a copy of everything an install reads
 * (`packages/react-ui/src`, `packages/recipes/src`, `design/systems`,
 * `design/palettes`), with one component's stylesheet edited.
 * `install.test.ts` uses the same shape. It is the only way to express "our
 * side changed" without editing this repository during a running test.
 *
 * The *registry* is deliberately the same object. A registry is a catalogue
 * (names, paths, props, closures, the token list), and a comment added to a
 * stylesheet changes none of them. Rebuilding it over the changed tree returns
 * a byte-identical document (`registry.test.ts` builds it twice on an
 * unchanged tree and asserts exactly that). An upstream edit changes the
 * file's *bytes*, and `diff` and `update` compare the bytes against the hash
 * the manifest recorded. Rebuilding the catalogue would add nothing, because
 * the catalogue does not describe this change.
 */
describe('after install: the vocabulary changes and the app updates', () => {
  /** A component stylesheet the install wrote, edited on our side. */
  const OURS = 'packages/recipes/src/controls/button.module.css'
  const VENDORED_OURS = 'src/polymorph/controls/button.module.css'
  const UPSTREAM_MARK = '/* upstream: a later publish moved this file */'

  /** A vendored file the consumer edited, which upstream has not touched. */
  const MINE = 'src/polymorph/layout/Stack.tsx'
  const MY_MARK = '// mine: the gap this app actually wants'

  let upstream: string
  let lines: string[]
  let outcome: { code: number }
  /** What the manifest recorded for the consumer's file when it was installed. */
  let installedHash: string

  beforeAll(() => {
    upstream = mkdtempSync(resolve(tmpdir(), 'polymorph-upstream-'))
    for (const directory of [
      'packages/react-ui/src',
      'packages/recipes/src',
      'design/systems',
      'design/palettes',
    ]) {
      cpSync(resolve(ROOT, directory), resolve(upstream, directory), { recursive: true })
    }

    // Our side changes.
    const ours = resolve(upstream, OURS)
    writeFileSync(ours, `${readFileSync(ours, 'utf8')}\n${UPSTREAM_MARK}\n`)

    // Their side changes too, on a different file. Changes on both sides are
    // what make an update risky instead of a plain download.
    const mine = resolve(app, MINE)
    writeFileSync(mine, `${readFileSync(mine, 'utf8')}\n${MY_MARK}\n`)
    installedHash = readManifest(app)?.files[MINE]?.hash ?? ''

    lines = []
    outcome = cli({ root: app, source: upstream, registry, out: (line) => lines.push(line) }, [
      'update',
    ])
  }, 120_000)

  afterAll(() => {
    if (upstream) rmSync(upstream, { recursive: true, force: true })
  })

  it('reports what it did, and does not fail because it kept a file', () => {
    expect(outcome.code).toBe(0)
    const output = lines.join('\n')
    expect(output).toContain('updated')
    expect(output).toContain(`kept yours ${MINE}`)
    // Not a silent skip. The output tells the consumer the file was theirs, and
    // how to see both sides.
    expect(output).toContain('Those are files you have edited')
    expect(output).toContain('`polymorph diff` shows which side moved')
  })

  it('applied our change', () => {
    expect(read(app, VENDORED_OURS)).toContain(UPSTREAM_MARK)
  })

  it('kept theirs intact', () => {
    const mine = read(app, MINE)
    expect(mine).toContain(MY_MARK)
    // It is still the file they edited, not ours with their line appended.
    expect(mine).toContain('export function Stack')
  })

  it('records both in the manifest, so the next diff still tells them apart', () => {
    const manifest = readManifest(app)

    // Ours: re-recorded with what is now on disk, so the next diff reports `clean`.
    expect(manifest?.files[VENDORED_OURS]?.hash).toBe(
      digest(readFileSync(resolve(app, VENDORED_OURS))),
    )
    expect(manifest?.files[VENDORED_OURS]?.source).toBe(OURS)

    // Theirs: still the hash of what we installed. Re-recording the file we
    // just refused to write would make the installer forget the file is theirs
    // and overwrite it on the *next* update.
    expect(manifest?.files[MINE]?.hash).toBe(installedHash)
    expect(manifest?.files[MINE]?.hash).not.toBe(digest(readFileSync(resolve(app, MINE))))

    const states = new Map(
      diffInstall(app, upstream, registry).files.map((file) => [file.path, file.state]),
    )
    expect(states.get(VENDORED_OURS)).toBe('clean')
    expect(states.get(MINE)).toBe('edited')
  })

  it('rewrote the generated config, including the token list', () => {
    // Generated files are outputs, rewritten on every install and update. The
    // token list the ghost rule checks against is one of them, so a list written
    // at install time does not go stale and report false failures.
    const config = read(app, 'polymorph.stylelint.js')
    expect(config).toContain('[RULE_NAMES.noGhostTokens]: [true, { tokens: TOKENS }]')
    expect(config.match(/'--pm-[a-z0-9-]+'/g)?.length ?? 0).toBeGreaterThan(150)
    // And the values, read again from the recompiled sheet.
    expect(config).toMatch(/'--pm-space-4': '[^']+',/)
  })

  it('leaves an app that still builds', () => {
    // `install.test.ts` cannot check this. Everything above would also pass for
    // an update that left a tree which no longer compiles.
    rmSync(resolve(app, 'dist'), { recursive: true, force: true })
    const result = run('npx', ['vite', 'build', '--logLevel', 'warn'])
    expect(result.code, result.output).toBe(0)
    expect(existsSync(resolve(app, 'dist/index.html'))).toBe(true)
  }, 120_000)

  it('leaves the vendored tree lawful under the installed rules', () => {
    // Including the file we just re-vendored and the one we did not.
    const result = run('npx', ['stylelint', 'src/polymorph/**/*.css'])
    expect(result.output).toBe('')
    expect(result.code).toBe(0)
  }, 120_000)
})
