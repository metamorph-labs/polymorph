import { getLocalTimeZone, today, type CalendarDate } from '@internationalized/date'
import {
  Button,
  Card,
  Combobox,
  ConfirmDialog,
  DatePicker,
  FormField,
  FormPage,
  Grid,
  Input,
  Select,
  Stack,
  Switch,
  toast,
} from '@polymorph/react-ui'
import { useState } from 'react'

import { AGENTS, assignmentSummary, capitalize, PRIORITIES } from './tickets'

/**
 * The new-ticket form.
 *
 * It shows that a form with real validation, a real confirmation and a real success path can be
 * built from `FormField` and controls with nothing custom. Two details matter most.
 *
 * **Validation is computed at render, not stored.** Errors are derived from the values and a
 * `submitted` flag, so there is no second copy of the form state to keep in sync, and a valid
 * field cannot be styled invalid. No error shows until the first submit, because a form that
 * shows errors while the user is still filling in the first field is unhelpful.
 *
 * **Discard asks for confirmation only when there is something to lose.** Cancelling an empty
 * form is just navigation. Cancelling a filled one loses data, so it goes through a ConfirmDialog.
 * ConfirmDialog cannot be built with the destructive option styled as the safe one, and it opens
 * with focus on the cancel action.
 *
 * Built on `FormPage`. The archetype provides a real `<form>`, so Enter submits from any field,
 * and on a failed submit it moves focus to the first invalid field. The spec defines both as
 * archetype behaviour so that every form gets them without extra code.
 *
 * Two fields are the ones a triager fills in, an assignee and a due date, and the vocabulary has
 * members for both (Combobox, DatePicker). Both are optional, and both have the same structure as
 * the fields above them: a `FormField` with a label, a description and a governed control, in the
 * two-column row this form already uses. The page needs no date handling of its own.
 */

const PRIORITY_OPTIONS = PRIORITIES.map((priority) => ({
  value: priority,
  label: capitalize(priority),
}))

/**
 * The team is a `description`, not a suffix on the label.
 *
 * A Combobox matches on the label, because `useFilter` compares an option's text value, which is
 * the name. So the second line is only visual. It distinguishes the two Platform engineers once a
 * partial name has matched both, and it never makes the label longer to type.
 *
 * **A known gap, reported rather than worked around:** typing `billing` finds nobody, even though
 * two rows say Billing. `Command` has `keywords` for matching beyond the visible text, and
 * `Combobox` has no equivalent. That belongs in Combobox's spec. A screen must not work around it
 * by adding the team to the label.
 */
const ASSIGNEE_OPTIONS = AGENTS.map((agent) => ({
  value: agent.id,
  label: agent.name,
  description: agent.team,
}))

interface Draft {
  subject: string
  requester: string
  priority: string
  /** `null` means unassigned, which is a real state in the queue. See `tickets.ts`. */
  assignee: string | null
  /** `null` means no date yet, the normal state of an untriaged ticket. */
  due: CalendarDate | null
  notify: boolean
}

const EMPTY: Draft = {
  subject: '',
  requester: '',
  priority: 'normal',
  assignee: null,
  due: null,
  notify: true,
}

/** Checks the shape only, not whether the address exists. The mail server checks that. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function errorsIn(draft: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {}
  if (draft.subject.trim() === '')
    errors.subject = 'Give it a subject — it is what the queue is scanned by.'
  if (draft.requester.trim() === '') errors.requester = 'Who reported this?'
  else if (!EMAIL.test(draft.requester.trim())) errors.requester = 'That is not an email address.'
  return errors
}

export interface NewTicketPageProps {
  onDone: () => void
}

export function NewTicketPage({ onDone }: NewTicketPageProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const errors = errorsIn(draft)
  const shown = submitted ? errors : {}
  const dirty = draft.subject !== '' || draft.requester !== ''

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  function submit() {
    setSubmitted(true)
    // FormPage focuses the first `aria-invalid` field, so this only decides whether the submit
    // went through.
    if (Object.keys(errorsIn(draft)).length > 0) return

    // The toast reports where the ticket went, not what was typed. The user just wrote the
    // subject, and the routing is something they cannot otherwise see.
    toast.success('Ticket created', {
      description: assignmentSummary(draft.assignee, draft.due),
      action: { label: 'View', onClick: onDone },
    })
    setDraft(EMPTY)
    setSubmitted(false)
    onDone()
  }

  function discard() {
    if (!dirty) {
      onDone()
      return
    }
    setConfirming(true)
  }

  return (
    <FormPage
      title="New ticket"
      description="Raise a conversation on someone's behalf — a phone call, or an email that never reached the queue."
      onSubmit={submit}
      actions={
        <>
          {/* ConfirmDialog fixes these choices: no body slot, no way to style the destructive
              option as the safe one, and focus starts on Cancel because the rightmost button
              here deletes a draft. */}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Discard this ticket?"
            description="The subject and requester you have typed will be lost."
            confirmLabel="Discard"
            trigger={<Button variant="ghost" tone="neutral" label="Discard" onClick={discard} />}
            onConfirm={() => {
              setDraft(EMPTY)
              setSubmitted(false)
              onDone()
            }}
          />
          <Button type="submit" icon="confirm" label="Create ticket" />
        </>
      }
    >
      <Card>
        <Stack gap={5}>
          <FormField
            label="Subject"
            required
            description="One line. It is what the queue is scanned by."
            error={shown.subject}
          >
            <Input
              value={draft.subject}
              onChange={(value) => set('subject', value)}
              placeholder="Webhook retries stop after the first 5xx"
              maxLength={120}
            />
          </FormField>

          <Grid columns={2} gap={5}>
            {/* Both cells in this row have a label, a description and a control. A description on
                only one would put the two controls at different heights, and a misaligned grid
                row looks like a mistake rather than a pair. */}
            <FormField
              label="Requester"
              required
              description="Where the confirmation and replies go."
              error={shown.requester}
            >
              <Input
                type="email"
                autoComplete="email"
                value={draft.requester}
                onChange={(value) => set('requester', value)}
                placeholder="dana@northwind.example"
              />
            </FormField>

            <FormField label="Priority" description="Urgent pages the on-call engineer.">
              {/* No `emptyOption`, because a ticket always has a priority, and this form could not
                  submit the neutral choice. */}
              <Select
                options={PRIORITY_OPTIONS}
                value={draft.priority}
                onChange={(value) => set('priority', value ?? 'normal')}
              />
            </FormField>
          </Grid>

          {/*
           * Assignment and a due date, the two fields a triager fills in. Both are optional, and
           * both show that with a clear button rather than a "None" row, because new tickets start
           * unassigned and undated. Those are default states, not choices.
           */}
          <Grid columns={2} gap={5}>
            {/* Both descriptions fit on one line at this column width, for the reason given for
                the row above. If one wraps and the other does not, the two controls sit at
                different heights and no longer look like a pair. */}
            <FormField label="Assignee" description="Who picks this up, if anyone.">
              <Combobox
                clearable
                options={ASSIGNEE_OPTIONS}
                placeholder="Search the team…"
                value={draft.assignee}
                onChange={(value) => set('assignee', value)}
              />
            </FormField>

            <FormField label="Due date" description="The day it has to be answered.">
              {/*
               * `minValue` is today, because a due date cannot be in the past. The field enforces
               * this, not a validator. The calendar cannot select yesterday, and typing an earlier
               * date marks the field invalid immediately instead of waiting for a submit.
               */}
              <DatePicker
                clearable
                minValue={today(getLocalTimeZone())}
                value={draft.due}
                onChange={(value) => set('due', value)}
              />
            </FormField>
          </Grid>

          <FormField
            label="Notify the requester"
            description="Sends a confirmation with the ticket number."
          >
            <Switch checked={draft.notify} onCheckedChange={(next) => set('notify', next)} />
          </FormField>
        </Stack>
      </Card>
    </FormPage>
  )
}
