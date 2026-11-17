/**
 * `polymorph add` links the red rules it generates into this array. What
 * Next.js writes is not application code.
 *
 * ESLint reads a file by the nearest config, so the repository's own lint
 * reads this one for the fixture's directory. `dist/` is where `pnpm gate:next`
 * assembles the application, with a copy of this config that has the rules
 * linked, and the repository's lint stops here.
 */
export default [{ ignores: ['.next/', 'next-env.d.ts', 'dist/'] }]
