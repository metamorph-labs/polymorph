import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { funnelChartLaw } from '@polymorph/conformance/funnel-chart'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { reactAdapter } from '../conformance/react'
import { FunnelChart, type FunnelChartProps } from './FunnelChart'
import { states } from './funnel-chart.states'

/**
 * What a browser settles for FunnelChart: the closed surface and the dev
 * warnings. The bars' lengths, the words that fit, the keys, the pointer, the
 * twin and the direction are the law's (`@polymorph/conformance/funnel-chart`),
 * which this file calls for React.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<FunnelChartProps>(true)
  })
})

funnelChartLaw({
  shell: 'React',
  mount: async (props) => render(<FunnelChart {...props} />),
})

describe('FunnelChart in React', () => {
  it('warns once about a stage that rises, and draws it as given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(
      <FunnelChart
        stages={[
          { key: 'trial', label: 'Started a trial', value: 400 },
          { key: 'invited', label: 'Invited a teammate', value: 520 },
        ]}
        label="Rising"
      />,
    )
    await vi.waitFor(() => expect(container.querySelectorAll('path[class*="bar"]')).toHaveLength(2))
    const said = warn.mock.calls.map((call) => String(call[0]))
    expect(said.filter((line) => line.includes('larger than the stage before'))).toHaveLength(1)
    warn.mockRestore()
  })

  it('says the plot can be activated only when it has an onSelect', () => {
    const { container, rerender } = render(<FunnelChart stages={[]} label="Hint" />)
    expect(container.textContent).not.toContain('Enter or Space selects')
    rerender(
      <FunnelChart
        stages={[{ key: 'a', label: 'A', value: 1 }]}
        label="Hint"
        onSelect={() => {}}
      />,
    )
    expect(container.textContent).toContain('Enter or Space selects')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({
  shell: 'React',
  member: 'FunnelChart',
  entries: states.entries,
  adapter: reactAdapter,
})
