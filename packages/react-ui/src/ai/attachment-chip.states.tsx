'use client'

import { type ComponentStates } from '@polymorph/react'
import { Inline } from '../layout/Inline'
import { AttachmentChip } from './AttachmentChip'

/** States fixture, from `design/components/attachment-chip.md`'s States table. */

export const states: ComponentStates = {
  component: 'AttachmentChip',

  entries: [
    {
      name: 'removable — in the composer, with the name and the size',
      render: () => <AttachmentChip name="retry-policy.pdf" size={184_320} onRemove={() => {}} />,
      expect: { 'data-status': 'done' },
    },
    {
      name: 'sent — in a message, nothing to remove',
      render: () => <AttachmentChip name="retry-policy.pdf" size={184_320} />,
      expect: { 'data-status': 'done' },
    },
    {
      name: 'openable — the name is a link to the file',
      render: () => (
        <AttachmentChip
          name="retry-policy.pdf"
          size={184_320}
          href="https://files.example.org/retry-policy.pdf"
        />
      ),
    },
    {
      name: 'uploading — the spinner takes the mark',
      render: () => <AttachmentChip name="screenshot.png" status="uploading" onRemove={() => {}} />,
      expect: { 'data-status': 'uploading' },
    },
    {
      name: 'error — the app’s words, in the danger ink',
      render: () => (
        <AttachmentChip
          name="archive.zip"
          status="error"
          message="Too large for this plan"
          onRemove={() => {}}
        />
      ),
      expect: { 'data-status': 'error' },
    },
    {
      name: 'a long name — ellipsed, the control still reachable',
      render: () => (
        <Inline gap={2}>
          <AttachmentChip
            name="quarterly-webhook-delivery-report-with-every-retry-and-its-outcome-2026.csv"
            size={2_457_600}
            icon="table"
            onRemove={() => {}}
          />
        </Inline>
      ),
    },
  ],

  /*
   * The remove button's hover and focus belong to Button, and the name's
   * belong to Link. The chip's own states are props, and the entries assert
   * `data-status`. The required selectors are the statuses the stylesheet
   * keys on beyond the shared block.
   */
  requiredSelectors: ['[data-status="error"]', '[data-status="uploading"]'],
}
