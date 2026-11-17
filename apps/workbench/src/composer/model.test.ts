import type { ScreenSpec } from '@polymorph/spec/schema'
import { describe, expect, it } from 'vitest'

import {
  commit,
  elementAt,
  HISTORY_LIMIT,
  insertChild,
  moveChild,
  parentOf,
  redo,
  removeAt,
  setProp,
  undo,
  updateAt,
  wrapIn,
  type History,
} from './model'

/**
 * The document model's laws: addresses name what the renderer draws, operations never mutate,
 * and the history is a list of documents. This is pure node-side logic. The composer page's own
 * tests cover the visual side.
 */

const spec: ScreenSpec = {
  spec: 'polymorph-screen/1',
  name: 'Probe',
  purpose: 'A fixture.',
  inputs: [],
  root: {
    component: 'Stack',
    props: { gap: 4 },
    children: [
      { component: 'Heading', children: ['Title'] },
      {
        component: 'SettingsRow',
        props: {
          label: 'Digest',
          control: { component: 'Switch', props: { checked: true } },
        },
      },
      { component: 'Badge', children: ['New'] },
    ],
  },
}

describe('addresses', () => {
  it('parses child steps and element-prop steps with one grammar', () => {
    expect(elementAt(spec, '$')?.component).toBe('Stack')
    expect(elementAt(spec, '$.children[0]')?.component).toBe('Heading')
    expect(elementAt(spec, '$.children[1].props.control')?.component).toBe('Switch')
    expect(elementAt(spec, '$.children[9]')).toBeNull()
    expect(elementAt(spec, '$.children[1].props.label')).toBeNull()
  })

  it('returns the parent of a node and the step that reaches it', () => {
    expect(parentOf('$.children[1].props.control')).toEqual({
      parent: '$.children[1]',
      step: { kind: 'prop', key: 'control' },
    })
    expect(parentOf('$')).toBeNull()
  })
})

describe('operations', () => {
  it('never mutate the original document', () => {
    const before = JSON.stringify(spec)
    removeAt(spec, '$.children[0]')
    insertChild(spec, '$', { component: 'Text', children: ['x'] })
    setProp(spec, '$.children[0]', 'level', 2)
    moveChild(spec, '$.children[0]', 1)
    wrapIn(spec, '$.children[2]', 'Card')
    expect(JSON.stringify(spec)).toBe(before)
  })

  it('removes a child, and removes an element slot by deleting the prop', () => {
    const fewer = removeAt(spec, '$.children[0]')
    expect(fewer.root.children).toHaveLength(2)
    const bare = removeAt(spec, '$.children[1].props.control')
    expect(elementAt(bare, '$.children[1].props.control')).toBeNull()
    expect(elementAt(bare, '$.children[1]')?.props?.label).toBe('Digest')
  })

  it('inserts at the end by default, or at a given index', () => {
    const appended = insertChild(spec, '$', { component: 'Text', children: ['tail'] })
    expect(appended.root.children).toHaveLength(4)
    const first = insertChild(spec, '$', { component: 'Text', children: ['head'] }, 0)
    expect(elementAt(first, '$.children[0]')?.component).toBe('Text')
  })

  it('sets props, and clears them by removing the key', () => {
    const leveled = setProp(spec, '$.children[0]', 'level', 2)
    expect(elementAt(leveled, '$.children[0]')?.props?.level).toBe(2)
    const cleared = setProp(leveled, '$.children[0]', 'level', undefined)
    expect(elementAt(cleared, '$.children[0]')?.props).toBeUndefined()
  })

  it('moves a child within bounds and refuses a move past either end', () => {
    const swapped = moveChild(spec, '$.children[0]', 1)
    expect(elementAt(swapped, '$.children[1]')?.component).toBe('Heading')
    expect(moveChild(spec, '$.children[0]', -1)).toBe(spec)
  })

  it('wraps a node, including the root, in a new parent', () => {
    const wrapped = wrapIn(spec, '$.children[0]', 'Card')
    expect(elementAt(wrapped, '$.children[0]')?.component).toBe('Card')
    expect(elementAt(wrapped, '$.children[0].children[0]')?.component).toBe('Heading')
    const reRooted = wrapIn(spec, '$', 'Card')
    expect(reRooted.root.component).toBe('Card')
    expect(elementAt(reRooted, '$.children[0]')?.component).toBe('Stack')
  })
})

describe('invalid addresses', () => {
  it('rejects an invalid address instead of treating it as the root', () => {
    // If `parseAddress` matched what it recognised and ignored the rest, it would parse any
    // string with no steps (a typo, a path from another grammar, an empty string) as zero steps,
    // which names the root. A mistyped address would then edit the whole document.
    // `removeAt(spec, 'children[0]')` (no leading `$`) asks to delete a node that does not exist,
    // and would return a new root.
    for (const nonsense of ['', 'children[0]', '$.kids[0]', '$.props', '$children[0]', 'root']) {
      expect(elementAt(spec, nonsense), nonsense).toBeNull()
      expect(parentOf(nonsense), nonsense).toBeNull()
      expect(
        updateAt(spec, nonsense, () => null),
        nonsense,
      ).toBe(spec)
      expect(removeAt(spec, nonsense), nonsense).toBe(spec)
    }
    // Valid addresses still parse, so the check rejects only invalid input.
    expect(elementAt(spec, '$')?.component).toBe('Stack')
    expect(elementAt(spec, '$.children[1].props.control')?.component).toBe('Switch')
  })
})

describe('an edited document passes the shape check without a JSON round-trip', () => {
  it('omits the key when children or props become empty, never leaving `undefined`', async () => {
    // A localStorage round-trip would remove a literal `children: undefined`. But the live law
    // panel validates the in-memory object, and SCREEN_SHAPE reports a present but undefined key
    // as "expected an array". So the model must omit the key, not set it to undefined.
    const { SCREEN_SHAPE } = await import('@polymorph/spec/schema')
    const { validate } = await import('@polymorph/registry/shape')

    const emptied = removeAt(spec, '$.children[0]')
    const emptiedTwice = removeAt(removeAt(emptied, '$.children[0]'), '$.children[0]')
    expect('children' in emptiedTwice.root).toBe(false)

    const cleared = setProp(spec, '$.children[0]', 'level', 2)
    const backOut = setProp(cleared, '$.children[0]', 'level', undefined)
    const heading = elementAt(backOut, '$.children[0]')
    expect(heading !== null && 'props' in heading).toBe(false)

    // The third way a props object becomes empty, and the easiest to miss. Removing an
    // element-valued slot goes through `updateAt`'s prop branch rather than `setProp`, and must
    // not write `"props": {}` into the saved document, just like the two cases above.
    const bareRow = setProp(spec, '$.children[1]', 'label', undefined)
    const slotless = removeAt(bareRow, '$.children[1].props.control')
    const row = elementAt(slotless, '$.children[1]')
    expect(row !== null && 'props' in row).toBe(false)

    for (const document of [emptiedTwice, backOut, slotless]) {
      expect(validate(SCREEN_SHAPE, document)).toEqual([])
    }
  })
})

describe('history', () => {
  /** n distinct documents, each one edit further from the fixture. */
  const chain = (count: number): ScreenSpec[] => {
    const specs: ScreenSpec[] = []
    let current = spec
    for (let index = 0; index < count; index += 1) {
      current = setProp(current, '$.children[0]', 'level', ((index % 5) + 2) as 2 | 3 | 4 | 5 | 6)
      specs.push(current)
    }
    return specs
  }

  it('merges a run of edits to one prop into one undo', () => {
    /*
     * Every keystroke in the inspector is an `apply`, and every `apply` is a `commit`. Without
     * merging, undoing a nine-character label would take nine presses, and the hundred-entry cap
     * would fill with the letters of one word. A commit with the same tag as the previous one
     * (the address and prop being edited) replaces the present instead of adding a past entry.
     */
    let history: History = { past: [], present: spec, future: [] }
    const [first, second, third] = chain(3) as [ScreenSpec, ScreenSpec, ScreenSpec]
    history = commit(history, first, '$.children[0]:level')
    history = commit(history, second, '$.children[0]:level')
    history = commit(history, third, '$.children[0]:level')

    expect(history.past).toHaveLength(1)
    expect(history.present).toBe(third)
    history = undo(history)
    expect(history.present).toBe(spec)
  })

  it('does not merge across a different tag or an untagged edit', () => {
    let history: History = { past: [], present: spec, future: [] }
    const [a, b, c, d] = chain(4) as [ScreenSpec, ScreenSpec, ScreenSpec, ScreenSpec]
    history = commit(history, a, '$.children[0]:level')
    history = commit(history, b, '$.children[2]:tone')
    history = commit(history, c, '$.children[0]:level')
    // A structural operation has no tag, and nothing merges into it.
    history = commit(history, d)
    expect(history.past).toHaveLength(4)

    // Undo, then type again. The new edit must not replace the restored entry.
    let resumed: History = commit(
      commit({ past: [], present: spec, future: [] }, a, '$.children[0]:level'),
      b,
      '$.children[0]:level',
    )
    expect(resumed.past).toHaveLength(1)
    resumed = undo(resumed)
    resumed = commit(resumed, c, '$.children[0]:level')
    expect(resumed.past).toHaveLength(1)
    expect(undo(resumed).present).toBe(spec)
  })

  it('keeps the history at exactly the cap', () => {
    // `slice(-HISTORY_LIMIT)` would keep a full hundred and then add the present on top, so the
    // stack would hold a hundred and one.
    let history: History = { past: [], present: spec, future: [] }
    for (const next of chain(HISTORY_LIMIT + 25)) history = commit(history, next)
    expect(history.past).toHaveLength(HISTORY_LIMIT)
  })

  it('commits, undoes and redoes, and a new edit clears the redo stack', () => {
    let history: History = { past: [], present: spec, future: [] }
    const second = removeAt(spec, '$.children[0]')
    const third = removeAt(second, '$.children[0]')
    history = commit(history, second)
    history = commit(history, third)
    history = undo(history)
    expect(history.present).toBe(second)
    history = redo(history)
    expect(history.present).toBe(third)
    history = undo(history)
    history = commit(history, spec)
    expect(history.future).toEqual([])
    expect(undo(undo(history)).past).toEqual([])
  })
})
