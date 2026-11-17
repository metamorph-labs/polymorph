/**
 * CSS Modules types. This package compiles under its own tsconfig with no
 * ambient environment types, so the module shape is declared here instead of
 * coming from `vite/client`. The React foundation must typecheck without a
 * bundler's globals.
 *
 * Only the shape this package uses is declared: `Icon` and `BrandMark` import
 * `icon.module.css` for its class names. The vocabulary's own copy
 * (`packages/react-ui/src/css-modules.d.ts`) also declares the raw-text and glob
 * forms its laws read stylesheets with.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
