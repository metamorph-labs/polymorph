import {
  cond,
  describeMember,
  el,
  flag,
  identity,
  lit,
  member,
  run,
  slot,
  text,
  when,
  type Node,
} from '../dsl'

const WIDE_LINE =
  'polymorph add button dialog drawer command popover menu tabs tooltip toast alert card ' +
  'accordion badge avatar separator kbd spinner progress stepper skeleton table data-table ' +
  'filter-bar pagination stat settings-row breadcrumbs page-header empty-state'

/** The block: its own scroll container, a tab stop and a named region only while it overflows. */
const block: Node = el(
  'pre',
  {
    class: ['block'],
    ref: 'block',
    attrs: {
      'data-overflowing': flag('overflowing'),
      'data-copyable': flag('copyable'),
      tabindex: when('overflowing', '0'),
      role: when('overflowing', lit('region')),
      'aria-label': when('overflowing', 'label'),
      ...identity('CodeBlock'),
    },
  },
  [el('code', {}, [slot()])],
)

/**
 * CodeBlock (`design/components/code-block.md`): a block of code, verbatim,
 * scrolling inside itself. It is measured on mount, when its box resizes, and
 * when its code changes, because a longer command in a box of the same size
 * changes no size an observer reports.
 *
 * `copyable` wraps the block with the corner control, which writes the slot's
 * text to the clipboard and confirms a successful write for the feedback time
 * CopyButton uses, in `copiedLabel`'s words. A refused write leaves a plain
 * copy control.
 */
export default describeMember({
  member: 'CodeBlock',
  dir: 'structure',
  recipe: 'structure/code-block',
  defaults: {
    label: lit('Code block'),
    copyable: 'false',
    copyLabel: lit('Copy'),
    copiedLabel: lit('Copied'),
  },
  state: { overflowing: 'false', copied: 'false', copies: '0' },
  derived: {
    copy: '() => void navigator.clipboard.writeText(slotText(slots.default)).then(() => { copied = true; copies += 1 }, () => undefined)',
  },
  effects: [
    {
      // `copyable` draws the block in another branch, a new element to observe.
      watch: 'copyable',
      resize: ['block'],
      mutation: ['block'],
      run: 'overflowing = block !== null && block.scrollWidth > block.clientWidth',
    },
    { watch: 'copies', mount: false, delay: '2000', run: 'copied = false' },
  ],
  template: cond(
    'copyable',
    [
      // The wrapper exists only when copyable, so a plain block's root is the `<pre>`.
      el('div', { class: ['copyable'], attrs: { 'data-state': when('copied', lit('copied')) } }, [
        block,
        el('div', { class: ['control'] }, [
          member(
            'Button',
            {
              variant: lit('ghost'),
              tone: lit('neutral'),
              size: lit('sm'),
              iconOnly: 'true',
              icon: "copied ? 'confirm' : 'copy'",
              label: 'copyLabel',
            },
            { on: { click: run('copy()') } },
          ),
        ]),
        // Polite, because a copy never justifies an interruption.
        el('span', { class: ['reader'], attrs: { 'aria-live': lit('polite') } }, [
          text("copied ? copiedLabel : ''"),
        ]),
      ]),
    ],
    [block],
  ),
  states: [
    {
      name: 'command',
      slots: { default: ['pnpm install\npnpm dev\npnpm proof'] },
      expect: { 'data-overflowing': null },
    },
    {
      name: 'wide line — scrolls in itself, never the page',
      slots: { default: [WIDE_LINE] },
      expect: { 'data-overflowing': '', tabindex: '0', role: 'region' },
    },
    {
      name: 'copyable — the corner control, named "Copy"',
      props: { copyable: true },
      slots: { default: ['pnpm add @polymorph/react-ui'] },
    },
  ],
})
