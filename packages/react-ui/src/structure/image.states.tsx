import { type ComponentStates } from '@polymorph/react'
import { Grid } from '../layout/Grid'
import { Image } from './Image'

/**
 * States fixture, from `design/components/image.md`'s States table.
 *
 * The pictures are data URIs, because a fixture that depends on the network
 * renders differently when the request fails. Each carries its own width and
 * height, so the entry with no size given has a natural size to draw at.
 *
 * No entry promises the loading state. It lasts from the element to its
 * picture, and a picture the browser has already decoded is complete at once,
 * so the state an entry is in when the law reads it depends on what ran before.
 * `image.test.tsx` holds it, with a picture no test has requested. The failed
 * entries pass an empty `src`, which is failed from the first render.
 */

const svg = (markup: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(markup)

const HARBOUR = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
    '<rect width="320" height="200" fill="#2f4a6b"/>' +
    '<circle cx="236" cy="72" r="28" fill="#f2c879"/>' +
    '<path d="M0 200V140L80 96l70 54 64-40 106 58v32z" fill="#1c2f47"/>' +
    '</svg>',
)

const MARK = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="14" fill="#2f4a6b"/>' +
    '<path d="M22 46V18h12a9 9 0 0 1 0 18H22m12 0 10 10" fill="none" stroke="#fff" stroke-width="5"/>' +
    '</svg>',
)

/** The harbour again at twice the pixels, the file a dense screen asks for. */
const HARBOUR_DENSE = svg(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 320 200">' +
    '<rect width="320" height="200" fill="#2f4a6b"/>' +
    '<circle cx="236" cy="72" r="28" fill="#f2c879"/>' +
    '<path d="M0 200V140L80 96l70 54 64-40 106 58v32z" fill="#1c2f47"/>' +
    '</svg>',
)

const HARBOUR_ALT = 'A harbour at dusk'

export const states: ComponentStates = {
  component: 'Image',

  entries: [
    {
      name: 'a picture at its own size — the box is held before it arrives',
      render: () => <Image src={HARBOUR} alt={HARBOUR_ALT} width={320} height={200} />,
      expect: { 'data-fit': 'contain', 'data-sized': '' },
    },
    {
      name: 'a brand mark — small, named and fetched at once',
      render: () => <Image src={MARK} alt="Relay" width={32} height={32} loading="eager" />,
      expect: { 'data-sized': '' },
    },
    {
      name: 'a set of files — the browser picks one for the screen',
      render: () => (
        <Image
          src={HARBOUR}
          srcSet={`${HARBOUR} 1x, ${HARBOUR_DENSE} 2x`}
          alt={HARBOUR_ALT}
          width={320}
          height={200}
        />
      ),
      expect: { 'data-sized': '' },
    },
    {
      name: 'the first view’s picture — fetched at once, ahead of the page’s others',
      render: () => (
        <Image
          src={HARBOUR}
          srcSet={`${HARBOUR} 320w, ${HARBOUR_DENSE} 640w`}
          alt={HARBOUR_ALT}
          width={320}
          height={200}
          loading="eager"
          fetchPriority="high"
        />
      ),
      expect: { 'data-sized': '' },
    },
    {
      name: 'decorative — an empty alt hides it from assistive technology',
      render: () => <Image src={HARBOUR} alt="" width={320} height={200} />,
    },
    {
      name: 'contained — the whole picture inside a frame of another ratio',
      render: () => (
        <Image src={HARBOUR} alt={HARBOUR_ALT} width={240} height={150} aspectRatio={1} />
      ),
      expect: { 'data-fit': 'contain' },
    },
    {
      name: 'cover — the same frame filled, the picture cropped',
      render: () => (
        <Image
          src={HARBOUR}
          alt={HARBOUR_ALT}
          width={240}
          height={150}
          aspectRatio={1}
          fit="cover"
        />
      ),
      expect: { 'data-fit': 'cover' },
    },
    {
      name: 'frames that take their container — three in a grid',
      render: () => (
        <Grid columns={3} gap={4}>
          <Image src={HARBOUR} alt={HARBOUR_ALT} aspectRatio={1.5} fit="cover" />
          <Image src={HARBOUR} alt={HARBOUR_ALT} aspectRatio={1.5} fit="cover" />
          <Image src={HARBOUR} alt={HARBOUR_ALT} aspectRatio={1.5} fit="cover" />
        </Grid>
      ),
    },
    {
      name: 'no size given — nothing is reserved, then the picture at its natural size',
      render: () => <Image src={HARBOUR} alt={HARBOUR_ALT} />,
      expect: { 'data-sized': null },
    },
    {
      name: 'failed — a meaningful image keeps its name on the fallback',
      render: () => <Image src="" alt={HARBOUR_ALT} width={320} height={200} />,
      expect: { 'data-state': 'failed', 'data-sized': '' },
    },
    {
      name: 'failed — a decorative image stays hidden',
      render: () => <Image src="" alt="" width={320} height={200} />,
      expect: { 'data-state': 'failed' },
    },
    {
      name: 'failed with no size given — the fallback has a size of its own',
      render: () => <Image src="" alt={HARBOUR_ALT} />,
      expect: { 'data-state': 'failed', 'data-sized': null },
    },
  ],

  // Every state is a prop or the outcome of the request: a picture has no
  // hover, no focus and no substrate.
  requiredSelectors: [],
}
