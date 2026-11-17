import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/structure/tree.module.css'
import { Tree, type TreeItem } from './Tree'

/** States fixture, from `design/components/tree.md`'s States table. */

const PLATFORM: TreeItem = { id: 'platform', label: 'Platform', hasChildren: true }

const ENGINEERING: TreeItem[] = [
  PLATFORM,
  { id: 'applications', label: 'Applications' },
  { id: 'data', label: 'Data' },
]

/** Three top-level units: a loaded branch, a branch the app has not loaded, and a leaf. */
const units = (engineering: Partial<TreeItem> = {}, design: Partial<TreeItem> = {}): TreeItem[] => [
  { id: 'engineering', label: 'Engineering', children: ENGINEERING, ...engineering },
  { id: 'design', label: 'Design', hasChildren: true, ...design },
  { id: 'sales', label: 'Sales', description: 'Three regions' },
]

const DEEP: TreeItem[] = [
  {
    id: 'company',
    label: 'Northwind',
    children: [
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
      },
      { id: 'sales', label: 'Sales' },
    ],
  },
]

const LONG: TreeItem[] = [
  {
    id: 'programme',
    label: 'Customer support operations for Europe, the Middle East and Africa',
    children: [
      {
        id: 'archive',
        label: 'ticket-export-eu-west-1-production-customer-support-archive',
        description: 'Holds the exports of the last twelve months, one unit for each region',
      },
    ],
  },
]

export const states: ComponentStates = {
  component: 'Tree',

  entries: [
    {
      name: 'a small tree — one branch open',
      render: () => (
        <Tree
          label="Organization units"
          items={units()}
          defaultExpanded={new Set(['engineering'])}
        />
      ),
      expect: { 'aria-label': 'Organization units' },
    },
    {
      name: 'nothing open',
      render: () => <Tree label="Organization units" items={units()} />,
    },
    {
      name: 'a selected item',
      render: () => (
        <Tree
          label="Organization units"
          items={units()}
          defaultExpanded={new Set(['engineering'])}
          defaultValue="applications"
        />
      ),
    },
    {
      name: 'a branch that is loading',
      render: () => (
        <Tree
          label="Organization units"
          items={units({}, { loading: true })}
          defaultExpanded={new Set(['design'])}
        />
      ),
    },
    {
      name: 'a level with more to load',
      render: () => (
        <Tree
          label="Organization units"
          items={units({ hasMore: true })}
          defaultExpanded={new Set(['engineering'])}
          hasMore
        />
      ),
    },
    {
      name: 'more of a level loading — the row that asks is busy',
      render: () => (
        <Tree
          label="Organization units"
          items={units({ hasMore: true, loading: true })}
          defaultExpanded={new Set(['engineering'])}
        />
      ),
    },
    {
      name: 'a disabled item',
      render: () => (
        <Tree
          label="Organization units"
          items={units({}, { disabled: true })}
          defaultExpanded={new Set(['engineering'])}
        />
      ),
    },
    {
      name: 'a deep tree — four levels',
      render: () => (
        <Tree
          label="Organization units"
          items={DEEP}
          defaultExpanded={new Set(['company', 'engineering', 'platform'])}
        />
      ),
    },
    {
      name: 'long labels at a narrow width',
      render: () => (
        <div className={styles.harness}>
          <Tree label="Organization units" items={LONG} defaultExpanded={new Set(['programme'])} />
        </div>
      ),
    },
  ],

  requiredSelectors: [':hover', ':focus-visible', '[aria-expanded="true"]'],
}
