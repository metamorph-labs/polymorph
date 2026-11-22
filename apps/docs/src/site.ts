/**
 * The site's own constants: what it is called and where its outside links go.
 *
 * `url` is the address the site is served from. It is read from `VITE_SITE_URL`
 * at build time, because the address belongs to a deployment and not to the
 * source. Canonical links, the sitemap and link previews are built from it, and
 * a build without it leaves them out.
 */
export const SITE = {
  name: 'Polymorph',
  tagline: 'one design system, any look you want',
  description:
    'One set of components that behaves the same in React, Vue, Svelte, Solid, Angular, plain HTML, SwiftUI and Jetpack Compose. Restyle all of them at once by changing a couple of small files.',
  url: (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? null,
  repository: 'https://github.com/metamorph-labs/polymorph',
  npm: 'https://www.npmjs.com/org/metamorph-labs',
  license: 'MIT',
} as const
