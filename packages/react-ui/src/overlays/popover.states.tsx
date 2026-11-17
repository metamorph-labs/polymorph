import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Inline } from '../layout/Inline'
import { Stack } from '../layout/Stack'
import { Popover } from './Popover'

/** States fixture, from `design/components/popover.md`'s States table. */

const TRIGGER = <Button variant="outline" tone="neutral" icon="filter" label="Configure" />

function Body() {
  return (
    <Stack gap={4}>
      <FormField label="Older than" description="In days.">
        <Input type="text" defaultValue="30" />
      </FormField>
      <Inline gap={3} justify="end">
        <Button variant="ghost" tone="neutral" size="sm" label="Reset" />
        <Button size="sm" label="Apply" />
      </Inline>
    </Stack>
  )
}

export const states: ComponentStates = {
  component: 'Popover',

  entries: [
    {
      name: 'closed',
      render: () => (
        <Popover trigger={TRIGGER} label="Filter configuration">
          <Body />
        </Popover>
      ),
    },
    {
      name: 'open — a small form the reader can walk away from',
      render: () => (
        <Popover defaultOpen trigger={TRIGGER} label="Filter configuration">
          <Body />
        </Popover>
      ),
    },
    {
      name: 'above its trigger',
      render: () => (
        <Popover defaultOpen side="top" trigger={TRIGGER} label="Filter configuration">
          <Body />
        </Popover>
      ),
    },
    {
      name: 'aligned to the end',
      render: () => (
        <Popover defaultOpen align="end" trigger={TRIGGER} label="Filter configuration">
          <Body />
        </Popover>
      ),
    },
    {
      name: 'text content, still a named panel',
      render: () => (
        <Popover defaultOpen trigger={TRIGGER} label="About retries">
          <p>Retries back off exponentially and stop after six attempts.</p>
        </Popover>
      ),
    },
  ],

  requiredSelectors: ['[data-state="open"]', ':focus-visible'],
}
