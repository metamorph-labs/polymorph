import { type ComponentStates, CONTROL_SIZES, lawfulCells } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { Button, BUTTON_GRID, type ButtonAppearance, type ButtonGrid } from './Button'

/**
 * States fixture, from `design/components/button.md`'s States table.
 *
 * The variant × tone rows come from `lawfulCells(BUTTON_GRID)` rather than a hand-written list, so
 * the gallery shows exactly the cells that exist. An unlawful cell cannot be drawn here, just as it
 * cannot be typed at a call site, and a cell added to the grid appears here automatically.
 */

const CELLS = lawfulCells<ButtonGrid>(BUTTON_GRID)

/**
 * The cells are lawful by construction, but `lawfulCells` returns the *cross product* type, every
 * variant against every tone. The assertion is safe here, and it is made once rather than per entry.
 */
function cell(pair: { variant: string; tone: string }): ButtonAppearance {
  return pair as ButtonAppearance
}

export const states: ComponentStates = {
  component: 'Button',

  entries: [
    ...CELLS.map((pair) => ({
      name: `${pair.variant} / ${pair.tone}`,
      render: () => <Button {...cell(pair)} label="Save" />,
      expect: { 'data-variant': pair.variant, 'data-tone': pair.tone, 'data-state': null },
    })),
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <Button key={size} size={size} icon="add" label={size} />
          ))}
        </Inline>
      ),
    },
    {
      name: 'size sm',
      render: () => <Button size="sm" label="Save" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size md',
      render: () => <Button label="Save" />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'size lg',
      render: () => <Button size="lg" label="Save" />,
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'leading icon',
      render: () => <Button icon="add" label="New ticket" />,
    },
    {
      name: 'trailing icon',
      render: () => <Button trailingIcon="next" label="Continue" />,
    },
    {
      name: 'icon-only',
      render: () => <Button iconOnly icon="edit" label="Edit" />,
      expect: { 'data-icon-only': '', 'aria-label': 'Edit' },
    },
    {
      name: 'icon-only at every size',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <Button key={size} size={size} iconOnly icon="delete" label={`Delete (${size})`} />
          ))}
        </Inline>
      ),
    },
    {
      name: 'loading',
      render: () => <Button loading label="Saving" />,
      expect: { 'data-state': 'loading', 'aria-busy': 'true' },
    },
    {
      name: 'loading, with a leading icon it replaces',
      render: () => <Button loading icon="add" label="New ticket" />,
    },
    {
      name: 'disabled',
      render: () => <Button disabled label="Save" />,
      expect: { 'data-disabled': '', disabled: '' },
    },
    {
      name: 'loading + disabled',
      render: () => <Button loading disabled label="Saving" />,
      expect: { 'data-state': 'loading', 'data-disabled': '', 'aria-busy': 'true' },
    },
    {
      name: 'pressed on — the active cell, latched',
      render: () => <Button variant="soft" pressed label="Watching" />,
      expect: { 'data-state': 'on', 'aria-pressed': 'true' },
    },
    {
      name: 'pressed off — the rest row, still telling the toggle’s truth',
      render: () => <Button variant="soft" pressed={false} label="Watching" />,
      expect: { 'data-state': 'off', 'aria-pressed': 'false' },
    },
    {
      name: 'expanded — a disclosure’s trigger while its region shows',
      render: () => (
        <Button variant="ghost" tone="neutral" expanded iconOnly icon="up" label="Details" />
      ),
      expect: { 'aria-expanded': 'true' },
    },
    {
      name: 'collapsed — the same trigger while its region is hidden',
      render: () => (
        <Button
          variant="ghost"
          tone="neutral"
          expanded={false}
          iconOnly
          icon="down"
          label="Details"
        />
      ),
      expect: { 'aria-expanded': 'false' },
    },
    {
      name: 'a count on the corner of an icon-only button',
      render: () => (
        <Button
          variant="ghost"
          tone="neutral"
          iconOnly
          icon="notification"
          label="Notifications"
          count={{ value: 3, label: 'Notifications, 3 unread' }}
        />
      ),
      expect: { 'aria-label': 'Notifications, 3 unread' },
    },
    {
      name: 'a count past its cap',
      render: () => (
        <Button
          variant="ghost"
          tone="neutral"
          iconOnly
          icon="notification"
          label="Notifications"
          count={{ value: 128, label: 'Notifications, 128 unread' }}
        />
      ),
      expect: { 'aria-label': 'Notifications, 128 unread' },
    },
    {
      name: 'a count of zero',
      render: () => (
        <Button
          variant="ghost"
          tone="neutral"
          iconOnly
          icon="notification"
          label="Notifications"
          count={{ value: 0, label: 'Notifications, 0 unread' }}
        />
      ),
      expect: { 'aria-label': 'Notifications' },
    },
    {
      name: 'a count beside a label',
      render: () => (
        <Button
          variant="outline"
          tone="neutral"
          label="Inbox"
          count={{ value: 12, label: 'Inbox, 12 unread' }}
        />
      ),
      expect: { 'aria-label': 'Inbox, 12 unread' },
    },
    {
      name: 'a count at every size',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <Button
              key={size}
              size={size}
              variant="ghost"
              tone="neutral"
              iconOnly
              icon="notification"
              label={`Notifications (${size})`}
              count={{ value: 7, label: `Notifications (${size}), 7 unread` }}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'every cell, disabled',
      render: () => (
        <Inline gap={3} wrap>
          {/* The danger cells come last, as a danger Button does in any group (`danger-last`). */}
          {[
            ...CELLS.filter((pair) => pair.tone !== 'danger'),
            ...CELLS.filter((pair) => pair.tone === 'danger'),
          ].map((pair) => (
            <Button
              key={`${pair.variant}/${pair.tone}`}
              {...cell(pair)}
              disabled
              label={`${pair.variant}/${pair.tone}`}
            />
          ))}
        </Inline>
      ),
    },
  ],

  requiredSelectors: [
    ':hover',
    ':active',
    ':focus-visible',
    '[data-state="loading"]',
    '[data-state="on"]',
    '[data-disabled]',
  ],
}
