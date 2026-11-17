'use client'

import { type ComponentStates } from '@polymorph/react'
import { Stack } from '../layout/Stack'
import { InlineEdit } from './InlineEdit'

/** States fixture, from `design/components/inline-edit.md`'s States table. */

const noop = () => {}

const LONG =
  'Acme billing and invoicing for the European and North American subsidiaries, including the reseller programme'

export const states: ComponentStates = {
  component: 'InlineEdit',

  entries: [
    {
      name: 'rest — the value as text, with its edit control beside it',
      render: () => <InlineEdit label="Project name" value="Acme billing" onCommit={noop} />,
      expect: { 'data-size': 'md' },
    },
    {
      name: 'empty — the placeholder, muted, in place of the value',
      render: () => (
        <InlineEdit label="Device name" value="" placeholder="Unnamed device" onCommit={noop} />
      ),
    },
    {
      name: 'editing — the field holds the value, with save and cancel beside it',
      render: () => (
        <InlineEdit label="Project name" value="Acme billing" defaultEditing onCommit={noop} />
      ),
      expect: { 'data-editing': '' },
    },
    {
      name: 'pending — a save in flight: the field is read-only and save is busy',
      render: () => (
        <InlineEdit label="Workspace name" value="Acme" defaultEditing pending onCommit={noop} />
      ),
      expect: { 'data-editing': '' },
    },
    {
      name: 'failed — the error the app passes, under the field and tied to it',
      render: () => (
        <InlineEdit
          label="Project name"
          value="Acme billing"
          defaultEditing
          error="A project named Acme billing already exists."
          onCommit={noop}
        />
      ),
      expect: { 'data-editing': '' },
    },
    {
      name: 'required, blank — save stays disabled until there is text',
      render: () => (
        <InlineEdit
          label="Team name"
          value=""
          placeholder="Team name"
          required
          defaultEditing
          onCommit={noop}
        />
      ),
      expect: { 'data-editing': '' },
    },
    {
      name: 'disabled — the value stays, its edit control does not',
      render: () => (
        <InlineEdit label="Project name" value="Acme billing" disabled onCommit={noop} />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'size sm',
      render: () => (
        <InlineEdit label="Project name" value="Acme billing" size="sm" onCommit={noop} />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <InlineEdit label="Project name" value="Acme billing" size="lg" onCommit={noop} />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'long value — it wraps, and its field fills the width it is given',
      render: () => (
        <Stack gap={3}>
          <InlineEdit label="Project name" value={LONG} onCommit={noop} />
          <InlineEdit label="Project name" value={LONG} defaultEditing onCommit={noop} />
        </Stack>
      ),
    },
  ],

  /*
   * Empty on purpose. Hover, focus and the busy state are the Buttons' and the Input's, whose own
   * fixtures assert them, and every state of this member's own parts is reachable from a prop.
   */
  requiredSelectors: [],
}
