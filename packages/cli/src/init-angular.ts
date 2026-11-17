import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import { STATUS, viteConfig, type FrameworkApp } from './init-app'
import { ESLINT_FRAGMENT, STYLELINT_FRAGMENT } from './patch'

/**
 * The files `polymorph init --framework angular` writes that differ from the
 * React app's (`init-app.ts` says which). The app is Angular 22, built by Vite
 * with Analog's Angular plugin, which compiles ahead of time as the Angular
 * CLI does, and bootstrapped without zone.js. Its components are standalone
 * and their state is signals, as `@polymorph/angular-ui`'s members are.
 */

/**
 * Angular, at the release this repository builds and tests the Angular
 * vocabulary with, and its patches. `frameworks.test.ts` holds it to
 * `packages/angular-ui/package.json`.
 */
export const ANGULAR_RANGE = '~22.2.2'

/** Angular's own packages an app runs on, and the two libraries Angular requires beside them. */
export const ANGULAR_FRAMEWORK: Readonly<Record<string, string>> = {
  '@angular/common': ANGULAR_RANGE,
  '@angular/compiler': ANGULAR_RANGE,
  '@angular/core': ANGULAR_RANGE,
  '@angular/platform-browser': ANGULAR_RANGE,
  rxjs: '^7.8.2',
  tslib: '^2.8.1',
}

/**
 * The tools a new Angular app builds, typechecks and lints with. Angular's
 * compiler requires TypeScript 6.0, so `typescript` here replaces the range
 * every other app takes. The template parser and the processor that extracts
 * an inline template are what the ESLint fragment reads templates with.
 */
export const ANGULAR_TOOLING: Readonly<Record<string, string>> = {
  '@analogjs/vite-plugin-angular': '^2.8.0',
  '@angular-eslint/eslint-plugin-template': '^22.6.0',
  '@angular-eslint/template-parser': '^22.6.0',
  '@angular/build': ANGULAR_RANGE,
  '@angular/compiler-cli': ANGULAR_RANGE,
  typescript: '~6.0.3',
}

/** The runtime packages a new Angular app installs. `@polymorph/rules` is a dev dependency. */
export const ANGULAR_RUNTIME_PACKAGES = [
  '@polymorph/engine',
  FRAMEWORK_FOUNDATION.angular,
  FRAMEWORK_VOCABULARY.angular,
]

export const ANGULAR_SCRIPTS = {
  dev: 'vite',
  build: 'vite build',
  // An app has no stylesheets of its own (`no-app-css`), so the CSS glob
  // usually matches nothing, which Stylelint otherwise reports as an error.
  lint: 'eslint src && stylelint "src/**/*.css" --allow-empty-input',
  // `tsc` cannot read a template; Angular's compiler checks the templates too.
  typecheck: 'ngc -p tsconfig.json --noEmit',
}

/**
 * The app's TypeScript and Angular compiler options. `strictTemplates` makes
 * the compiler type-check every binding in a template. The build emits
 * through this program, so it sets an `outDir` rather than `noEmit`, and the
 * typecheck passes `--noEmit`. `vite/client` declares the stylesheet the
 * entry imports.
 */
export const ANGULAR_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["vite/client"],
    "outDir": "./dist/out-tsc"
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true
  },
  "include": ["src"]
}
`

/** The page: the root component's element, which Angular renders into, and the entry. */
export function angularIndexHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
}

export const ANGULAR_MAIN = `// The theme first: its stylesheet, its fonts and the stored choice, before Angular bootstraps.
import 'virtual:polymorph/theme'
// The vocabulary's base layer, which the package ships as a global stylesheet.
import '${FRAMEWORK_VOCABULARY.angular}/base.css'

import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'

import { App } from './app'

bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(
  (error: unknown) => console.error(error),
)
`

/**
 * The container. It owns the state and the behaviour and hands the emitted
 * screen its data and callbacks: the state is a signal, and `onStart` is the
 * screen's input, a function that keeps `this` when the screen calls it.
 */
export const ANGULAR_APP = `import { Component, computed, signal } from '@angular/core'

import { Welcome } from './screens/welcome'

/**
 * The container. It owns the state and the behaviour, and hands the emitted
 * screen its data and callbacks. The screen itself only composes and binds.
 */
@Component({
  selector: 'app-root',
  imports: [Welcome],
  template: \`
    <main>
      <app-welcome [status]="status()" [onStart]="start" />
    </main>
  \`,
})
export class App {
  protected readonly started = signal(false)

  protected readonly status = computed(() =>
    this.started()
      ? '${STATUS.after}'
      : '${STATUS.before}',
  )

  /** The screen's \`onStart\`: an arrow function, so it keeps \`this\` when the screen calls it. */
  protected readonly start = (): void => this.started.set(true)
}
`

export const ANGULAR_AGENTS = `# Working in this app

This app is built with polymorph, a closed component vocabulary with lint rules that enforce it,
in Angular.

- The vocabulary is \`${FRAMEWORK_VOCABULARY.angular}\`. Screens compose its members and bind content to them.
  A member is a standalone component: list it in the component's \`imports\` and write it by its
  selector (\`<pm-button>\`).
- The contract is \`polymorph/system-card.md\`: every member, its props, the token families and the
  rules. A member or prop that is not in the card does not exist. A prop keeps its React name and
  type as an input (\`label="Save"\`, \`[gap]="4"\`; a boolean is always bound, \`[iconOnly]="true"\`),
  a callback \`onFoo\` is the output \`foo\` (\`(click)="save()"\`), a node-typed prop is content marked
  \`slot="foo"\` or an \`ng-container\` with \`ngProjectAs="[slot=foo]"\`, and \`children\` is the
  content between the member's tags.
- The MCP server in \`.mcp.json\` is the tool for both: \`get_system_card\` with \`framework: "angular"\`
  returns the card, and \`validate\` with \`framework: "angular"\` checks a component, its inline
  template included, against the red rules and names the lawful fix for each violation.
- \`.mcp.json\` starts the server from the polymorph checkout that created this app, by its absolute
  path on that machine. The path is machine-specific. On another machine, change it to that
  machine's checkout. A team can instead add \`.mcp.json\` to \`.gitignore\` and keep one per person.
- Screens are written as specs under \`src/screens/*.json\` and emitted to standalone components
  (\`emit_screen\` with a \`.ts\` path). An emitted screen holds no state and no logic: its inputs are
  signal inputs, callbacks included. A hand-written container, such as \`src/app.ts\`, renders it and
  owns both. To change an emitted screen, change its spec and emit it again.
- To see a screen, call \`render_screen\` with its spec. It draws the screen in a browser at a
  phone and a desktop width, and returns the pictures with the layout faults it measured. It needs
  a browser, downloaded once in the polymorph checkout: \`pnpm exec playwright install chromium\`.
- Application code may not write styles or raw controls: no CSS files, no \`styles\` or
  \`styleUrl\`, no \`class\` or \`style\` on a member, no raw \`<button>\` or \`<input>\`, no Angular
  animations. The red rules in \`${ESLINT_FRAGMENT}\` and \`${STYLELINT_FRAGMENT}\` read the
  templates too, and \`pnpm lint\` runs them.
- Another library's component (a map, a rich-text editor, a data grid) goes inside
  \`<pm-third-party library="…" reason="…">\`, in the file that imports it. The card says what the
  boundary allows. \`useThemeValues()\` from \`@polymorph/angular\` gives the theme's values to a
  library that takes them in JavaScript.
- The theme is the two JSON files in \`src/theme/\`, compiled at build time by the Vite plugin.
`

/** The Angular app, as `planInit` writes it. */
export const ANGULAR_INIT: FrameworkApp = {
  name: 'Angular',
  framework: ANGULAR_FRAMEWORK,
  runtime: ANGULAR_RUNTIME_PACKAGES,
  tooling: ANGULAR_TOOLING,
  scripts: ANGULAR_SCRIPTS,
  indexHtml: angularIndexHtml,
  tsconfig: ANGULAR_TSCONFIG,
  main: { path: 'src/main.ts', contents: ANGULAR_MAIN },
  viteConfig: (systemPath, palettePath) =>
    viteConfig(
      {
        importLine: "import angular from '@analogjs/vite-plugin-angular'",
        // Ahead of time, as the Angular CLI compiles: the compiler writes each
        // template as code and type-checks it.
        call: "angular({ tsconfig: './tsconfig.json', jit: false })",
      },
      {
        name: 'Angular',
        dedupe: ['@angular/core', '@angular/common', '@angular/platform-browser'],
      },
      systemPath,
      palettePath,
    ),
  welcome: 'src/screens/welcome.ts',
  app: { path: 'src/app.ts', contents: ANGULAR_APP },
  agents: ANGULAR_AGENTS,
}
