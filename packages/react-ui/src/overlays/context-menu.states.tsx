import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Card } from '../structure/Card'
import { Table } from '../structure/Table'
import { ContextMenu } from './ContextMenu'
import type { MenuEntry } from './Menu'
import { Menu } from './Menu'

/**
 * States fixture, from `design/components/context-menu.md`'s States table.
 *
 * No public prop renders the open panel, because there is no `open` prop: a
 * context menu opens at a point, and the point exists only in the gesture. Per
 * the completeness law the open-state selectors are in `requiredSelectors`,
 * and the browser test performs a real press to reach them. The item cells are
 * covered by Menu's own fixture, so this member refers to them and does not
 * render them again.
 */

const noop = () => {}

/** Every entry kind in the grammar, on one surface. */
const FULL_MIX: MenuEntry[] = [
  { kind: 'label', label: 'This ticket' },
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', icon: 'time', kbd: 'S', onSelect: noop },
  { label: 'Merge into…', disabled: true, onSelect: noop },
  { kind: 'separator' },
  { kind: 'checkbox', label: 'Watching', checked: true, onCheckedChange: noop },
  { label: 'Delete', icon: 'delete', tone: 'danger', onSelect: noop },
]

/**
 * One array used by both menus in the pairing, declared once, as the spec asks
 * screens to do.
 */
const ROW_COMMANDS: MenuEntry[] = [
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', icon: 'time', onSelect: noop },
  { kind: 'separator' },
  { label: 'Archive', icon: 'archive', onSelect: noop },
]

export const states: ComponentStates = {
  component: 'ContextMenu',

  entries: [
    {
      name: 'closed — the surface is all there is',
      render: () => (
        <ContextMenu entries={FULL_MIX}>
          <Card>
            <p>Login loop after password reset. Right-click for the ticket commands.</p>
          </Card>
        </ContextMenu>
      ),
      expect: { 'data-state': 'closed' },
    },
    {
      name: 'the pairing — the same commands, one visible door and one faster one',
      render: () => (
        <Table label="Tickets">
          <Table.Head>
            <Table.Row>
              <Table.Header>Ticket</Table.Header>
              <Table.Header>Subject</Table.Header>
              <Table.Header>Actions</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <ContextMenu entries={ROW_COMMANDS}>
              <Table.Row>
                <Table.Cell>T-1041</Table.Cell>
                <Table.Cell>Login loop after password reset</Table.Cell>
                <Table.Cell>
                  <Menu
                    defaultOpen
                    trigger={
                      <Button
                        variant="ghost"
                        tone="neutral"
                        iconOnly
                        icon="overflow"
                        label="Ticket actions"
                      />
                    }
                    items={ROW_COMMANDS}
                  />
                </Table.Cell>
              </Table.Row>
            </ContextMenu>
            <Table.Row>
              <Table.Cell>T-1039</Table.Cell>
              <Table.Cell>Invoice shows the wrong currency</Table.Cell>
              <Table.Cell />
            </Table.Row>
          </Table.Body>
        </Table>
      ),
    },
  ],

  requiredSelectors: [
    '[data-state="open"]',
    '[data-highlighted]',
    '[data-tone="danger"]',
    '[data-disabled]',
    '[data-state="checked"]',
  ],
}
