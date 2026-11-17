import {
  cond,
  describeMember,
  each,
  el,
  identity,
  js,
  lit,
  member,
  run,
  text,
  words,
  type Node,
  type PartShell,
} from '../dsl'

const PAYLOAD = {
  id: 'tkt_5417',
  title: 'Sync fails on large workspaces',
  priority: 2,
  resolved: false,
  assignee: { name: 'Ada Okonkwo', team: 'Platform' },
  labels: ['sync', 'performance'],
  closedAt: null,
}

const EVERY_KIND = { string: 'a string', number: 41.5, boolean: true, nothing: null }

/** An entry's key and its colon, when it sits in a container. */
const keyed: Node = cond('name !== undefined', [
  el('span', { part: 'key', class: ['key'] }, [
    text('name'),
    el('span', { class: ['colon'] }, [words(':')]),
  ]),
])

/**
 * JsonTree.Entry: one value of the tree, a leaf or a container, rendering its
 * own entries one level deeper. Each container holds whether it is open, so
 * browsing stays uncontrolled.
 */
const entry: PartShell = {
  name: 'Entry',
  public: false,
  purpose: 'one value of the tree, a leaf or a container with its entries',
  props: {
    name: { type: 'string', optional: true, doc: 'The key or index it sits under.' },
    value: { type: 'unknown' },
    depth: { type: 'number' },
    defaultDepth: { type: 'number' },
  },
  state: { open: 'depth < defaultDepth' },
  derived: {
    // A container's entries as key and value pairs; `null` for a leaf.
    entries:
      "typeof value === 'object' && value !== null ? (Array.isArray(value) ? value.map((item: unknown, index: number) => [String(index), item] as const) : Object.entries(value)) : null",
    // Non-JSON values (`undefined`, functions) take the muted `null` tone instead of crashing.
    kind: "value === null ? 'null' : typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'null'",
    spelled: "kind === 'string' ? JSON.stringify(value) : String(value)",
    // The collapsed summary, which is the toggle's name too.
    summary:
      "Array.isArray(value) ? `[…] ${value.length} ${value.length === 1 ? 'item' : 'items'}` : `{…} ${entries?.length ?? 0} ${entries?.length === 1 ? 'key' : 'keys'}`",
  },
  template: cond(
    'entries === null',
    [
      el('li', { part: 'row', class: ['row'] }, [
        keyed,
        el('span', { part: 'value', class: ['value'], attrs: { 'data-kind': 'kind' } }, [
          text('spelled'),
        ]),
      ]),
    ],
    // `{}` and `[]` are leaves: a toggle that expands into nothing would mislead.
    'entries.length === 0',
    [
      el('li', { part: 'row', class: ['row'] }, [
        keyed,
        el('span', { part: 'summary', class: ['summary'] }, [
          text("Array.isArray(value) ? '[]' : '{}'"),
        ]),
      ]),
    ],
    [
      el('li', { part: 'row', class: ['row'] }, [
        el(
          'button',
          {
            part: 'toggle',
            class: ['toggle'],
            attrs: { type: lit('button'), 'aria-expanded': 'open' },
            on: { click: run('open = !open') },
          },
          [
            el(
              'span',
              { part: 'chevron', class: ['chevron'], attrs: { 'aria-hidden': lit('true') } },
              [member('Icon', { name: lit('next'), size: lit('sm') })],
            ),
            keyed,
            el('span', { part: 'summary', class: ['summary'] }, [text('summary')]),
          ],
        ),
        cond('open', [
          el('ul', { part: 'children', class: ['children'] }, [
            each('entries', 'pair', 'pair[0]', [
              member('JsonTreeEntry', {
                name: 'pair[0]',
                value: 'pair[1]',
                depth: 'depth + 1',
                defaultDepth: 'defaultDepth',
              }),
            ]),
          ]),
        ]),
      ]),
    ],
  ),
}

/**
 * JsonTree (`design/components/json-tree.md`): a browsable view of one JSON
 * value. Objects and arrays collapse and leaves are coloured by kind. Not
 * `role="tree"`: nested lists announce depth and count, and a button with
 * `aria-expanded` gives Tab and Enter natively.
 */
export default describeMember({
  member: 'JsonTree',
  dir: 'structure',
  recipe: 'structure/json-tree',
  defaults: { defaultDepth: '1' },
  // The spec's `agent` fence. Each branch holds whether it is open, so the tree reads its
  // branches from its own toggles in the document, by the recipe's classes, and `expand` and
  // `collapse` press a toggle, as a person does.
  agent: {
    on: 'tree',
    state: {
      expanded: 'jsonTreeExpanded(tree, styles.toggle, styles.key)',
      branches: 'jsonTreeBranches(tree, styles.toggle, styles.key)',
    },
    actions: {
      expand: {
        argument: 'id',
        run: 'setJsonTreeBranch(tree, styles.toggle, styles.key, value, true)',
      },
      collapse: {
        argument: 'id',
        run: 'setJsonTreeBranch(tree, styles.toggle, styles.key, value, false)',
      },
    },
  },
  template: el(
    'ul',
    { ref: 'tree', class: ['root'], attrs: { 'aria-label': 'label', ...identity('JsonTree') } },
    [member('JsonTreeEntry', { value: 'data', depth: '0', defaultDepth: 'defaultDepth' })],
  ),
  parts: [entry],
  states: [
    {
      name: 'a payload — the first ring open',
      props: { data: PAYLOAD, label: 'Response body' },
      expect: { 'aria-label': 'Response body' },
    },
    {
      name: 'closed fist — depth 0',
      props: { data: PAYLOAD, label: 'Response body', defaultDepth: 0 },
    },
    {
      name: 'wide open — every ring',
      props: { data: PAYLOAD, label: 'Response body', defaultDepth: js('Infinity') },
    },
    {
      name: 'every kind',
      props: { data: EVERY_KIND, label: 'Every kind', defaultDepth: js('Infinity') },
    },
    {
      name: 'empty containers — leaves, no toggle',
      props: {
        data: { empty: {}, none: [] },
        label: 'Empty containers',
        defaultDepth: js('Infinity'),
      },
    },
    { name: 'primitive root', props: { data: 42, label: 'A number alone' } },
  ],
})
