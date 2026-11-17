'use client'

import { useState } from 'react'

import { type ComponentStates, type ModePreference } from '@polymorph/react'
import { ModeSwitch } from './ModeSwitch'

/**
 * States fixture, from `design/components/mode-switch.md`'s States table.
 *
 * `'use client'` because the controlled entry holds its choice in state and passes a handler.
 *
 * The first entry follows the document, so in the workbench gallery it shows and sets the
 * workbench's own mode. The controlled entry holds its choice the way an application that saves
 * it does, and the contract's keys run there, so the behaviour law does not change the mode of
 * the page it runs on.
 */

/** The application around a controlled ModeSwitch: it holds the choice and applies none. */
function Held() {
  const [value, setValue] = useState<ModePreference>('light')
  return <ModeSwitch label="Appearance" value={value} onChange={setValue} />
}

export const states: ComponentStates = {
  component: 'ModeSwitch',

  entries: [
    {
      name: 'uncontrolled — the document’s preference',
      // The segment checked is the document's preference, which the fixture does not choose, so
      // only the root is checked here. `mode-switch.test.tsx` checks the segments.
      render: () => <ModeSwitch label="Appearance" />,
      expect: { role: 'radiogroup', 'data-size': 'md' },
    },
    {
      name: 'controlled — the application holds the choice',
      render: () => <Held />,
      expect: { role: 'radiogroup' },
    },
    {
      name: 'sm',
      render: () => <ModeSwitch label="Appearance" value="dark" size="sm" />,
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'disabled — while the application saves the last choice',
      render: () => <ModeSwitch label="Appearance" value="system" disabled />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'localized',
      render: () => (
        <ModeSwitch
          label="Apparence"
          value="light"
          messages={{ light: 'Clair', dark: 'Sombre', system: 'Système' }}
        />
      ),
    },
  ],

  /*
   * The SegmentedControl's: hover and focus, which no prop can produce, and the two attribute
   * states Radix writes on the segments. The recipe is SegmentedControl's.
   */
  requiredSelectors: [':hover', ':focus-visible', '[data-state="checked"]', '[data-disabled]'],
}
