import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Lightbox, type LightboxImage } from './Lightbox'

/**
 * States fixture, from `design/components/lightbox.md`'s States table.
 *
 * The pictures are data URIs, as Image's are, because a fixture that depends on
 * the network renders differently when the request fails. Each carries its own
 * width and height, so the lightbox fits it by its natural size.
 *
 * Every entry but one is closed and opens from its own trigger, as Dialog's
 * entries do: an entry open on mount covers the whole page. The one open entry
 * is there because the identity law reads rendered fixtures, and only an open
 * lightbox renders the element that carries `data-member`. It keeps its
 * trigger, because the panel portals out of the container.
 *
 * The page's direction is the document's, so no entry is right to left. The
 * recipe's mirrored arrows are in `requiredSelectors`, and the law in
 * `@polymorph/conformance/lightbox` opens a lightbox in a right-to-left
 * document.
 */

const svg = (markup: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(markup)

/** A picture of one colour field with a sun and a ridge, at the size given. */
const scene = (width: number, height: number, sky: string, ground: string) =>
  svg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${sky}"/>` +
      `<circle cx="${width * 0.72}" cy="${height * 0.34}" r="${Math.min(width, height) * 0.12}" fill="#f2c879"/>` +
      `<path d="M0 ${height}V${height * 0.7}L${width * 0.25} ${height * 0.48}l${width * 0.22} ${height * 0.27} ${width * 0.2}-${height * 0.2} ${width * 0.33} ${height * 0.29}V${height}z" fill="${ground}"/>` +
      '</svg>',
  )

const PREVIEW: LightboxImage = {
  src: scene(960, 600, '#2f4a6b', '#1c2f47'),
  alt: 'The checkout page with an error banner over the payment form',
}

const SET: LightboxImage[] = [
  { src: scene(1200, 800, '#2f4a6b', '#1c2f47'), alt: 'A harbour at dusk' },
  { src: scene(800, 1000, '#3b5d3a', '#1f331e'), alt: 'A pine ridge in the morning' },
  { src: scene(1200, 900, '#6b3f2f', '#3a2018'), alt: 'Red cliffs over a dry river' },
]

const WIDE: LightboxImage = {
  src: scene(2400, 900, '#2f4a6b', '#1c2f47'),
  alt: 'A panorama of the harbour from the north wall',
}

const TALL: LightboxImage = {
  src: scene(600, 1600, '#3b5d3a', '#1f331e'),
  alt: 'The settings screen on a phone, scrolled to the bottom',
}

export const states: ComponentStates = {
  component: 'Lightbox',

  entries: [
    {
      name: 'one picture — no previous, next or position',
      render: () => (
        <Lightbox
          label="Attachment preview"
          images={[PREVIEW]}
          trigger={<Button variant="outline" tone="neutral" label="View the preview" />}
        />
      ),
    },
    {
      name: 'open — the second of three pictures',
      render: () => (
        <Lightbox
          defaultOpen
          defaultIndex={1}
          label="Photographs"
          images={SET}
          trigger={<Button variant="outline" tone="neutral" label="View the photographs" />}
        />
      ),
    },
    {
      name: 'several pictures',
      render: () => (
        <Lightbox
          label="Photographs"
          images={SET}
          trigger={<Button variant="outline" tone="neutral" label="View the photographs" />}
        />
      ),
    },
    {
      name: 'a wide picture — fitted by its width',
      render: () => (
        <Lightbox
          label="Panorama"
          images={[WIDE]}
          trigger={<Button variant="outline" tone="neutral" label="View the panorama" />}
        />
      ),
    },
    {
      name: 'a tall picture — fitted by its height',
      render: () => (
        <Lightbox
          label="Phone screenshot"
          images={[TALL]}
          trigger={<Button variant="outline" tone="neutral" label="View the screenshot" />}
        />
      ),
    },
    {
      name: 'a picture that fails — Image’s fallback',
      render: () => (
        <Lightbox
          label="Attachment preview"
          images={[{ src: '', alt: 'The preview of the uploaded receipt' }]}
          trigger={<Button variant="outline" tone="neutral" label="View the receipt" />}
        />
      ),
    },
  ],

  /*
   * A leaving panel's `data-state`, which the substrate sets during the exit;
   * the panel's focus, which the substrate gives it when a press lands on the
   * picture; and the page's reading direction, which mirrors the travel
   * controls. No prop reaches any of them.
   */
  requiredSelectors: ['[data-state="closed"]', ':focus-visible', '[dir="rtl"]'],
}
