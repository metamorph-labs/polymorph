import { afterEach, describe, expect, it } from 'vitest'

import { currentRailDestination, goToRailDestination, railDestinations } from './rail-destinations'

/**
 * What an agent goes to in an AppShell's rail (`design/archetypes/app-shell.md`,
 * Agent): the same ids in every renderer, read from the rail in the document,
 * and a press on the item itself. The rail here is plain DOM with the shape
 * every renderer's AppShell draws: items with the recipe's item class, each
 * holding its label in an element with the label class, some inside a named
 * group, beside controls that are not items.
 */

afterEach(() => document.body.replaceChildren())

/** The recipe's classes, as a CSS module may write them: the item's value holds two. */
const CLASSES = { item: 'nav-item nav-item-x1', label: 'nav-label' }

const item = (label: string, attributes = '', tag: 'a' | 'button' = 'a') =>
  `<${tag} class="nav-item nav-item-x1" ${attributes}><span class="nav-glyph"></span>` +
  `<span class="nav-label">${label}</span><span class="nav-end">12</span></${tag}>`

/** A rail with a brand row and its own toggle, two groups, an ungrouped item and a foot. */
function rail(): HTMLElement {
  const nav = document.createElement('nav')
  nav.setAttribute('aria-label', 'Primary')
  nav.innerHTML = [
    '<div><button type="button" aria-label="Collapse sidebar"></button></div>',
    '<div role="group" aria-label="Platform">',
    '<span>Platform</span>',
    item('Inbox', 'href="/inbox" aria-current="page"'),
    item('New ticket', 'type="button"', 'button'),
    item('Settings', 'type="button"', 'button'),
    '</div>',
    '<div role="group" aria-label="Workspace">',
    '<span>Workspace</span>',
    item('Members', 'href="/members"'),
    item('Settings', 'type="button"', 'button'),
    item('Billing', 'type="button" disabled', 'button'),
    item('Audit log', 'href="/audit" aria-disabled="true"'),
    '</div>',
    item('Help', 'href="/help"'),
    '<div><button type="button" aria-label="Account"></button></div>',
  ].join('')
  document.body.append(nav)
  return nav
}

describe('railDestinations', () => {
  it('lists each item in order, by its href or its label, with a disabled one marked', () => {
    expect(railDestinations(rail(), CLASSES)).toEqual([
      { id: '/inbox', label: 'Inbox' },
      { id: 'New ticket', label: 'New ticket' },
      { id: 'Platform / Settings', label: 'Settings' },
      { id: '/members', label: 'Members' },
      { id: 'Workspace / Settings', label: 'Settings' },
      { id: 'Billing', label: 'Billing', disabled: true },
      { id: '/audit', label: 'Audit log', disabled: true },
      { id: '/help', label: 'Help' },
    ])
  })

  it('gives an id shared within one group, or by items with no group, a count after it', () => {
    const nav = document.createElement('nav')
    nav.innerHTML = [
      '<div role="group" aria-label="Platform">',
      item('Inbox', 'href="/inbox"'),
      item('Inbox', 'href="/inbox"'),
      '</div>',
      item('Help', 'type="button"', 'button'),
      item('Help', 'type="button"', 'button'),
    ].join('')
    document.body.append(nav)
    expect(railDestinations(nav, CLASSES).map((destination) => destination.id)).toEqual([
      'Platform / /inbox',
      'Platform / /inbox (2)',
      'Help',
      'Help (2)',
    ])
  })

  it('reads nothing from a rail that is not there, or by an item class that is missing', () => {
    expect(railDestinations(null, CLASSES)).toEqual([])
    expect(currentRailDestination(undefined, CLASSES)).toBeNull()
    expect(railDestinations(rail(), { item: undefined, label: 'nav-label' })).toEqual([])
  })

  it('reads an item’s text as its label when the label class is missing', () => {
    const nav = document.createElement('nav')
    nav.innerHTML = '<button class="nav-item" type="button"> Help <span> desk </span></button>'
    document.body.append(nav)
    expect(railDestinations(nav, { item: 'nav-item', label: undefined })).toEqual([
      { id: 'Help desk', label: 'Help desk' },
    ])
  })
})

describe('currentRailDestination', () => {
  it('is the id of the item marked current, and null once none is', () => {
    const nav = rail()
    expect(currentRailDestination(nav, CLASSES)).toBe('/inbox')
    nav.querySelector('[aria-current]')?.setAttribute('aria-current', 'false')
    expect(currentRailDestination(nav, CLASSES)).toBeNull()
  })
})

describe('goToRailDestination', () => {
  it('presses the item the id names, and no other', () => {
    const nav = rail()
    const pressed: Element[] = []
    nav.addEventListener('click', (event) => {
      // The link's own navigation would leave the test's page.
      event.preventDefault()
      pressed.push(event.target as Element)
    })
    goToRailDestination(nav, CLASSES, 'Workspace / Settings')
    goToRailDestination(nav, CLASSES, '/help')
    const workspace = nav.querySelector('[role="group"][aria-label="Workspace"]')
    expect(pressed).toEqual([
      workspace?.querySelector('button.nav-item'),
      nav.querySelector('a[href="/help"]'),
    ])
  })

  it('throws for an id that names no item, and for a disabled item, and presses nothing', () => {
    const nav = rail()
    let pressed = 0
    nav.addEventListener('click', (event) => {
      event.preventDefault()
      pressed += 1
    })
    expect(() => goToRailDestination(nav, CLASSES, 'Settings')).toThrow(
      'No destination in the rail has the id "Settings".',
    )
    expect(() => goToRailDestination(nav, CLASSES, 'Billing')).toThrow(
      'The destination "Billing" is disabled.',
    )
    expect(() => goToRailDestination(nav, CLASSES, '/audit')).toThrow(
      'The destination "/audit" is disabled.',
    )
    expect(pressed).toBe(0)
  })
})
