/**
 * CSS Modules types. `@polymorph/elements-ui` compiles under its own tsconfig with no
 * ambient environment types, so the module shape is declared here, as
 * `@polymorph/solid-ui` declares it. The states fixtures read recipe classes for the
 * boxes an entry needs.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

/** A stylesheet imported for its effect (the base layer, the host rule). */
declare module '*.css'

/** A file as text, which the laws read in the browser, where `node:fs` does not exist. */
declare module '*?raw' {
  const source: string
  export default source
}

/** Files by glob, for the laws that read every spec. */
interface ImportMeta {
  glob<T>(
    pattern: string | string[],
    options: { query: string; import: string; eager: true },
  ): Record<string, T>
}
