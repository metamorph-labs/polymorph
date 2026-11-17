import { type ComponentStates } from '@polymorph/react'
import { CodeBlock } from './CodeBlock'

/**
 * States fixture, from `design/components/code-block.md`'s States table.
 *
 * The second entry's line is wider than any test viewport, so `data-overflowing`
 * is a real measurement. Its absence on the first entry is the opposite case.
 */

const WIDE_LINE =
  'polymorph add button dialog drawer command popover menu tabs tooltip toast alert card ' +
  'accordion badge avatar separator kbd spinner progress stepper skeleton table data-table ' +
  'filter-bar pagination stat settings-row breadcrumbs page-header empty-state'

export const states: ComponentStates = {
  component: 'CodeBlock',

  entries: [
    {
      name: 'command',
      render: () => (
        <CodeBlock>{`pnpm install
pnpm dev
pnpm proof`}</CodeBlock>
      ),
      expect: { 'data-overflowing': null },
    },
    {
      name: 'wide line — scrolls in itself, never the page',
      render: () => <CodeBlock>{WIDE_LINE}</CodeBlock>,
      expect: { 'data-overflowing': '', tabindex: '0', role: 'region' },
    },
    {
      name: 'copyable — the corner control, named "Copy"',
      render: () => <CodeBlock copyable>pnpm add @polymorph/react-ui</CodeBlock>,
    },
  ],

  // A post-interaction state that props cannot render, so per the states-fixture
  // rule the selector is listed here and the browser test performs the press.
  requiredSelectors: ['[data-state="copied"]'],
}
