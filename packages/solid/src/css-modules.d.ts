/**
 * CSS Modules types. This package compiles under its own tsconfig with no
 * ambient environment types, so the module shape is declared here instead of
 * coming from `vite/client`.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
