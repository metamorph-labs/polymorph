'use client'

import { type ComponentStates } from '@polymorph/react'
import { Grid } from '../layout/Grid'
import { ImageEditor } from './ImageEditor'

/**
 * States fixture, from `design/components/image-editor.md`'s States table.
 *
 * The spec's `dragover` row is the one entry missing here, because a drag cannot be synthesized
 * in a fixture (as in FileUpload). The selector is asserted through `requiredSelectors` instead.
 *
 * The image is a deterministic data-URI test card, a labelled quadrant grid, so the effect of pan,
 * zoom and the mask is *visible* in the gallery, and nothing is fetched.
 */

const TEST_CARD =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <rect width="320" height="240" fill="#4e6fae"/>
      <rect x="320" width="320" height="240" fill="#7a5fb0"/>
      <rect y="240" width="320" height="240" fill="#568a6c"/>
      <rect x="320" y="240" width="320" height="240" fill="#b0655e"/>
      <circle cx="320" cy="240" r="70" fill="#f4f1ea"/>
      <text x="320" y="252" font-family="sans-serif" font-size="36" text-anchor="middle" fill="#333">640×480</text>
    </svg>`,
  )

const noop = () => {}

export const states: ComponentStates = {
  component: 'ImageEditor',

  entries: [
    {
      name: 'empty — the doorway',
      render: () => <ImageEditor onConfirm={noop} onCancel={noop} />,
      expect: { 'data-empty': '' },
    },
    {
      name: 'loaded — stage, tools, actions',
      render: () => <ImageEditor src={TEST_CARD} onConfirm={noop} onCancel={noop} />,
    },
    {
      name: 'circle mask — the avatar’s truth',
      render: () => <ImageEditor src={TEST_CARD} mask="circle" onConfirm={noop} onCancel={noop} />,
      expect: { 'data-mask': 'circle' },
    },
    {
      name: 'wide crop',
      render: () => (
        <ImageEditor src={TEST_CARD} aspectRatio={16 / 9} onConfirm={noop} onCancel={noop} />
      ),
    },
    {
      name: 'no cancel — an inline editor has nowhere to go back to',
      render: () => <ImageEditor src={TEST_CARD} onConfirm={noop} />,
    },
    {
      name: 'rounded mask — the card’s cut-out',
      render: () => <ImageEditor src={TEST_CARD} mask="rounded" onConfirm={noop} onCancel={noop} />,
      expect: { 'data-mask': 'rounded' },
    },
    {
      name: 'every control offered — rotate, flip, reset, and the grid',
      render: () => (
        <ImageEditor src={TEST_CARD} flip reset grid maxZoom={8} onConfirm={noop} onCancel={noop} />
      ),
    },
    {
      name: 'disabled',
      render: () => <ImageEditor src={TEST_CARD} disabled onConfirm={noop} onCancel={noop} />,
      expect: { 'data-disabled': '' },
    },
    {
      name: 'two shapes side by side — the stage tracks its column',
      render: () => (
        <Grid columns={2} gap={6}>
          <ImageEditor src={TEST_CARD} mask="circle" onConfirm={noop} />
          <ImageEditor src={TEST_CARD} aspectRatio={16 / 9} onConfirm={noop} />
        </Grid>
      ),
    },
  ],

  requiredSelectors: [
    '[data-dragover]',
    '[data-panning]',
    '[data-disabled]',
    '[data-busy]',
    '[data-animate]',
  ],
}
