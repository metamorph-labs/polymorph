'use client'

import { useState } from 'react'

import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { Countdown } from './Countdown'
import { Text } from './Text'

/**
 * States fixture, from `design/components/countdown.md`'s States table.
 *
 * Each moment is computed *at render*, a fixed distance ahead of now, so a
 * gallery cell or a screenshot starts from the same time left whenever it is
 * drawn, as RelativeTime's fixture does. The cells then tick, which is the
 * member.
 */

const SECOND_MS = 1000

const ahead = (ms: number) => new Date(Date.now() + ms).toISOString()
const back = (ms: number) => new Date(Date.now() - ms).toISOString()

/**
 * The composition the spec shows: the Button that waits for the end is the
 * application's, disabled until the Countdown says the moment is reached.
 */
function ResendBeside() {
  const [locked, setLocked] = useState(true)
  const [until] = useState(() => ahead(30 * SECOND_MS))
  return (
    <Inline gap={3} align="center">
      <Text>
        Send a new code in{' '}
        <Countdown
          until={until}
          label="Time until a new code can be sent"
          onEnd={() => setLocked(false)}
        />
      </Text>
      <Button
        variant="outline"
        tone="neutral"
        size="sm"
        label="Send a new code"
        disabled={locked}
      />
    </Inline>
  )
}

export const states: ComponentStates = {
  component: 'Countdown',

  entries: [
    {
      name: 'minutes — m:ss',
      render: () => (
        <Countdown until={ahead(299 * SECOND_MS)} label="Time until the code expires" />
      ),
      expect: { 'data-ended': null },
    },
    {
      name: 'hours — h:mm:ss from an hour',
      render: () => (
        <Countdown until={ahead(3725 * SECOND_MS)} label="Time until the session ends" />
      ),
    },
    {
      name: 'ended — 0:00 once the moment is reached',
      render: () => <Countdown until={back(5 * SECOND_MS)} label="Time until the code expires" />,
      expect: { 'data-ended': '' },
    },
    {
      name: 'locale — the locale’s numerals and words',
      render: () => (
        <Countdown
          until={ahead(299 * SECOND_MS)}
          label="Time until the code expires"
          locale="ar-EG"
        />
      ),
    },
    {
      name: 'announced — a polite line at one minute and at ten seconds',
      render: () => (
        <Countdown until={ahead(65 * SECOND_MS)} label="Time until the code expires" announce />
      ),
    },
    {
      name: 'beside a Button — the application enables it at the end',
      render: () => <ResendBeside />,
    },
    {
      name: 'invalid — no moment, so nothing renders',
      render: () => <Countdown until="not-a-moment" label="Time until the code expires" />,
      rendersNothing: true,
    },
  ],

  /*
   * None. Every state comes from `until`, and nothing here can be pressed or
   * focused.
   */
  requiredSelectors: [],
}
