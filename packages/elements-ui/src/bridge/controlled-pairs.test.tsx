import { createSignal, type JSX } from 'solid-js'
import { userEvent } from 'vitest/browser'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { define, eventOf, propertyOf, type ElementDefinition } from '@polymorph/elements'
import { installTestTheme } from '@polymorph/engine/testing'

import { DEFINITIONS } from '../definitions'
import '../overlays/Dialog'
import '../overlays/Tabs'
import '../overlays/TabsContent'
import { mount } from '../mount'

/**
 * Every kind of controlled pair the elements ship (`value` with `onChange`,
 * `open` with `onOpenChange`, `checked`, `expanded`, `index`, `step`, `view`,
 * `collapsed`, `editing`, `ratio`, `page`, `sort`, `selection`), through the
 * bridge's rule for them:
 *
 *  - a value the page holds follows the reader: after the change event the
 *    element sets the prop to the reported value and hands it to the member;
 *  - a listener that cancels the change keeps the page's value;
 *  - a member the page holds no value for stays uncontrolled, and the
 *    property reads the value it last reported.
 *
 * A probe member stands in for each pair: it reports a new value on a press,
 * keeps its own state while it is handed none, and shows the value it draws.
 * Two real members check the same rule end to end.
 */

beforeAll(installTestTheme)

/** Each kind of pair once, by its prop and its event, with the codec the first member gives it. */
const KINDS = [
  ...new Map(
    Object.values(DEFINITIONS).flatMap((definition) =>
      Object.entries(definition.controlled ?? {}).map(
        ([prop, event]) =>
          [`${prop}/${event}`, { prop, event, codec: definition.props[prop] ?? 'json' }] as const,
      ),
    ),
  ).values(),
]

/** A probe member for one pair: the value it draws, and a press that reports the next one. */
function probeOf(prop: string, event: string) {
  return function Probe(props: Record<string, unknown>): JSX.Element {
    const [own, setOwn] = createSignal<unknown>('own')
    let presses = 0
    const shown = () => (props[prop] === undefined ? own() : props[prop])
    return (
      <button
        type="button"
        data-handed={props[prop] === undefined ? 'none' : 'value'}
        onClick={() => {
          const next = `press-${++presses}`
          if (props[prop] === undefined) setOwn(next)
          ;(props[event] as ((value: unknown) => void) | undefined)?.(next)
        }}
      >
        {String(shown())}
      </button>
    )
  }
}

const tagOf = (index: number) => `probe-pair-${index}`

KINDS.forEach(({ prop, event, codec }, index) => {
  const definition: ElementDefinition = {
    tag: tagOf(index),
    member: 'Probe',
    props: { [prop]: codec },
    events: { [event]: { type: eventOf(event) } },
    slots: [],
    controlled: { [prop]: event },
  }
  define(definition, probeOf(prop, event))
})

describe('every kind of controlled pair follows the reader', () => {
  it('ships the kinds this test names', () => {
    expect(KINDS.map((kind) => kind.prop).sort()).toEqual(
      expect.arrayContaining(['checked', 'expanded', 'index', 'open', 'page', 'value']),
    )
  })

  KINDS.forEach(({ prop, event }, index) => {
    const tag = tagOf(index)
    const property = propertyOf(prop)
    const press = async (host: HTMLElement) => {
      const button = host.querySelector('button') as HTMLButtonElement
      await userEvent.click(button)
      return button
    }

    it(`${prop} with ${event}: a value the page holds takes the reader’s choice`, async () => {
      const { host } = await mount({ name: 'held', html: `<${tag}></${tag}>` })
      const element = host.querySelector(tag) as unknown as Record<string, unknown> & HTMLElement
      element[property] = 'page'
      const heard: CustomEvent[] = []
      element.addEventListener(eventOf(event), (change) => heard.push(change as CustomEvent))
      const button = await press(host)
      await vi.waitFor(() => expect(button.textContent).toBe('press-1'))
      expect(element[property]).toBe('press-1')
      expect(button.getAttribute('data-handed')).toBe('value')
      expect(heard.map((change) => [change.detail, change.cancelable])).toEqual([['press-1', true]])
    })

    it(`${prop} with ${event}: a cancelled change keeps the page’s value`, async () => {
      const { host } = await mount({ name: 'cancelled', html: `<${tag}></${tag}>` })
      const element = host.querySelector(tag) as unknown as Record<string, unknown> & HTMLElement
      element[property] = 'page'
      element.addEventListener(eventOf(event), (change) => change.preventDefault())
      const button = await press(host)
      await new Promise((settle) => setTimeout(settle, 30))
      expect(button.textContent).toBe('page')
      expect(element[property]).toBe('page')
    })

    it(`${prop} with ${event}: a member the page holds no value for keeps its own`, async () => {
      const { host } = await mount({ name: 'own', html: `<${tag}></${tag}>` })
      const element = host.querySelector(tag) as unknown as Record<string, unknown> & HTMLElement
      expect(element[property]).toBeUndefined()
      const button = await press(host)
      await vi.waitFor(() => expect(button.textContent).toBe('press-1'))
      expect(button.getAttribute('data-handed')).toBe('none')
      expect(element[property]).toBe('press-1')
      // The page takes the value over by setting one.
      element[property] = 'page'
      await vi.waitFor(() => expect(button.textContent).toBe('page'))
      expect(button.getAttribute('data-handed')).toBe('value')
    })
  })
})

describe('real members follow the reader the same way', () => {
  it('closes a Dialog the page holds open when the reader dismisses it', async () => {
    const { host } = await mount({
      name: 'dialog',
      html: '<poly-dialog title="Rename" open><poly-button slot="trigger" label="Rename"></poly-button><p>Body</p></poly-dialog>',
    })
    const element = host.querySelector('poly-dialog') as unknown as { open: boolean | undefined }
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    expect(element.open).toBe(false)
  })

  it('moves Tabs the page holds to the tab the reader chose, unless the page cancels', async () => {
    const html =
      '<poly-tabs value="open" tabs=\'[{"value":"open","label":"Open"},{"value":"closed","label":"Closed"}]\'><poly-tabs-content value="open">Open tickets</poly-tabs-content><poly-tabs-content value="closed">Closed tickets</poly-tabs-content></poly-tabs>'
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[data-tabs-part="tab"]')]
    const { host, unmount } = await mount({ name: 'tabs', html })
    const element = host.querySelector('poly-tabs') as unknown as { value: string } & HTMLElement
    await userEvent.click(tabs()[1] as HTMLElement)
    await vi.waitFor(() => expect(element.value).toBe('closed'))
    expect(host.textContent).toContain('Closed tickets')
    unmount()

    const owned = await mount({ name: 'owned tabs', html })
    const kept = owned.host.querySelector('poly-tabs') as unknown as { value: string } & HTMLElement
    kept.addEventListener('poly-change', (change) => change.preventDefault())
    await userEvent.click(tabs()[1] as HTMLElement)
    await new Promise((settle) => setTimeout(settle, 50))
    expect(kept.value).toBe('open')
    expect(owned.host.textContent).toContain('Open tickets')
  })
})
