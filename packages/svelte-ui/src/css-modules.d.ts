/**
 * CSS Modules types. This package compiles under its own tsconfig with no
 * ambient environment types, so the module shape is declared here rather than
 * inherited from `vite/client`, as `@polymorph/react-ui` declares it.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

/** A stylesheet imported for its effect (the base layer). */
declare module '*.css'

/** A file as text, which the laws read in the browser, where `node:fs` does not exist. */
declare module '*?raw' {
  const source: string
  export default source
}

/** Files by glob, for the laws that read every spec or stylesheet. */
interface ImportMeta {
  glob<T>(
    pattern: string | string[],
    options: { query: string; import: string; eager: true },
  ): Record<string, T>
}
