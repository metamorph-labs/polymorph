/**
 * `@polymorph/engine/runtime`: what an application does with a theme at run time,
 * without the code that derives one.
 *
 * A system, palette, mode, density or motion temperament is an attribute on
 * `<html>`. These functions set those attributes and remember the choice.
 * None of them imports the theme engine, so an application that compiles its
 * themes at build time (`@polymorph/engine/vite`) ships no `zod`, no `culori` and
 * no derivation code.
 */
export * from '@polymorph/theme/runtime'
