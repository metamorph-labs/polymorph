'use client'

import { cloneElement, useEffect, useState, type ReactElement } from 'react'

import { Button } from '../controls/Button'
import { type ComponentStates } from '@polymorph/react'
import { Command, type CommandItem, type CommandProps } from './Command'

/**
 * States fixture, from `design/components/command.md`'s States table.
 *
 * Every entry has a working launcher, for Drawer's reason: the app owns the ⌘K
 * binding and the open state, so a floating panel with no way in or out would
 * leave out the part an application writes. Two entries start open: the
 * palette as it opens, and the palette with a query typed. A palette portals
 * over the whole page, and six open ones would stack six scrims and
 * misrepresent the single token they all use.
 *
 * Each entry writes its palette inline, as the launcher's child, so a
 * conformance run can set its props. The launcher gives the palette the open
 * state it owns and calls the palette's own `onOpenChange` as well: the
 * `open` an entry writes is a placeholder the launcher replaces, and its
 * `onOpenChange` hears every change the palette asks for.
 */

type Palette = ReactElement<CommandProps>

/** The launcher's open state, given to its palette, and the press that opens it. */
function useLaunched(palette: Palette, startOpen: boolean): [Palette, () => void] {
  const [open, setOpen] = useState(startOpen)
  const launched = cloneElement(palette, {
    open,
    onOpenChange: (next: boolean) => {
      palette.props.onOpenChange(next)
      setOpen(next)
    },
  })
  return [launched, () => setOpen(true)]
}

function Launcher({
  label,
  startOpen = false,
  children,
}: {
  label: string
  startOpen?: boolean
  children: Palette
}) {
  const [palette, launch] = useLaunched(children, startOpen)

  return (
    <>
      <Button variant="outline" tone="neutral" label={label} onClick={launch} />
      {palette}
    </>
  )
}

/** How many frames the typed entry waits for its panel before giving up. */
const PANEL_FRAMES = 60

/**
 * Open, with a query already typed. Command takes no query prop, because the
 * query is the reader's, so this entry types it into the field the palette
 * renders, the way a reader would, once the panel is up.
 */
function Typed({ query, children }: { query: string; children: Palette }) {
  const [palette, launch] = useLaunched(children, true)
  const { placeholder } = children.props

  useEffect(() => {
    let frame = 0
    let waited = 0
    const type = () => {
      const field = document.querySelector<HTMLInputElement>(
        `[data-member="command"] input[placeholder="${placeholder}"]`,
      )
      if (field === null) {
        if (++waited < PANEL_FRAMES) frame = requestAnimationFrame(type)
        return
      }
      // React reads a typed value through the input's own setter, so the
      // prototype's setter and an `input` event are what make this a keystroke.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, query)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    frame = requestAnimationFrame(type)
    return () => cancelAnimationFrame(frame)
  }, [query, placeholder])

  return (
    <>
      <Button variant="outline" tone="neutral" label="Open the palette" onClick={launch} />
      {palette}
    </>
  )
}

const noop = () => {}

const FLAT: CommandItem[] = [
  { id: 'new', label: 'New ticket', icon: 'add', hint: 'N', onSelect: () => {} },
  { id: 'search', label: 'Search tickets', icon: 'search', onSelect: () => {} },
  { id: 'assign', label: 'Assign to me', icon: 'user', onSelect: () => {} },
  { id: 'archive', label: 'Archive ticket', icon: 'archive', onSelect: () => {} },
]

const GROUPED: CommandItem[] = [
  { id: 'new', label: 'New ticket', icon: 'add', hint: 'N', group: 'Tickets', onSelect: () => {} },
  {
    id: 'assign',
    label: 'Assign to me',
    icon: 'user',
    group: 'Tickets',
    keywords: ['owner', 'mine'],
    onSelect: () => {},
  },
  {
    id: 'theme',
    label: 'Switch theme',
    icon: 'mode-dark',
    group: 'Workspace',
    onSelect: () => {},
  },
  {
    id: 'settings',
    label: 'Open settings',
    icon: 'settings',
    hint: ',',
    group: 'Workspace',
    onSelect: () => {},
  },
]

const WITH_DISABLED: CommandItem[] = [
  { id: 'new', label: 'New ticket', icon: 'add', onSelect: () => {} },
  { id: 'merge', label: 'Merge tickets', icon: 'duplicate', disabled: true, onSelect: () => {} },
]

export const states: ComponentStates = {
  component: 'Command',

  entries: [
    {
      name: 'open',
      render: () => (
        <Launcher startOpen label="Open the palette">
          <Command open={false} onOpenChange={noop} items={FLAT} />
        </Launcher>
      ),
    },
    {
      name: 'open with a query — the results narrowed, Escape clears before it closes',
      render: () => (
        <Typed query="ticket">
          <Command
            open={false}
            onOpenChange={noop}
            placeholder="Search the commands…"
            items={FLAT}
          />
        </Typed>
      ),
    },
    {
      name: 'closed — the launcher is all there is',
      render: () => (
        <Launcher label="Open the palette">
          <Command open={false} onOpenChange={noop} items={FLAT} />
        </Launcher>
      ),
    },
    {
      name: 'groups',
      render: () => (
        <Launcher label="Grouped commands">
          <Command open={false} onOpenChange={noop} items={GROUPED} />
        </Launcher>
      ),
    },
    {
      name: 'with hints and icons',
      render: () => (
        <Launcher label="Hints and icons">
          <Command open={false} onOpenChange={noop} items={FLAT} />
        </Launcher>
      ),
    },
    {
      name: 'loading',
      render: () => (
        <Launcher label="Loading commands">
          <Command open={false} onOpenChange={noop} loading items={[]} />
        </Launcher>
      ),
    },
    {
      name: 'empty',
      render: () => (
        <Launcher label="No commands">
          <Command
            open={false}
            onOpenChange={noop}
            items={[]}
            emptyMessage="No matching commands"
          />
        </Launcher>
      ),
    },
    {
      name: 'a disabled command',
      render: () => (
        <Launcher label="With a disabled command">
          <Command open={false} onOpenChange={noop} items={WITH_DISABLED} />
        </Launcher>
      ),
    },
    {
      name: 'chaining — the palette stays open',
      render: () => (
        <Launcher label="Chained commands">
          <Command open={false} onOpenChange={noop} closeOnSelect={false} items={FLAT} />
        </Launcher>
      ),
    },
  ],

  requiredSelectors: [':focus-visible', '[data-highlighted]', '[data-disabled]', '[data-loading]'],
}
