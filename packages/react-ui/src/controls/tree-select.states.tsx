import { type ComponentStates, CONTROL_SIZES } from '@polymorph/react'
import styles from '@polymorph/recipes/controls/tree-select.module.css'
import { Inline } from '../layout/Inline'
import { type TreeItem } from '../structure/Tree'
import { Button } from './Button'
import { FormField } from './FormField'
import { TreeSelect } from './TreeSelect'

/**
 * States fixture, from `design/components/tree-select.md`'s States table.
 *
 * The open entries portal their panel to `<body>`, so in the gallery they float
 * over the page rather than sitting in their section, as Select's do.
 */

const LABEL = 'Organization units'

/** Three top-level units: a loaded branch three levels deep, a branch the app has not loaded, and a leaf. */
const units = (engineering: Partial<TreeItem> = {}, design: Partial<TreeItem> = {}): TreeItem[] => [
  {
    id: 'engineering',
    label: 'Engineering',
    children: [
      {
        id: 'platform',
        label: 'Platform',
        children: [
          { id: 'runtime', label: 'Runtime' },
          { id: 'storage', label: 'Storage' },
        ],
      },
      { id: 'applications', label: 'Applications' },
    ],
    ...engineering,
  },
  { id: 'design', label: 'Design', hasChildren: true, ...design },
  { id: 'sales', label: 'Sales', description: 'Three regions' },
]

const LONG: TreeItem[] = [
  {
    id: 'programme',
    label: 'Customer support operations for Europe, the Middle East and Africa',
    children: [
      {
        id: 'archive',
        label: 'ticket-export-eu-west-1-production-customer-support-archive',
        description: 'Holds the exports of the last twelve months',
      },
    ],
  },
]

export const states: ComponentStates = {
  component: 'TreeSelect',

  entries: [
    {
      name: 'empty, with a placeholder',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units()}
          placeholder="Choose a unit"
          aria-label="Move under"
        />
      ),
      expect: { 'data-state': 'closed', 'data-size': 'md', 'data-placeholder': '' },
    },
    {
      name: 'a value',
      render: () => (
        <TreeSelect label={LABEL} items={units()} defaultValue="design" aria-label="Move under" />
      ),
      expect: { 'data-placeholder': null },
    },
    {
      name: 'a value deep in the hierarchy',
      render: () => (
        <TreeSelect label={LABEL} items={units()} defaultValue="runtime" aria-label="Move under" />
      ),
    },
    {
      name: 'open on a value deep in the hierarchy',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units()}
          defaultValue="runtime"
          defaultOpen
          aria-label="Move under, open on its unit"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open, a level loading',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units({}, { loading: true })}
          defaultExpanded={new Set(['design'])}
          defaultOpen
          placeholder="Choose a unit"
          aria-label="Move under, a level loading"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open, a level with more to load',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units({ hasMore: true })}
          hasMore
          defaultExpanded={new Set(['engineering'])}
          defaultOpen
          placeholder="Choose a unit"
          aria-label="Move under, more to load"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'open, disabled nodes',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units({}, { disabled: true }).map((unit) =>
            unit.id === 'sales' ? { ...unit, disabled: true } : unit,
          )}
          defaultExpanded={new Set(['engineering'])}
          defaultValue="applications"
          defaultOpen
          aria-label="Move under, with units that cannot be chosen"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'a value whose level is not loaded',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units()}
          defaultValue="brand"
          valueLabel="Brand"
          aria-label="Move under"
        />
      ),
      expect: { 'data-placeholder': null },
    },
    {
      name: 'the empty choice, chosen',
      render: () => (
        <TreeSelect label={LABEL} items={units()} emptyOption="Top level" aria-label="Move under" />
      ),
      // "Top level" is a chosen value, so the trigger is not in its placeholder state.
      expect: { 'data-placeholder': null },
    },
    {
      name: 'open on the empty choice',
      render: () => (
        <TreeSelect
          label={LABEL}
          items={units()}
          emptyOption="Top level"
          defaultOpen
          aria-label="Move under, open on the empty choice"
        />
      ),
      expect: { 'data-state': 'open' },
    },
    {
      name: 'sizes side by side',
      render: () => (
        <Inline gap={3}>
          {CONTROL_SIZES.map((size) => (
            <TreeSelect
              key={size}
              size={size}
              label={LABEL}
              items={units()}
              defaultValue="platform"
              aria-label={`Move under (${size})`}
            />
          ))}
        </Inline>
      ),
    },
    {
      name: 'size sm',
      render: () => (
        <TreeSelect
          size="sm"
          label={LABEL}
          items={units()}
          defaultValue="platform"
          aria-label="Move under"
        />
      ),
      expect: { 'data-size': 'sm' },
    },
    {
      name: 'size lg',
      render: () => (
        <TreeSelect
          size="lg"
          label={LABEL}
          items={units()}
          defaultValue="platform"
          aria-label="Move under"
        />
      ),
      expect: { 'data-size': 'lg' },
    },
    {
      name: 'invalid',
      render: () => (
        <TreeSelect
          invalid
          label={LABEL}
          items={units()}
          placeholder="Required"
          aria-label="Move under"
        />
      ),
      expect: { 'data-invalid': '' },
    },
    {
      name: 'disabled',
      render: () => (
        <TreeSelect
          disabled
          label={LABEL}
          items={units()}
          defaultValue="design"
          aria-label="Move under"
        />
      ),
      expect: { 'data-disabled': '' },
    },
    {
      name: 'long labels at a narrow width',
      render: () => (
        <div className={styles.harness}>
          <TreeSelect label={LABEL} items={LONG} defaultValue="archive" aria-label="Archive into" />
        </div>
      ),
    },
    {
      name: 'the move-target form',
      render: () => (
        <Inline gap={2} align="end" wrap>
          <FormField label="Move under" description="The unit and the units inside it move.">
            <TreeSelect label={LABEL} items={units()} emptyOption="Top level" />
          </FormField>
          <Button variant="soft" tone="accent" label="Move unit" />
        </Inline>
      ),
    },
  ],

  requiredSelectors: [
    ':hover',
    ':focus-visible',
    '[data-state="open"]',
    '[data-invalid]',
    '[data-disabled]',
  ],
}
