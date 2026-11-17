import {
  AuthPage,
  Badge,
  Button,
  FormField,
  Input,
  Link,
  OTPInput,
  PasswordInput,
  Stack,
} from '@polymorph/react-ui'
import { useState } from 'react'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Northbeam**'s sign-in. The AuthPage archetype, and the only exemplar with no
 * AppShell around it.
 *
 * That is how the archetype is designed, not an omission. Auth is the one screen type that sits
 * outside the shell, so AuthPage renders its own `<main>` and its own `<h1>` inside the card.
 * There is no rail, so the link back to the workbench goes in the `footer` slot, which is meant
 * for page content below the card. The `cardFooter` above it stays part of the form, because the
 * sentence offering the other account action belongs to the form it is an alternative to.
 *
 * **The second sign-in method really swaps the field.** "Use a one-time code" replaces the
 * password field with an OTPInput and changes its own label to the way back. One piece of state
 * drives two fields, and no prop is unused. The two controls differ on purpose. PasswordInput
 * masks, can reveal, and sets `current-password`. OTPInput never masks, because the code is not
 * secret from the person reading it, and masking would cause more of the transcription errors
 * the code is meant to prevent.
 */

type Method = 'password' | 'code'

export function SigninPage() {
  const [method, setMethod] = useState<Method>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')

  return (
    <AuthPage
      brand={
        <Badge variant="solid" tone="accent">
          Northbeam
        </Badge>
      }
      title="Sign in"
      description="Use the address your workspace invited."
      cardFooter={
        <>
          {'Don’t have an account? '}
          <Link href="#signup">Create a workspace</Link>
        </>
      }
      footer={
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          icon="back"
          label="All pages"
          onClick={() => navigate(PAGES_ROOT)}
        />
      }
    >
      <FormField label="Email">
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(value) => setEmail(value)}
          placeholder="you@northbeam.example"
        />
      </FormField>

      {method === 'password' ? (
        <FormField
          label="Password"
          // The reset link goes in the label row, next to the field it relates to, rather than
          // under the field as a third line.
          labelEnd={
            <Link href="#reset" variant="standalone">
              Forgot your password?
            </Link>
          }
        >
          <PasswordInput
            toggleLabel="Show password"
            value={password}
            onChange={(value) => setPassword(value)}
          />
        </FormField>
      ) : (
        <FormField
          label="One-time code"
          description="We sent six digits to that address. It expires in ten minutes."
        >
          <OTPInput value={code} onChange={setCode} />
        </FormField>
      )}

      {/* The primary action and its alternative are two options for one decision, so they sit
          closer together than two separate questions would. Both fill the card width, because
          the card sets the width. */}
      <Stack gap={3}>
        <Button label="Sign in" type="submit" />
        <Button
          variant="ghost"
          tone="neutral"
          label={method === 'password' ? 'Use a one-time code' : 'Use your password instead'}
          onClick={() => setMethod(method === 'password' ? 'code' : 'password')}
        />
      </Stack>
    </AuthPage>
  )
}
