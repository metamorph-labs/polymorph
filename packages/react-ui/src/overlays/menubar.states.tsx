import { type ComponentStates } from '@polymorph/react'
import styles from '@polymorph/recipes/overlays/menubar.module.css'
import type { MenuEntry } from './Menu'
import { Menubar, type MenubarMenu } from './Menubar'

/**
 * States fixture, from `design/components/menubar.md`'s States table.
 *
 * The open entries use `defaultOpen`, as Menu's do, because the gallery cannot
 * show a menu that appears only after a press. The phone form and the
 * right-to-left row are what every entry becomes at a phone's width and in a
 * right-to-left document, which no prop reaches: the member's test and the
 * shared law render them.
 */

const noop = () => {}

const FILE: MenuEntry[] = [
  { label: 'New', icon: 'add', kbd: '⌘N', onSelect: noop },
  { label: 'Open…', icon: 'folder', kbd: '⌘O', onSelect: noop },
  {
    kind: 'submenu',
    label: 'Open recent',
    items: [
      { label: 'Quarterly plan', onSelect: noop },
      { label: 'Launch checklist', onSelect: noop },
    ],
  },
  { kind: 'separator' },
  { label: 'Save', kbd: '⌘S', onSelect: noop },
  { label: 'Export…', icon: 'download', onSelect: noop },
  { kind: 'separator' },
  { label: 'Move to trash', icon: 'delete', tone: 'danger', onSelect: noop },
]

const EDIT: MenuEntry[] = [
  { label: 'Undo', icon: 'undo', kbd: '⌘Z', onSelect: noop },
  { label: 'Redo', kbd: '⇧⌘Z', disabled: true, onSelect: noop },
  { kind: 'separator' },
  { label: 'Cut', kbd: '⌘X', onSelect: noop },
  { label: 'Copy', icon: 'copy', kbd: '⌘C', onSelect: noop },
  { label: 'Paste', kbd: '⌘V', onSelect: noop },
]

const VIEW: MenuEntry[] = [
  { kind: 'label', label: 'Show' },
  { kind: 'checkbox', label: 'Ruler', checked: true, onCheckedChange: noop },
  { kind: 'checkbox', label: 'Grid', checked: false, onCheckedChange: noop },
  { kind: 'checkbox', label: 'Comments', checked: true, disabled: true, onCheckedChange: noop },
  { kind: 'separator' },
  { label: 'Zoom in', onSelect: noop },
  { label: 'Zoom out', onSelect: noop },
]

const HELP: MenuEntry[] = [
  { label: 'Keyboard shortcuts', icon: 'help', onSelect: noop },
  { label: 'Send feedback', icon: 'comment', onSelect: noop },
]

const MENUS: MenubarMenu[] = [
  { label: 'File', entries: FILE },
  { label: 'Edit', entries: EDIT },
  { label: 'View', entries: VIEW },
  { label: 'Help', entries: HELP },
]

/** Insert is disabled, between two titles that are not. */
const WITH_DISABLED: MenubarMenu[] = [
  { label: 'File', entries: FILE },
  { label: 'Edit', entries: EDIT },
  { label: 'Insert', disabled: true, entries: [{ label: 'Table', onSelect: noop }] },
  { label: 'View', entries: VIEW },
  { label: 'Help', entries: HELP },
]

/** A document tool's whole row, longer than a narrow box. */
const LONG: MenubarMenu[] = [
  'File',
  'Edit',
  'View',
  'Insert',
  'Format',
  'Arrange',
  'Tools',
  'Table',
  'Window',
  'Help',
].map((label) => ({ label, entries: [{ label: `${label} settings`, onSelect: noop }] }))

export const states: ComponentStates = {
  component: 'Menubar',

  entries: [
    {
      name: 'resting — the titles, and no menu open',
      render: () => <Menubar label="Document" menus={MENUS} />,
    },
    {
      name: 'one menu open — its panel under its title, at its start edge',
      render: () => <Menubar label="Document" menus={MENUS} defaultOpen="File" />,
    },
    {
      name: 'checkbox entries — toggles that leave the menu open',
      render: () => <Menubar label="Document" menus={MENUS} defaultOpen="View" />,
    },
    {
      name: 'a disabled title — passed over by the keys',
      render: () => <Menubar label="Document" menus={WITH_DISABLED} />,
    },
    {
      // The box is the container, as the fixture is the consumer that sizes it.
      name: 'a long row in a narrow box — the row scrolls inside it',
      render: () => (
        <div className={styles.harness}>
          <Menubar label="Document" menus={LONG} />
        </div>
      ),
    },
  ],

  /*
   * The title's hover and focus ring are states no prop reaches. A row's
   * highlight is Menu's `data-highlighted`, which Radix sets from the pointer
   * and the keys, and Menu's recipe styles it through `composes`.
   */
  requiredSelectors: [
    '[data-state="open"]',
    ':hover',
    ':focus-visible',
    ':disabled',
    '[data-highlighted]',
    '[data-state="checked"]',
  ],
}
