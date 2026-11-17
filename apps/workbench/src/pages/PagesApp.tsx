import { lazy, Suspense } from 'react'

import { exemplarSlugFromPath } from './routes'

/**
 * The exemplar host. Like Relay, each of the seven routes renders a full-screen product. Each is
 * its own lazy chunk, so opening one page does not download the others. Fallbacks are `null`, not
 * a styled placeholder, because a fallback is a style decision and the red rules give application
 * code nowhere to make one.
 */

const AnalyticsPage = lazy(() =>
  import('./AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })),
)
const CrmPage = lazy(() => import('./CrmPage').then((module) => ({ default: module.CrmPage })))
const ProjectPage = lazy(() =>
  import('./ProjectPage').then((module) => ({ default: module.ProjectPage })),
)
const OnboardingPage = lazy(() =>
  import('./OnboardingPage').then((module) => ({ default: module.OnboardingPage })),
)
const BillingPage = lazy(() =>
  import('./BillingPage').then((module) => ({ default: module.BillingPage })),
)
const SigninPage = lazy(() =>
  import('./SigninPage').then((module) => ({ default: module.SigninPage })),
)
const AssistantPage = lazy(() =>
  import('./AssistantPage').then((module) => ({ default: module.AssistantPage })),
)

export function PagesApp({ route }: { route: string }) {
  const slug = exemplarSlugFromPath(route)

  return (
    <Suspense fallback={null}>
      {slug === 'analytics' ? (
        <AnalyticsPage />
      ) : slug === 'crm' ? (
        <CrmPage />
      ) : slug === 'project' ? (
        <ProjectPage />
      ) : slug === 'onboarding' ? (
        <OnboardingPage />
      ) : slug === 'billing' ? (
        <BillingPage />
      ) : slug === 'signin' ? (
        <SigninPage />
      ) : slug === 'assistant' ? (
        <AssistantPage />
      ) : null}
    </Suspense>
  )
}
