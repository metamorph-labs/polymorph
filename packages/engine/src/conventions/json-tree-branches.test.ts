import { afterEach, describe, expect, it } from 'vitest'

import { jsonTreeBranches, jsonTreeExpanded, setJsonTreeBranch } from './json-tree-branches'

/**
 * What an agent opens and closes in a JsonTree (`design/components/json-tree.md`,
 * Agent): the same ids in every renderer, read from the tree in the document,
 * and a press on the branch's own toggle. The tree here is plain DOM with the
 * shape every renderer's JsonTree draws: rows whose branch is a toggle holding
 * a chevron, a key with its colon and a summary, and whose leaf is a key and a
 * value with no toggle.
 */

afterEach(() => document.body.replaceChildren())

/** The recipe's classes, as a CSS module may write them: the toggle's value holds two. */
const TOGGLE = 'json-toggle json-toggle-x1'
const KEY = 'json-key'

const key = (name: string | undefined) =>
  name === undefined ? '' : `<span class="${KEY}">${name}<span class="json-colon">:</span></span>`

const leaf = (name: string, value: string) =>
  `<li>${key(name)}<span class="json-value" data-kind="string">${value}</span></li>`

/** A branch row: its toggle, and its children while it is open. */
const branch = (name: string | undefined, summary: string, children: string[] | null) =>
  `<li><button type="button" class="${TOGGLE}" aria-expanded="${children !== null}">` +
  `<span aria-hidden="true"><svg></svg></span>${key(name)}<span>${summary}</span></button>` +
  (children === null ? '' : `<ul>${children.join('')}</ul>`) +
  '</li>'

/** An object with an open object, a closed array, a key that a pointer escapes and a leaf. */
function tree(): HTMLUListElement {
  const ul = document.createElement('ul')
  ul.setAttribute('aria-label', 'Response body')
  ul.innerHTML = branch(undefined, '{…} 3 keys', [
    leaf('id', '"tkt_5417"'),
    branch('assignee', '{…} 2 keys', [leaf('name', '"Ada"'), branch('a/b~c', '{…} 1 key', null)]),
    branch('labels', '[…] 2 items', null),
  ])
  document.body.append(ul)
  return ul
}

describe('jsonTreeBranches', () => {
  it('lists each toggle in order, by the JSON Pointer of its value, labelled by its text', () => {
    expect(jsonTreeBranches(tree(), TOGGLE, KEY)).toEqual([
      { id: '', label: '{…} 3 keys' },
      { id: '/assignee', label: 'assignee:{…} 2 keys' },
      { id: '/assignee/a~1b~0c', label: 'a/b~c:{…} 1 key' },
      { id: '/labels', label: 'labels:[…] 2 items' },
    ])
  })

  it('reads a key whole, its spaces included, and an index as its key', () => {
    const ul = document.createElement('ul')
    ul.innerHTML = branch(undefined, '{…} 1 key', [branch(' padded ', '{…} 1 key', null)])
    document.body.append(ul)
    expect(jsonTreeBranches(ul, TOGGLE, KEY).map((found) => found.id)).toEqual(['', '/ padded '])

    const list = document.createElement('ul')
    list.innerHTML = branch(undefined, '[…] 1 item', [branch('0', '{…} 1 key', null)])
    document.body.append(list)
    expect(jsonTreeBranches(list, TOGGLE, KEY).map((found) => found.id)).toEqual(['', '/0'])
  })

  it('stops at the tree, so a tree inside a row of another list reads from its own root', () => {
    const outer = document.createElement('ul')
    outer.innerHTML = `<li>${key('outside')}</li>`
    document.body.append(outer)
    const ul = tree()
    outer.querySelector('li')?.append(ul)
    expect(jsonTreeBranches(ul, TOGGLE, KEY).map((found) => found.id)).toEqual([
      '',
      '/assignee',
      '/assignee/a~1b~0c',
      '/labels',
    ])
  })

  it('reads nothing from a tree that is not there, or by a toggle class that is missing', () => {
    expect(jsonTreeBranches(null, TOGGLE, KEY)).toEqual([])
    expect(jsonTreeExpanded(undefined, TOGGLE, KEY)).toEqual([])
    expect(jsonTreeBranches(tree(), undefined, KEY)).toEqual([])
    expect(jsonTreeBranches(tree(), ' ', KEY)).toEqual([])
  })
})

describe('jsonTreeExpanded', () => {
  it('is the ids of the branches whose toggle says they are open', () => {
    const ul = tree()
    expect(jsonTreeExpanded(ul, TOGGLE, KEY)).toEqual(['', '/assignee'])
    ul.querySelector('[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false')
    expect(jsonTreeExpanded(ul, TOGGLE, KEY)).toEqual(['/assignee'])
  })
})

describe('setJsonTreeBranch', () => {
  it('presses the toggle the id names when the branch is not as asked, and no other', () => {
    const ul = tree()
    const pressed: Element[] = []
    ul.addEventListener('click', (event) => pressed.push(event.target as Element))
    setJsonTreeBranch(ul, TOGGLE, KEY, '/labels', true)
    setJsonTreeBranch(ul, TOGGLE, KEY, '/assignee', false)
    const toggles = Array.from(ul.querySelectorAll('button'))
    expect(pressed).toEqual([toggles[3], toggles[1]])
  })

  it('leaves a branch that is already as asked alone', () => {
    const ul = tree()
    let pressed = 0
    ul.addEventListener('click', () => {
      pressed += 1
    })
    setJsonTreeBranch(ul, TOGGLE, KEY, '', true)
    setJsonTreeBranch(ul, TOGGLE, KEY, '/labels', false)
    expect(pressed).toBe(0)
  })

  it('throws for an id that names no branch, a leaf included, and presses nothing', () => {
    const ul = tree()
    let pressed = 0
    ul.addEventListener('click', () => {
      pressed += 1
    })
    expect(() => setJsonTreeBranch(ul, TOGGLE, KEY, '/id', true)).toThrow(
      'No branch of the tree has the id "/id".',
    )
    expect(() => setJsonTreeBranch(ul, TOGGLE, KEY, '/labels/0', true)).toThrow(
      'No branch of the tree has the id "/labels/0".',
    )
    expect(pressed).toBe(0)
  })
})
