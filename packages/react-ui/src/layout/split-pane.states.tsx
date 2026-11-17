import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/layout/split-pane.module.css'
import { FixtureBox } from '../conventions/FixtureBox'
import { SplitPane } from './SplitPane'

/**
 * States fixture, from `design/components/split-pane.md`'s States table.
 *
 * A stacked split divides the height its container gives it, so that entry
 * renders inside a fixed-height harness (ScrollArea's pattern). Its root
 * attribute is asserted in the browser test, because the entry's root is the
 * harness.
 */

const pane = (name: string) => <FixtureBox tall>{name}</FixtureBox>

export const states: ComponentStates = {
  component: 'SplitPane',

  entries: [
    {
      name: 'even — the default apportionment',
      render: () => (
        <SplitPane label="Resize navigator" start={pane('navigator')} end={pane('canvas')} />
      ),
    },
    {
      name: 'apportioned — a narrow start pane',
      render: () => (
        <SplitPane
          label="Resize navigator"
          defaultRatio={0.3}
          start={pane('navigator')}
          end={pane('canvas')}
        />
      ),
    },
    {
      name: 'floors — minmax holds what the ratio cannot',
      render: () => (
        <SplitPane
          label="Resize navigator"
          startMin={160}
          endMin={160}
          start={pane('navigator')}
          end={pane('canvas')}
        />
      ),
    },
    {
      name: 'stacked — request above response',
      render: () => (
        <div className={styles.harness}>
          <SplitPane
            label="Resize response"
            orientation="vertical"
            start={pane('request')}
            end={pane('response')}
          />
        </div>
      ),
    },
    {
      name: 'controlled — the app owns the ratio',
      render: () => (
        <SplitPane
          label="Resize navigator"
          ratio={0.66}
          start={pane('navigator')}
          end={pane('canvas')}
        />
      ),
    },
  ],

  /*
   * States a prop cannot reach: the divider's pointer states, and the stacked
   * recipe keyed on the orientation attribute. The vocabulary emits `dragging`
   * from the pointer interaction it handles (Slider emits the same attribute and
   * its substrate does not), so only the stylesheet can show it has a recipe.
   */
  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="dragging"]',
    '[data-orientation="vertical"]',
  ],
}
