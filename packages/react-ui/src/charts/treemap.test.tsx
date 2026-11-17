import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { chartBoxLaw } from '@polymorph/conformance/chart-box'
import { treemapLaw } from '@polymorph/conformance/treemap'
import { installTestTheme } from '@polymorph/engine/testing'
import { assertGoverned } from '@polymorph/react'
import { reactAdapter } from '../conformance/react'
import { Treemap, type TreemapProps } from './Treemap'
import { states } from './treemap.states'

/**
 * What a browser settles for Treemap: the closed surface and the dev warnings.
 * The tiling, the labels that fit, the keys, the pointer, the twin and the
 * direction are the law's (`@polymorph/conformance/treemap`), which this file
 * calls for React.
 */

beforeAll(installTestTheme)

describe('the closed surface', () => {
  it('has no style escape hatch', () => {
    assertGoverned<TreemapProps>(true)
  })
})

treemapLaw({
  shell: 'React',
  mount: async (props) => render(<Treemap {...props} />),
})

describe('Treemap in React', () => {
  it('warns once that a third level is summed into the second, and draws the sum', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(
      <Treemap
        items={[
          {
            key: 'eng',
            label: 'Engineering',
            value: 60,
            children: [
              {
                key: 'platform',
                label: 'Platform',
                value: 40,
                children: [
                  { key: 'db', label: 'Databases', value: 25 },
                  { key: 'net', label: 'Network', value: 15 },
                ],
              },
              { key: 'apps', label: 'Apps', value: 20 },
            ],
          },
        ]}
        label="Deep"
      />,
    )
    await vi.waitFor(() =>
      expect(container.querySelectorAll('rect[class*="tile"]')).toHaveLength(2),
    )
    const said = warn.mock.calls.map((call) => String(call[0]))
    expect(said.filter((line) => line.includes('summed into'))).toHaveLength(1)
    warn.mockRestore()
  })

  it('says the plot can be activated only when it has an onSelect', () => {
    const { container, rerender } = render(<Treemap items={[]} label="Hint" />)
    expect(container.textContent).not.toContain('Enter or Space selects')
    rerender(
      <Treemap items={[{ key: 'a', label: 'A', value: 1 }]} label="Hint" onSelect={() => {}} />,
    )
    expect(container.textContent).toContain('Enter or Space selects')
  })
})

/* No part of a state is drawn past the chart's inline edges (`@polymorph/conformance/chart-box`). */
chartBoxLaw({ shell: 'React', member: 'Treemap', entries: states.entries, adapter: reactAdapter })
