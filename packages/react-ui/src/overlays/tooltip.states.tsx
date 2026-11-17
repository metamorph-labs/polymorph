import { type ComponentStates } from '@polymorph/react'
import { Button } from '../controls/Button'
import { Inline } from '../layout/Inline'
import { Tooltip, TooltipProvider, type TooltipSide } from './Tooltip'

/**
 * States fixture, from `design/components/tooltip.md`'s States table.
 *
 * Every entry has its own provider. The delays are an app-level decision and the
 * gallery is not an app, so each entry stands alone instead of depending on a
 * provider another entry mounted.
 */

const SIDES: TooltipSide[] = ['top', 'right', 'bottom', 'left']

export const states: ComponentStates = {
  component: 'Tooltip',

  entries: [
    {
      name: 'closed — hover or focus the trigger',
      render: () => (
        <TooltipProvider>
          <Tooltip content="Archive this ticket">
            <Button variant="outline" tone="neutral" iconOnly icon="archive" label="Archive" />
          </Tooltip>
        </TooltipProvider>
      ),
    },
    ...SIDES.map((side) => ({
      name: `open, side ${side}`,
      render: () => (
        <TooltipProvider>
          <Inline justify="center">
            <Tooltip defaultOpen side={side} content={`Grows out of the ${side} edge`}>
              <Button variant="outline" tone="neutral" label={side} />
            </Tooltip>
          </Inline>
        </TooltipProvider>
      ),
    })),
    {
      name: 'long content wraps at the max width',
      render: () => (
        <TooltipProvider>
          <Inline justify="center">
            <Tooltip
              defaultOpen
              side="bottom"
              content="A hint long enough to wrap onto several lines, which is already longer than a tooltip should be."
            >
              <Button variant="outline" tone="neutral" label="Long hint" />
            </Tooltip>
          </Inline>
        </TooltipProvider>
      ),
    },
    {
      name: 'a row of them — the second opens without waiting again',
      render: () => (
        <TooltipProvider>
          <Inline gap={2}>
            <Tooltip content="Archive">
              <Button variant="ghost" tone="neutral" iconOnly icon="archive" label="Archive" />
            </Tooltip>
            <Tooltip content="Duplicate">
              <Button variant="ghost" tone="neutral" iconOnly icon="duplicate" label="Duplicate" />
            </Tooltip>
            <Tooltip content="Delete">
              <Button variant="ghost" tone="danger" iconOnly icon="delete" label="Delete" />
            </Tooltip>
          </Inline>
        </TooltipProvider>
      ),
    },
  ],

  requiredSelectors: ['[data-state="delayed-open"]', '[data-side="top"]', '[data-side="bottom"]'],
}
