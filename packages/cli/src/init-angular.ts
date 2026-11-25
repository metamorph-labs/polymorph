import { FRAMEWORK_FOUNDATION, FRAMEWORK_VOCABULARY } from '@polymorph/registry'

import { STATUS, viteConfig, type FrameworkApp } from './init-app'

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
}
