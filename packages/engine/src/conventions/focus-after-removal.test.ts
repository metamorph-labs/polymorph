import { afterEach, describe, expect, it } from 'vitest'

import {
  focusAfterRemoval,
  focusPlace,
  focusReturnTarget,
  nearestFocusable,
} from './focus-after-removal'

/**
 * The rule for where focus goes when the element it returns to, or the region
 * that holds it, has left the page: the first focusable element after where it
 * was, else the last one before it, else the page's `main`. The members' laws
 * hold the common case in every shell; this holds the fallbacks on plain DOM.
 */

const page = document.createElement('div')

afterEach(() => {
  page.replaceChildren()
  page.remove()
})

/** Draws the page from markup and returns the element with each id. */
function draw(markup: string): Record<string, HTMLElement> {
  page.innerHTML = markup
  document.body.append(page)
  return Object.fromEntries(
    [...page.querySelectorAll<HTMLElement>('[id]')].map((element) => [element.id, element]),
  )
}

describe('nearestFocusable', () => {
  it('takes the first tab stop after where the element was', () => {
    const { row, next } = draw(`
      <table><tbody>
        <tr id="row"><td><button id="opener">Delete</button></td></tr>
        <tr><td><button id="next">Delete</button></td></tr>
      </tbody></table>`)
    const place = focusPlace(page.querySelector('#opener'))
    row?.remove()
    expect(place && nearestFocusable(place)).toBe(next)
  })

  it('takes the last tab stop before it when nothing after it takes focus', () => {
    const { previous, row } = draw(`
      <button id="previous">Back</button>
      <div id="row"><button id="opener">Delete</button></div>
      <button disabled>Disabled</button>
      <button hidden>Hidden</button>
      <span tabindex="-1">Not a stop</span>`)
    const place = focusPlace(page.querySelector('#opener'))
    row?.remove()
    expect(place && nearestFocusable(place)).toBe(previous)
  })

  it('finds the gap in the nearest ancestor still in the page when both neighbours went too', () => {
    const { list } = draw(`
      <ul id="list"><li><button id="opener">One</button></li><li><button>Two</button></li></ul>
      <button>After the list</button>`)
    const place = focusPlace(page.querySelector('#opener'))
    // The list draws its items again: every element the place recorded beside it is gone.
    const item = document.createElement('li')
    item.innerHTML = '<button>Two</button>'
    list?.replaceChildren(item)
    expect(place && nearestFocusable(place)).toBe(item.querySelector('button'))
  })

  it('passes over what it is told to skip', () => {
    const { row, panel, after } = draw(`
      <div id="row"><button id="opener">Open</button></div>
      <div id="panel"><button>In the closing panel</button></div>
      <button id="after">After</button>`)
    const place = focusPlace(page.querySelector('#opener'))
    row?.remove()
    expect(place && nearestFocusable(place, [panel])).toBe(after)
  })

  it('leaves the page’s main as it was when focus does not land on it', async () => {
    const { main, row } = draw(
      `<main id="main"><div id="row"><button id="opener">Only</button></div></main>`,
    )
    const place = focusPlace(page.querySelector('#opener'))
    row?.remove()
    expect(place && nearestFocusable(place)).toBe(main)
    await new Promise((settle) => setTimeout(settle, 0))
    expect(main?.hasAttribute('tabindex')).toBe(false)
  })

  it('falls back to the page’s main, made focusable while it holds focus', () => {
    const { main, row } = draw(
      `<main id="main"><div id="row"><button id="opener">Only</button></div></main>`,
    )
    const place = focusPlace(page.querySelector('#opener'))
    row?.remove()
    const target = place && nearestFocusable(place)
    expect(target).toBe(main)
    target?.focus()
    expect(document.activeElement).toBe(main)
    target?.blur()
    expect(main?.hasAttribute('tabindex')).toBe(false)
  })
})

describe('focusReturnTarget', () => {
  it('returns to the element itself while focus can go to it', () => {
    const { opener } = draw(`<button id="opener">Open</button><button>After</button>`)
    expect(focusReturnTarget(focusPlace(opener))).toBe(opener)
  })

  it('goes to the nearest element when the element is still there but disabled', () => {
    const { opener, after } = draw(
      `<button id="opener">Open</button><button id="after">After</button>`,
    )
    const place = focusPlace(opener)
    opener?.setAttribute('disabled', '')
    expect(focusReturnTarget(place)).toBe(after)
  })

  it('has no place for the body', () => {
    expect(focusPlace(document.body)).toBeNull()
    expect(focusReturnTarget(null)).toBeNull()
  })
})

describe('focusAfterRemoval', () => {
  /** A microtask later, when the returned function has looked at the page again. */
  const settled = () => new Promise<void>((settle) => queueMicrotask(settle))

  it('moves focus out of a region that leaves while it holds focus', async () => {
    const { region, inside, after } = draw(`
      <div id="region"><button id="inside">Dismiss</button></div>
      <button id="after">After</button>`)
    const release = focusAfterRemoval(region)
    inside?.focus()
    // A framework runs the function, then takes the region out, in one update.
    release()
    region?.remove()
    await settled()
    expect(document.activeElement).toBe(after)
  })

  it('moves focus near where the region was when it has already gone', async () => {
    const { region, inside, after } = draw(`
      <div id="region"><button id="inside">Dismiss</button></div>
      <button id="after">After</button>`)
    const release = focusAfterRemoval(region)
    inside?.focus()
    region?.remove()
    release()
    await settled()
    expect(document.activeElement).toBe(after)
  })

  it('leaves focus in a region that stays, as StrictMode’s rehearsed unmount leaves it', async () => {
    const { region, inside } = draw(`
      <div id="region"><button id="inside" autofocus>Retry</button></div>
      <button>After</button>`)
    inside?.focus()
    const release = focusAfterRemoval(region)
    release()
    const again = focusAfterRemoval(region)
    await settled()
    expect(document.activeElement).toBe(inside)
    again()
  })

  it('leaves focus alone once it has moved to another element', async () => {
    const { region, inside, before } = draw(`
      <button id="before">Before</button>
      <div id="region"><button id="inside">Dismiss</button></div>
      <button>After</button>`)
    const release = focusAfterRemoval(region)
    inside?.focus()
    before?.focus()
    region?.remove()
    release()
    await settled()
    expect(document.activeElement).toBe(before)
  })
})
