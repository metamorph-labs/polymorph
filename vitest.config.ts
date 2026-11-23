import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import solid from 'vite-plugin-solid'
import { configDefaults, defineConfig } from 'vitest/config'

import { angularPlugins } from './packages/angular-ui/vitest.plugins'
import { ANGULAR_HOST, reachThroughPlugin } from './packages/elements-ui/reach-through'

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * The projects that run by default (`docs/verification.md`):
 *  - `logic` — node, for pure logic: the theme, the rules, the registry, the
 *    tools, the run-time screen core, the shells' and native packages'
 *    file-reading laws, and the eval
 *  - `core` / `ui` — real chromium via Playwright, because Radix overlays and
 *    motion are unreliable in jsdom. `core` runs the tests of
 *    `@polymorph/engine` and `@polymorph/react`; `ui` runs the vocabulary's,
 *    `@polymorph/react-ui`.
 *  - `vue` — the same chromium, for the Vue vocabulary's laws
 *    (`@polymorph/vue-ui`).
 *  - `solid` — the same chromium, for the Solid vocabulary's laws
 *    (`@polymorph/solid-ui`).
 *  - `svelte` — the same chromium, for the Svelte vocabulary's laws
 *    (`@polymorph/svelte-ui`).
 *  - `angular` — the same chromium, for the Angular vocabulary's laws and its
 *    foundation's Zag adapter (`@polymorph/angular-ui`, `@polymorph/angular`).
 *  - `elements` — the same chromium, for the custom elements' laws and the
 *    bridge's tests (`@polymorph/elements-ui`, over `@polymorph/elements`).
 *  - `hosted` — the same chromium, for the workbench's two components from
 *    other libraries (`apps/workbench/src/hosted`).
 *
 * The browser projects are rooted at a package that installs React, so Vite's
 * dep optimizer resolves react from that package's `node_modules` rather than
 * the (react-free) repo root.
 *
 * `PM_BROWSER_MATRIX=1` widens the browser projects into a matrix: each
 * project's `-firefox` and `-webkit` twin joins the list (`core-firefox`,
 * `ui-webkit`, `svelte-firefox` and so on).
 * They are built from the same factories, so a browser engine's project cannot
 * drift from the chromium project it mirrors. The matrix is opt-in because it
 * runs the browser suite twice more, which is not part of the inner loop.
 * `pnpm test` and `pnpm gate` stay chromium-only and fast, and
 * `pnpm gate:engines` sets the variable and runs each engine's projects
 * (`scripts/gate-engines.mjs`, `docs/verification.md`). The engines need a
 * one-time `pnpm exec playwright install firefox webkit`.
 */
type Engine = 'chromium' | 'firefox' | 'webkit'

const MATRIX_ENGINES: Engine[] = ['firefox', 'webkit']

/** The workbench's browser tests, which the `hosted` project runs and `logic` leaves alone. */
const HOSTED_TESTS = 'src/hosted/**/*.test.tsx'

/** The chromium project keeps its bare name. A matrix engine's project adds the engine name. */
const named = (base: string, engine: Engine) => (engine === 'chromium' ? base : `${base}-${engine}`)

const browser = (engine: Engine) => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  /*
   * Desktop, explicitly. Vitest's default browser viewport is 414×896, a phone
   * size. A suite running there implicitly would test every archetype in its
   * small-viewport layout, while the galleries and the proof shots show the
   * wide one. Only one of the two layouts would be under test.
   *
   * A test that needs the narrow layout requests it with `page.viewport(...)`.
   * The breakpoint is a claim, so crossing it should be a visible line of test
   * code.
   */
  viewport: { width: 1280, height: 800 },
  /*
   * The browser server on an explicit address. `localhost` resolves to ::1
   * first on Ubuntu 26.04 and to 127.0.0.1 first on macOS. The server can then
   * listen on one loopback address while the browser connects to the other, and
   * a test file fails to import from a server that is running. A literal
   * address leaves nothing to resolve.
   */
  api: { host: '127.0.0.1' },
  instances: [{ browser: engine }],
})

/*
 * The React browser projects. `core` covers what a consumer installs beneath
 * the components: `@polymorph/engine` (the motion engine and the conventions)
 * and `@polymorph/react` (the icon gateway, the presence components and the
 * control hook). `ui` covers `packages/react-ui`, the components and the CSS
 * they compose. The other frameworks' projects follow below.
 */
/*
 * Chromium is the only engine for which Playwright provides focus emulation,
 * so it is the only one where every parallel test iframe behaves as focused.
 * Firefox and webkit share one real focus, and parallel files take it from
 * each other mid-test. A key pressed after `element.focus()` goes nowhere, a
 * Radix focus scope dismisses the popover it just opened, and toast timers
 * pause because the window reports itself blurred. Measured: nearly every
 * firefox failure of that kind disappears when files run one at a time.
 * Running files serially is the cost of a second real engine. The chromium
 * projects keep their parallelism, so the default lane is unaffected.
 */
const serialOffChromium = (engine: Engine) =>
  engine === 'chromium' ? {} : { fileParallelism: false }

/*
 * The workbench's hosted components (`apps/workbench/src/hosted`): a map and a
 * rich-text editor another library draws, each inside a `<ThirdParty>`
 * boundary. Their tests need a real browser, because the map is drawn from
 * computed custom properties and the editor is a contenteditable. The project
 * is rooted at the app, which is the only package that installs the two
 * libraries, so none of them is a dependency of a polymorph package. The
 * libraries are listed up front for the reason the `ui` project lists its own.
 */
const hostedProject = (engine: Engine) => ({
  root: dir('./apps/workbench'),
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    include: [
      'leaflet',
      '@tiptap/core',
      '@tiptap/starter-kit',
      '@testing-library/react',
      'axe-core',
      // The members beside the hosted components bring these.
      '@polymorph/react-ui > react-aria',
      '@polymorph/react-ui > react-stately',
    ],
  },
  test: {
    name: named('hosted', engine),
    include: [HOSTED_TESTS],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

const coreProject = (engine: Engine) => ({
  // Rooted at `packages/react`, which installs React; `packages/engine` installs
  // none. Test files are collected from both packages.
  root: dir('./packages/react'),
  // The same define as the ui factory below. The whole browser suite can read
  // the browser engine, so a declared skip works the same in every package.
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  // Listed up front for the reason the `ui` project lists its own. The theme
  // hook's hydration test renders with the server renderer and hydrates with
  // the client's.
  optimizeDeps: { include: ['react-dom/client', 'react-dom/server'] },
  test: {
    name: named('core', engine),
    dir: dir('./packages'),
    include: ['{engine,react}/src/**/*.test.{ts,tsx}'],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

const uiProject = (engine: Engine) => ({
  root: dir('./packages/react-ui'),
  /*
   * The browser engine, visible to the suite. A test may not branch on it to pass. It
   * may only declare a skip on a limit of the test tooling, and
   * `packages/conformance/src/engines.ts` names each limit once, with its reason.
   * A declared skip keeps an engine's lane green and meaningful. A lane that is
   * permanently red for a known cause teaches everyone to stop reading it.
   */
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  plugins: [react()],
  // `motion/react` and `@testing-library/react` are pre-bundled separately
  // by the browser dep optimizer, and each would carry its own React. That
  // shows up as a null `useContext` when a motion component renders inside a
  // testing-library tree.
  resolve: { dedupe: ['react', 'react-dom'] },
  /*
   * Listed up front rather than discovered mid-run. A dependency the optimizer
   * first meets during a test triggers a second optimize pass, and the two
   * passes produce two React copies. That shows up as `useSyncExternalStore`
   * reading a null dispatcher the first time a React Aria hook runs inside a
   * testing-library tree. Listing these packages lets one pass handle them all.
   */
  optimizeDeps: {
    include: [
      'react-aria',
      'react-stately',
      '@internationalized/date',
      '@radix-ui/react-visually-hidden',
      // A member's test that renders on a server and hydrates imports both renderers.
      'react-dom/client',
      'react-dom/server',
    ],
  },
  test: {
    name: named('ui', engine),
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

/*
 * The Vue vocabulary (`packages/vue-ui`): its laws over the generated
 * single-file components, in the same chromium, rooted at the package that
 * installs Vue so the dep optimizer resolves Vue and Zag from there.
 */
const vueProject = (engine: Engine) => ({
  root: dir('./packages/vue-ui'),
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  plugins: [vue()],
  resolve: { dedupe: ['vue'] },
  optimizeDeps: {
    include: [
      '@zag-js/vue',
      '@zag-js/accordion',
      '@zag-js/carousel',
      '@zag-js/checkbox',
      '@zag-js/collapsible',
      '@zag-js/combobox',
      '@zag-js/dialog',
      '@zag-js/hover-card',
      '@zag-js/menu',
      '@zag-js/number-input',
      '@zag-js/popover',
      '@zag-js/radio-group',
      '@zag-js/select',
      '@zag-js/slider',
      '@zag-js/switch',
      '@zag-js/tabs',
      '@zag-js/tooltip',
      // The server renderer, which the foundation's and the fields' server-render tests run.
      'vue/server-renderer',
      '@testing-library/dom',
      'axe-core',
    ],
  },
  test: {
    name: named('vue', engine),
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

/*
 * The Solid vocabulary (`packages/solid-ui`): its laws over the generated
 * components, in the same chromium, rooted at the package that installs Solid
 * so the dep optimizer resolves Solid and Zag from there. Solid's plugin
 * compiles the members' JSX and the foundation's (`packages/solid`), which the
 * vocabulary imports as source.
 */
const solidProject = (engine: Engine) => ({
  root: dir('./packages/solid-ui'),
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  plugins: [solid({ hot: false })],
  resolve: { dedupe: ['solid-js'] },
  optimizeDeps: {
    include: [
      '@zag-js/solid',
      // The foundation's own copy of Zag's Solid adapter imports these directly.
      '@polymorph/solid > @zag-js/core',
      '@polymorph/solid > @zag-js/utils',
      '@zag-js/accordion',
      '@zag-js/carousel',
      '@zag-js/checkbox',
      '@zag-js/collapsible',
      '@zag-js/color-picker',
      '@zag-js/combobox',
      '@zag-js/date-picker',
      '@zag-js/dialog',
      '@zag-js/hover-card',
      '@zag-js/menu',
      '@zag-js/number-input',
      '@zag-js/popover',
      '@zag-js/radio-group',
      '@zag-js/scroll-area',
      '@zag-js/select',
      '@zag-js/slider',
      '@zag-js/switch',
      '@zag-js/tabs',
      '@zag-js/tooltip',
      '@testing-library/dom',
      'axe-core',
    ],
  },
  test: {
    name: named('solid', engine),
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

/*
 * The Svelte vocabulary (`packages/svelte-ui`): its laws over the generated
 * components, in the same chromium, rooted at the package that installs Svelte
 * so the dep optimizer resolves Svelte and Zag from there. Svelte's plugin
 * compiles the members and the foundation's components and rune modules
 * (`packages/svelte`), which the vocabulary imports as source, with the
 * vocabulary's compiler options (`packages/svelte-ui/svelte.config.js`).
 */
const svelteProject = (engine: Engine) => ({
  root: dir('./packages/svelte-ui'),
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  plugins: [svelte({ configFile: dir('./packages/svelte-ui/svelte.config.js') })],
  resolve: { dedupe: ['svelte'] },
  optimizeDeps: {
    include: [
      '@zag-js/svelte',
      '@zag-js/accordion',
      '@zag-js/carousel',
      '@zag-js/checkbox',
      '@zag-js/collapsible',
      '@zag-js/color-picker',
      '@zag-js/combobox',
      '@zag-js/date-picker',
      '@zag-js/dialog',
      '@zag-js/hover-card',
      '@zag-js/menu',
      '@zag-js/number-input',
      '@zag-js/popover',
      '@zag-js/radio-group',
      '@zag-js/scroll-area',
      '@zag-js/select',
      '@zag-js/slider',
      '@zag-js/switch',
      '@zag-js/tabs',
      '@zag-js/tooltip',
      '@testing-library/dom',
      'axe-core',
    ],
  },
  test: {
    name: named('svelte', engine),
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

/*
 * The Angular vocabulary (`packages/angular-ui`) and its foundation
 * (`packages/angular`): their laws over the generated standalone components and
 * the foundation's Zag adapter, in the same chromium, rooted at the vocabulary,
 * whose install holds Angular, its compiler and TypeScript 6.0, which the
 * compiler requires. The compiler plugin is loaded from that install
 * (`packages/angular-ui/vitest.plugins.ts`) and compiles the members ahead of
 * time, their templates type-checked as an application's are.
 */
const angularProject = (engine: Engine) => ({
  root: dir('./packages/angular-ui'),
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  // The recipes as the Angular build compiles them: each selector that reads a parent or a
  // sibling also matches through a member's host (`ANGULAR_HOST` in
  // `packages/elements-ui/reach-through.ts`).
  plugins: [reachThroughPlugin(ANGULAR_HOST), ...angularPlugins()],
  resolve: { dedupe: ['@angular/core', '@angular/common', '@angular/platform-browser'] },
  optimizeDeps: {
    include: [
      '@angular/compiler',
      '@zag-js/accordion',
      '@zag-js/carousel',
      '@zag-js/checkbox',
      '@zag-js/collapsible',
      '@zag-js/color-picker',
      '@zag-js/combobox',
      '@zag-js/date-picker',
      '@zag-js/dialog',
      '@zag-js/hover-card',
      '@zag-js/menu',
      '@zag-js/number-input',
      '@zag-js/popover',
      '@zag-js/radio-group',
      '@zag-js/scroll-area',
      '@zag-js/select',
      '@zag-js/slider',
      '@zag-js/switch',
      '@zag-js/tabs',
      '@zag-js/tooltip',
      '@testing-library/dom',
      'axe-core',
    ],
  },
  test: {
    name: named('angular', engine),
    dir: dir('./packages'),
    include: ['{angular,angular-ui}/src/**/*.test.ts'],
    setupFiles: [dir('./packages/angular-ui/src/test-setup.ts')],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

/*
 * The custom elements (`packages/elements-ui`): their laws over the generated
 * definitions and element-form fixtures, the parity law against the Solid
 * shell, and the bridge's tests (`src/bridge`), in the same chromium. Rooted
 * at the vocabulary, which installs the Solid vocabulary the elements render;
 * Solid's plugin compiles the Solid members, foundation and fixtures the
 * elements import as source. Zag's machines are the Solid vocabulary's
 * dependencies, so the optimizer reaches them through it.
 */
const elementsProject = (engine: Engine) => ({
  root: dir('./packages/elements-ui'),
  define: { __PM_ENGINE__: JSON.stringify(engine) },
  // The recipes as the elements' build ships them: each selector that reads a parent or a
  // sibling also matches through a host (`packages/elements-ui/reach-through.ts`). The Solid
  // members the parity law renders beside the elements read the same stylesheets, and the
  // added forms match only through a host, so they render as the Solid project renders them.
  plugins: [reachThroughPlugin(), solid({ hot: false })],
  resolve: { dedupe: ['solid-js'] },
  optimizeDeps: {
    include: [
      '@polymorph/solid-ui > @zag-js/solid',
      '@polymorph/solid > @zag-js/core',
      '@polymorph/solid > @zag-js/utils',
      '@polymorph/solid-ui > @zag-js/accordion',
      '@polymorph/solid-ui > @zag-js/carousel',
      '@polymorph/solid-ui > @zag-js/checkbox',
      '@polymorph/solid-ui > @zag-js/collapsible',
      '@polymorph/solid-ui > @zag-js/color-picker',
      '@polymorph/solid-ui > @zag-js/combobox',
      '@polymorph/solid-ui > @zag-js/date-picker',
      '@polymorph/solid-ui > @zag-js/dialog',
      '@polymorph/solid-ui > @zag-js/hover-card',
      '@polymorph/solid-ui > @zag-js/menu',
      '@polymorph/solid-ui > @zag-js/number-input',
      '@polymorph/solid-ui > @zag-js/popover',
      '@polymorph/solid-ui > @zag-js/radio-group',
      '@polymorph/solid-ui > @zag-js/scroll-area',
      '@polymorph/solid-ui > @zag-js/select',
      '@polymorph/solid-ui > @zag-js/slider',
      '@polymorph/solid-ui > @zag-js/switch',
      '@polymorph/solid-ui > @zag-js/tabs',
      '@polymorph/solid-ui > @zag-js/tooltip',
      '@testing-library/dom',
      'axe-core',
    ],
  },
  test: {
    name: named('elements', engine),
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    ...serialOffChromium(engine),
    browser: browser(engine),
  },
})

export default defineConfig({
  test: {
    /**
     * Half the cores, based on measurement.
     *
     * Vitest's default is one worker per core minus one (nine on a ten-core
     * machine), and the suite is oversubscribed at that level. Each extra
     * worker re-imports the substrate and, in the browser projects, boots
     * another chromium. Past a point the machine spends more on switching
     * between them than the parallelism gains. Total CPU time shows this, and it
     * is not affected by other load on the machine. Total user time rises
     * steadily with the worker count (197s at 4, 205s at 6, 217s at 8, 222s at
     * the default), while wall time gets worse over the same range. Work that
     * appears only when workers are added is contention, not testing.
     *
     * A fraction rather than a number, on purpose. `4` was the fastest setting
     * measured on a ten-core machine, but that result is specific to the
     * machine. Pinning it would leave two thirds of a thirty-two-core CI machine
     * idle. `'50%'` keeps the tested ratio and scales with the hardware.
     */
    maxWorkers: '50%',
    /**
     * Coverage is scoped to the `logic` project (`pnpm test:coverage` runs
     * `--project logic --coverage`) on purpose. The v8 provider collects from a
     * browser only over CDP, a chromium-only protocol. The firefox and webkit
     * lanes of the browser matrix can never report, so a threshold over the
     * browser projects would mean different things depending on which engine
     * ran. The browser projects are gated by the law suite itself.
     *
     * Thresholds only go up. Each is the coverage measured when it was last
     * raised, rounded down to the whole percent. Raise them when real coverage
     * rises. Never lower them to admit a regression.
     */
    coverage: {
      provider: 'v8',
      include: ['packages/{theme,rules,registry,cli,mcp,spec,screen}/src/**'],
      reporter: ['text', 'html'],
      // The measured coverage behind these thresholds: statements 89.28%,
      // branches 81.17%, functions 94.36%, lines 91.69%.
      thresholds: {
        statements: 89,
        branches: 81,
        functions: 94,
        lines: 91,
      },
    },
    projects: [
      {
        test: {
          name: 'logic',
          /*
           * `node`, not `jsdom`, based on measurement.
           *
           * This is the "pure logic" project: schema validation, colour
           * derivation, lint rules under RuleTester, the registry generator,
           * subprocess acceptance. Under jsdom it would pay for a document per
           * file regardless, measured at 53.9s of cumulative `environment`
           * across 54 files. That is the largest line in its budget and more
           * than the whole `ui` project's wall time.
           *
           * Only a handful of files read a DOM (the theme's browser half,
           * `packages/theme/src/runtime.test.ts`, and some workbench tests),
           * and each asks for jsdom by docblock. An audit of the rest supports
           * this choice. Every other apparent DOM user contains DOM text, not
           * DOM calls: source written into a fixture file, a `code:` string
           * passed to RuleTester, or a `page.evaluate` body that runs in
           * Playwright's real browser and never in the environment named here.
           *
           * The risk is a silent pass, not a failure. A file that needed a
           * document would take the `typeof document === 'undefined'` branch
           * and pass while asserting nothing. That is why the opt-in is per
           * file and explained in place, and why a new test that touches the
           * DOM adds the docblock rather than moving the project to jsdom.
           */
          environment: 'node',
          /*
           * Context reuse, measured: ~23% less wall time and ~37% less CPU for
           * this project's run, and the gain holds under heavier outside load.
           * The pollution this setting can introduce is across files (a module
           * registry surviving between files). The right check for that is
           * file-order shuffle, which passes across seeds here. Within-file
           * shuffle is the wrong check: it fails the same way on the stock
           * config, because two files are deliberate pipelines (state produced
           * in beforeAll and consumed later in the same file), which isolation
           * settings never affect. The browser projects keep full isolation,
           * because the parked-pointer setup (test-setup.ts) depends on
           * per-file state.
           */
          isolate: false,
          // Relay's own logic is included too. The screens are vocabulary and
          // are covered by the law tests, but which tickets a filter keeps is
          // application logic, and it can be wrong like any other.
          include: [
            'packages/{theme,rules,registry,cli,mcp,spec,screen}/src/**/*.test.ts',
            // The packaging laws and the scratch-app acceptance test: node tests
            // about files on disk. Kept out of each package's `src/` so a browser
            // project does not claim them. The `pnpm new:member` generator test
            // is here for the same reason: it writes files and edits four lists,
            // which needs no browser.
            'packages/{engine,react,rules,cli,mcp,spec,screen,conformance,react-ui,vue,vue-ui,solid,solid-ui,svelte,svelte-ui,angular,angular-ui,elements,elements-ui}/*.test.ts',
            // The member descriptions and the generators that write the shells from them.
            'packages/shells/src/**/*.test.ts',
            // `.tsx` for the composer's renderer law. A test of React output is
            // written in JSX, and asks for jsdom by docblock like every
            // DOM-touching file in this project.
            'apps/workbench/src/**/*.test.{ts,tsx}',
            'apps/docs/src/**/*.test.{ts,tsx}',
            // The agent eval's harness, run against its scripted model.
            'eval/*.test.ts',
            // The native contracts and the laws over the SwiftUI members. They
            // read the registry and Swift sources as text; `swift test` renders.
            'packages/native/src/**/*.test.ts',
          ],
          // The hosted components' tests need a browser, and the `hosted` project runs them.
          exclude: [...configDefaults.exclude, `apps/workbench/${HOSTED_TESTS}`],
        },
      },
      coreProject('chromium'),
      uiProject('chromium'),
      vueProject('chromium'),
      solidProject('chromium'),
      svelteProject('chromium'),
      angularProject('chromium'),
      elementsProject('chromium'),
      hostedProject('chromium'),
      ...(process.env.PM_BROWSER_MATRIX === '1'
        ? MATRIX_ENGINES.flatMap((engine) => [
            coreProject(engine),
            uiProject(engine),
            vueProject(engine),
            solidProject(engine),
            svelteProject(engine),
            angularProject(engine),
            elementsProject(engine),
            hostedProject(engine),
          ])
        : []),
    ],
  },
})
