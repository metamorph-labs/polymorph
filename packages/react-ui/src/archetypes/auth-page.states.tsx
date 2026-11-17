import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Link } from '../controls/Link'
import { Stack } from '../layout/Stack'
import { Alert } from '../structure/Alert'
import { Badge } from '../structure/Badge'
import { AuthPage } from './AuthPage'

/**
 * States fixture, from `design/archetypes/auth-page.md`'s States table.
 *
 * The entries follow the common login-card composition: the heading
 * start-aligned inside the card, the password label's row with its own reset
 * link, a primary and a secondary button that both fill the card width, and the
 * sign-up line at the end of the card instead of below it. The last four are
 * the pages that are not a sign-in: one step of a flow that runs before the
 * shell, and three whole-page statuses.
 */

const BRAND = (
  <Badge variant="solid" tone="accent">
    Relay
  </Badge>
)

/**
 * The account line, in the card. Two entries share it on purpose, because a
 * product that offers sign-up in two different sentences is inconsistent.
 */
const SIGN_UP = (
  <>
    {'Don’t have an account? '}
    <Link href="#signup">Sign up</Link>
  </>
)

/**
 * The action cluster is a `Stack`, not four loose children.
 *
 * The card's own gap is the spacing between fields. A primary action and its
 * alternative are two options for one decision, so they sit closer together
 * than two fields do. Both fill the card width because the archetype's column
 * stretches them, with no prop on either Button.
 */
function Actions() {
  return (
    <Stack gap={3}>
      <Button label="Sign in" type="submit" />
      <Button variant="outline" tone="neutral" label="Email me a sign-in link" />
    </Stack>
  )
}

function Fields({ error }: { error?: string } = {}) {
  return (
    <>
      <FormField label="Email">
        <Input type="email" autoComplete="email" placeholder="you@example.com" />
      </FormField>
      <FormField
        label="Password"
        error={error}
        labelEnd={
          <Link href="#reset" variant="standalone">
            Forgot your password?
          </Link>
        }
      >
        <Input type="password" autoComplete="current-password" />
      </FormField>
      <Actions />
    </>
  )
}

export const states: ComponentStates = {
  component: 'AuthPage',

  entries: [
    {
      name: 'sign in — the login block’s composition',
      render: () => (
        <AuthPage
          brand={BRAND}
          title="Welcome back"
          description="Enter the address your team invited."
          cardFooter={SIGN_UP}
        >
          <Fields />
        </AuthPage>
      ),
    },
    {
      name: 'with a footer below the card — furniture, not the form’s own line',
      render: () => (
        <AuthPage
          brand={BRAND}
          title="Welcome back"
          description="Enter the address your team invited."
          cardFooter={SIGN_UP}
          footer={
            <>
              <Link href="#sso">Use SSO</Link>
              <Link href="#help">Support</Link>
            </>
          }
        >
          <Fields />
        </AuthPage>
      ),
    },
    {
      name: 'rejected — the error is the field’s, not a banner’s',
      render: () => (
        <AuthPage brand={BRAND} title="Welcome back" cardFooter={SIGN_UP}>
          <Fields error="That password does not match." />
        </AuthPage>
      ),
    },
    {
      name: 'no brand — the card carries the whole moment',
      render: () => (
        <AuthPage title="Reset your password" description="We will email you a link.">
          <FormField label="Email">
            <Input type="email" autoComplete="email" />
          </FormField>
          <Button label="Send the link" type="submit" />
        </AuthPage>
      ),
    },
    {
      name: 'a step of a flow — the way back beside the title',
      render: () => (
        <AuthPage
          brand={BRAND}
          title="Your team"
          description="Name it now. You can change it later."
          backAction={
            <Button variant="ghost" tone="neutral" size="sm" icon="back" iconOnly label="Back" />
          }
        >
          <FormField label="Team name">
            <Input placeholder="Northwind" />
          </FormField>
          <Button label="Continue" type="submit" />
        </AuthPage>
      ),
    },
    {
      name: 'a status — nothing is at this address, and one way on',
      render: () => (
        <AuthPage
          brand={BRAND}
          title="Page not found"
          description="No Relay page exists at this address."
        >
          <Link href="#overview" variant="button" buttonVariant="solid">
            Go to overview
          </Link>
        </AuthPage>
      ),
    },
    {
      name: 'a status — it failed, with the notice and a retry',
      render: () => (
        <AuthPage
          brand={BRAND}
          title="Workspace unavailable"
          description="The workspace could not be loaded. Nothing was changed."
        >
          <Alert tone="danger" title="The service did not answer in time">
            Request 7f3a9c
          </Alert>
          <Stack gap={3}>
            <Button label="Try again" />
            <Button variant="outline" tone="neutral" label="Sign in again" />
          </Stack>
        </AuthPage>
      ),
    },
    {
      name: 'a status — the heading alone, with nothing to do here',
      render: () => (
        <AuthPage
          title="This link has expired"
          description="Open the newest invitation email and follow its link."
        />
      ),
    },
  ],

  /*
   * States no prop reaches. The illustrated layout's entrance is keyed on
   * `[data-auth-enter]`, a mark the archetype puts on its own heading and a
   * host puts on its fields. It is also keyed on the page-transition state the
   * shared convention sets while a step enters or waits. Neither is a prop of
   * this member, so the stylesheet is required to style them, and they are
   * listed here.
   */
  requiredSelectors: ['[data-auth-enter]', '[data-page-transition-state]'],
}
