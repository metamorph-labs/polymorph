'use client'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Select } from '../controls/Select'
import { Textarea } from '../controls/Textarea'
import { Grid } from '../layout/Grid'
import { Stack } from '../layout/Stack'
import { Card } from '../structure/Card'
import { Stepper } from '../structure/Stepper'
import { FormPage } from './FormPage'

/** States fixture, from `design/archetypes/form-page.md`'s States table. */

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'normal', label: 'Normal' },
]

const SETUP_STEPS = [{ label: 'Collection' }, { label: 'First file' }, { label: 'Served URL' }]

const ACTIONS = (
  <>
    <Button variant="ghost" tone="neutral" label="Cancel" />
    <Button icon="confirm" label="Create ticket" type="submit" />
  </>
)

export const states: ComponentStates = {
  component: 'FormPage',

  entries: [
    {
      name: 'a header, one card and the committing row',
      render: () => (
        <FormPage
          title="New ticket"
          description="Raise a conversation on someone's behalf."
          actions={ACTIONS}
        >
          <Card>
            <Stack gap={5}>
              <FormField label="Subject" required description="One line.">
                <Input placeholder="Webhook retries stop after the first 5xx" />
              </FormField>
              <FormField label="Details">
                <Textarea rows={4} />
              </FormField>
            </Stack>
          </Card>
        </FormPage>
      ),
    },
    {
      name: 'a two-column row, where both cells carry a description or neither',
      render: () => (
        <FormPage title="New ticket" actions={ACTIONS}>
          <Card>
            <Grid columns={2} gap={5}>
              <FormField label="Requester" required description="Where replies go.">
                <Input type="email" placeholder="dana@northwind.example" />
              </FormField>
              <FormField label="Priority" description="Urgent pages the on-call engineer.">
                <Select options={PRIORITIES} defaultValue="normal" />
              </FormField>
            </Grid>
          </Card>
        </FormPage>
      ),
    },
    {
      name: 'with a destructive tertiary, leftmost and quiet',
      render: () => (
        <FormPage
          title="Edit ticket"
          actions={
            <>
              <Button variant="ghost" tone="danger" label="Delete ticket…" />
              <Button variant="outline" tone="neutral" label="Cancel" />
              <Button label="Save changes" type="submit" />
            </>
          }
        >
          <Card>
            <FormField label="Subject" required>
              <Input defaultValue="Webhook retries stop after the first 5xx" />
            </FormField>
          </Card>
        </FormPage>
      ),
    },
    {
      name: 'a real form — Enter submits from any field',
      render: () => (
        <FormPage title="New ticket" actions={ACTIONS} onSubmit={() => {}}>
          <Card>
            <FormField label="Subject" required>
              <Input />
            </FormField>
          </Card>
        </FormPage>
      ),
    },
    {
      name: 'a step of a flow — the progress above the step’s card',
      render: () => (
        <FormPage
          title="Set up Northwind"
          description="Three steps, and the first file is served."
          actions={
            <>
              <Button variant="outline" tone="neutral" label="Back" />
              <Button label="Continue" type="submit" />
            </>
          }
        >
          <Stepper steps={SETUP_STEPS} activeIndex={1} />
          <Card title="First file">
            <FormField label="File name" required>
              <Input placeholder="logo.svg" />
            </FormField>
          </Card>
        </FormPage>
      ),
    },
  ],

  requiredSelectors: [],
}
