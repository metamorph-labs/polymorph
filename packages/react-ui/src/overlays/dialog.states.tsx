import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { FormField } from '../controls/FormField'
import { Input } from '../controls/Input'
import { Stack } from '../layout/Stack'
import { Dialog } from './Dialog'

/**
 * States fixture, from `design/components/dialog.md`'s States table.
 *
 * Nearly every entry is closed and opens from its own trigger, which is the
 * accurate way to show a modal in a gallery. A dialog that opens on mount
 * covers the whole page, so seven of them would stack seven scrims and
 * misrepresent the one token the scrim uses. Opening from a button also shows
 * the panel growing out of that button.
 *
 * One entry opens: the spec's `open md` row. It must, because the identity law
 * reads rendered fixtures. A fixture that never renders the panel never renders
 * the element with the member's name (`data-member`), and the exception seam
 * could not address Dialog. It keeps its trigger, because the panel portals
 * out of the container and an open dialog without a trigger renders nothing
 * where the completeness law looks.
 */

function LongBody() {
  return (
    <Stack gap={4}>
      {Array.from({ length: 12 }, (_, index) => (
        <p key={index}>
          Paragraph {index + 1}. A body long enough that it has to scroll inside the panel while the
          title and the actions stay where they were put.
        </p>
      ))}
    </Stack>
  )
}

export const states: ComponentStates = {
  component: 'Dialog',

  entries: [
    {
      name: 'plain',
      render: () => (
        <Dialog title="Discard this ticket?" trigger={<Button label="Open" />}>
          <p>This is the body. It holds whatever the screen needs it to hold.</p>
        </Dialog>
      ),
    },
    {
      name: 'described',
      render: () => (
        <Dialog
          title="Discard this ticket?"
          description="Nothing you typed is kept."
          trigger={<Button label="Open" />}
        >
          <p>The description sits under the title, and is what a reader is told first.</p>
        </Dialog>
      ),
    },
    {
      name: 'open md — the panel itself, at the size it defaults to',
      render: () => (
        <Dialog
          defaultOpen
          title="Discard this ticket?"
          description="Nothing you typed is kept."
          trigger={<Button label="Open" />}
          footer={<Button tone="danger" label="Discard" />}
        >
          <p>The panel is portalled, so this is the entry that shows it at all.</p>
        </Dialog>
      ),
    },
    {
      name: 'sizes',
      render: () => (
        <Stack gap={3} align="start">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Dialog
              key={size}
              size={size}
              title={`A ${size} dialog`}
              description="Widths are space-scale arithmetic, so a roomier theme gets roomier dialogs."
              trigger={<Button variant="outline" tone="neutral" label={`Open ${size}`} />}
            >
              <p>Body.</p>
            </Dialog>
          ))}
        </Stack>
      ),
    },
    {
      name: 'with a footer — one primary action, rightmost',
      render: () => (
        <Dialog
          title="Discard this ticket?"
          description="Nothing you typed is kept."
          trigger={<Button tone="danger" label="Discard…" />}
          footer={
            <>
              <Button variant="outline" tone="neutral" label="Keep editing" />
              <Button tone="danger" label="Discard" />
            </>
          }
        >
          <p>The primary action sits rightmost, and it is the only solid one.</p>
        </Dialog>
      ),
    },
    {
      name: 'with a form — focus lands in the body, not on ✕',
      render: () => (
        <Dialog
          title="New ticket"
          description="Focus starts in the first field."
          trigger={<Button icon="add" label="New ticket" />}
          footer={<Button label="Create" />}
        >
          <Stack gap={4}>
            <FormField label="Subject" description="One line, as the customer would say it.">
              <Input placeholder="What went wrong?" />
            </FormField>
          </Stack>
        </Dialog>
      ),
    },
    {
      name: 'non-dismissible — no ✕, no Escape, no outside click',
      render: () => (
        <Dialog
          dismissible={false}
          title="Choose one"
          description="This one cannot be waved away."
          trigger={<Button variant="outline" tone="neutral" label="Open a forced choice" />}
          footer={
            <>
              <Button variant="outline" tone="neutral" label="Cancel" />
              <Button label="Continue" />
            </>
          }
        >
          <p>A forced choice. Use sparingly.</p>
        </Dialog>
      ),
    },
    {
      name: 'scrolling body — header and footer stay put',
      render: () => (
        <Dialog
          title="Long body"
          description="The body scrolls; nothing else does."
          trigger={<Button variant="outline" tone="neutral" label="Open a long dialog" />}
          footer={<Button label="Done" />}
        >
          <LongBody />
        </Dialog>
      ),
    },
  ],

  requiredSelectors: ['[data-state="open"]', '[data-state="closed"]', ':focus-visible'],
}
