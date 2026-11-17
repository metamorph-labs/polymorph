/**
 * The exemplar routes. The shell needs to know them before it loads the exemplars, the same split
 * as `relay/routes.ts`. `App` imports this file rather than the barrel so the route check does not
 * download the product screens.
 *
 * `/pages` itself is not an exemplar route, because the index renders inside the workbench
 * chrome. An exemplar replaces the shell as Relay does, because AppShell is 100vh and renders its
 * own `<main>`.
 */
export const PAGES_ROOT = '/pages'

export const EXEMPLAR_SLUGS = [
  'analytics',
  'crm',
  'project',
  'onboarding',
  'billing',
  'signin',
  'assistant',
] as const

export type ExemplarSlug = (typeof EXEMPLAR_SLUGS)[number]

export function exemplarSlugFromPath(pathname: string): ExemplarSlug | undefined {
  const match = /^\/pages\/([a-z-]+)\/?$/.exec(pathname)
  const slug = match?.[1]
  return EXEMPLAR_SLUGS.includes(slug as ExemplarSlug) ? (slug as ExemplarSlug) : undefined
}

export function isExemplarRoute(pathname: string): boolean {
  return exemplarSlugFromPath(pathname) !== undefined
}
