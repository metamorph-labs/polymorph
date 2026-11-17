import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Hero } from './Hero'

/** States fixture, from `design/components/hero.md`'s States table. */

const LEDE =
  'Every design decision is made exactly once, referenced everywhere, verified by law, and safely changeable — by people and by agents.'

export const states: ComponentStates = {
  component: 'Hero',

  entries: [
    {
      name: 'opening moment',
      render: () => (
        <Hero
          title="One vocabulary. Any number of faces."
          lede={LEDE}
          actions={<Button variant="solid" tone="accent" label="Browse components" />}
        />
      ),
      expect: { 'data-align': 'start' },
    },
    {
      name: 'centered',
      render: () => (
        <Hero
          align="center"
          title="One vocabulary. Any number of faces."
          lede={LEDE}
          actions={
            <>
              <Button variant="solid" tone="accent" label="Browse components" />
              <Button variant="ghost" tone="neutral" label="Read the brief" />
            </>
          }
        />
      ),
      expect: { 'data-align': 'center' },
    },
    {
      name: 'title alone',
      render: () => <Hero title="One vocabulary. Any number of faces." />,
      expect: { 'data-align': 'start' },
    },
  ],

  requiredSelectors: [],
}
