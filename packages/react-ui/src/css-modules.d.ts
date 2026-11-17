/**
 * CSS Modules types. `@polymorph/react-ui` compiles under its own tsconfig with no
 * ambient environment types, so the module shape is declared here rather than
 * inherited from `vite/client`. The vocabulary must typecheck without assuming
 * a bundler's globals.
 *
 * The pattern matches a member's recipe import,
 * `@polymorph/recipes/controls/button.module.css`, whose package ships CSS and
 * no declarations, and the relative `./button.module.css` a vendored copy
 * imports instead.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

/**
 * The same file as text. The `requiredSelectors` law needs it to read what a
 * component ships: no prop can reach hover, focus and active, so the source is
 * the only evidence. The law runs in the browser project, where `node:fs` does
 * not exist.
 */
declare module '*.module.css?raw' {
  const source: string
  export default source
}

/**
 * Every stylesheet at once, as text.
 *
 * Declared here for the same reason as the two above, and only for what is
 * used, rather than by importing `vite/client`. A law that reads the package's
 * CSS must not depend on a hand-kept list of files, because a new stylesheet
 * could be left off it. So `conventions/reduced-motion.test.ts` reads them by
 * glob.
 */
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, T>
}
