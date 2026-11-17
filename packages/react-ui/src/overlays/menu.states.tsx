import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import type { MenuEntry } from './Menu'
import { Menu } from './Menu'

/**
 * States fixture, from `design/components/menu.md`'s States table.
 *
 * The open entries use `defaultOpen`, as the spec asks, because the gallery
 * cannot show a menu that appears only after a click.
 */

const noop = () => {}

const ITEMS: MenuEntry[] = [
  { kind: 'label', label: 'This ticket' },
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  { label: 'Snooze', icon: 'time', kbd: 'S', onSelect: noop },
  { label: 'Copy link', icon: 'link', kbd: '⌘', onSelect: noop },
  { kind: 'separator' },
  { label: 'Merge into…', disabled: true, onSelect: noop },
  { label: 'Delete', icon: 'delete', tone: 'danger', onSelect: noop },
]

/**
 * One level; the type does not allow two. The submenu row is the only place a
 * menu holds something other than a command, so it is shown beside the
 * commands rather than on its own.
 */
const NESTED: MenuEntry[] = [
  { label: 'Assign to me', icon: 'user', onSelect: noop },
  {
    kind: 'submenu',
    label: 'Move to',
    icon: 'archive',
    items: [
      { kind: 'label', label: 'Queues' },
      { label: 'Billing', onSelect: noop },
      { label: 'Onboarding', onSelect: noop },
      { kind: 'separator' },
      { label: 'Escalations', disabled: true, onSelect: noop },
    ],
  },
  { kind: 'submenu', label: 'Snooze until', icon: 'time', disabled: true, items: [] },
  { kind: 'separator' },
  { label: 'Delete', icon: 'delete', tone: 'danger', onSelect: noop },
]

const TRIGGER = <Button variant="ghost" tone="neutral" iconOnly icon="overflow" label="Actions" />

export const states: ComponentStates = {
  component: 'Menu',

  entries: [
    {
      name: 'closed — the trigger is all there is',
      render: () => <Menu trigger={TRIGGER} items={[{ label: 'Assign to me', onSelect: noop }]} />,
    },
    {
      name: 'open — labels, icons, hints, a separator and a danger command',
      render: () => <Menu defaultOpen trigger={TRIGGER} items={ITEMS} />,
    },
    {
      name: 'aligned to the end, for a trigger at the right edge',
      render: () => (
        <Menu
          defaultOpen
          align="end"
          trigger={TRIGGER}
          items={[
            { label: 'Assign to me', icon: 'user', onSelect: noop },
            { label: 'Snooze', icon: 'time', onSelect: noop },
          ]}
        />
      ),
    },
    {
      name: 'a submenu — one row that opens a list instead of running a command',
      render: () => <Menu defaultOpen trigger={TRIGGER} items={NESTED} />,
    },
    {
      name: 'commands only — no icons, no hints',
      render: () => (
        <Menu
          defaultOpen
          trigger={TRIGGER}
          items={[
            { label: 'Mark as read', onSelect: noop },
            { label: 'Mark as unread', onSelect: noop },
          ]}
        />
      ),
    },
    {
      name: 'checkbox entries — checked and unchecked, toggling without dismissal',
      render: () => (
        <Menu
          defaultOpen
          trigger={TRIGGER}
          items={[
            { kind: 'label', label: 'Columns' },
            { kind: 'checkbox', label: 'Status', checked: true, onCheckedChange: noop },
            { kind: 'checkbox', label: 'Assignee', checked: false, onCheckedChange: noop },
            {
              kind: 'checkbox',
              label: 'Replies',
              checked: true,
              onCheckedChange: noop,
              disabled: true,
            },
          ]}
        />
      ),
    },
  ],

  /*
   * The spec also lists `:focus-visible`, marked "(trigger)". The trigger is a
   * Button, which has the focus convention's ring in its own stylesheet. This
   * list is what this component's CSS must style, so including it would assert
   * Button's stylesheet under Menu's name.
   *
   * Items are deliberately left out too. Radix sets `data-highlighted` from
   * both pointer and keyboard, so one state covers both, and a focus ring as
   * well would show the same thing twice.
   */
  requiredSelectors: [
    '[data-state="open"]',
    '[data-highlighted]',
    '[data-tone="danger"]',
    '[data-disabled]',
    '[data-state="checked"]',
  ],
}
