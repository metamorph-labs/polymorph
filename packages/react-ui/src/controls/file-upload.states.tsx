'use client'

import { type ComponentStates } from '@polymorph/react'
import { FileUpload, type FileUploadItem } from './FileUpload'

/**
 * States fixture, from `design/components/file-upload.md`'s States table.
 *
 * The spec's `dragover` row is the one entry missing here, because a drag cannot be expressed as
 * props. It goes to `requiredSelectors` per the fixture convention (`design/components/README.md`,
 * fixture derivation) and is simulated in `file-upload.test.tsx` instead, where a real
 * `DragEvent` can be dispatched on a real zone.
 */

const noop = () => undefined

const UPLOADING: FileUploadItem = {
  id: 'a',
  name: 'quarterly-report.pdf',
  size: 2_411_724,
  status: 'uploading',
  progress: 40,
}

const DONE: FileUploadItem = {
  id: 'b',
  name: 'logo-mark.svg',
  size: 14_208,
  status: 'done',
}

const FAILED: FileUploadItem = {
  id: 'c',
  name: 'customer-export.csv',
  size: 91_226_112,
  status: 'error',
  message: 'Larger than the 50 MB limit',
}

export const states: ComponentStates = {
  component: 'FileUpload',

  entries: [
    {
      name: 'idle',
      render: () => (
        <FileUpload
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          hint="PDF, PNG or SVG · up to 50 MB"
          aria-label="Attachments"
        />
      ),
      expect: { 'data-state': 'idle' },
    },
    {
      name: 'uploading',
      render: () => (
        <FileUpload
          files={[UPLOADING]}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          aria-label="Attachments"
        />
      ),
    },
    {
      name: 'mixed list — one of each status',
      render: () => (
        <FileUpload
          files={[UPLOADING, DONE, FAILED]}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          aria-label="Attachments"
        />
      ),
    },
    {
      name: 'error with retry',
      render: () => (
        <FileUpload
          files={[FAILED]}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          onRetry={noop}
          aria-label="Attachments"
        />
      ),
    },
    {
      name: 'invalid',
      render: () => (
        <FileUpload
          invalid
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          aria-label="Attachments"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => (
        <FileUpload
          disabled
          files={[DONE]}
          onFilesAdd={noop}
          onReject={noop}
          onRemove={noop}
          aria-label="Attachments"
        />
      ),
      expect: { 'data-disabled': '' },
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="dragover"]',
    '[data-status="error"]',
    '[data-disabled]',
  ],
}
