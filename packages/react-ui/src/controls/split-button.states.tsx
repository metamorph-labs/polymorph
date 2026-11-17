import { type ComponentStates } from '@polymorph/react'
import type { MenuEntry } from '../overlays/Menu'
import { SplitButton } from './SplitButton'

/**
 * States fixture, from `design/components/split-button.md`'s States table.
 *
 * Every entry is a variant of the label's verb, such as "Resolve and notify", never
 * "Delete". A command that contradicts the primary belongs in a different control. The
 * one destructive variant is inside the menu, separated and styled with Menu's quiet
 * danger tone.
 */

const noop = () => {}

const RESOLVE: MenuEntry[] = [
  { label: 'Resolve and notify', onSelect: noop },
  { label: 'Resolve as duplicate', onSelect: noop },
]

const WITH_DANGER: MenuEntry[] = [
  ...RESOLVE,
  { kind: 'separator' },
  { label: 'Resolve and delete thread', tone: 'danger', onSelect: noop },
]

export const states: ComponentStates = {
  component: 'SplitButton',

  entries: [
    {
      name: 'solid accent — the default default',
      render: () => (
        <SplitButton label="Resolve" entries={RESOLVE} menuLabel="More resolve options" />
      ),
      expect: { 'data-variant': 'solid', 'data-tone': 'accent', 'data-size': 'md' },
    },
    {
      name: 'soft accent',
      render: () => (
        <SplitButton
          variant="soft"
          label="Resolve"
          entries={RESOLVE}
          menuLabel="More resolve options"
        />
      ),
      expect: { 'data-variant': 'soft' },
    },
    {
      name: 'outline accent',
      render: () => (
        <SplitButton
          variant="outline"
          label="Resolve"
          entries={RESOLVE}
          menuLabel="More resolve options"
        />
      ),
      expect: { 'data-variant': 'outline', 'data-tone': 'accent' },
    },
    {
      name: 'outline neutral — the one lawful neutral',
      render: () => (
        <SplitButton
          variant="outline"
          tone="neutral"
          label="Export"
          entries={[
            { label: 'Export as CSV', onSelect: noop },
            { label: 'Export as JSON', onSelect: noop },
          ]}
          menuLabel="More export options"
        />
      ),
      expect: { 'data-variant': 'outline', 'data-tone': 'neutral' },
    },
    {
      name: 'with icon — leading on the primary',
      render: () => (
        <SplitButton
          icon="confirm"
          label="Resolve"
          entries={RESOLVE}
          menuLabel="More resolve options"
        />
      ),
    },
    {
      name: 'size sm',
      render: () => (
        <SplitButton size="sm" label="Resolve" entries={RESOLVE} menuLabel="More resolve options" />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <SplitButton size="lg" label="Resolve" entries={RESOLVE} menuLabel="More resolve options" />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'open — the siblings one chevron behind',
      render: () => (
        <SplitButton
          defaultOpen
          label="Resolve"
          entries={RESOLVE}
          menuLabel="More resolve options"
        />
      ),
    },
    {
      name: 'danger entry — the quarantine, one hairline further away',
      render: () => (
        <SplitButton
          defaultOpen
          label="Resolve"
          entries={WITH_DANGER}
          menuLabel="More resolve options"
        />
      ),
    },
    {
      name: 'loading — one command in flight is the group’s state',
      render: () => (
        <SplitButton
          loading
          icon="confirm"
          label="Resolve"
          entries={RESOLVE}
          menuLabel="More resolve options"
        />
      ),
    },
    {
      name: 'disabled — the whole group; halves never disagree',
      render: () => (
        <SplitButton disabled label="Resolve" entries={RESOLVE} menuLabel="More resolve options" />
      ),
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':active',
    ':focus-visible',
    '[data-state="loading"]',
    '[data-state="open"]',
    '[data-disabled]',
  ],
}
