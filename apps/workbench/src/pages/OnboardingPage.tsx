import {
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  FormField,
  FormPage,
  Input,
  Select,
  Stack,
  Stepper,
  Switch,
  TagInput,
  Tooltip,
  type Step,
} from '@polymorph/react-ui'
import { useState } from 'react'

import { navigate } from '../harness/router'
import { PAGES_ROOT } from './routes'

/**
 * Exemplar: **Northbeam**, workspace onboarding. The FormPage archetype inside a full product
 * frame.
 *
 * The archetype provides the committing row: exactly one solid button, aligned by a rule to the
 * card column it submits, inside a real `<form>` so Enter submits from any field. The page
 * supplies everything above it. Here that is a Stepper over the cards, showing which of three
 * steps this screen is on.
 *
 * **The stepper reflects real state, because an inaccurate Stepper is worse than none.**
 * `design/components/stepper.md` says the component reports progress rather than navigating it.
 * So to show step 2 of 3, the flow must actually be on step 2 of 3. `step` is state, Continue and
 * Back change it, and each step has its own card. Completed steps can be revisited because
 * `onStepSelect` makes them buttons. A fixed `activeIndex` over cards that never change would
 * only depict a flow.
 *
 * Like Relay and every other exemplar, this replaces the workbench shell, because AppShell is
 * 100vh and renders its own `<main>`. The rail's one working item returns to the index. The rest
 * is Northbeam's own UI.
 */

const STEPS: Step[] = [
  { label: 'Workspace', description: 'What to call it' },
  { label: 'Invite your team', description: 'Who works in it' },
  { label: 'Defaults', description: 'What we send you' },
]

/** 0-based, so the last step is one less than the count. */
const LAST = STEPS.length - 1

const TEAM_SIZES = [
  { value: 'solo', label: 'Just me for now' },
  { value: 'small', label: '2–9 people' },
  { value: 'medium', label: '10–49 people' },
  { value: 'large', label: '50 or more' },
]

const ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'Reads everything, changes nothing' },
  { value: 'editor', label: 'Editor', description: 'Also builds and edits boards' },
  { value: 'admin', label: 'Admin', description: 'Also invites and removes people' },
]

/** Checks the shape only, not whether the address exists. The mail server checks that. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * TagInput's normalize-or-reject policy, set explicitly rather than left at the default. An
 * invite list holds addresses, so a tag that is not an address is refused at the field (with a
 * flash) instead of becoming a chip nobody can send to.
 */
function emailTag(raw: string): string | null {
  const tag = raw.trim().toLowerCase()
  return EMAIL.test(tag) ? tag : null
}

export function OnboardingPage() {
  /** Step 2 of 3: the workspace is named, and the team is not invited yet. */
  const [step, setStep] = useState(1)
  const [finished, setFinished] = useState(false)
  /** No error shows until a Continue has been refused. */
  const [attempted, setAttempted] = useState(false)

  const [workspace, setWorkspace] = useState('Northbeam HQ')
  const [size, setSize] = useState('medium')
  const [invites, setInvites] = useState<string[]>([
    'maya@northbeam.example',
    'tobi@northbeam.example',
  ])
  const [role, setRole] = useState('editor')
  const [updates, setUpdates] = useState(true)
  const [digest, setDigest] = useState(false)

  const inviteError =
    attempted && invites.length === 0
      ? 'Add at least one address — you can remove people again later.'
      : undefined

  /** Every step change clears the previous step's errors. */
  function goTo(next: number) {
    setAttempted(false)
    setFinished(false)
    setStep(next)
  }

  function submit() {
    if (step === 1 && invites.length === 0) {
      setAttempted(true)
      return
    }
    if (step < LAST) {
      goTo(step + 1)
      return
    }
    setFinished(true)
  }

  const title =
    step === 0 ? 'Name your workspace' : step === 1 ? 'Invite your team' : 'Choose your defaults'

  const description =
    step === 0
      ? 'Everyone you invite sees this name. It can change whenever you like.'
      : step === 1
        ? 'Northbeam is better with the people you already work with. Nobody is charged until they sign in.'
        : 'Two switches, both reversible, neither of them marketing.'

  return (
    <AppShell
      brand={
        <Badge variant="solid" tone="accent">
          Northbeam
        </Badge>
      }
      sidebar={
        <>
          <AppShell.NavGroup label="Set up">
            <AppShell.NavItem icon="home" label="Get started" current onSelect={() => {}} />
            <AppShell.NavItem icon="upload" label="Import your data" onSelect={() => {}} />
            <AppShell.NavItem icon="link" label="Connect a tool" onSelect={() => {}} />
          </AppShell.NavGroup>
          <AppShell.NavGroup label="Workspace">
            <AppShell.NavItem icon="team" label="Members" onSelect={() => {}} />
            <AppShell.NavItem icon="settings" label="Settings" onSelect={() => {}} />
          </AppShell.NavGroup>
        </>
      }
      sidebarFooter={<AppShell.UserCard name="Priya Raman" detail="priya@northbeam.example" />}
      topbar={{
        leading: (
          <Tooltip content="Back to the workbench's page index">
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              icon="back"
              label="All pages"
              onClick={() => navigate(PAGES_ROOT)}
            />
          </Tooltip>
        ),
        trailing: (
          <Button variant="outline" tone="neutral" size="sm" icon="help" label="Setup guide" />
        ),
      }}
    >
      <FormPage
        title={title}
        description={description}
        onSubmit={submit}
        actions={
          <>
            <Button
              variant="ghost"
              tone="neutral"
              label="Back"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            />
            {/* The only solid button on the page, as the committing row requires. That is also
                why Back uses the `ghost` variant rather than `outline`. */}
            <Button
              type="submit"
              icon={step === LAST ? 'confirm' : undefined}
              label={finished ? 'Setup complete' : step === LAST ? 'Finish setup' : 'Continue'}
              disabled={finished}
            />
          </>
        }
      >
        {/* An index past the last step marks every step completed, which is how a finished flow
            looks: three checks and no current step. */}
        <Stepper steps={STEPS} activeIndex={finished ? STEPS.length : step} onStepSelect={goTo} />

        {finished ? (
          <Alert tone="success" title="Northbeam is ready">
            {`${workspace} is set up, and ${invites.length === 1 ? 'one invitation is' : `${invites.length} invitations are`} on the way. Everything here can be changed again in Workspace settings.`}
          </Alert>
        ) : null}

        {step === 0 ? (
          <Card>
            <Stack gap={5}>
              <FormField
                label="Workspace name"
                required
                description="Usually the company or the team. Everyone you invite sees it."
              >
                <Input
                  value={workspace}
                  onChange={(value) => setWorkspace(value)}
                  placeholder="Northbeam HQ"
                  maxLength={60}
                />
              </FormField>

              <FormField
                label="Team size"
                description="Only used to pick sensible defaults. It is never shown to anyone."
              >
                <Select
                  options={TEAM_SIZES}
                  value={size}
                  onChange={(value) => setSize(value ?? size)}
                />
              </FormField>
            </Stack>
          </Card>
        ) : step === 1 ? (
          <Card>
            <Stack gap={5}>
              <FormField
                label="Invite by email"
                required
                description="Enter or a comma commits an address; paste a whole list and it splits."
                error={inviteError}
              >
                <TagInput
                  value={invites}
                  onChange={setInvites}
                  validate={emailTag}
                  max={25}
                  placeholder="maya@northbeam.example"
                />
              </FormField>

              <FormField
                label="They join as"
                description="The starting role for everyone in this batch. Change it per person afterwards."
              >
                <Select options={ROLES} value={role} onChange={(value) => setRole(value ?? role)} />
              </FormField>
            </Stack>
          </Card>
        ) : (
          <Card>
            <Stack gap={5}>
              <FormField
                label="Send me product updates"
                description="About one email a month, and only when something actually shipped."
              >
                <Switch checked={updates} onCheckedChange={setUpdates} />
              </FormField>

              <FormField
                label="Weekly workspace digest"
                description="What your team looked at last week, every Monday morning."
              >
                <Switch checked={digest} onCheckedChange={setDigest} />
              </FormField>
            </Stack>
          </Card>
        )}
      </FormPage>
    </AppShell>
  )
}
