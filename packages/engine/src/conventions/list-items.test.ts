import { afterEach, describe, expect, it } from 'vitest'

import { chooseListItem, currentListItem, listItems } from './list-items'

/**
 * What an agent picks in a List (`design/components/list.md`, Agent): the
 * same ids in every renderer, read from the list in the document, and a press
 * on the item's own link or button. The list here is plain DOM with the shape
 * every renderer's List draws: rows whose title is a link, a button or plain
 * text, the link and the button with the recipe's target class, and trailing
 * controls that are members of their own.
 */

afterEach(() => document.body.replaceChildren())

/** The recipe's target class, as a CSS module may write it: the value holds two. */
const TARGET = 'list-primary list-primary-x1'

const row = (title: string, attributes = '', tag: 'a' | 'button' | 'span' = 'a', trailing = '') =>
  `<li><span class="list-text"><${tag} class="list-title${tag === 'span' ? '' : ` ${TARGET}`}" ` +
  `${attributes}>${title}</${tag}><span>A line under it</span></span>` +
  (trailing === '' ? '' : `<span class="list-trailing">${trailing}</span>`) +
  '</li>'

/** Links and buttons, one current, a row that is only read and a trailing Button. */
function list(): HTMLUListElement {
  const ul = document.createElement('ul')
  ul.setAttribute('aria-label', 'Members')
  ul.innerHTML = [
    row('Ada Okafor', 'href="#ada" aria-current="page"'),
    row(
      'Bao Tran',
      'href="#bao"',
      'a',
      '<button type="button" data-member="button">Resend</button>',
    ),
    row('Carmen Ruiz', '', 'span'),
    row('Dee Mensah', 'type="button"', 'button'),
  ].join('')
  document.body.append(ul)
  return ul
}

describe('listItems', () => {
  it('lists each item that navigates or is picked, in order, by its href or its title', () => {
    expect(listItems(list(), TARGET)).toEqual([
      { id: '#ada', label: 'Ada Okafor' },
      { id: '#bao', label: 'Bao Tran' },
      { id: 'Dee Mensah', label: 'Dee Mensah' },
    ])
  })

  it('gives each item that would share an id a count after it', () => {
    const ul = document.createElement('ul')
    ul.innerHTML = [
      row('Inbox', 'href="#inbox"'),
      row('Inbox', 'href="#inbox"'),
      row('Help', 'type="button"', 'button'),
      row('Help (2)', 'type="button"', 'button'),
      row('Help', 'type="button"', 'button'),
    ].join('')
    document.body.append(ul)
    expect(listItems(ul, TARGET).map((item) => item.id)).toEqual([
      '#inbox',
      '#inbox (2)',
      'Help',
      'Help (2)',
      'Help (3)',
    ])
  })

  it('leaves out the items of a List drawn inside one of its rows', () => {
    const ul = list()
    const inner = document.createElement('ul')
    inner.innerHTML = row('Nested', 'href="#nested"')
    ul.querySelector('.list-trailing')?.append(inner)
    expect(listItems(ul, TARGET).map((item) => item.id)).toEqual(['#ada', '#bao', 'Dee Mensah'])
  })

  it('reads nothing from a list that is not there, or by a class that is missing', () => {
    expect(listItems(null, TARGET)).toEqual([])
    expect(currentListItem(undefined, TARGET)).toBeNull()
    expect(listItems(list(), undefined)).toEqual([])
    expect(listItems(list(), ' ')).toEqual([])
  })
})

describe('currentListItem', () => {
  it('is the id of the item marked current, on a link or a button, and null once none is', () => {
    const ul = list()
    expect(currentListItem(ul, TARGET)).toBe('#ada')
    ul.querySelector('[aria-current]')?.removeAttribute('aria-current')
    ul.querySelector('button.list-title')?.setAttribute('aria-current', 'true')
    expect(currentListItem(ul, TARGET)).toBe('Dee Mensah')
    ul.querySelector('[aria-current]')?.setAttribute('aria-current', 'false')
    expect(currentListItem(ul, TARGET)).toBeNull()
  })
})

describe('chooseListItem', () => {
  it('presses the link or the button the id names, and no other', () => {
    const ul = list()
    const pressed: Element[] = []
    ul.addEventListener('click', (event) => {
      // The link's own navigation would move the test's page.
      event.preventDefault()
      pressed.push(event.target as Element)
    })
    chooseListItem(ul, TARGET, '#bao')
    chooseListItem(ul, TARGET, 'Dee Mensah')
    expect(pressed).toEqual([
      ul.querySelector('a[href="#bao"]'),
      ul.querySelector('button.list-title'),
    ])
  })

  it('throws for an id that names no item, one that is only read included, and presses nothing', () => {
    const ul = list()
    let pressed = 0
    ul.addEventListener('click', (event) => {
      event.preventDefault()
      pressed += 1
    })
    expect(() => chooseListItem(ul, TARGET, 'Carmen Ruiz')).toThrow(
      'No item in the list has the id "Carmen Ruiz".',
    )
    expect(() => chooseListItem(ul, TARGET, 'Resend')).toThrow(
      'No item in the list has the id "Resend".',
    )
    expect(pressed).toBe(0)
  })
})
