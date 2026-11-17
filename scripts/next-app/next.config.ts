import type { NextConfig } from 'next'

/**
 * `optimizePackageImports` is the one setting the consumer guide asks a
 * Next.js application for (`docs/consuming.md`). With it, webpack follows a
 * name through the vocabulary's entry point to the member's own module.
 * Turbopack does that without it.
 *
 * The two roots are for this fixture alone. `pnpm gate:next` assembles the
 * application inside the repository and links its dependencies from the
 * repository's install, and Turbopack reads no file outside its root.
 */
const repository = process.env.POLYMORPH_REPOSITORY

const config: NextConfig = {
  experimental: { optimizePackageImports: ['@polymorph/react-ui'] },
  turbopack: { root: repository },
  outputFileTracingRoot: repository,
}

export default config
