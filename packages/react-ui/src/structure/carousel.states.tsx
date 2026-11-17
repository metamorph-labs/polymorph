import { type ComponentStates } from '@polymorph/react'
import { FixtureBox } from '../conventions/FixtureBox'
import { Carousel, type CarouselSlide } from './Carousel'

/** States fixture, from `design/components/carousel.md`'s States table. */

const TOUR: CarouselSlide[] = [
  { id: 'compose', label: 'Compose', content: <FixtureBox tall>Compose a request</FixtureBox> },
  { id: 'send', label: 'Send', content: <FixtureBox tall>Send and inspect</FixtureBox> },
  { id: 'share', label: 'Share', content: <FixtureBox tall>Share the run</FixtureBox> },
]

const labels = {
  label: 'Product tour',
  previousLabel: 'Previous step',
  nextLabel: 'Next step',
}

export const states: ComponentStates = {
  component: 'Carousel',

  entries: [
    {
      name: 'a tour',
      render: () => <Carousel slides={TOUR} {...labels} />,
      expect: { 'aria-roledescription': 'carousel', 'aria-label': 'Product tour' },
    },
    {
      name: 'second slide',
      render: () => <Carousel slides={TOUR} {...labels} defaultIndex={1} />,
    },
    {
      name: 'looping — the ends join',
      render: () => <Carousel slides={TOUR} {...labels} loop />,
    },
    {
      name: 'at the end — next disabled without loop',
      render: () => <Carousel slides={TOUR} {...labels} defaultIndex={2} />,
    },
    {
      name: 'controlled — the app owns the position',
      render: () => <Carousel slides={TOUR} {...labels} index={2} />,
    },
    {
      name: 'empty — the page tells that story, not the deck',
      render: () => <Carousel slides={[]} {...labels} />,
      rendersNothing: true,
    },
  ],

  /*
   * The dots' pointer states and the rail's position attribute. The previous
   * and next buttons are vocabulary Buttons with their own stylesheet.
   */
  requiredSelectors: [':hover', ':focus-visible', '[aria-current="true"]'],
}
