/**
 * CSS Modules types. `@polymorph/elements` compiles under its own tsconfig with no
 * ambient environment types, and it reads the Solid foundation's source, whose
 * Icon imports its stylesheet, so the module shape is declared here as
 * `@polymorph/solid` declares it.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
