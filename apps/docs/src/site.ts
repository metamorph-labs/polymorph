/**
 * The site's own constants: what it is called and where its outside links go.
 *
 * `url` is the address the site is served from. It is read from `VITE_SITE_URL`
 * at build time, because the address belongs to a deployment and not to the
 * source. Canonical links, the sitemap, link previews and the pages' structured
 * data are built from it, and a build without it leaves them out. The files for
 * agents write their links in full with it (`llms.ts`).
 */
export const SITE = {
  name: 'Polymorph',
  tagline: 'one design system, any look you want',
  description:
    'One set of components for React, Vue, Svelte, Solid, Angular and plain HTML, with native SwiftUI and Jetpack Compose versions of most of them. Restyle everything at once by changing a couple of small files.',
  url: (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? null,
  repository: 'https://github.com/metamorph-labs/polymorph',
  npm: 'https://www.npmjs.com/org/metamorph-labs',
  license: 'MIT',
} as const
