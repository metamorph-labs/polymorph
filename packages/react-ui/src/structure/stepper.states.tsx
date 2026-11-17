'use client'

import { type ComponentStates } from '@polymorph/react'
import { Stepper } from './Stepper'

/** States fixture, from `design/components/stepper.md`'s States table. */

const noop = () => {}

const MIGRATION = [
  { label: 'Connect' },
  { label: 'Map fields' },
  { label: 'Review' },
  { label: 'Import' },
]

const DESCRIBED = [
  { label: 'Connect', description: 'Point us at your old help desk' },
  { label: 'Map fields', description: 'Match their names to ours' },
  { label: 'Review', description: 'Check a sample of 20 tickets' },
  { label: 'Import', description: 'Roughly an hour for 10,000' },
]

export const states: ComponentStates = {
  component: 'Stepper',

  entries: [
    {
      name: 'mid-flow — two done, one current, one to come',
      render: () => <Stepper steps={MIGRATION} activeIndex={2} />,
      expect: { 'data-orientation': 'horizontal' },
    },
    {
      name: 'start — nothing behind you yet',
      render: () => <Stepper steps={MIGRATION} activeIndex={0} />,
    },
    {
      name: 'end — the last step is the current one',
      render: () => <Stepper steps={MIGRATION} activeIndex={3} />,
    },
    {
      name: 'with descriptions',
      render: () => <Stepper steps={DESCRIBED} activeIndex={1} />,
    },
    {
      name: 'revisitable — completed steps are real buttons',
      render: () => <Stepper steps={MIGRATION} activeIndex={2} onStepSelect={noop} />,
    },
    {
      name: 'vertical',
      render: () => <Stepper steps={DESCRIBED} activeIndex={2} orientation="vertical" />,
      expect: { 'data-orientation': 'vertical' },
    },
    {
      // The error flag sets how the step looks now. The connector fill and the
      // revisitable button still follow `activeIndex`, which the browser test
      // asserts.
      name: 'errored step — the danger family on the mark, the sentence unchanged',
      render: () => (
        <Stepper
          steps={[
            { label: 'Connect' },
            { label: 'Map fields', error: true },
            { label: 'Review' },
            { label: 'Import' },
          ]}
          activeIndex={2}
        />
      ),
    },
  ],

  requiredSelectors: [
    '[data-state="completed"]',
    '[data-state="active"]',
    '[data-state="upcoming"]',
    '[data-state="error"]',
    ':focus-visible',
  ],
}
