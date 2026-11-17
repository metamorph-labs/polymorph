import { type ComponentStates } from '@polymorph/react'
import { ColorInput } from './ColorInput'

/** States fixture, from `design/components/color-input.md`'s States table. */

export const states: ComponentStates = {
  component: 'ColorInput',

  entries: [
    {
      name: 'rest',
      render: () => (
        <ColorInput
          defaultValue="#8864f0"
          pickerLabel="Choose accent colour"
          aria-label="Accent colour"
        />
      ),
    },
    {
      name: 'open — the picker popover',
      render: () => (
        <ColorInput
          defaultValue="#8864f0"
          pickerLabel="Choose accent colour"
          aria-label="Accent colour"
          defaultOpen
        />
      ),
    },
    {
      name: 'alpha — the fourth channel',
      render: () => (
        <ColorInput
          alpha
          defaultValue="#8864f0cc"
          pickerLabel="Choose highlight colour"
          aria-label="Highlight colour"
          defaultOpen
        />
      ),
      expect: { 'data-alpha': '' },
    },
    {
      name: 'sizes',
      render: () => (
        <>
          <ColorInput
            size="sm"
            defaultValue="#0089ea"
            pickerLabel="Choose accent colour"
            aria-label="Accent colour"
          />
          <ColorInput
            size="md"
            defaultValue="#0089ea"
            pickerLabel="Choose accent colour"
            aria-label="Accent colour"
          />
          <ColorInput
            size="lg"
            defaultValue="#0089ea"
            pickerLabel="Choose accent colour"
            aria-label="Accent colour"
          />
        </>
      ),
    },
    {
      name: 'invalid',
      render: () => (
        <ColorInput
          defaultValue="#8864f0"
          pickerLabel="Choose accent colour"
          aria-label="Accent colour"
          invalid
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => (
        <ColorInput
          defaultValue="#8864f0"
          pickerLabel="Choose accent colour"
          aria-label="Accent colour"
          disabled
        />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'controlled — the app owns the value',
      render: () => (
        <ColorInput value="#0089ea" pickerLabel="Choose accent colour" aria-label="Accent colour" />
      ),
    },
  ],

  /*
   * The pointer states of the swatch and the thumbs, the dragging state that React Aria reports
   * and the member exposes, and the three root modes. Only the stylesheet can show `dragging`,
   * because no prop can produce a held thumb.
   */
  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="dragging"]',
    '[data-invalid]',
    '[data-disabled]',
    '[data-alpha]',
  ],
}
